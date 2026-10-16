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
const episodes = Number(arg('episodes', 1000)), seed = Number(arg('seed', 42)), batchGames = Number(arg('batch', 16)), evalEvery=Number(arg('eval-every',60)), poolGames=Number(arg('pool-games',30)), tournamentGames=Number(arg('tournament-games',120)), roleFloor=Number(arg('role-floor',.18));
const counts = String(arg('players', '3,4,5,6')).split(',').map(Number);
const evalGames = Number(arg('eval-games', 60));
const output = path.resolve(root, arg('output', 'models/policy.json'));
if (!Number.isInteger(episodes) || episodes < 1 || !Number.isInteger(batchGames) || batchGames < 1 || !Number.isInteger(evalGames) || evalGames < 1 || counts.some(n => !Number.isInteger(n) || n < 3 || n > 8)) throw new Error('episodes/batch/eval-games는 양의 정수, players는 3~8이어야 합니다.');
await mkdir(path.dirname(output), { recursive: true });
const random = seededRandom(seed), resume = arg('resume', null);
const transfer = arg('transfer',null);
if(resume&&transfer)throw new Error('--resume과 --transfer는 동시에 사용할 수 없습니다.');
let policy = transfer ? transferPolicy(JSON.parse(await readFile(path.resolve(root,transfer),'utf8')),seed) : resume ? validatePolicy(JSON.parse(await readFile(path.resolve(root, resume), 'utf8'))) : createPolicy(seed);
let trainer = new PPO(policy,{entropy:Number(arg('entropy',.025)),learningRate:Number(arg('learning-rate',.0005))});
const epochs=Number(arg('epochs',2));
if(!Number.isInteger(epochs)||epochs<1||epochs>10||!Number.isInteger(evalEvery)||evalEvery<20||!Number.isInteger(poolGames)||poolGames<10||!Number.isInteger(tournamentGames)||tournamentGames<30||!(roleFloor>=0&&roleFloor<=1)||!(trainer.entropy>=0&&trainer.entropy<=.2)||!(trainer.learningRate>0&&trainer.learningRate<=.02))throw new Error('학습·평가 설정이 올바르지 않습니다.');
if (resume) {
  try { trainer.restore(JSON.parse(await readFile(`${path.resolve(root, resume)}.checkpoint.json`, 'utf8')).optimizer); }
  catch (error) { if (error.code !== 'ENOENT') throw error; console.log('옵티마이저 체크포인트 없음: 모델 가중치부터 새 옵티마이저로 계속 학습합니다.'); }
}
const beforeEpisodes = policy.metadata.episodes;
console.log(`PPO 셀프플레이 시작 · CPU · ${episodes}판 · ${counts.join('/')}인 · 외부 API 없음`);
const initialPolicy=structuredClone(policy);
const evaluationSeed=seed+100000;
const evaluatePool=(checkpoint, previous=initialPolicy)=>{
  const pool=['random','balanced','cooperative','aggressive','builder','trader','mixed',previous];
 const games=poolGames;
  const rows=pool.map((opponent,index)=>evaluate(checkpoint,{games,counts,random:seededRandom(evaluationSeed+index),opponent}));
 const roles={};for(const row of rows)for(const [role,value] of Object.entries(row.byRole)){const target=roles[role] ||= {games:0,wins:0};target.games+=value.games;target.wins+=value.wins;}
 const coreRoles=['king','citizen','rebel'].map(role=>roles[role]).filter(role=>role?.games>=Math.max(12,Math.floor(poolGames/2)));
 const score=rows.reduce((sum,row)=>sum+row.winRate,0)/rows.length,minimumRole=Math.min(...coreRoles.map(role=>role.wins/role.games),1);
 return {rows:rows.map(row=>({opponent:row.opponent,games:row.games,wins:row.wins,winRate:row.winRate,roleFloor:row.roleFloor,byRole:row.byRole})),score,minimumRole,roles};
};
const before = { pool:evaluatePool(policy,initialPolicy), mixed: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed+50),opponent:'mixed' }), random: evaluate(policy, { games: evalGames, counts, random:seededRandom(evaluationSeed+51), opponent: 'random' }) };
console.log('학습 전 평가:', JSON.stringify(before));
const history = [], opponents = [], finalists=[], started = Date.now();
let bestPolicy=structuredClone(policy),bestScore=before.pool.score,bestEvaluation=before.pool,rejected=0;
const opponentPool=()=>[
  {kind:'random'},
  ...['balanced','cooperative','aggressive','builder','trader'].map(style=>({kind:'baseline',style})),
  ...(opponents.length?[{kind:'policy',policy:opponents[0]}]:[{kind:'baseline',style:'balanced'}])
];
const scorePolicy=checkpoint=>evaluatePool(checkpoint,bestPolicy);
let trajectories = [], decisions = policy.metadata.decisions || 0;
async function save() {
   bestPolicy.metadata = { ...bestPolicy.metadata, algorithm: 'PPO-game-policy', episodes: beforeEpisodes + completed, decisions, trainedAt: new Date().toISOString(), elapsedSeconds: (Date.now() - started) / 1000, playerCounts: counts, evaluation: { before, after: bestEvaluation }, history: history.slice(-20), reward: 'terminal win +1/loss -1 plus bounded battle, mediation, expedition, ambush rewards', candidateActions: 'type-balanced legal bundles; inventory-cycle guard', personalities: ['balanced','bold','cooperative','trader','builder','investigator'], trainingSettings:{entropy:trainer.entropy,learningRate:trainer.learningRate,epochs,batchGames,evalEvery,poolGames,tournamentGames,roleFloor}, opponents:'uniform random/balanced/cooperative/aggressive/builder/trader/previous checkpoints', checkpointSelection:{bestScore,rejected,finalists:finalists.map(f=>({episode:f.episode,score:f.evaluation.score,minimumRole:f.evaluation.minimumRole}))}, externalApi: false, liveDialogueLearning:'separate runtime strategy model; excluded from PPO reward; human action aggregates retained only for evaluation diagnostics' };
   await writeFile(`${output}.tmp`, JSON.stringify(bestPolicy)); await rename(`${output}.tmp`, output);
  await writeFile(`${output}.checkpoint.json`, JSON.stringify({ optimizer: trainer.checkpoint() }));
}
let completed = 0, stop = false;
process.on('SIGINT', () => { stop = true; console.log('현재 배치까지 학습한 후 저장합니다.'); });
for (let episode = 1; episode <= episodes && !stop; episode++) {
   const result = rollout(policy, { count: counts[(episode - 1) % counts.length], random, opponents:opponentPool(),opponentOffset:episode });
  trajectories.push(...result.trajectories.values()); decisions += result.steps; completed = episode;
  if (episode % batchGames === 0 || episode === episodes || stop) {
    const stats = trainer.update(trainer.prepare(trajectories), { random,epochs }); trajectories = [];
    history.push({ episode: beforeEpisodes + episode, ...stats });
    if (episode % evalEvery === 0 || episode === episodes || stop) {
       const evaluation=scorePolicy(policy),accepted=evaluation.score>=bestScore&&evaluation.minimumRole>=roleFloor;
      history.push({episode:beforeEpisodes+episode,score:evaluation.score,accepted});
      if(accepted){bestScore=evaluation.score;bestPolicy=structuredClone(policy);bestEvaluation=evaluation;finalists.push({policy:structuredClone(policy),evaluation,episode:beforeEpisodes+episode});finalists.sort((a,b)=>b.evaluation.score-a.evaluation.score);finalists.splice(4);opponents.unshift(structuredClone(policy));if(opponents.length>6)opponents.pop();}
      else {rejected++;policy=structuredClone(bestPolicy);trainer=new PPO(policy,{entropy:trainer.entropy,learningRate:trainer.learningRate});}
      console.log(`${episode}/${episodes}판 · ${decisions}회 행동 · value loss ${stats.valueLoss.toFixed(4)} · entropy ${stats.entropy.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)}초`);
       await save();
    }
  }
}
await save();
// 상위 후보는 더 큰 동일 상대 풀 토너먼트로 최종 선택합니다.
const tournament=checkpoint=>{
 const pool=['random','balanced','cooperative','aggressive','builder','trader','mixed',initialPolicy];
 const rows=pool.map((opponent,index)=>evaluate(checkpoint,{games:tournamentGames,counts,random:seededRandom(evaluationSeed+100+index),opponent}));
 const roles={};for(const row of rows)for(const [role,value] of Object.entries(row.byRole)){const target=roles[role] ||= {games:0,wins:0};target.games+=value.games;target.wins+=value.wins;}
 const coreRoles=['king','citizen','rebel'].map(role=>roles[role]).filter(role=>role?.games>=Math.max(20,Math.floor(tournamentGames/2)));
 return {score:rows.reduce((sum,row)=>sum+row.winRate,0)/rows.length,minimumRole:Math.min(...coreRoles.map(role=>role.wins/role.games),1),roles,rows:rows.map(row=>({opponent:row.opponent,winRate:row.winRate,roleFloor:row.roleFloor,byRole:row.byRole}))};
};
finalists.push({policy:structuredClone(bestPolicy),evaluation:bestEvaluation,episode:beforeEpisodes+completed});
for(const finalist of finalists)finalist.tournament=tournament(finalist.policy);
finalists.sort((a,b)=>b.tournament.score-a.tournament.score||b.tournament.minimumRole-a.tournament.minimumRole);
if(finalists[0].tournament.minimumRole>=roleFloor){bestPolicy=finalists[0].policy;bestScore=finalists[0].tournament.score;bestEvaluation=finalists[0].tournament;}
const after = { pool:bestEvaluation, mixed: evaluate(bestPolicy, { games: evalGames, counts, random:seededRandom(evaluationSeed+50),opponent:'mixed' }), random: evaluate(bestPolicy, { games: evalGames, counts, random:seededRandom(evaluationSeed+51), opponent: 'random' }), previous: evaluate(bestPolicy,{games:evalGames,counts,random:seededRandom(evaluationSeed+52),opponent:initialPolicy}) };
bestPolicy.metadata.evaluation.after = after;
bestPolicy.metadata.checkpointSelection={bestScore,rejected,finalists:finalists.map(f=>({episode:f.episode,score:f.tournament?.score||f.evaluation.score,minimumRole:f.tournament?.minimumRole||f.evaluation.minimumRole})),finalTournament:true};
validatePolicy(bestPolicy);
await writeFile(`${output}.tmp`, JSON.stringify(bestPolicy)); await rename(`${output}.tmp`, output);
console.log('학습 후 평가:', JSON.stringify(after));
console.log(`모델 저장 완료: ${output} · 누적 ${policy.metadata.episodes}판. 승률은 표본·상대 구성에 따라 달라지며 개선을 보장하지 않습니다.`);
