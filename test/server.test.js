import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { candidates } from '../lib/ai-policy.js';
import { baseline } from '../ai/environment.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const clients = [];
let server, dataDir, url, port;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start() {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, OPENAI_API_KEY:'',BAZE_API_KEY:'',PORT: String(port), DATA_DIR: dataDir, AI_DELAY_MS: '50' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  server.stderr.on('data', data => { errors += data; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`서버 시작 실패: ${errors}`);
    try { const r = await fetch(`${url}/health`); if (r.ok) return; } catch {}
    await sleep(30);
  }
  throw new Error('서버 시작 시간 초과');
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const done = once(server, 'exit'); server.kill('SIGTERM'); await done;
}
async function connect() {
  const client = io(url, { reconnection: false, transports: ['websocket'] });
  clients.push(client); client.on('state', state => { client.state = state; });
  await once(client, 'connect'); return client;
}
const send = (client, command) => client.timeout(3000).emitWithAck('command', command);
before(async () => {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  port = probe.address().port; await new Promise(r => probe.close(r)); url = `http://127.0.0.1:${port}`;
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'kingdom-test-')); await start();
});
after(async () => { clients.forEach(c => c.disconnect()); await stop(); await rm(dataDir, { recursive: true, force: true }); });

test('실제 WebSocket: 방 생성·코드 입장·권한 검증·게임 시작·개인화 상태', async () => {
  const a = await connect(), b = await connect(), c = await connect();
  const created = await send(a, { type: 'create', name: '<왕국>' });
  assert.ok(created.ok); assert.match(created.session.code, /^[A-Z2-9]{6}$/);
  assert.ok((await send(b, { type: 'join', code: created.session.code.toLowerCase(), name: '시민' })).ok);
  assert.ok((await send(c, { type: 'join', code: created.session.code, name: '반란' })).ok);
  assert.equal((await send(b, { type: 'start' })).ok, false);
  assert.ok((await send(a, { type: 'start' })).ok);
  await sleep(30);
  for (const client of [a, b, c]) {
    assert.equal(client.state.status, 'playing'); assert.equal(client.state.me.hand.length, client.state.me.role === 'king' ? 20 : 12);
    assert.ok(client.state.players.every(p => !('hand' in p) && !('token' in p)));
    assert.equal(client.state.players.filter(p => p.role === 'king').length, 1);
  }
  const intruder = await connect();
  assert.equal((await send(intruder, { type: 'join', code: created.session.code, name: '늦은입장' })).ok, false);
  assert.equal((await send(intruder, { type: 'resume', code: created.session.code, token: 'fake' })).ok, false);
});
test('일시 끊김과 새 연결에 복귀하면 같은 자리·직업·손패 유지', async () => {
  const a = await connect(); const created = await send(a, { type: 'create', name: '복귀테스트' });
  const b = await connect(); await send(b, { type: 'join', code: created.session.code, name: '둘' });
  const c = await connect(); await send(c, { type: 'join', code: created.session.code, name: '셋' });
  await send(a, { type: 'start' }); await sleep(20);
  const before = structuredClone(a.state.me); a.disconnect(); await sleep(20);
  const restored = await connect();
  assert.ok((await send(restored, { type: 'resume', ...created.session })).ok);
  assert.equal(restored.state.me.id, before.id); assert.equal(restored.state.me.role, before.role);
  assert.deepEqual(restored.state.me.hand, before.hand);
  const newer = await connect(), replaced = once(restored, 'replaced'), disconnected = once(restored, 'disconnect');
  assert.ok((await send(newer, { type: 'resume', ...created.session })).ok);
  await replaced; await disconnected; assert.equal(restored.connected, false); assert.equal(newer.state.me.id, before.id);
});
test('로컬 서버 재시작 후 저장된 방과 비공개 복귀 토큰으로 복구', async () => {
  const a = await connect(); const created = await send(a, { type: 'create', name: '저장테스트' });
  const b = await connect(); await send(b, { type: 'join', code: created.session.code, name: '둘' });
  const c = await connect(); await send(c, { type: 'join', code: created.session.code, name: '셋' });
  await send(a, { type: 'start' }); const previous = structuredClone(a.state.me);
  clients.forEach(c => c.disconnect()); await stop(); await start();
  const restored = await connect(); assert.ok((await send(restored, { type: 'resume', ...created.session })).ok);
  assert.deepEqual(restored.state.me.hand, previous.hand); assert.equal(restored.state.me.role, previous.role);
  assert.equal(restored.state.me.id, previous.id); assert.equal(restored.state.game.phase, 'morning');
});
test('WebSocket 시민지원 6장·재접속 중복 없음·공개 API 공통 제작만·개인별 제작 권한', async () => {
  const a = await connect(), b = await connect(), c = await connect();
  const created = await send(a, { type: 'create', name: '지원확인' });
  const br = await send(b, { type: 'join', code: created.session.code, name: '둘' });
  const cr = await send(c, { type: 'join', code: created.session.code, name: '셋' });
  const group = [a, b, c], sessions = [created, br, cr];
  await send(a, { type: 'start' });
  for(let i=0;i<100&&!group.every(s=>s.state?.status==='playing');i++)await sleep(10);
  const k = group.find(s => s.state.me.role === 'king');
  await send(k, { type: 'expedition' });
  for(const p of group)await send(p,{type:'voteExpedition',difficulty:'low'});
  for (const p of group.filter(p => p !== k)) await send(p, { type: 'joinExpedition', join: false });
  await send(k, { type: 'contribute', cards: [] });
  for (const p of group) await send(p, { type: 'redistribute', accept: false });
  const actor = async () => {
    for (let i = 0; i < 100; i++) {
      const g = group[0].state.game;
      if (g.phase === 'day' && group.every(s => s.state.game.phase === g.phase && s.state.game.round === g.round && s.state.game.current === g.current)) {
        return group.find(s => s.state.me.id === g.current);
      }
      await sleep(10);
    }
    throw new Error('플레이어 차례 상태 동기화 시간 초과');
  };
  for (let i = 0; i < 3; i++) await send(await actor(), { type: 'draw3' });
  for (let i = 0; i < 3; i++) {
    const p = await actor(); await send(p, { type: 'beginCraft' }); await send(p, { type: 'craftDone' });
  }
  for (let i = 0; i < 3; i++) await send(await actor(), { type: 'refresh', cards: [] });
  await sleep(30);for(const s of group.filter(s=>s.state.me.role==='rebel'))await send(s,{type:'ambushSkip'});
  for (let i = 0; i < 100 && group.some(s => s.state.game.phase !== 'evening'); i++) await sleep(10);
  const counts = new Map(group.map(s => [s.state.me.id, s.state.me.hand.length]));
  assert.ok((await send(k, { type: 'aid' })).ok); await sleep(30);
  for (const p of group) {
    assert.equal(p.state.me.hand.length, counts.get(p.state.me.id) + (p === k ? 0 : 6));
    if (p !== k) assert.match(p.state.me.notes.at(-1).text, /시민지원: 카드 \+6장/);
  }
  const recipient = group.find(p => p !== k), previous = structuredClone(recipient.state.me);
  const session = sessions[group.indexOf(recipient)].session;
  recipient.disconnect(); const restored = await connect();
  assert.ok((await send(restored, { type: 'resume', ...session })).ok);
  assert.deepEqual(restored.state.me.hand, previous.hand);
  const rules = await (await fetch(`${url}/api/rules`)).json();
  assert.equal(rules.recipes.length, 9);
  assert.ok(rules.recipes.every(r=>!r.role));
  assert.equal(k.state.me.recipes.filter(r=>r.role==='king').length,4);
  assert.ok(k.state.me.recipes.every(r=>!r.role||r.role==='king'));
  assert.ok(rules.recipes.some(r => r.input === 'eternalSword' && r.output === 'eternalMagic'));
  assert.deepEqual(rules.recipes.find(r => r.output === 'ironSword').ingredients, [
    { input: 'flameSword', count: 1 }, { input: 'northSword', count: 1 }
  ]);
});
test('게임 중 방 나가기로 연결 해제, 다른 사람에게 오프라인 표시·재입장으로 원래 손패·차례 복구', async () => {
  const a = await connect(), b = await connect(), c = await connect();
  const created = await send(a, { type: 'create', name: '나가기방장' });
  await send(b, { type: 'join', code: created.session.code, name: '둘' });
  await send(c, { type: 'join', code: created.session.code, name: '셋' });
  await send(a, { type: 'start' }); await sleep(20);
  const before = structuredClone(a.state);
  const result = await send(a, { type: 'leave' });
  assert.ok(result.ok); assert.ok(result.left); assert.deepEqual(result.resumeSession, created.session);
  await sleep(20);
  assert.equal(b.state.players.find(p => p.id === before.me.id).online, false);
  assert.equal(b.state.players.length, 3); assert.equal(b.state.status, 'playing');
  assert.equal((await send(a, { type: 'aid' })).ok, false);
  assert.ok((await send(a, { type: 'resume', ...result.resumeSession })).ok);
  assert.deepEqual(a.state.me.hand, before.me.hand); assert.equal(a.state.me.role, before.me.role);
  assert.equal(a.state.game.phase, before.game.phase); assert.equal(a.state.host, before.host);
  await sleep(20); assert.equal(b.state.players.find(p => p.id === before.me.id).online, true);
  await send(a, { type: 'leave' });
  const newRoom = await send(a, { type: 'create', name: '새로운방' });
  assert.ok(newRoom.ok); assert.notEqual(newRoom.session.code, created.session.code);
  assert.ok((await send(a, { type: 'leave' })).ok);
  assert.ok((await send(a, { type: 'resume', ...result.resumeSession })).ok);
  assert.equal(a.state.me.id, before.me.id);
});
test('대기실 방 나가기 시 참가자 제거·방장 위임·마지막 참가자 퇴장 시 방 삭제', async () => {
  const a = await connect(), b = await connect();
  const created = await send(a, { type: 'create', name: '대기실방장' });
  await send(b, { type: 'join', code: created.session.code, name: '새방장' });
  const result = await send(a, { type: 'leave' });
  assert.ok(result.ok); assert.equal(result.resumeSession, undefined); await sleep(20);
  assert.equal(b.state.players.length, 1); assert.equal(b.state.host, b.state.me.id);
  await send(b, { type: 'leave' });
  assert.equal((await send(a, { type: 'resume', ...created.session })).ok, false);
});
test('학습 모델 로드·AI 추가 제거·사람 1명 + AI 2명 실시간 게임 끝까지 완료', { timeout: 45000 }, async () => {
  const info = await (await fetch(`${url}/api/ai`)).json();
  assert.equal(info.available, true); assert.equal(info.algorithm, 'PPO-self-play'); assert.ok(info.episodes > 0);
  const human = await connect(); await send(human, { type: 'create', name: '혼자플레이' });
  assert.ok((await send(human, { type: 'addBot' })).ok);
  const first = human.state.players.find(p => p.bot);
  assert.ok((await send(human, { type: 'removeBot', target: first.id })).ok);
  assert.equal(human.state.players.length, 1);
  await send(human, { type: 'addBot' }); await send(human, { type: 'addBot' });
  assert.equal(human.state.players.filter(p => p.bot && p.online).length, 2);
  assert.ok((await send(human, { type: 'start' })).ok);
  const started = Date.now();
  let humanActions = 0;
  while (human.state.status === 'playing' && Date.now() - started < 40000) {
    const actions = candidates(human.state);
    if (actions.length) {
      const result = await send(human, baseline(human.state, actions));
      assert.ok(result.ok, result.error); humanActions++;
      // 실제 서버 요청 제한을 유지하면서 사람의 선택 속도를 모사합니다.
      await sleep(160);
    } else await sleep(10);
  }
  assert.equal(human.state.status, 'finished', JSON.stringify(human.state.game));
  assert.ok(humanActions > 0); assert.ok(human.state.game.winner);
});
test('AI 다음에 입장한 사람에게 방장 권한 위임, 사람이 모두 떠나면 AI만 있는 대기실 삭제', async () => {
  const a = await connect(), b = await connect();
  const created = await send(a, { type: 'create', name: '원방장' });
  await send(a, { type: 'addBot' }); await send(b, { type: 'join', code: created.session.code, name: '새방장' });
  await send(a, { type: 'leave' }); await sleep(30);
  assert.equal(b.state.host, b.state.me.id); assert.equal(b.state.players.length, 2);
  await send(b, { type: 'leave' });
  assert.equal((await send(a, { type: 'resume', ...created.session })).ok, false);
});

