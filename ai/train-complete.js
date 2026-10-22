import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {compatiblePolicy} from './transfer.js';
import {rollout} from './environment.js';
import {PPO} from './ppo.js';
import {seededRandom,enableActionConstruction} from '../lib/ai-policy.js';
import {saveExperiment,loadExperiment} from './checkpoint.js';
import {eligibleCounts} from './cell-evaluation.js';
import {EVALUATED_ROLES} from './evaluation-gate.js';
const args=process.argv.slice(2),arg=(key,d)=>args.includes(`--${key}`)?args[args.indexOf(`--${key}`)+1]:d;
const directory=arg('directory','models/sequential-v1'),episodes=Number(arg('episodes',480)),resume=args.includes('--continue');
const maximumCandidates=Math.ceil(episodes/60),alpha=.05/(maximumCandidates+(maximumCandidates*(maximumCandidates+1))/2+maximumCandidates+1);
if(!Number.isInteger(episodes)||episodes<=0)throw Error('episodes는 양의 정수 필요');
await mkdir(directory,{recursive:true});const file=path.join(directory,'experiment.json');
const fingerprint=createHash('sha256');for(const name of ['train-complete.js','environment.js','reward-ledger.js','ppo.js','cell-evaluation.js','statistical-gate.js','evaluate-complete.js','../lib/action-construction.js','../lib/construction-rules.js','../lib/action-fields.js','../lib/ai-policy.js','../lib/game.js','../lib/ai-observation.js','transfer.js'])fingerprint.update(await readFile(new URL(name,import.meta.url)));const engine=fingerprint.digest('hex');
const rng=seededRandom(20261017),settings={learningRate:.0005,entropy:.025};let state;
if(resume){state=await loadExperiment(file);if(state.engine!==engine||state.episodesTarget!==episodes)throw Error('학습 코드/전체시도수 변경: 새 실험 경로 필요');rng.restore(state.rng);if(state.phase==='complete'){console.log(JSON.stringify({file,completed:state.completed,promoted:false}));process.exit(0);}}
else{
  const policy=compatiblePolicy(JSON.parse(await readFile(arg('source','models/strategy-v10-robust2.json'),'utf8'))),baseline=structuredClone(policy);enableActionConstruction(policy);policy.metadata.algorithm='PPO-autoregressive-action-construction';policy.metadata.evaluationValidForCurrentRules=false;
 const trainer=new PPO(policy,settings);state={engine,completed:0,lineage:0,current:{policy,optimizer:trainer.checkpoint()},candidates:[],opponents:[],rng:rng.state(),phase:'training',history:[],settings};
  state.best=structuredClone(state.current);state.opponents.push(structuredClone(baseline));state.episodesTarget=episodes;state.alpha=alpha;await writeFile(path.join(directory,'baseline.json'),JSON.stringify(baseline));
}
const save=async()=>{state.rng=rng.state();await saveExperiment(file,state);};
let policy=state.current.policy,trainer=new PPO(policy,settings);trainer.restore(state.current.optimizer);
async function assess(){
  const candidateFile=path.join(directory,`candidate-${state.completed}.json`),evaluationFile=path.join(directory,`evaluation-${state.completed}.json`);
  await writeFile(candidateFile,JSON.stringify(state.current.policy));state.phase='evaluation';await save();
  const poolFile=path.join(directory,`opponent-pool-${state.completed}-before.json`);await writeFile(poolFile,JSON.stringify(state.candidates.filter(c=>c.attempts!==state.completed).map(c=>c.file)));
  await promisify(execFile)(process.execPath,['ai/evaluate-complete.js','--candidate',candidateFile,'--baseline',path.join(directory,'baseline.json'),'--alpha',String(alpha),'--pool',poolFile,'--output',evaluationFile],{maxBuffer:1024*1024});
  const report=JSON.parse(await readFile(evaluationFile,'utf8')),score=Object.values(report.cells.candidate).reduce((sum,c)=>sum+c.wins/c.games,0)/Object.keys(report.cells.candidate).length;
  if(!state.history.some(h=>h.attempts===state.completed))state.history.push({attempts:state.completed,lineage:state.lineage,state:report.gate.state,score,evaluationFile});
  if(report.gate.state==='pass'){
   if(!state.candidates.some(c=>c.attempts===state.completed)){state.candidates.push({attempts:state.completed,lineage:state.lineage,score,file:candidateFile,optimizer:trainer.checkpoint(),snapshot:structuredClone(state.current)});state.opponents.push(structuredClone(policy));await save();}
    const updatedPoolFile=path.join(directory,`opponent-pool-${state.completed}-after.json`);await writeFile(updatedPoolFile,JSON.stringify(state.candidates.map(c=>c.file)));
  for(const previous of state.candidates){
   const updated=path.join(directory,`reevaluation-${state.completed}-${previous.attempts}.json`);
    await promisify(execFile)(process.execPath,['ai/evaluate-complete.js','--candidate',previous.file,'--baseline',path.join(directory,'baseline.json'),'--alpha',String(alpha),'--pool',updatedPoolFile,'--output',updated],{maxBuffer:1024*1024});
    previous.latestEvaluation=updated;
    const updatedReport=JSON.parse(await readFile(updated,'utf8'));previous.gate=updatedReport.gate.state;
    previous.score=Object.values(updatedReport.cells.candidate).reduce((sum,c)=>sum+c.wins/c.games,0)/Object.keys(updatedReport.cells.candidate).length;
    await save();
   }
   const best=state.candidates.filter(c=>c.gate==='pass').sort((a,b)=>b.score-a.score)[0];
  if(best)state.best=structuredClone(best.snapshot);
    state.current=structuredClone(state.best);policy=state.current.policy;trainer=new PPO(policy,settings);trainer.restore(state.current.optimizer);state.lineage=policy.metadata.sequentialEpisodes||0;
 }else{state.current=structuredClone(state.best);policy=state.current.policy;trainer=new PPO(policy,settings);trainer.restore(state.current.optimizer);state.lineage=policy.metadata.sequentialEpisodes||0;}
  state.phase='training';await save();console.log(JSON.stringify(state.history.at(-1)));
}
if(state.phase==='evaluation')await assess();
while(state.completed<episodes||(state.pendingTrajectories||[]).length){
  const trajectories=state.pendingTrajectories||[];
 for(let i=state.pendingBatchGames||0;i<12&&state.completed<episodes;i++){
  const pool=[{kind:'random'},...['balanced','cooperative','aggressive','builder','trader'].map(style=>({kind:'baseline',style})),...state.opponents.map(policy=>({kind:'policy',policy}))];
   const learnerRole=EVALUATED_ROLES[state.completed%EVALUATED_ROLES.length],counts=eligibleCounts(learnerRole),count=counts[Math.floor(state.completed/EVALUATED_ROLES.length)%counts.length];
   const result=rollout(policy,{count,learnerRole,opponents:pool,opponentOffset:state.completed,random:rng,maxSteps:3000});
   trajectories.push(...result.trajectories.values());state.completed++;state.lineage++;
   state.pendingTrajectories=trajectories;state.pendingBatchGames=i+1;await save();
 }
 trainer.update(trainer.prepare(trajectories),{epochs:2,random:rng});policy.metadata.sequentialEpisodes=state.lineage;policy.metadata.totalAttempts=state.completed;policy.metadata.promoted=false;
 state.pendingTrajectories=[];state.pendingBatchGames=0;state.current={policy,optimizer:trainer.checkpoint()};await save();
 if(state.completed%60===0||state.completed===episodes)await assess();
}
state.phase='final-tournament';await save();
const finalists=state.finalistsPending||[{file:path.join(directory,'baseline.json'),baseline:true},...state.candidates];state.finalistsPending=finalists;await save();
for(const entry of finalists){
  if(entry.final)continue;const output=path.join(directory,`final-${entry.baseline?'baseline':entry.attempts}.json`);
 const poolFile=path.join(directory,'opponent-pool.json');await writeFile(poolFile,JSON.stringify(state.candidates.map(c=>c.file)));
 await promisify(execFile)(process.execPath,['ai/evaluate-complete.js','--candidate',entry.file,'--baseline',path.join(directory,'baseline.json'),'--alpha',String(alpha),'--pool',poolFile,'--output',output],{maxBuffer:1024*1024});
 const report=JSON.parse(await readFile(output,'utf8'));entry.final={output,state:report.gate.state,score:Object.values(report.cells.candidate).reduce((sum,c)=>sum+c.wins/c.games,0)/Object.keys(report.cells.candidate).length};await save();
}
state.finalists=finalists.map(({snapshot,optimizer,...entry})=>entry);state.selected=state.finalists.filter(c=>!c.baseline&&c.final.state==='pass').sort((a,b)=>b.final.score-a.final.score)[0]?.file||path.join(directory,'baseline.json');state.newModelQualified=state.selected!==path.join(directory,'baseline.json');
state.phase='complete';state.promoted=false;state.reason='실제 API·전체 명세 검증과 별도 승격';await save();console.log(JSON.stringify({file,completed:state.completed,selected:state.selected,promoted:false}));
