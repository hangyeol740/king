import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, makeRoom, joinRoom, view, defaultRoles, CARDS, RECIPES, ROLES, RuleError } from './lib/game.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 32_768 });
const rooms = new Map();
const sessions = new Map();
const dataDir = process.env.DATA_DIR || path.join(root, '.data');
const savePath = path.join(dataDir, 'rooms.json');
await mkdir(dataDir, { recursive: true });
try {
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  for (const room of saved) {
    room.players.forEach(p => { p.online = false; });
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
app.get('/api/rules', (_req, res) => res.json({ cards: CARDS, recipes: RECIPES, roles: ROLES }));
app.use(express.static(path.join(root, 'public')));

function broadcast(room) {
  for (const p of room.players) {
    const socketId = sessions.get(p.token);
    if (socketId) io.to(socketId).emit('state', view(room, p.id));
  }
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
io.on('connection', socket => {
  let windowStart = Date.now(), requests = 0;
  socket.on('command', async (input, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); requests = 0; }
      if (++requests > 80) throw new RuleError('요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.');
      if (!input || typeof input.type !== 'string') throw new RuleError('잘못된 요청입니다.');
      let room, p;
      if (['create', 'join', 'resume'].includes(input.type)) {
        if (socket.data.room) throw new RuleError('이미 방에 접속했습니다.');
        if (input.type === 'create') {
          room = makeRoom(code(), nickname(input.name)); rooms.set(room.code, room); p = room.players[0];
        } else {
          room = rooms.get(typeof input.code === 'string' ? input.code.trim().toUpperCase() : '');
          if (!room) throw new RuleError('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
          if (input.type === 'join') p = joinRoom(room, nickname(input.name));
          else {
            p = room.players.find(p => p.token === input.token);
            if (!p) throw new RuleError('복귀 정보를 찾을 수 없습니다.');
          }
        }
        attach(socket, room, p);
      } else {
        room = rooms.get(socket.data.room);
        p = room?.players.find(p => p.id === socket.data.player);
        if (!room || !p || sessions.get(p.token) !== socket.id) throw new RuleError('방에 먼저 접속하세요.');
        if (input.type === 'leave') {
          if (room.status === 'playing') {
            // 플레이 중에는 숨겨진 진영과 차례를 보존하고 연결만 분리합니다.
            sessions.delete(p.token); socket.data = {}; p.online = false;
            broadcast(room); await persist();
            reply({ ok: true, left: true, resumeSession: { code: room.code, token: p.token } }); return;
          }
          room.players = room.players.filter(v => v.id !== p.id);
          sessions.delete(p.token); socket.data = {};
          if (room.players.length === 0) rooms.delete(room.code);
          else {
            if (room.host === p.id) room.host = room.players[0].id;
            if (room.status === 'finished') { room.status = 'lobby'; room.game = null; room.players.forEach(p => { p.hand = []; p.role = null; p.notes = []; }); }
            room.config = defaultRoles(room.players.length);
          }
          broadcast(room); await persist(); reply({ ok: true, left: true }); return;
        }
        act(room, p.id, input);
      }
      broadcast(room);
      await persist();
      reply({ ok: true, session: { code: room.code, token: p.token } });
    } catch (error) {
      if (!(error instanceof RuleError)) console.error(error);
      reply({ ok: false, error: error instanceof RuleError ? error.message : '서버 오류가 발생했습니다.' });
    }
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.find(p => p.id === socket.data.player);
    if (p && sessions.get(p.token) === socket.id) {
      sessions.delete(p.token); p.online = false; broadcast(room); persist();
    }
  });
});
const port = Number(process.env.PORT) || 3000;
http.listen(port, '0.0.0.0', () => console.log(`왕국과 반란 서버: http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  await persist(); io.close(); http.close(() => process.exit(0));
});