test('WebSocket 중립 직업 설정·주교 배정·밤 순서·재접속과 저장 복구', async () => {
  const group = [await connect(), await connect(), await connect(), await connect()];
  const created = await send(group[0], { type: 'create', name: '주교방장' });
  const sessions = [created.session];
  for (let i = 1; i < group.length; i++) sessions.push((await send(group[i], { type: 'join', code: created.session.code, name: `주교테스트${i}` })).session);
  assert.equal((await send(group[1], { type: 'neutralJobs', jobs: ['bishop'] })).ok, false);
  assert.ok((await send(group[0], { type: 'neutralJobs', jobs: ['bishop'] })).ok);
  assert.ok((await send(group[0], { type: 'start' })).ok); await sleep(30);
  const k = group.find(s => s.state.me.role === 'king'), b = group.find(s => s.state.me.job === 'bishop'), rebel = group.find(s => s.state.me.role === 'rebel');
  assert.ok(b); assert.equal(b.state.me.churchInfluence, 0);
  assert.equal(b.state.me.recipes.filter(r => r.job === 'bishop').length, 4);
  for (const client of group.filter(s => s !== b)) {
    assert.equal(client.state.me.churchInfluence, undefined);
    assert.equal(client.state.players.find(p => p.id === b.state.me.id).job, null);
  }
  await send(k, { type: 'expedition' });
  for (const p of group) await send(p, { type: 'voteExpedition', difficulty: 'low' });
  for (const p of group.filter(p => p !== k)) await send(p, { type: 'joinExpedition', join: false });
  await send(k, { type: 'contribute', cards: [] });
  for (const p of group) await send(p, { type: 'redistribute', accept: false });
  const actor = async () => {
    for (let i = 0; i < 100; i++) {
      const g = k.state.game;
      if (group.every(s => s.state.game.phase === g.phase && s.state.game.round === g.round && s.state.game.current === g.current)) return group.find(s => s.state.me.id === g.current);
      await sleep(10);
    }
    throw new Error('주교 테스트 상태 동기화 실패');
  };
  for (let i = 0; i < 4; i++) await send(await actor(), { type: 'draw3' });
  for (let i = 0; i < 4; i++) { const p = await actor(); await send(p, { type: 'beginCraft' }); await send(p, { type: 'craftDone' }); }
  for (let i = 0; i < 4; i++) await send(await actor(), { type: 'refresh', cards: [] });
  await sleep(30);await send(rebel,{type:'ambushSkip'});await sleep(30); await send(k, { type: 'aid' }); await sleep(30);
  assert.equal((await send(b, { type: 'bishopDone' })).ok, false);
  assert.ok((await send(rebel, { type: 'revolt', cards: [] })).ok); await sleep(30);
  assert.equal(b.state.game.phase, 'bishopNight');
  assert.equal((await send(k, { type: 'bishopDone' })).ok, false);
  const before = structuredClone(b.state.me), session = sessions[group.indexOf(b)];
  clients.forEach(c => c.disconnect()); await stop(); await start();
  const restored = await connect(); assert.ok((await send(restored, { type: 'resume', ...session })).ok);
  assert.deepEqual(restored.state.me, before); assert.equal(restored.state.game.phase, 'bishopNight');
  assert.ok((await send(restored, { type: 'bishopDone' })).ok);
  assert.equal(restored.state.game.phase, 'morning'); assert.equal(restored.state.game.day, 2);
});

