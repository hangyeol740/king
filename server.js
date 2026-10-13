import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, makeRoom, joinRoom, view, canAct, defaultRoles, gameDays, religiousGoal, CARDS, visibleRecipes, ROLES, NEUTRAL_JOBS, CITIZEN_JOBS, MERCHANT_BUYS, RuleError } from './lib/game.js';
import { makeDevice, deviceView } from './lib/device.js';
import { createBotRunner } from './lib/ai-runner.js';
import { compatiblePolicy } from './ai/transfer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 32_768 });
const rooms = new Map();
const sessions = new Map();
const dataDir = process.env.DATA_DIR || path.join(root, '.data');
const savePath = path.join(dataDir, 'rooms.json');
let policy = null;
try {
  const savedPolicy = JSON.parse(await readFile(process.env.AI_MODEL_PATH || path.join(root, 'models/policy.json'), 'utf8'));
  policy = compatiblePolicy(savedPolicy);
  console.log(`강화학습 모델 로드: ${policy.metadata.episodes}판 · ${policy.metadata.algorithm}`);
} catch (error) { console.warn(`AI 모델 사용 불가: ${error.message}. npm run ai:train으로 학습할 수 있습니다.`); }
await mkdir(dataDir, { recursive: true });
try {
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  for (const room of saved) {
    room.players.forEach(p => { p.online = !!p.bot; });
    if (room.status === 'playing' && (room.game.rulesVersion || 0) < 5) {
      room.game.maxDays = gameDays(room.players.length);
      room.game.religiousGoal = religiousGoal(room.players.length);
      room.game.rulesVersion = 5;
    }
    if (room.game?.phase === 'tax' && !room.game.pending.payments) {
      room.game.pending.payments = Object.fromEntries(room.game.pending.done.filter(id => id !== room.game.king).map(id => [id, []]));
    }
    rooms.set(room.code, room);
  }
} catch (error) { if (error.code !== 'ENOENT') console.error('저장 데이터 읽기 실패:', error.message); }
let saveQueue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify([...rooms.values()]);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await writeFile(`${savePath}.tmp`, snapshot, { mode: 0o600 });
    await rename(`${savePath}.tmp`, savePath);
  }).catch(error => console.error('게임 저장 실패:', error.message));
  return saveQueue;
}
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/rules', (_req, res) => res.set('Cache-Control', 'no-store').json({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS, citizenJobs: CITIZEN_JOBS, merchantBuys: MERCHANT_BUYS }));
app.get('/api/ai', (_req, res) => res.json({ available: !!policy, algorithm: policy?.metadata.algorithm || null, episodes: policy?.metadata.episodes || 0, adaptedRules: !!policy?.metadata.adaptedRules, previousTrainingEpisodes: policy?.metadata.transferredFrom?.episodes || 0, trainedAt: policy?.metadata.trainedAt || null, playerCounts: policy?.metadata.playerCounts || [], maxBots: 8 }));
app.use(express.static(path.join(root, 'public')));

