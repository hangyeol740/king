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

const root = fileURLToPath(new URL('../', import.meta.url));
const clients = [];
let server, dataDir, url, port;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start() {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    assert.equal(client.state.status, 'playing'); assert.equal(client.state.me.hand.length, 5);
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
  const newer = await connect(), replaced = once(restored, 'replaced');
  assert.ok((await send(newer, { type: 'resume', ...created.session })).ok);
  await replaced; assert.equal(restored.connected, false); assert.equal(newer.state.me.id, before.id);
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
