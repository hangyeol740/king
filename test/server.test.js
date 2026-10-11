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
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, AI_DELAY_MS: '50' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    assert.equal(client.state.status, 'playing'); assert.equal(client.state.me.hand.length, 12);
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
  for (let i = 0; i < 3; i++) await send(await actor(), { type: 'gather' });
  for (let i = 0; i < 3; i++) {
    const p = await actor(); await send(p, { type: 'beginCraft' }); await send(p, { type: 'craftDone' });
  }
  for (let i = 0; i < 3; i++) await send(await actor(), { type: 'refresh', cards: [] });
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
