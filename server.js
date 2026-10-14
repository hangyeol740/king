import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, makeRoom,makePlayer,joinRoom, view,spectatorView,autoGameVotes,canAct, defaultRoles, gameDays, religiousGoal, CARDS, visibleRecipes, ROLES, NEUTRAL_JOBS, CITIZEN_JOBS, MERCHANT_BUYS, RuleError } from './lib/game.js';
import {register,login,newAccountSession,accountFromToken,profile,changePoints,settleAccount} from './lib/accounts.js';
import {ratingEligible} from './lib/game.js';
import {chatAct,chatView,removeChatMember,botChat,respondToChat,chatEnabled} from './lib/chat.js';
import { makeDevice, deviceView } from './lib/device.js';
import { createBotRunner } from './lib/ai-runner.js';
import { compatiblePolicy } from './ai/transfer.js';
import {createOpenAIChat} from './lib/openai-chat.js';
import {createCognitiveAgent} from './lib/cognitive-agent.js';
import {createAgentClient} from './lib/agent-client.js';
import {createSupabaseStore} from './lib/persistent-store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 32_768 });
const rooms = new Map();
const sessions = new Map();
const dataDir = process.env.DATA_DIR || path.join(root, '.data');
const savePath = path.join(dataDir, 'rooms.json');
const accountPath=path.join(dataDir,'accounts.json');
let accounts=[];
const permanentStore=createSupabaseStore();
let policy = null;
try {
  const savedPolicy = JSON.parse(await readFile(process.env.AI_MODEL_PATH || path.join(root, 'models/strategy-v10-candidate.json'), 'utf8'));
  policy = compatiblePolicy(savedPolicy);
  console.log(`강화학습 모델 로드: ${policy.metadata.episodes}판 · ${policy.metadata.algorithm}`);
} catch (error) { console.warn(`AI 모델 사용 불가: ${error.message}. npm run ai:train으로 학습할 수 있습니다.`); }
await mkdir(dataDir, { recursive: true });
const permanentSnapshot=permanentStore?await permanentStore.load():null;
try{accounts=JSON.parse(await readFile(accountPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(permanentSnapshot)accounts=permanentSnapshot.accounts||[];
try {
  const saved = permanentSnapshot?permanentSnapshot.rooms||[]:JSON.parse(await readFile(savePath, 'utf8'));
  for (const room of saved) {
    room.players.forEach(p => { p.online = !!p.bot;if(room.status==='playing'&&!p.bot&&(room.mode||'online')==='online'){p.takeover=true;p.absent=true;} });
    (room.spectators||[]).forEach(p=>p.online=false);
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
  for(const room of rooms.values())if(ratingEligible(room))for(const p of room.players.filter(p=>p.surrendered)){
    const a=accounts.find(a=>a.id===(p.gameAccountId||p.accountId));if(a)settleAccount(a,`${room.code}/${room.createdAt}/${room.game.startedAt||'legacy'}`,p.role,'surrender');
  }
  for(const room of rooms.values())if(room.status==='finished'&&ratingEligible(room)){
    for(const p of room.players){const a=accounts.find(a=>a.id===(p.gameAccountId||p.accountId));if(!a||p.bot&&!p.gameAccountId)continue;
      const key=`${room.code}/${room.createdAt}/${room.game.startedAt||'legacy'}`;
      settleAccount(a,key,p.role,p.surrendered?'surrender':room.game.winner.side==='draw'?'draw':room.game.winner.players.includes(p.id)?'win':'loss',p.absent?300:0);
    }
  }
  const snapshot = JSON.stringify([...rooms.values()]);
  const accountSnapshot=JSON.stringify(accounts);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await writeFile(`${savePath}.tmp`, snapshot, { mode: 0o600 });
    await rename(`${savePath}.tmp`, savePath);
    await writeFile(`${accountPath}.tmp`,accountSnapshot,{mode:0o600});await rename(`${accountPath}.tmp`,accountPath);
    if(permanentStore)await permanentStore.save({rooms:JSON.parse(snapshot),accounts:JSON.parse(accountSnapshot)});
  }).catch(error => console.error('게임 저장 실패:', error.message));
  return saveQueue;
}
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/rules', (_req, res) => res.set('Cache-Control', 'no-store').json({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS, citizenJobs: CITIZEN_JOBS, merchantBuys: MERCHANT_BUYS }));
app.get('/api/ai', (_req, res) => res.json({ available: !!policy, algorithm: policy?.metadata.algorithm || null, episodes: policy?.metadata.episodes || 0, adaptedRules: !!policy?.metadata.adaptedRules, previousTrainingEpisodes: policy?.metadata.transferredFrom?.episodes || 0, trainedAt: policy?.metadata.trainedAt || null, playerCounts: policy?.metadata.playerCounts || [], maxBots: 8 }));
app.use(express.static(path.join(root, 'public')));

const agent=createCognitiveAgent({client:createAgentClient({timeout:Math.max(100,Number(process.env.AI_PLAN_TIMEOUT_MS)||8000)}),changed:async room=>{broadcast(room);await persist();}});
const bots = createBotRunner({ policy, agent:agent.enabled?agent:null, changed: async room => { broadcast(room); await persist(); }, delay: Math.max(50, Number(process.env.AI_DELAY_MS) || 750) });
const conversationAI=createOpenAIChat({changed:async room=>{await persist();broadcast(room);}});
app.get('/api/ai-chat/status',(_req,res)=>res.set('Cache-Control','no-store').json({ ...conversationAI.diagnostics(),planning:agent.diagnostics() }));
function broadcast(room) {
  autoGameVotes(room);
  agent.observe(room);
  for (const socketId of new Set([...room.players,...(room.spectators||[])].map(p => sessions.get(p.token)).filter(Boolean))) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const device = room.devices?.find(d => d.id === socket.data.device);
    if (device) {
      if (room.status === 'playing' && !deviceMayOpen(room, socket.data.player)) socket.data.player = null;
      const snapshot=deviceView(room,device,socket.data.player);const active=room.players.find(p=>p.id===snapshot.device.active);if(active&&chatEnabled(room))snapshot.chat=chatView(room,active);socket.emit('state',snapshot);
    } else {
      const spectator=room.spectators?.find(p=>p.id===socket.data.player),p=spectator||room.players.find(p=>p.id===socket.data.player);
      if(p){const snapshot=spectator?spectatorView(room,p):view(room,p.id);if(chatEnabled(room))snapshot.chat=chatView(room,p,!!spectator);socket.emit('state',snapshot);}
    }
    const a=accounts.find(a=>a.id===socket.data.account);if(a)socket.emit('account',profile(a));
  }
  bots.schedule(room);
}
function nickname(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > 16 || /[\u0000-\u001f]/.test(name)) throw new RuleError('닉네임은 1~16자로 입력하세요.');
  return name;
}
function guestName(room){const used=new Set([...(room?.players||[]),...(room?.spectators||[]),...accounts].map(p=>p.name));let name;do{name=`게스트${Array.from({length:6},()=>randomInt(10)).join('')}`;}while(used.has(name));return name;}
function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value;
  do { value = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(value));
  return value;
}
function attach(socket, room, p) {
  if(p.accountId&&socket.data.account!==p.accountId)throw new RuleError('원래 참가한 계정으로 로그인한 뒤 복귀하세요.');
  const previous = sessions.get(p.token);
  if (previous && previous !== socket.id) {
    const old = io.sockets.sockets.get(previous);
    if (old) { old.emit('replaced'); old.disconnect(true); }
  }
  socket.data.room = room.code; socket.data.player = p.id; socket.data.token = p.token;
  sessions.set(p.token, socket.id); p.online = true;
  if(p.absent&&room.status==='playing'){const a=accounts.find(a=>a.id===p.accountId);if(a&&ratingEligible(room))changePoints(a,-20);p.returnPenalties=(p.returnPenalties||0)+1;p.absent=false;p.takeover=false;}
}
function attachDevice(socket, room, device) {
  const members = room.players.filter(p => device.players.includes(p.id));
  for (const previous of new Set(members.map(p => sessions.get(p.token)).filter(id => id && id !== socket.id))) {
    const old = io.sockets.sockets.get(previous);
    if (old) { old.emit('replaced'); old.disconnect(true); }
  }
  socket.data = { account:socket.data.account,room: room.code, device: device.id, player: room.status === 'lobby' ? members[0].id : null };
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
      if(['register','login','accountResume','logout'].includes(input.type)){
        if(socket.data.room)throw new RuleError('방을 나간 뒤 계정을 변경하세요.');
        if(input.type==='logout'){const a=accounts.find(a=>a.id===socket.data.account);if(a)a.sessions=a.sessions.filter(s=>s.token!==input.token);delete socket.data.account;await persist();reply({ok:true,account:null});return;}
        const a=input.type==='register'?await register(accounts,input.name,input.password):input.type==='login'?await login(accounts,input.name,input.password):accountFromToken(accounts,input.token);
        if(!a)throw new RuleError('계정 로그인이 만료되었습니다.');socket.data.account=a.id;const token=input.type==='accountResume'?input.token:newAccountSession(a);await persist();reply({ok:true,account:profile(a),accountToken:token});return;
      }
      let room, p;
      let personalResult = null;
      if (['create', 'join','spectate','resume', 'resumeDevice'].includes(input.type)) {
        if (socket.data.room) throw new RuleError('이미 방에 접속했습니다.');
        if (input.type === 'create') {
          const a=accounts.find(a=>a.id===socket.data.account);room = makeRoom(code(),a?a.name:guestName());room.mode=input.mode==='offline'?'offline':'online';room.players[0].accountId=a?.id||null; rooms.set(room.code, room); p = room.players[0];
        } else {
          room = rooms.get(typeof input.code === 'string' ? input.code.trim().toUpperCase() : '');
          if (!room) throw new RuleError('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
          if (['join','spectate'].includes(input.type)){
            if(room.mode==='offline')throw new RuleError('오프라인 방에는 다른 기기와 관전자가 참가할 수 없습니다.');
            const a=accounts.find(a=>a.id===socket.data.account),name=a?a.name:guestName(room);
            if(a&&[...room.players,...(room.spectators||[])].some(p=>p.accountId===a.id))throw new RuleError('이미 참가한 계정입니다. 원래 자리로 복귀하세요.');
            if(input.type==='join')p=joinRoom(room,name);else{p=makePlayer(name);room.spectators||=[];room.spectators.push(p);}p.accountId=a?.id||null;
          }
          else if (input.type === 'resumeDevice') {
            const device = room.devices?.find(d => d.token === input.token);
            if (!device) throw new RuleError('공유 기기 복귀 정보를 찾을 수 없습니다.');
            attachDevice(socket, room, device);
          } else {
            p = [...room.players,...(room.spectators||[])].find(p => p.token === input.token);
            if (!p) throw new RuleError('복귀 정보를 찾을 수 없습니다.');
          }
        }
        if (input.type !== 'resumeDevice') {
          if(input.type==='resume'&&room.mode==='offline')throw new RuleError('오프라인 방은 공유 기기 복귀로만 접속하세요.');
          attach(socket, room, p);
        }
      } else {
        room = rooms.get(socket.data.room);
        p = room?.players.find(p => p.id === socket.data.player);
        const spectator=room?.spectators?.find(p=>p.id===socket.data.player);if(spectator)p=spectator;
        const device = room?.devices?.find(d => d.id === socket.data.device);
        if (!room || (!device && (!p || sessions.get(p.token) !== socket.id)) || (device && !ownedPlayers(socket, room).every(p => sessions.get(p.token) === socket.id))) throw new RuleError('방에 먼저 접속하세요.');
        if(['chatSend','pairRequest','pairAnswer','pairLeave','secretCreate','secretJoin','secretLeave','secretDelete'].includes(input.type)){
          if(!p||p.surrendered)throw new RuleError('채팅에 참가할 수 없습니다.');chatAct(room,p,input,!!spectator);
          void (room.status==='playing'&&agent.enabled?agent.respond(room,p,input):conversationAI.respond(room,p,input));
          if(input.type==='pairRequest')for(const q of room.players.filter(q=>q.bot))botChat(room,q,{type:'chat'});
        }else if(input.type==='mode'){
          if(room.host!==p?.id||room.status!=='lobby'||!['online','offline'].includes(input.mode))throw new RuleError('방장만 로비에서 모드를 선택할 수 있습니다.');
          if(input.mode==='offline'&&(room.spectators?.length||room.players.some(q=>q.id!==p.id&&!q.bot&&!device?.players.includes(q.id))))throw new RuleError('다른 기기 참가자와 관전자를 먼저 내보내세요.');
          if(input.mode==='online'&&room.devices?.some(d=>d.players.length>1))throw new RuleError('공유 기기 추가 참가자를 먼저 삭제하세요.');room.mode=input.mode;
        }else if(input.type==='removeLocalPlayer'){
          if(room.mode!=='offline'||room.status!=='lobby'||!device||!device.players.includes(input.target)||input.target===room.host)throw new RuleError('오프라인 대기실의 추가 참가자만 삭제할 수 있습니다.');
          const target=room.players.find(p=>p.id===input.target);if(!target)throw new RuleError('삭제할 참가자가 없습니다.');sessions.delete(target.token);room.players=room.players.filter(p=>p!==target);device.players=device.players.filter(id=>id!==target.id);if(socket.data.player===target.id)socket.data.player=room.host;room.config=defaultRoles(room.players.length);room.citizenJobs=[];
        }else if(input.type==='toSpectator'||input.type==='toPlayer'||input.type==='addSpectator'){
          if(room.mode==='offline'||room.host!==p?.id)throw new RuleError('온라인 방장만 관전자를 관리할 수 있습니다.');room.spectators||=[];
          if(input.type==='toPlayer'){
            if(room.status!=='lobby')throw new RuleError('로비에서만 관전자를 참가자로 옮길 수 있습니다.');
            const t=room.spectators.find(s=>s.id===input.target);if(!t)throw new RuleError('관전자를 선택하세요.');room.spectators=room.spectators.filter(s=>s!==t);room.players.push(t);room.config=defaultRoles(room.players.length);room.citizenJobs=[];
          }else if(input.type==='toSpectator'){
            if(room.status!=='lobby')throw new RuleError('게임 중에는 참가자를 관전자로 전환할 수 없습니다.');
            const t=room.players.find(p=>p.id===input.target);if(!t||t.id===room.host||t.bot)throw new RuleError('다른 참가자를 선택하세요.');room.players=room.players.filter(p=>p!==t);room.spectators.push(t);room.config=defaultRoles(room.players.length);room.citizenJobs=[];
          }else{const t=makePlayer(guestName(room));room.spectators.push(t);personalResult={spectatorInvite:{code:room.code,token:t.token}};}
        }else if (input.type === 'addLocalPlayer') {
          if(room.mode!=='offline')throw new RuleError('오프라인 모드에서만 같은 기기 참가자를 추가할 수 있습니다.');
          if (room.status !== 'lobby') throw new RuleError('대기실에서만 같은 기기의 플레이어를 추가할 수 있습니다.');
          const name = accounts.some(a=>a.id===socket.data.account)?nickname(input.name):guestName(room);
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
          const members = spectator?[spectator]:ownedPlayers(socket, room);
          if (room.status === 'playing'&&!spectator) {
            // 플레이 중에는 숨겨진 진영과 차례를 보존하고 연결만 분리합니다.
            const resumeSession = device ? { code: room.code, token: device.token, device: true } : { code: room.code, token: p.token };
            members.forEach(p => { sessions.delete(p.token); p.online = false;if(room.mode!=='offline'&&!p.bot&&!p.surrendered&&!spectator){p.absent=true;p.takeover=true;} });const account=socket.data.account;socket.data = {account};
            broadcast(room); await persist();
            reply({ ok: true, left: true, resumeSession }); return;
          }
          const ids = new Set(members.map(p => p.id));
          room.players = room.players.filter(v => !ids.has(v.id));
          members.forEach(p => sessions.delete(p.token));
          if (device) room.devices = room.devices.filter(d => d !== device);
          if(spectator)room.spectators=room.spectators.filter(s=>s!==spectator);const account=socket.data.account;socket.data = {account};
          if (!room.players.some(p => !p.bot)) rooms.delete(room.code);
          else {
            if (ids.has(room.host)) room.host = room.players.find(p => !p.bot).id;
            if (room.status === 'finished'&&!spectator) { room.status = 'lobby'; room.game = null; room.players.forEach(p => { p.hand = []; p.role = null; p.job = null; p.churchInfluence = 0; p.notes = []; }); }
            room.config = defaultRoles(room.players.length);
          }
          broadcast(room); await persist(); reply({ ok: true, left: true }); return;
        } else {
        if(spectator)throw new RuleError('관전자는 게임 행동을 할 수 없습니다.');
        if (!p) {
          if (device && room.status === 'finished' && input.type === 'rematch' && device.players.includes(room.host)) p = room.players.find(p => p.id === room.host);
          else throw new RuleError('이름을 확인하고 자신의 화면을 먼저 열어주세요.');
        }
        if (input.type === 'addBot' && !policy) throw new RuleError('학습된 AI 모델이 없습니다. 서버에 models/policy.json을 포함하고 다시 배포하세요.');
        if (input.type === 'start' && !policy && room.players.some(p => p.bot)) throw new RuleError('AI 참가자를 사용하려면 학습된 모델을 서버에 포함하거나 AI를 제거하세요.');
        const oldNotes = new Set(p.notes.map(n => n.id));
        const oldStage = room.game ? `${room.game.day}/${room.game.phase}/${room.game.round}/${room.game.turn}` : null;
        act(room, p.id, input);
        if(input.type==='start')room.game.startedAt=Date.now();
        if(p.surrendered)removeChatMember(room,p.id);
        if (device) {
          const notes = p.notes.filter(n => !oldNotes.has(n.id) && n.details?.kind === 'hand');
          if (notes.length) personalResult = { owner: p.name, notes };
          const newStage = room.game ? `${room.game.day}/${room.game.phase}/${room.game.round}/${room.game.turn}` : null;
          if (room.status === 'lobby') socket.data.player = device.players[0];
          else if (room.status === 'playing' && (oldStage !== newStage || !canAct(room, p.id))) socket.data.player = null;
        }
        }
      }
      await persist();
      broadcast(room);
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
      for (const p of [...ownedPlayers(socket, room),...(room.spectators||[]).filter(p=>p.id===socket.data.player)]) if (sessions.get(p.token) === socket.id) { sessions.delete(p.token); p.online = false;if(room.status==='playing'&&room.mode!=='offline'&&!p.bot&&!room.spectators?.includes(p)&&!p.surrendered){p.absent=true;p.takeover=true;} }
      broadcast(room); persist();
    }
  });
});
const port = Number(process.env.PORT) || 3000;
http.listen(port, '0.0.0.0', () => console.log(`왕국과 반란 서버: http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  agent.close();bots.close(); await persist(); io.close(); http.close(() => process.exit(0));
});