test('WebSocket 3인 첫날 왕 사형 선택·투표 비공개·서버 재시작 복구·전원 완료 후 몰수', async () => {
  const group = [await connect(), await connect(), await connect()], sessions = [];
  const created = await send(group[0], { type: 'create', name: '사형방장' }); sessions.push(created.session);
  for (let i = 1; i < group.length; i++) sessions.push((await send(group[i], { type: 'join', code: created.session.code, name: `사형참가${i}` })).session);
  await send(group[0], { type: 'start' }); await sleep(20);
  const k = group.find(p => p.state.me.role === 'king'), target = group.find(p => p !== k), targetId = target.state.me.id;
  assert.equal(k.state.game.maxDays, 10);
  assert.ok((await send(k, { type: 'execute' })).ok); await sleep(20);
  assert.equal(target.state.game.phase, 'executionVote'); assert.equal(target.state.me.hand.length, 12);
  assert.equal((await send(target, { type: 'voteExecution', target: k.state.me.id })).ok, false);
  assert.ok((await send(k, { type: 'voteExecution', target: targetId })).ok); await sleep(20);
  assert.equal(target.state.game.pending.myVote, null); assert.equal(target.state.game.pending.voteCount, 1);
  assert.equal(target.state.game.pending.votes, undefined);
  const kingIndex = group.indexOf(k);
  clients.forEach(c => c.disconnect()); await stop(); await start();
  const restored = [];
  for (const session of sessions) { const c = await connect(); assert.ok((await send(c, { type: 'resume', ...session })).ok); restored.push(c); }
  assert.equal(restored[kingIndex].state.game.pending.myVote, targetId);
  for (const p of restored.filter((client, i) => i !== kingIndex && !client.state.game.pending?.myDone)) assert.ok((await send(p, { type: 'voteExecution', target: targetId })).ok);
  await sleep(20);
  assert.equal(restored[0].state.game.phase, 'redistribute');
  assert.equal(restored.find(p => p.state.me.id === targetId).state.me.hand.length, 12);
  assert.equal(restored.find(p => p.state.me.id === targetId).state.me.executed, true);
  assert.equal(restored[0].state.game.lastExecution.target, targetId);
});

