import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt,randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, makeRoom,makePlayer,joinRoom, view,spectatorView,autoGameVotes,canAct, defaultRoles, gameDays, religiousGoal, CARDS, visibleRecipes, ROLES, NEUTRAL_JOBS, CITIZEN_JOBS, REBEL_JOBS, MERCHANT_BUYS, RuleError } from './lib/game.js';
import {register,login,newAccountSession,accountFromToken,profile,changePoints,settleAccount,renameAccount,validateNickname} from './lib/accounts.js';
import {ratingEligible,checkHumanDeparture} from './lib/game.js';
import {chatAct,chatView,removeChatMember,chatEnabled} from './lib/chat.js';
import { makeDevice, deviceView } from './lib/device.js';
import { createBotRunner } from './lib/ai-runner.js';
import {stepServerlessAI} from './lib/serverless-ai.js';
import {repairAISeats} from './lib/repair-ai-seats.js';
import { compatiblePolicy } from './ai/transfer.js';
import {createLiveLearning} from './lib/live-learning.js';
import {createOnlineExperience} from './lib/online-experience.js';
import {createSupabaseStore} from './lib/persistent-store.js';
import {assets} from './ai/reward-ledger.js';
import {decide,createDecisionContext} from './lib/ai-policy.js';
import {aiObservation} from './lib/ai-observation.js';
import {verifyGoogleCredential,googleAccount} from './lib/google-auth.js';
import {createEmailVerification} from './lib/email-verification.js';
import {createSharedRuntime} from './lib/shared-runtime.js';
import {createSupabaseRuntime} from './lib/supabase-runtime.js';
import {tmpdir} from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const vercel=process.env.VERCEL==='1';
const app = express();
app.get('/api/auth/google/config',(_req,res)=>res.json({clientId:process.env.GOOGLE_CLIENT_ID||null}));
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 32_768 });
const rooms = new Map();
const sessions = new Map();
const httpClients=new Map();
const dataDir = vercel?path.join(tmpdir(),`kingdom-${process.env.VERCEL_ENV||'development'}`):process.env.DATA_DIR || path.join(root, '.data');
const savePath = path.join(dataDir, 'rooms.json');
const accountPath=path.join(dataDir,'accounts.json');
let accounts=[];
const emailVerification=createEmailVerification();
const permanentStore=vercel?null:createSupabaseStore();
const shared=vercel?(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL?createSharedRuntime:createSupabaseRuntime)({
   ...(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL?{}:{url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}),
   ...(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL?{url:process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL}:{}),
  token:process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN,
  prefix:process.env.GAME_STATE_NAMESPACE||`kingdom:${process.env.VERCEL_ENV||'development'}`,
  restore(saved){
    rooms.clear();for(const room of saved.rooms||[]){repairAISeats(room);rooms.set(room.code,room);}
    sessions.clear();for(const [token,id] of saved.sessions||[])sessions.set(token,id);
    accounts=saved.accounts||[];
    httpClients.clear();for(const [id,data]of saved.httpClients||[])httpClients.set(id,data);
  },
  snapshot:()=>({version:1,rooms:[...rooms.values()],sessions:[...sessions],accounts,httpClients:[...httpClients]})
}):null;
let policy = null;
let policyLoadError = null;
try {
  const savedPolicy = JSON.parse(await readFile(process.env.AI_MODEL_PATH || path.join(root, 'models/strategy-v10-robust2.json'), 'utf8'));
  policy = compatiblePolicy(savedPolicy);
  console.log(`강화학습 모델 로드: ${policy.metadata.episodes}판 · ${policy.metadata.algorithm}`);
} catch (error) { policyLoadError=error.code==='ENOENT'?'model_file_missing':'model_incompatible';console.warn(`AI 모델 사용 불가: ${error.message}. 모델 파일과 현재 규칙의 호환성을 확인하세요.`); }
await mkdir(dataDir, { recursive: true });
const permanentSnapshot=permanentStore?await permanentStore.load():null;
let savedLearning=permanentSnapshot?.learningV2;
if(!savedLearning)try{savedLearning=JSON.parse(await readFile(path.join(dataDir,'ai-learning-v2.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')console.error('AI 학습 기록 읽기 실패:',e.message);}
const learning=createLiveLearning(savedLearning);
const experience=createOnlineExperience({directory:path.join(dataDir,'training-v2'),captureSpeech:false,archive:permanentStore?event=>permanentStore.archiveExperience(event):null,loadRemote:permanentStore?(offset,limit)=>permanentStore.loadExperiences(offset,limit):null});
await experience.restore();
try{accounts=JSON.parse(await readFile(accountPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(permanentSnapshot)accounts=permanentSnapshot.accounts||[];
try {
  const saved = vercel?[]:permanentSnapshot?permanentSnapshot.rooms||[]:JSON.parse(await readFile(savePath, 'utf8'));
  for (const room of saved) {
    room.players.forEach(p => {p.aiStatus={state:'ready'};delete p.pendingDialogue;delete p.pendingDialogueText;if(p.agentMind){delete p.agentMind.executionObservation;for(const scope of Object.values(p.agentMind.scopes||{}))if(scope.plan?.status==='pending'){scope.plan.status='restart-review';scope.plan.outcome='서버 재시작 후 최신 상태로 재판단 필요';}}p.online = !!p.bot;if(room.status==='playing'&&!p.bot&&(room.mode||'online')==='online'){p.takeover=true;p.absent=true;} });
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
  for(const room of rooms.values())learning.observe(room);
  for(const room of rooms.values())checkHumanDeparture(room);
  for(const room of rooms.values())experience.outcome(room);
  for(const room of rooms.values())learning.settle(room);
  for(const room of rooms.values())if(ratingEligible(room))for(const p of room.players.filter(p=>p.surrendered||p.personalSurrender)){
    const a=accounts.find(a=>a.id===(p.gameAccountId||p.accountId));if(a)settleAccount(a,`${room.code}/${room.createdAt}/${room.game.startedAt||'legacy'}`,p.role,p.humanExitOutcome||'surrender');
  }
  for(const room of rooms.values())if(room.status==='finished'&&ratingEligible(room)){
    for(const p of room.players){const a=accounts.find(a=>a.id===(p.gameAccountId||p.accountId));if(!a||p.bot&&!p.gameAccountId)continue;
      const key=`${room.code}/${room.createdAt}/${room.game.startedAt||'legacy'}`;
      settleAccount(a,key,p.role,p.surrendered||p.personalSurrender?p.humanExitOutcome||'surrender':room.game.winner.side==='draw'?'draw':room.game.winner.players.includes(p.id)?'win':'loss',p.personalSurrender?0:p.absent?300:0);
    }
  }
  if(shared)return shared.save();
  const snapshot = JSON.stringify([...rooms.values()]);
  const accountSnapshot=JSON.stringify(accounts);
  const learningSnapshot=JSON.stringify(learning.snapshot());
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await writeFile(`${savePath}.tmp`, snapshot, { mode: 0o600 });
    await rename(`${savePath}.tmp`, savePath);
    await writeFile(`${accountPath}.tmp`,accountSnapshot,{mode:0o600});await rename(`${accountPath}.tmp`,accountPath);
    await writeFile(path.join(dataDir,'ai-learning-v2.json.tmp'),learningSnapshot,{mode:0o600});await rename(path.join(dataDir,'ai-learning-v2.json.tmp'),path.join(dataDir,'ai-learning-v2.json'));
    if(permanentStore)await permanentStore.save({...permanentSnapshot,rooms:JSON.parse(snapshot),accounts:JSON.parse(accountSnapshot),learningV2:JSON.parse(learningSnapshot)});
  }).catch(error => console.error('게임 저장 실패:', error.message));
  return saveQueue;
}
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/rules', (_req, res) => res.set('Cache-Control', 'no-store').json({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS, citizenJobs: CITIZEN_JOBS,rebelJobs:REBEL_JOBS, merchantBuys: MERCHANT_BUYS }));
app.get('/api/ai', (_req, res) => res.set('Cache-Control','no-store').json({ available: !!policy, loadError:policyLoadError,processStartedAt:new Date(Date.now()-process.uptime()*1000).toISOString(),algorithm: policy?.metadata.algorithm || null, episodes: policy?.metadata.episodes || 0, adaptedRules: !!policy?.metadata.adaptedRules, previousTrainingEpisodes: policy?.metadata.transferredFrom?.episodes || 0, trainedAt: policy?.metadata.trainedAt || null, playerCounts: policy?.metadata.playerCounts || [], maxBots: 8 }));
app.use(express.static(path.join(root, 'public')));

const bots = createBotRunner({ policy, runExclusive:shared?work=>shared.run(work):null, currentRoom:code=>rooms.get(code), changed: async room => { broadcast(room); await persist(); }, delay: Math.max(50, Number(process.env.AI_DELAY_MS) || 750) });
app.get('/api/ai-chat/status',(_req,res)=>res.set('Cache-Control','no-store').json({ mode:'reinforcement-only',enabled:false,configured:false,provider:null,model:null,attempts:0,reason:'ai_chat_removed' }));
function broadcast(room,syncOnly=false) {
  if(!syncOnly)autoGameVotes(room);
  for (const socketId of new Set([...room.players,...(room.spectators||[])].map(p => sessions.get(p.token)).filter(Boolean))) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const device = room.devices?.find(d => d.id === socket.data.device);
    if (device) {
      if (room.status === 'playing' && !deviceMayOpen(room, socket.data.player)) socket.data.player = null;
      const snapshot=deviceView(room,device,socket.data.player);const active=room.players.find(p=>p.id===snapshot.device.active);if(active&&chatEnabled(room))snapshot.chat=chatView(room,active);socket.emit('state',snapshot);
    } else {
      const spectator=room.spectators?.find(p=>p.id===socket.data.player),p=spectator||room.players.find(p=>p.id===socket.data.player);
      if(p){const watching=!!spectator||!!p.dead;const snapshot=watching?spectatorView(room,p):view(room,p.id);if(chatEnabled(room))snapshot.chat=chatView(room,p,watching);socket.emit('state',snapshot);}
    }
    const a=accounts.find(a=>a.id===socket.data.account);if(a)socket.emit('account',profile(a));
  }
  if(!vercel||process.env.VERCEL_ENV==='test')bots.schedule(room);
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
  if(p.personalSurrender&&room.status!=='lobby')throw new RuleError('기권한 게임에는 복귀할 수 없습니다. 새 게임에 참가하세요.');
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
  if(room.devices?.some(d=>d.revealing===id))return true;
  if(room.players.find(p=>p.id===id)?.personalSurrender&&room.status==='playing')return false;
  if(room.status==='playing'&&room.devices?.some(d=>d.players.includes(id))&&!room.game.deviceRevealed?.includes(id))return true;
  if (canAct(room, id)) return true;
  const g = room.game;
  return room.status === 'playing' && (['night', 'bishopNight', 'mediationSupport', 'expeditionCards', 'market', 'merchantEvening'].includes(g.phase) || g.phase === 'day' && ['trade', 'royalSupport'].includes(g.pending?.kind));
}
function setupSocket(socket) {
  let windowStart = Date.now(), requests = 0;
  let emailWindow=Date.now(),emailRequests=0;
  async function handleCommand(input, callback) {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); requests = 0; }
      if (++requests > 80) throw new RuleError('요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.');
      if (!input || typeof input.type !== 'string') throw new RuleError('잘못된 요청입니다.');
      if(['sendEmailCode','register','login','googleLogin','accountResume','logout','setNickname'].includes(input.type)){
        if(socket.data.room)throw new RuleError('방을 나간 뒤 계정을 변경하세요.');
        if(input.type==='sendEmailCode'){
          if(Date.now()-emailWindow>3600000){emailWindow=Date.now();emailRequests=0;}
          if(++emailRequests>5)throw new RuleError('인증 메일 요청 한도를 초과했습니다. 나중에 다시 시도하세요.');
          if(accounts.some(a=>(a.loginId||a.name).toLowerCase()===String(input.loginId||'').trim().toLowerCase()))throw new RuleError('이미 사용 중인 아이디입니다.');
          await emailVerification.send(input.email);reply({ok:true});return;
        }
        let signupEmail;
        if(input.type==='register'){
          if(input.password!==input.passwordConfirm)throw new RuleError('비밀번호가 일치하지 않습니다.');
          if(typeof input.password!=='string'||!/^[A-Za-z0-9]{4,64}$/.test(input.password))throw new RuleError('비밀번호는 영어·숫자로만 4~64자 입력하세요.');
          const loginId=input.loginId||input.name;
          if(typeof loginId!=='string'||!/^[\p{L}\p{N}_-]{1,16}$/u.test(loginId)||loginId.startsWith('게스트'))throw new RuleError('아이디는 1~16자의 문자·숫자·_·-로 입력하세요.');
          if(accounts.some(a=>(a.loginId||a.name).toLowerCase()===loginId.toLowerCase()))throw new RuleError('이미 사용 중인 아이디입니다.');
          if(input.email){signupEmail=String(input.email).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail))throw new RuleError('이메일 주소를 확인하세요.');}
        }
        if(input.type==='logout'){const a=accounts.find(a=>a.id===socket.data.account);if(a)a.sessions=a.sessions.filter(s=>s.token!==input.token);delete socket.data.account;await persist();reply({ok:true,account:null});return;}
        if(input.type==='setNickname'){const a=accounts.find(a=>a.id===socket.data.account);if(!a)throw new RuleError('먼저 로그인하세요.');renameAccount(a,input.nickname);await persist();reply({ok:true,account:profile(a),accountToken:input.token});return;}
        const a=input.type==='googleLogin'?googleAccount(accounts,await verifyGoogleCredential(input.credential,process.env.GOOGLE_CLIENT_ID)):input.type==='register'?await register(accounts,input.loginId||input.name,input.password,input.nickname||input.loginId||input.name):input.type==='login'?await login(accounts,input.loginId||input.name,input.password):accountFromToken(accounts,input.token);
        if(!a)throw new RuleError('계정 로그인이 만료되었습니다.');if(signupEmail){a.email=signupEmail;a.emailVerified=false;}socket.data.account=a.id;const token=input.type==='accountResume'?input.token:newAccountSession(a);await persist();reply({ok:true,account:profile(a),accountToken:token});return;
      }
      let room, p;
      let personalResult = null;
      let trainingEvent=null;
      if (['create', 'join','spectate','resume', 'resumeDevice'].includes(input.type)) {
        if (socket.data.room) throw new RuleError('이미 방에 접속했습니다.');
        if (input.type === 'create') {
          const a=accounts.find(a=>a.id===socket.data.account);room = makeRoom(code(),a?a.name:input.name?validateNickname(input.name):guestName());room.mode=input.mode==='offline'?'offline':'online';room.players[0].accountId=a?.id||null; rooms.set(room.code, room); p = room.players[0];
        } else {
          room = rooms.get(typeof input.code === 'string' ? input.code.trim().toUpperCase() : '');
          if (!room) throw new RuleError('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
          if (['join','spectate'].includes(input.type)){
            if(room.mode==='offline')throw new RuleError('오프라인 방에는 다른 기기와 관전자가 참가할 수 없습니다.');
            const a=accounts.find(a=>a.id===socket.data.account),name=a?a.name:input.name?validateNickname(input.name):guestName(room);
            if([...room.players,...(room.spectators||[])].some(p=>p.name===name))throw new RuleError('이 방에 같은 닉네임이 있습니다. 홈에서 닉네임을 바꿔주세요.');
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
          if(p?.personalSurrender&&room.status!=='lobby'&&!['leave','hideSeat'].includes(input.type))throw new RuleError('기권 결과가 확정된 자리는 AI만 조종할 수 있습니다.');
        if(['chatSend','pairRequest','pairAnswer','pairLeave','secretCreate','secretJoin','secretLeave','secretDelete'].includes(input.type)){
          if(!p||p.surrendered&&!p.dead)throw new RuleError('채팅에 참가할 수 없습니다.');chatAct(room,p,input,!!spectator||!!p.dead);
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
            const pending=room.status==='playing'?device.players.filter(id=>!room.game.deviceRevealed?.includes(id)):[];
            if(pending.length&&input.player!==pending[0])throw new RuleError('안내된 플레이어부터 직업을 확인하세요.');
            if (!device.players.includes(input.player) || !deviceMayOpen(room, input.player)) throw new RuleError('이 기기의 플레이어만 자신의 화면을 열 수 있습니다.');
            socket.data.player = input.player;
            if(room.status==='playing'){room.game.deviceRevealed ||= [];if(!room.game.deviceRevealed.includes(input.player)){device.revealing=input.player;room.game.deviceRevealed.push(input.player);}}
          } else {delete device.revealing;socket.data.player = room.status === 'lobby' ? device.players[0] : null;}
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
        if(device&&room.status==='playing'&&(device.revealing||device.players.some(id=>!room.game.deviceRevealed?.includes(id))))throw new RuleError('모든 플레이어가 직업을 확인한 뒤 진행하세요. 화면을 가리고 다음 사람에게 넘겨주세요.');
        if (!p) {
          if (device && room.status === 'finished' && input.type === 'rematch' && device.players.includes(room.host)) p = room.players.find(p => p.id === room.host);
          else throw new RuleError('이름을 확인하고 자신의 화면을 먼저 열어주세요.');
        }
        if (input.type === 'addBot' && !policy) throw new RuleError(policyLoadError==='model_file_missing'?'AI 모델 파일을 찾지 못했습니다. 서버의 AI_MODEL_PATH 설정을 확인하세요.':'AI 모델을 현재 게임 규칙으로 불러오지 못했습니다. 서버 로그를 확인하고 수정 후 재시작하세요.');
         if (input.type === 'start' && !policy && room.players.some(p => p.bot)) throw new RuleError('AI 참가자를 사용하려면 학습된 모델을 서버에 포함하거나 AI를 제거하세요.');
        const oldNotes = new Set(p.notes.map(n => n.id));
        const oldStage = room.game ? `${room.game.day}/${room.game.phase}/${room.game.round}/${room.game.turn}` : null;
        trainingEvent=experience.capture(room,p,input);
        const actionContext=room.game?{phase:room.game.phase,round:room.game.round}:null;
        const before=room.game?assets(room):null,eventId=room.game?.pending?.eventId;act(room, p.id, input);
        if(before)learning.observe(room,{before,actor:p.id,action:input,eventId:eventId||room.game?.pending?.eventId});
         experience.commit(trainingEvent);trainingEvent=null;
         learning.recordHumanAction(room,p,input,actionContext);
         if(p.personalSurrender){sessions.delete(p.token);const account=socket.data.account;socket.data={account};broadcast(room);await persist();reply({ok:true,left:true});return;}
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
      broadcast(room);
      await persist();
      const device = room.devices?.find(d => d.id === socket.data.device);
      reply({ ok: true, session: device ? { code: room.code, token: device.token, device: true } : { code: room.code, token: p.token }, ...(personalResult ? { personalResult } : {}) });
    } catch (error) {
      if (!(error instanceof RuleError)) console.error(error);
      reply({ ok: false, error: error instanceof RuleError ? error.message : '서버 오류가 발생했습니다.' });
    }
  }
  socket.on('command',(input,callback)=>{
    const work=()=>handleCommand(input,callback);
    if(shared)void shared.run(work).catch(error=>{console.error(error.message);if(typeof callback==='function')callback({ok:false,error:'게임 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'});});
    else void work();
  });
  async function disconnect() {
    const room = rooms.get(socket.data.room);
    if (room) {
      for (const p of [...ownedPlayers(socket, room),...(room.spectators||[]).filter(p=>p.id===socket.data.player)]) if (sessions.get(p.token) === socket.id) { sessions.delete(p.token); p.online = false;if(room.status==='playing'&&room.mode!=='offline'&&!p.bot&&!room.spectators?.includes(p)&&!p.surrendered){p.absent=true;p.takeover=true;} }
      broadcast(room); await persist();
    }
  }
  socket.on('disconnect',()=>{if(shared)void shared.run(disconnect).catch(error=>console.error(error.message));else void disconnect();});
  return handleCommand;
}
io.on('connection',setupSocket);
app.use('/api/transport',express.json({limit:'32kb'}));
app.post('/api/transport',async(req,res)=>{
 if(!shared)return res.status(404).json({error:'HTTP transport is only enabled on shared hosting'});
  try{
   let output;
   if(req.body.client&&!req.body.command){
    await shared.read(()=>{
     const data=httpClients.get(req.body.client),room=rooms.get(data?.room);
     if(!data){output={expired:true};return;}
     if(room?.status==='playing'&&room.players.some(p=>(p.bot||p.takeover)&&!p.surrendered&&canAct(room,p.id)))return;
     const events=[],socket={id:req.body.client,data,emit:(name,value)=>events.push({name,value})};
     io.sockets.sockets.set(socket.id,socket);try{if(room)broadcast(room,true);}finally{io.sockets.sockets.delete(socket.id);}
     output={client:socket.id,reply:{ok:true},events};
    });
    if(output)return res.set('Cache-Control','no-store').json(output);
   }
  await shared.run(async()=>{
   const id=req.body.client||randomUUID();
   if(req.body.client&&!httpClients.has(id)){output={expired:true};return;}
   const data=httpClients.get(id)||{},events=[],handlers={};
   const socket={id,data,emit:(name,value)=>events.push({name,value}),on:(name,fn)=>handlers[name]=fn,disconnect:()=>{}};
   httpClients.set(id,data);io.sockets.sockets.set(id,socket);const command=setupSocket(socket);
   let reply={ok:true};
   try{
     if(req.body.command)await command(req.body.command,value=>reply=value);
    const room=rooms.get(socket.data.room);
     if(room?.status==='playing'&&!req.body.command){
     const bot=room.players.find(p=>(p.bot||p.takeover)&&!p.surrendered&&canAct(room,p.id));
      if(bot&&policy)stepServerlessAI(room,policy);
    }
    if(room)broadcast(room,true);
    httpClients.set(id,socket.data);await persist();output={client:id,reply,events};
   }finally{io.sockets.sockets.delete(id);}
  });
  res.set('Cache-Control','no-store').json(output);
 }catch(error){console.error('HTTP game transport:',error.message);res.status(503).json({error:'게임 연결을 다시 시도해주세요.'});}
});
const port = Number(process.env.PORT) || 3000;
if(!vercel)http.listen(port, '0.0.0.0', () => console.log(`왕국과 반란 서버: http://localhost:${port}`));
let syncTimer;
if(shared&&(!vercel||process.env.VERCEL_ENV==='test')){
  syncTimer=setInterval(()=>{
    if(!io.sockets.sockets.size)return;
    void shared.read(()=>{
      for(const socket of io.sockets.sockets.values()){
        const room=rooms.get(socket.data.room),player=[...(room?.players||[]),...(room?.spectators||[])].find(p=>p.id===socket.data.player);
        if(player&&sessions.get(player.token)!==socket.id){socket.emit('replaced');socket.disconnect(true);}
      }
      for(const room of rooms.values())broadcast(room,true);
    }).catch(error=>console.error('게임 동기화 실패:',error.message));
  },1500);syncTimer.unref?.();
}
export default http;
export async function closeRuntime(){clearInterval(syncTimer);bots.close();if(!shared)await persist();await experience.flush();experience.close();io.close();}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
   await closeRuntime(); if(!vercel)http.close(() => process.exit(0));
});
