import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPolicy, validatePolicy, seededRandom } from '../lib/ai-policy.js';
import { rollout, evaluate } from './environment.js';
import { PPO } from './ppo.js';
import { transferPolicy } from './transfer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }
const episodes = Number(arg('episodes', 1000)), seed = Number(arg('seed', 42)), batchGames = Number(arg('batch', 16));
const counts = String(arg('players', '3,4,5,6')).split(',').map(Number);
const evalGames = Number(arg('eval-games', 60));
const output = path.resolve(root, arg('output', 'models/policy.json'));
if (!Number.isInteger(episodes) || episodes < 1 || !Number.isInteger(batchGames) || batchGames < 1 || !Number.isInteger(evalGames) || evalGames < 1 || counts.some(n => !Number.isInteger(n) || n < 3 || n > 8)) throw new Error('episodes/batch/eval-games는 양의 정수, players는 3~8이어야 합니다.');
await mkdir(path.dirname(output), { recursive: true });
const random = seededRandom(seed), resume = arg('resume', null);
const transfer = arg('transfer',null);
if(resume&&transfer)throw new Error('--resume과 --transfer는 동시에 사용할 수 없습니다.');
let policy = transfer ? transferPolicy(JSON.parse(await readFile(path.resolve(root,transfer),'utf8')),seed) : resume ? validatePolicy(JSON.parse(await readFile(path.resolve(root, resume), 'utf8'))) : createPolicy(seed);
const trainer = new PPO(policy,{entropy:Number(arg('entropy',.025)),learningRate:Number(arg('learning-rate',.0005))});
const epochs=Number(arg('epochs',2));
if(!Number.isInteger(epochs)||epochs<1||epochs>10||!(trainer.entropy>=0&&trainer.entropy<=.2)||!(trainer.learningRate>0&&trainer.learningRate<=.02))throw new Error('epochs/entropy/learning-rate 설정이 올바르지 않습니다.');
if (resume) {
  try { trainer.restore(JSON.parse(await readFile(`${path.resolve(root, resume)}.checkpoint.json`, 'utf8')).optimizer); }
  catch (error) { if (error.code !== 'ENOENT') throw error; console.log('옵티마이저 체크포인트 없음: 모델 가중치부터 새 옵티마이저로 계속 학습합니다.'); }
}
const beforeEpisodes = policy.metadata.episodes;
console.log(`PPO 셀프플레이 시작 · CPU · ${episodes}판 · ${counts.join('/')}인 · 외부 API 없음`);
const initialPolicy=structuredClone(policy);
const evaluationSeed=seed+100000;
const before = { mixed: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed),opponent:'mixed' }), random: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed+1), opponent: 'random' }) };
console.log('학습 전 평가:', JSON.stringify(before));
const history = [], opponents = [null], started = Date.now();
let trajectories = [], decisions = policy.metadata.decisions || 0;
async function save() {
  policy.metadata = { ...policy.metadata, algorithm: 'PPO-self-play', episodes: beforeEpisodes + completed, decisions, trainedAt: new Date().toISOString(), elapsedSeconds: (Date.now() - started) / 1000, playerCounts: counts, evaluation: { before, after: null }, history: history.slice(-20), reward: 'terminal team win +1 / loss -1', candidateActions: 'type-balanced legal bundles; inventory-cycle guard', personalities: ['balanced','bold','cooperative','trader','builder','investigator'], trainingSettings:{entropy:trainer.entropy,learningRate:trainer.learningRate,epochs,batchGames}, externalApi: false };
  await writeFile(`${output}.tmp`, JSON.stringify(policy)); await rename(`${output}.tmp`, output);
  await writeFile(`${output}.checkpoint.json`, JSON.stringify({ optimizer: trainer.checkpoint() }));
}
let completed = 0, stop = false;
process.on('SIGINT', () => { stop = true; console.log('현재 배치까지 학습한 후 저장합니다.'); });
for (let episode = 1; episode <= episodes && !stop; episode++) {
  const result = rollout(policy, { count: counts[(episode - 1) % counts.length], random, opponents });
  trajectories.push(...result.trajectories.values()); decisions += result.steps; completed = episode;
  if (episode % batchGames === 0 || episode === episodes || stop) {
    const stats = trainer.update(trainer.prepare(trajectories), { random,epochs }); trajectories = [];
    history.push({ episode: beforeEpisodes + episode, ...stats });
    if (episode % (batchGames * 5) === 0 || episode === episodes || stop) {
      console.log(`${episode}/${episodes}판 · ${decisions}회 행동 · value loss ${stats.valueLoss.toFixed(4)} · entropy ${stats.entropy.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)}초`);
      opponents.push(structuredClone(policy)); if (opponents.length > 5) opponents.splice(1, 1);
      await save();
    }
  }
}
await save();
const after = { mixed: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed),opponent:'mixed' }), random: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed+1), opponent: 'random' }), previous: evaluate(policy,{games:evalGames,counts,random:seededRandom(evaluationSeed+2),opponent:initialPolicy}) };
policy.metadata.evaluation.after = after;
validatePolicy(policy);
await writeFile(`${output}.tmp`, JSON.stringify(policy)); await rename(`${output}.tmp`, output);
console.log('학습 후 평가:', JSON.stringify(after));
console.log(`모델 저장 완료: ${output} · 누적 ${policy.metadata.episodes}판. 승률은 표본·상대 구성에 따라 달라지며 개선을 보장하지 않습니다.`);