test('한 기기3명은 시작·전환·재접속 시 숨김, 자신의 차례만 열고 전원 투표·재분배 진행', async()=>{
  const shared=await connect();await send(shared,{type:'create',name:'공유하나'});
  await send(shared,{type:'mode',mode:'offline'});
  const added=await send(shared,{type:'addLocalPlayer',name:'공유둘'});assert.ok(added.ok);assert.equal(added.session.device,true);
  const last=await send(shared,{type:'addLocalPlayer',name:'공유셋'});assert.ok(last.ok);const session=last.session;
  assert.equal(shared.state.device.players.length,3);assert.equal(shared.state.players.filter(p=>p.online).length,3);
  assert.ok(shared.state.players.every(p=>/^게스트\d+$/.test(p.name)));
  await send(shared,{type:'start'});assert.equal(shared.state.device.active,null);assert.equal(shared.state.me.hand.length,0);assert.equal(shared.state.me.role,null);
  const k=shared.state.players.find(p=>p.role==='king'),nonKing=shared.state.players.find(p=>p.id!==k.id);
  assert.equal((await send(shared,{type:'openSeat',player:nonKing.id})).ok,false);
  assert.equal((await send(shared,{type:'expedition'})).ok,false);
  assert.ok((await send(shared,{type:'openSeat',player:k.id})).ok);assert.equal(shared.state.me.id,k.id);assert.equal(shared.state.me.hand.length,20);
  assert.ok((await send(shared,{type:'lockSeat'})).ok);assert.equal(shared.state.me.hand.length,0);
  assert.ok((await send(shared,{type:'openSeat',player:k.id})).ok);assert.ok((await send(shared,{type:'expedition'})).ok);assert.equal(shared.state.device.active,null);
  shared.disconnect();const restored=await connect();assert.ok((await send(restored,{type:'resumeDevice',...session})).ok);assert.equal(restored.state.device.active,null);
  const ids=restored.state.device.players.map(p=>p.id);
  for(const id of ids){assert.ok((await send(restored,{type:'openSeat',player:id})).ok);assert.ok((await send(restored,{type:'voteExpedition',difficulty:'low'})).ok);assert.equal(restored.state.device.active,null);}
  for(const id of ids.filter(id=>id!==k.id)){await send(restored,{type:'openSeat',player:id});assert.ok((await send(restored,{type:'joinExpedition',join:false})).ok);}
  await send(restored,{type:'openSeat',player:k.id});await send(restored,{type:'contribute',cards:[]});
  for(const id of ids){await send(restored,{type:'openSeat',player:id});assert.ok((await send(restored,{type:'redistribute',accept:false})).ok);}
  assert.equal(restored.state.game.phase,'day');assert.equal(restored.state.device.active,null);
  const current=restored.state.game.current;await send(restored,{type:'openSeat',player:current});assert.ok((await send(restored,{type:'draw3'})).ok);assert.equal(restored.state.device.active,null);
});