const bots = createBotRunner({ policy, changed: async room => { broadcast(room); await persist(); }, delay: Math.max(50, Number(process.env.AI_DELAY_MS) || 750) });
function broadcast(room) {
  for (const socketId of new Set(room.players.map(p => sessions.get(p.token)).filter(Boolean))) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const device = room.devices?.find(d => d.id === socket.data.device);
    if (device) {
      if (room.status === 'playing' && !deviceMayOpen(room, socket.data.player)) socket.data.player = null;
      socket.emit('state', deviceView(room, device, socket.data.player));
    } else if (room.players.some(p => p.id === socket.data.player)) socket.emit('state', view(room, socket.data.player));
  }
  bots.schedule(room);
}
function nickname(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > 16 || /[\u0000-\u001f]/.test(name)) throw new RuleError('닉네임은 1~16자로 입력하세요.');
  return name;
}
function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value;
  do { value = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(value));
  return value;
}
function attach(socket, room, p) {
  const previous = sessions.get(p.token);
  if (previous && previous !== socket.id) {
    const old = io.sockets.sockets.get(previous);
    if (old) { old.emit('replaced'); old.disconnect(true); }
  }
  socket.data.room = room.code; socket.data.player = p.id; socket.data.token = p.token;
  sessions.set(p.token, socket.id); p.online = true;
}
function attachDevice(socket, room, device) {
  const members = room.players.filter(p => device.players.includes(p.id));
  for (const previous of new Set(members.map(p => sessions.get(p.token)).filter(id => id && id !== socket.id))) {
    const old = io.sockets.sockets.get(previous);
    if (old) { old.emit('replaced'); old.disconnect(true); }
  }
  socket.data = { room: room.code, device: device.id, player: room.status === 'lobby' ? members[0].id : null };
  members.forEach(p => { sessions.set(p.token, socket.id); p.online = true; });
}
function ownedPlayers(socket, room) {
  const device = room.devices?.find(d => d.id === socket.data.device);
  return room.players.filter(p => device ? device.players.includes(p.id) : p.id === socket.data.player);
}
function deviceMayOpen(room, id) {
  if (canAct(room, id)) return true;
  const g = room.game;
  return room.status === 'playing' && (['night', 'bishopNight', 'mediationSupport', 'expeditionCards', 'market', 'merchantEvening'].includes(g.phase) || g.phase === 'day' && ['trade', 'royalSupport'].includes(g.pending?.kind));
}
io.on('connection', socket => {
  let windowStart = Date.now(), requests = 0;
  socket.on('command', async (input, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); requests = 0; }
      if (++requests > 80) throw new RuleError('요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.');
      if (!input || typeof input.type !== 'string') throw new RuleError('잘못된 요청입니다.');
      let room, p;
      let personalResult = null;
      if (['create', 'join', 'resume', 'resumeDevice'].includes(input.type)) {
        if (socket.data.room) throw new RuleError('이미 방에 접속했습니다.');
        if (input.type === 'create') {
          room = makeRoom(code(), nickname(input.name)); rooms.set(room.code, room); p = room.players[0];
        } else {
          room = rooms.get(typeof input.code === 'string' ? input.code.trim().toUpperCase() : '');
          if (!room) throw new RuleError('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
          if (input.type === 'join') p = joinRoom(room, nickname(input.name));
          else if (input.type === 'resumeDevice') {
            const device = room.devices?.find(d => d.token === input.token);
            if (!device) throw new RuleError('공유 기기 복귀 정보를 찾을 수 없습니다.');
            attachDevice(socket, room, device);
          } else {
            p = room.players.find(p => p.token === input.token);
            if (!p) throw new RuleError('복귀 정보를 찾을 수 없습니다.');
          }
        }
        if (input.type !== 'resumeDevice') attach(socket, room, p);
      } else {
        room = rooms.get(socket.data.room);
        p = room?.players.find(p => p.id === socket.data.player);
        const device = room?.devices?.find(d => d.id === socket.data.device);
        if (!room || (!device && (!p || sessions.get(p.token) !== socket.id)) || (device && !ownedPlayers(socket, room).every(p => sessions.get(p.token) === socket.id))) throw new RuleError('방에 먼저 접속하세요.');
        if (input.type === 'addLocalPlayer') {
          if (room.status !== 'lobby') throw new RuleError('대기실에서만 같은 기기의 플레이어를 추가할 수 있습니다.');
          const name = nickname(input.name);
          if (room.players.some(p => p.name === name)) throw new RuleError('이미 사용 중인 닉네임입니다.');
          const group = device || makeDevice(room, p);
          const added = joinRoom(room, name); group.players.push(added.id);
          if (!device) attachDevice(socket, room, group);
          else { sessions.set(added.token, socket.id); added.online = true; }
        } else if (input.type === 'openSeat' || input.type === 'lockSeat') {
          if (!device) throw new RuleError('공유 기기에서만 화면을 전환할 수 있습니다.');
          if (input.type === 'openSeat') {
            if (!device.players.includes(input.player) || !deviceMayOpen(room, input.player)) throw new RuleError('이 기기의 플레이어만 자신의 화면을 열 수 있습니다.');
            socket.data.player = input.player;
          } else socket.data.player = room.status === 'lobby' ? device.players[0] : null;
        } else if (input.type === 'leave') {
          const members = ownedPlayers(socket, room);
          if (room.status === 'playing') {
            // 플레이 중에는 숨겨진 진영과 차례를 보존하고 연결만 분리합니다.
            const resumeSession = device ? { code: room.code, token: device.token, device: true } : { code: room.code, token: p.token };
            members.forEach(p => { sessions.delete(p.token); p.online = false; }); socket.data = {};
            broadcast(room); await persist();
            reply({ ok: true, left: true, resumeSession }); return;
          }
          const ids = new Set(members.map(p => p.id));
          room.players = room.players.filter(v => !ids.has(v.id));
          members.forEach(p => sessions.delete(p.token));
          if (device) room.devices = room.devices.filter(d => d !== device);
          socket.data = {};
          if (!room.players.some(p => !p.bot)) rooms.delete(room.code);
          else {
            if (ids.has(room.host)) room.host = room.players.find(p => !p.bot).id;
            if (room.status === 'finished') { room.status = 'lobby'; room.game = null; room.players.forEach(p => { p.hand = []; p.role = null; p.job = null; p.churchInfluence = 0; p.notes = []; }); }
            room.config = defaultRoles(room.players.length);
          }
          broadcast(room); await persist(); reply({ ok: true, left: true }); return;
        } else {
        if (!p) {
          if (device && room.status === 'finished' && input.type === 'rematch' && device.players.includes(room.host)) p = room.players.find(p => p.id === room.host);
          else throw new RuleError('이름을 확인하고 자신의 화면을 먼저 열어주세요.');
        }
        if (input.type === 'addBot' && !policy) throw new RuleError('학습된 AI 모델이 없습니다. 서버에 models/policy.json을 포함하고 다시 배포하세요.');
        if (input.type === 'start' && !policy && room.players.some(p => p.bot)) throw new RuleError('AI 참가자를 사용하려면 학습된 모델을 서버에 포함하거나 AI를 제거하세요.');
        const oldNotes = new Set(p.notes.map(n => n.id));
        const oldStage = room.game ? `${room.game.day}/${room.game.phase}/${room.game.round}/${room.game.turn}` : null;
        act(room, p.id, input);
        if (device) {
          const notes = p.notes.filter(n => !oldNotes.has(n.id) && n.details?.kind === 'hand');
          if (notes.length) personalResult = { owner: p.name, notes };
          const newStage = room.game ? `${room.game.day}/${room.game.phase}/${room.game.round}/${room.game.turn}` : null;
          if (room.status === 'lobby') socket.data.player = device.players[0];
          else if (room.status === 'playing' && (oldStage !== newStage || !canAct(room, p.id))) socket.data.player = null;
        }
        }
      }
      broadcast(room);
      await persist();
      const device = room.devices?.find(d => d.id === socket.data.device);
      reply({ ok: true, session: device ? { code: room.code, token: device.token, device: true } : { code: room.code, token: p.token }, ...(personalResult ? { personalResult } : {}) });
    } catch (error) {
      if (!(error instanceof RuleError)) console.error(error);
      reply({ ok: false, error: error instanceof RuleError ? error.message : '서버 오류가 발생했습니다.' });
    }
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    if (room) {
      for (const p of ownedPlayers(socket, room)) if (sessions.get(p.token) === socket.id) { sessions.delete(p.token); p.online = false; }
      broadcast(room); persist();
    }
  });
});
const port = Number(process.env.PORT) || 3000;
http.listen(port, '0.0.0.0', () => console.log(`왕국과 반란 서버: http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  bots.close(); await persist(); io.close(); http.close(() => process.exit(0));
});
