import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), '..');
const directory = path.join(root, '.data');
const statePath = path.join(directory, 'online.json');
const logPath = path.join(directory, 'online.log');
const port = Number(process.env.PORT) || 3000;
const origin = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function state() { try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return null; } }
async function alive(saved) {
  if (!saved?.pid) return false;
  try {
    process.kill(saved.pid, 0);
    const command = await readFile(`/proc/${saved.pid}/cmdline`, 'utf8');
    return command.includes(filename) && command.split('\0').includes('worker');
  } catch { return false; }
}
async function health() {
  try {
    const response = await fetch(`${origin}/api/rules`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const rules = await response.json();
    return rules.roles?.king === '왕' && !!rules.cards?.resource;
  } catch { return false; }
}
function print(saved) {
  console.log(`상태: ${saved?.phase || 'stopped'}`);
  if (saved?.url) console.log(`공개 게임 주소: ${saved.url}`);
  if (saved?.error) console.log(`오류: ${saved.error}`);
  console.log(`로그: ${logPath}`);
}

async function worker() {
  await mkdir(directory, { recursive: true });
  const log = await open(logPath, 'a', 0o600);
  let saved = { pid: process.pid, phase: 'starting', url: null, port, startedAt: new Date().toISOString(), ownsServer: false, serverPid: null, tunnelPid: null };
  let queue = Promise.resolve(), server, tunnel, closing = false;
  function update(patch) {
    saved = { ...saved, ...patch };
    const snapshot = JSON.stringify(saved, null, 2);
    queue = queue.then(async () => { await writeFile(`${statePath}.tmp`, snapshot, { mode: 0o600 }); await rename(`${statePath}.tmp`, statePath); });
    return queue;
  }
  function output(text) { return log.write(`${new Date().toISOString()} ${text}`); }
  async function stop(signal = 'SIGTERM', error = null) {
    if (closing) return;
    closing = true;
    await update({ phase: error ? 'error' : 'stopping', error });
    const children = [tunnel, ...(saved.ownsServer ? [server] : [])].filter(Boolean);
    const waiting = children.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode) { resolve(); return; }
      child.once('exit', resolve); child.kill(signal);
    }));
    await Promise.race([Promise.all(waiting), sleep(7000)]);
    for (const child of children) if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    await update({ phase: error ? 'error' : 'stopped', stoppedAt: new Date().toISOString() });
    await log.close(); process.exit(error ? 1 : 0);
  }
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  await update({});
  try {
    if (!await health()) {
      server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
      server.stdout.on('data', chunk => { void output(chunk.toString()); });
      server.stderr.on('data', chunk => { void output(chunk.toString()); });
      server.on('error', error => { void stop('SIGTERM', `게임 서버 실행 실패: ${error.message}`); });
      server.on('exit', code => { if (!closing) void stop('SIGTERM', `게임 서버 종료: ${code}`); });
      await update({ ownsServer: true, serverPid: server.pid });
      let ready = false;
      for (let i = 0; i < 100 && !closing; i++) { if (await health()) { ready = true; break; } await sleep(300); }
      if (!ready) throw new Error('게임 서버가 준비되지 않았습니다. 포트 사용 여부와 로그를 확인하세요.');
    }
    if (closing) return;
    tunnel = spawn(process.env.CLOUDFLARED_BIN || 'cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', origin], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '', connected = false;
    function tunnelOutput(chunk) {
      const text = chunk.toString(); void output(text);
      buffer = (buffer + text).slice(-16000);
      const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
      connected ||= buffer.includes('Registered tunnel connection');
      if (url && (saved.url !== url || connected && saved.phase !== 'online')) void update({ url, phase: connected ? 'online' : 'connecting' });
    }
    tunnel.stdout.on('data', tunnelOutput); tunnel.stderr.on('data', tunnelOutput);
    tunnel.on('error', error => { void stop('SIGTERM', `cloudflared 실행 실패: ${error.message}`); });
    tunnel.on('exit', code => { if (!closing) void stop('SIGTERM', `공개 터널 종료: ${code}`); });
    await update({ phase: 'connecting', tunnelPid: tunnel.pid });
  } catch (error) { await stop('SIGTERM', error.message); }
}

const command = process.argv[2] || 'start';
if (command === 'worker') await worker();
else if (command === 'status') {
  const saved = await state();
  print(await alive(saved) ? saved : { phase: 'stopped', error: saved?.error });
} else if (command === 'stop') {
  const saved = await state();
  if (!await alive(saved)) console.log('실행 중인 공개 연결이 없습니다.');
  else {
    process.kill(saved.pid, 'SIGTERM');
    for (let i = 0; i < 100 && await alive(saved); i++) await sleep(100);
    if(await alive(saved)){console.error('공개 연결 종료를 기다리고 있습니다. 상태와 로그를 확인하세요.');process.exitCode=1;}
    else console.log('공개 연결을 종료했습니다. 기존에 따로 실행한 게임 서버는 유지됩니다.');
  }
} else if (command === 'start') {
  let saved = await state();
  if (!await alive(saved)) {
    await mkdir(directory, { recursive: true });
    const child = spawn(process.execPath, [filename, 'worker'], { cwd: root, env: process.env, detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 300; i++) {
      saved = await state();
      if (saved?.pid === child.pid && saved.phase === 'online' && saved.url) break;
      if (saved?.pid === child.pid && saved.phase === 'error') { print(saved); process.exit(1); }
      await sleep(300);
    }
  } else {
    for (let i = 0; i < 300 && saved?.phase !== 'online'; i++) {
      if (!await alive(saved)) break;
      await sleep(300); saved = await state();
    }
  }
  const running=await alive(saved);
  print(running?saved:{phase:saved?.error?'error':'stopped',error:saved?.error});
  if (!running || saved?.phase !== 'online') { console.log('연결이 준비되지 않았습니다. npm run online:status로 다시 확인하세요.'); process.exitCode = 1; }
} else { console.error('사용법: node deploy/online.js start|status|stop'); process.exitCode = 1; }