test('온라인 공유 추가 금지·오프라인 다른 기기/관전 참가 금지·추가 참가자 삭제', async()=>{
  const shared=await connect(),remote=await connect();const created=await send(shared,{type:'create',name:'혼합공유1'});
  assert.equal((await send(shared,{type:'addLocalPlayer',name:'혼합공유2'})).ok,false);await send(shared,{type:'mode',mode:'offline'});
  const group=await send(shared,{type:'addLocalPlayer',name:'혼합공유2'});assert.ok(group.ok);
  assert.equal((await send(remote,{type:'join',code:created.session.code})).ok,false);assert.equal((await send(remote,{type:'spectate',code:created.session.code})).ok,false);
  const target=shared.state.device.players.find(p=>p.id!==shared.state.host);assert.ok((await send(shared,{type:'removeLocalPlayer',target:target.id})).ok);assert.equal(shared.state.players.length,1);
});

test('대기실 공유 기기 퇴장 시 그 기기 참가자만 제거하고 다른 기기에 방장 위임', async()=>{
  const shared=await connect(),remote=await connect();const created=await send(shared,{type:'create',name:'퇴장공유1'});
  await send(shared,{type:'mode',mode:'offline'});await send(shared,{type:'addLocalPlayer',name:'퇴장공유2'});
  await send(shared,{type:'leave'});await sleep(20);assert.equal((await send(remote,{type:'join',code:created.session.code})).ok,false);
});

