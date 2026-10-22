import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compatiblePolicy} from './transfer.js';
import {rollout,evaluate,newGame,baseline} from './environment.js';
import {PPO} from './ppo.js';
import {seededRandom,validatePolicy,candidates,decide,createDecisionContext,recordDecision} from '../lib/ai-policy.js';
import {EVALUATED_ROLES,mergeRoles,promotionGate,selectPassingCandidate} from './evaluation-gate.js';
import {saveExperiment,loadExperiment} from './checkpoint.js';
import {act,view} from '../lib/game.js';
import {aiObservation} from '../lib/ai-observation.js';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(`--${k}`)?args[args.indexOf(`--${k}`)+1]:d;
if(!args.includes('--legacy-experiment'))throw Error('구식 후보선택 학습기는 기본 실행이 금지되었습니다. 최종 명세 학습은 ai/train-complete.js를 사용하세요. 과거 실험 재현만 --legacy-experiment로 실행하세요.');
const file=arg('experiment','models/rebuild-v11/experiment.json'),resume=args.includes('--continue'),episodes=Number(arg('episodes',480)),interval=60;
if(!Number.isInteger(episodes)||episodes<1)throw Error('episodes는 양의 정수여야 합니다.');
const minSamples=500,finalGames=1000,settings={learningRate:.0005,entropy:.025};
const hash=p=>createHash('sha256').update(JSON.stringify([p.actor,p.critic])).digest('hex');
const seed=Number(arg('seed',20261030)),random=seededRandom(seed);
const codeHash=createHash('sha256');for(const relative of ['./environment.js','./train-rebuild.js','./ppo.js','../lib/game.js','../lib/ai-policy.js','../lib/ai-observation.js'])codeHash.update(await readFile(new URL(relative,import.meta.url)));const engineFingerprint=codeHash.digest('hex');
let state;
if(resume){state=await loadExperiment(file);if(state.engineFingerprint!==engineFingerprint)throw Error('코드 기준이 바뀌었습니다. 이전 평가를 혼합하지 말고 새 experiment 경로로 시작하세요.');random.restore(state.rng);if(state.phase==='complete'||state.phase==='no-promotion'){console.log(JSON.stringify({file,phase:state.phase,winner:state.winner}));process.exit(0);}}
else{
 const source=JSON.parse(await readFile(arg('source','models/strategy-v10-robust2.json'),'utf8')),policy=compatiblePolicy(source);
 const trainer=new PPO(policy,settings);
 const entry={id:hash(policy),policy:structuredClone(policy),optimizer:trainer.checkpoint(),lineageUpdates:0};
  state={engineFingerprint,experimental:true,promotionAuthorized:false,limitations:['candidate-selection PPO; sequential action construction not implemented','500 samples per role aggregate; not per role-opponent cell','no sequential/multiple-comparison 95% confidence gate','latest reward and dialogue specifications not fully implemented'],completed:0,current:{policy,optimizer:trainer.checkpoint()},candidates:[entry],opponents:[entry],rng:random.state(),phase:'initial-evaluation',history:[],baselineId:entry.id,settings,sourceEpisodes:source.metadata.episodes,validation:{minimumRoleSamples:minSamples,floor:.05,maximumDrop:.03,finalGames},oldDatasetsExcluded:true};
}
const checkpoint=async()=>{state.rng=random.state();await saveExperiment(file,state);};
const opponentList=()=>['random','balanced','cooperative','aggressive','builder','trader','mixed',...state.opponents.map(e=>e.policy)];
async function assess(entry,final=false){
 const pool=opponentList(),poolIds=state.opponents.map(e=>e.id),saved=state.inProgressEvaluation;
 const reusable=saved?.candidate===entry.id&&saved.report.final===final&&JSON.stringify(saved.report.pool)===JSON.stringify(poolIds);
 const report=reusable?saved.report:{rows:[],roles:mergeRoles([]),score:0,pool:poolIds,final};
 state.inProgressEvaluation={candidate:entry.id,entry,report};
 for(let i=report.rows.length;i<pool.length;i++){
  const opponent=pool[i];const row=evaluate(entry.policy,{games:final?finalGames:60,counts:[3,4,5,6,7,8],opponent,random});
  report.rows.push(row);report.roles=mergeRoles(report.rows);await checkpoint();
 }
 // 보통 출현 비율에 맡기지 않고 모자란 역할은 해당 자리를 맡은 완전 게임으로 보충합니다.
 for(const role of EVALUATED_ROLES)while(report.roles[role].games<minSamples){
  const outcome=roleGame(entry.policy,role,pool[report.roles[role].games%pool.length]);
  report.roles[role].games++;report.roles[role].wins+=Number(outcome);
   if(report.roles[role].games%50===0){state.inProgressEvaluation={candidate:entry.id,entry,report};await checkpoint();}
 }
 report.score=Object.values(report.roles).reduce((sum,r)=>sum+r.wins/r.games,0)/EVALUATED_ROLES.length;
 state.inProgressEvaluation=null;return report;
}
function roleGame(policy,role,opponent){
 let room,learner;
 for(let attempt=0;attempt<500;attempt++){
  room=newGame(role==='king'||role==='rebel'?3:6,random);
  if(['hunter','blacksmith'].includes(role)){const citizen=room.players.find(p=>p.role==='citizen');if(citizen)citizen.job=role;}
  learner=room.players.find(p=>(p.job||p.role)===role);if(learner)break;
 }
 if(!learner)throw Error(`역할 표본 생성 실패:${role}`);
 const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)]));
 for(let steps=0;room.status==='playing';steps++){
  if(steps>2500)throw Error('역할 평가 단계 초과');
   const ready=room.players.map(p=>({p,s:aiObservation(room,p)})).map(x=>({...x,actions:candidates(x.s)})).filter(x=>x.actions.length);
  if(!ready.length)throw Error('역할 평가 교착');
  const {p,s,actions}=ready[Math.floor(random()*ready.length)];
  let action;
  if(p.id===learner.id)action=decide(policy,s,random,contexts.get(p.id));
  else if(opponent&&typeof opponent==='object')action=decide(opponent,s,random,contexts.get(p.id));
  else if(opponent==='random')action=actions[Math.floor(random()*actions.length)];
  else action=baseline(s,actions,random,opponent==='mixed'?['balanced','cooperative','aggressive','builder','trader'][steps%5]:opponent);
  act(room,p.id,action);
 }
 return room.game.winner.players.includes(learner.id);
}
if(state.phase==='initial-evaluation'){
 state.candidates[0].evaluation=await assess(state.candidates[0]);state.phase='training';await checkpoint();
}
let policy=state.current.policy,trainer=new PPO(policy,settings);trainer.restore(state.current.optimizer);let trajectories=state.trajectories||[];
async function finishCycle(){
 const candidate=state.pendingCandidate;
 if(!candidate.evaluation)candidate.evaluation=await assess(candidate);
 const baseline=state.candidates.find(c=>c.id===state.baselineId);const gate=promotionGate(candidate.evaluation.roles,baseline.evaluation.roles);
 if(!state.history.some(h=>h.attempts===state.completed))state.history.push({attempts:state.completed,score:candidate.evaluation.score,gate});
 if(gate.passed&&!state.candidates.some(c=>c.id===candidate.id))state.candidates.push(candidate);
 if(gate.passed&&!state.opponents.some(c=>c.id===candidate.id)){state.opponents.push(candidate);state.reevaluateIds=state.candidates.map(c=>c.id);await checkpoint();}
 for(const id of [...(state.reevaluateIds||[])]){const existing=state.candidates.find(c=>c.id===id);existing.evaluation=await assess(existing);state.reevaluateIds=state.reevaluateIds.filter(x=>x!==id);await checkpoint();}
 const winner=selectPassingCandidate(state.candidates.map(c=>({...c,roles:c.evaluation.roles,score:c.evaluation.score})),baseline.evaluation.roles);
 if(winner){policy=structuredClone(winner.policy);trainer=new PPO(policy,settings);trainer.restore(winner.optimizer);state.current={policy,optimizer:trainer.checkpoint()};}
 state.pendingCandidate=null;state.phase='training';await checkpoint();console.log(JSON.stringify(state.history.at(-1)));
}
if(state.phase==='candidate-evaluation')await finishCycle();
for(;state.phase==='training'&&state.completed<episodes;){
 const descriptors=[{kind:'random'},...['balanced','cooperative','aggressive','builder','trader'].map(style=>({kind:'baseline',style})),...state.opponents.map(e=>({kind:'policy',policy:e.policy}))];
 const result=rollout(policy,{count:[3,4,5,6,7,8][state.completed%6],random,opponents:descriptors,opponentOffset:state.completed});
 trajectories.push(...result.trajectories.values());state.completed++;
 if(state.completed%12===0||state.completed===episodes){trainer.update(trainer.prepare(trajectories),{epochs:2,random});trajectories=[];state.current={policy,optimizer:trainer.checkpoint()};state.trajectories=[];await checkpoint();}
 if(state.completed%interval===0||state.completed===episodes){
  state.pendingCandidate={id:hash(policy),policy:structuredClone(policy),optimizer:trainer.checkpoint(),lineageUpdates:state.completed};state.phase='candidate-evaluation';await checkpoint();await finishCycle();
 }
}
if(state.phase==='training'){state.phase='tournament';await checkpoint();}
for(const entry of state.candidates)if(!entry.final){entry.final=await assess(entry,true);await checkpoint();}
const baselineEntry=state.candidates.find(c=>c.id===state.baselineId);
const winner=selectPassingCandidate(state.candidates.map(c=>({...c,roles:c.final.roles,score:c.final.score})),baselineEntry.final.roles);
state.winner=winner?.id||null;state.phase=winner?'complete':'no-promotion';state.inProgressEvaluation=null;await checkpoint();
console.log(JSON.stringify({file,phase:state.phase,winner:state.winner,totalAttempts:state.completed,roleMinimum:minSamples,finalGamesPerOpponent:finalGames}));