test('서버 재시작 뒤 공유 기기 인원·손패를 복구하되 이름 확인 전에는 비공개 상태를 보내지 않음', async()=>{
  const shared=await connect();await send(shared,{type:'create',name:'저장공유1'});await send(shared,{type:'mode',mode:'offline'});await send(shared,{type:'addLocalPlayer',name:'저장공유2'});
  const added=await send(shared,{type:'addLocalPlayer',name:'저장공유3'});await send(shared,{type:'start'});
  const king=shared.state.players.find(p=>p.role==='king');await send(shared,{type:'openSeat',player:king.id});const before=structuredClone(shared.state.me.hand);
  clients.forEach(c=>c.disconnect());await stop();await start();const restored=await connect();
  assert.ok((await send(restored,{type:'resumeDevice',...added.session})).ok);assert.equal(restored.state.device.players.length,3);assert.equal(restored.state.device.active,null);
  assert.equal(restored.state.me.role,null);assert.equal(restored.state.me.hand.length,0);assert.equal(restored.state.me.notes.length,0);
  await send(restored,{type:'openSeat',player:king.id});assert.deepEqual(restored.state.me.hand,before);
});

test('실제 익명 상점 동시 구매는 재고를 중복 판매하지 않으며 돈·진열장이 재시작 후 복구', async()=>{
  const group=[await connect(),await connect(),await connect(),await connect(),await connect()],sessions=[];
  const created=await send(group[0],{type:'create',name:'상점검증1'});sessions.push(created.session);
  for(let i=1;i<group.length;i++)sessions.push((await send(group[i],{type:'join',code:created.session.code,name:`상점검증${i+1}`})).session);
  const command=async(p,a)=>{const result=await send(p,a);assert.ok(result.ok,result.error);await sleep(8);return result;};
  await command(group[0],{type:'config',roles:{king:1,citizen:1,rebel:1,neutral:2}});await command(group[0],{type:'neutralJobs',jobs:['merchant','bishop']});await command(group[0],{type:'start'});await sleep(20);
  const k=group.find(p=>p.state.me.role==='king'),m=group.find(p=>p.state.me.job==='merchant'),bishop=group.find(p=>p.state.me.job==='bishop'),reb=group.find(p=>p.state.me.role==='rebel'),cit=group.find(p=>p.state.me.role==='citizen');
  async function morning(){await command(k,{type:'expedition'});for(const p of group)await command(p,{type:'voteExpedition',difficulty:'low'});for(const p of group.filter(p=>p!==k))await command(p,{type:'joinExpedition',join:p===m});assert.equal(m.state.game.pending.myDone,true);await command(k,{type:'contribute',cards:[]});for(const p of group)await command(p,{type:'redistribute',accept:false});assert.equal(k.state.game.phase,'market');}
  await morning();for(const p of group.filter(p=>p!==m))await command(p,{type:'marketDone'});
  const actor=()=>group.find(p=>p.state.me.id===k.state.game.current);
  for(let i=0;i<5;i++){const p=actor();await command(p,{type:'draw3'});}
  for(let i=0;i<5;i++){const p=actor();await command(p,{type:'beginCraft'});if(p===m)await command(p,{type:'craft',recipe:0,count:1});await command(p,{type:'craftDone'});}
  for(let i=0;i<5;i++)await command(actor(),{type:'refresh',cards:[]});await command(reb,{type:'ambushSkip'});await command(k,{type:'aid'});assert.equal(k.state.game.phase,'merchantEvening');
  const goods=[m.state.me.hand.find(c=>c.type==='resource'),m.state.me.hand.find(c=>c.type==='sword')];
  await command(m,{type:'displayGoods',cards:goods.map(c=>c.id),price:1});const [first,second]=m.state.game.shop;
  await command(m,{type:'changePrice',stock:second.id,price:3});
  for(const p of group.filter(p=>p!==m)){assert.equal(p.state.me.money,undefined);assert.equal(p.state.players.find(p=>p.id===m.state.me.id).job,null);assert.equal(p.state.game.pending,null);assert.ok(goods.every(c=>!JSON.stringify(p.state).includes(c.id)));}
  await command(m,{type:'beginCraft'});await command(m,{type:'craftDone'});assert.equal((await send(m,{type:'beginCraft'})).ok,false);await command(m,{type:'merchantDone'});
  await command(reb,{type:'revolt',cards:[]});await command(bishop,{type:'bishopDone'});await morning();
  const before=new Map([k,cit].map(p=>[p.state.me.id,p.state.me.hand.map(c=>c.id)]));
  const requests=[k,cit].map(p=>send(p,{type:'marketBuy',stock:first.id,quantity:1,cards:[p.state.me.hand[0].id]}));
  const responses=await Promise.all(requests);await sleep(20);assert.equal(responses.filter(r=>r.ok).length,1);
  const winner=responses[0].ok?k:cit,loser=responses[0].ok?cit:k;assert.ok(winner.state.me.hand.some(c=>c.id===goods[0].id));assert.deepEqual(loser.state.me.hand.map(c=>c.id),before.get(loser.state.me.id));
  assert.equal(m.state.me.money,2);assert.equal(k.state.me.money,undefined);assert.equal(m.state.game.shop.length,1);assert.equal(m.state.game.shop[0].price,3);
  const shop=structuredClone(m.state.game.shop),money=m.state.me.money,session=sessions[group.indexOf(m)];
  clients.forEach(c=>c.disconnect());await stop();await start();const restored=await connect();assert.ok((await send(restored,{type:'resume',...session})).ok);
  assert.equal(restored.state.me.money,money);assert.deepEqual(restored.state.game.shop,shop);assert.equal(restored.state.game.phase,'market');
});

test('계정/게스트 이름·관전 손패·익명 채팅·게임 중 전환 금지·무승부 점수 저장',async()=>{
 const g=[await connect(),await connect(),await connect()];const accounts=[];
 for(let i=0;i<3;i++){const r=await send(g[i],{type:'register',name:`계정검증${i}`,password:'abc12345'});assert.ok(r.ok,r.error);accounts.push(r);}
 const created=await send(g[0],{type:'create',name:'위조'});for(let i=1;i<3;i++)assert.ok((await send(g[i],{type:'join',code:created.session.code,name:'위조'})).ok);
 await send(g[0],{type:'start'});await sleep(20);assert.equal(g[0].state.me.name,'계정검증0');
 const s=await connect();assert.ok((await send(s,{type:'spectate',code:created.session.code,name:'위조'})).ok);assert.match(s.state.me.name,/^게스트\d+$/);assert.ok(s.state.players.every(p=>p.role&&p.hand));
 assert.equal((await send(s,{type:'expedition'})).ok,false);assert.ok((await send(s,{type:'chatSend',channel:'spectator',text:'관전'})).ok);
 assert.equal((await send(g[0],{type:'toSpectator',target:g[1].state.me.id})).ok,false);
 await send(g[0],{type:'chatSend',channel:'public',text:'모두'});await sleep(20);assert.equal(s.state.chat.public.at(-1).text,'모두');assert.ok(!g[1].state.chat.spectator);
 const requester=g.find(p=>p.state.me.role==='king');await send(requester,{type:'requestDraw'});const voter=g.find(p=>p!==requester);await send(voter,{type:'gameVote',vote:voter.state.game.vote.id,accept:true});await sleep(20);assert.equal(requester.state.game.winner.side,'draw');
 for(let i=0;i<3;i++){await send(g[i],{type:'leave'});const r=await send(g[i],{type:'accountResume',token:accounts[i].accountToken});assert.ok(r.ok);assert.equal(r.account.points,30);assert.equal(r.account.draws,1);}
});

test('온라인 이탈 AI 대체·도중 복귀20점 차감·미복귀 종료300점 추가·점수0하한',async()=>{
 const group=[await connect(),await connect(),await connect()],auth=[];
 for(let i=0;i<3;i++){const r=await send(group[i],{type:'register',name:`이탈계정${i}`,password:'abc12345'});assert.ok(r.ok);auth.push(r);}
 const created=await send(group[0],{type:'create'}),session=[created.session];for(let i=1;i<3;i++)session.push((await send(group[i],{type:'join',code:created.session.code})).session);
  await send(group[0],{type:'start'});await sleep(20);const k=group.find(p=>p.state.me.role==='king'),v=group.find(p=>p!==k);await send(k,{type:'requestDraw'});for(let i=0;i<30&&!v.state.game.vote;i++)await sleep(10);await send(v,{type:'gameVote',vote:v.state.game.vote.id,accept:true});
 await sleep(20);assert.equal(k.state.status,'finished');await send(group[0],{type:'rematch'});await send(group[0],{type:'start'});await sleep(20);
  const id=group[1].state.me.id;group[1].disconnect();for(let i=0;i<50&&!group[0].state.players.find(p=>p.id===id).takeover;i++)await sleep(10);assert.equal(group[0].state.players.find(p=>p.id===id).takeover,true);
 const restored=await connect();await send(restored,{type:'accountResume',token:auth[1].accountToken});assert.ok((await send(restored,{type:'resume',...session[1]})).ok);await sleep(20);assert.equal(restored.state.players.find(p=>p.id===id).takeover,false);
 const check=await connect();const profile=await send(check,{type:'accountResume',token:auth[1].accountToken});assert.equal(profile.account.points,10);
  group[2].disconnect();await sleep(10);const active=[group[0],restored],request=active.find(p=>p.state.me.role!=='citizen');await send(request,{type:'requestDraw'});const other=active.find(p=>p!==request);for(let i=0;i<30&&!other.state.game.vote;i++)await sleep(10);assert.ok((await send(other,{type:'gameVote',vote:other.state.game.vote.id,accept:true})).ok);await sleep(30);
 const absent=await connect();const result=await send(absent,{type:'accountResume',token:auth[2].accountToken});assert.equal(result.account.points,0);assert.equal(result.account.draws,2);
});
