import {readFile,writeFile,rename} from 'node:fs/promises';
import {newGame,readyPlayers} from './environment.js';
import {act,view} from '../lib/game.js';
import {seededRandom,candidates} from '../lib/ai-policy.js';
import {compatiblePolicy} from './transfer.js';
import {createAgentClient} from '../lib/agent-client.js';
import {createCognitiveAgent,fallbackAction} from '../lib/cognitive-agent.js';
import {SOCIAL_MODES,socialContext,socialDistribution} from '../lib/social-strategy.js';
import {personaFor} from '../lib/conversation.js';

const args=process.argv.slice(2),arg=(k,d)=>args.includes(`--${k}`)?Number(args[args.indexOf(`--${k}`)+1]):d;
const episodes=arg('episodes',6),pairs=arg('eval-pairs',4),seed=arg('seed',142026),maxCalls=arg('calls-per-game',8);
if(![episodes,pairs,seed,maxCalls].every(Number.isInteger)||episodes<1||pairs<1||maxCalls<1||maxCalls>100)throw Error('Invalid training arguments');
const client=createAgentClient({timeout:40000});if(!client.enabled)throw Error('Server API key is required');
const gamePolicy=compatiblePolicy(JSON.parse(await readFile(new URL('../models/policy.json',import.meta.url),'utf8')));
const model={version:1,algorithm:'REINFORCE-unified-observe-plan-act',values:{},metadata:{episodes:0,seed,maxCalls,externalApi:true,promoted:false}};
const traces=[],evaluation={pairs:[],candidate:{games:0,wins:0},honest:{games:0,wins:0}};
const random=seededRandom(seed),styles=['신중하고 공개 근거를 우선한다.','적극적으로 협상하지만 무조건 믿지는 않는다.','자원을 아끼고 조건부 협력을 선호한다.'];
const honest=s=>({values:{[socialContext(s)]:[100,-100,-100,-100]}});
async function save(){const files=[['agent-candidate.json',model],['agent-traces.json',traces],['agent-evaluation.json',evaluation]];for(const [name,data]of files){const path=new URL(`../models/${name}`,import.meta.url);await writeFile(`${path.pathname}.tmp`,JSON.stringify(data,null,2));await rename(`${path.pathname}.tmp`,path);}}
async function run(start,learnerId,train,control,gameSeed,label){
 const room=structuredClone(start),rng=seededRandom(gameSeed),records=[],traceRefs=[],callsByDay=new Map();let now=1000000,steps=0,calls=0,errors=0;
 for(const [i,p]of room.players.entries()){p.bot=true;p.online=true;personaFor(p,room.game);p.persona.style+=` ${styles[i%styles.length]}`;}
 const limited={get enabled(){return calls<maxCalls&&(callsByDay.get(room.game.day)||0)<Math.max(2,Math.ceil(maxCalls/3));},diagnostics:()=>({calls}),async ask(system,context,schema){if(!this.enabled)throw Error('budget');calls++;callsByDay.set(room.game.day,(callsByDay.get(room.game.day)||0)+1);return client.ask(system,context,schema);}};
 const agent=createCognitiveAgent({client:limited,clock:()=>now,random:rng,policy:s=>s.me.id===learnerId&&control!=='honest'?model:honest(s),failed:()=>{errors++;},onDecision:({snapshot:s,prepared,plan})=>{
  if(s.me.id===learnerId)records.push({key:socialContext(s),mode:prepared.mode,probabilities:socialDistribution(control==='honest'?honest(s):model,s)});
  const trace={run:label,split:train?'train':'evaluation',actor:s.me.id,learner:s.me.id===learnerId,day:s.game.day,phase:s.game.phase,role:s.me.job||s.me.role,mode:prepared.mode,observations:prepared.context.newEvidenceIds,previousPlan:structuredClone(prepared.context.previousPlan),history:prepared.context.history,plan:structuredClone(plan)};traces.push(trace);traceRefs.push({trace,plan});
 }});
 while(room.status==='playing'){
  if(++steps>2200)throw Error('agent_step_limit');
  const p=readyPlayers(room)[0];if(!p)throw Error('no_ready_player');
  const decision=await agent.beforeAction(room,p);now+=5000;
  if(decision.wait||decision.stale)continue;
  const s=view(room,p.id),legal=candidates(s);if(!legal.length)continue;
  const action=decision.action&&legal.find(a=>JSON.stringify(a)===JSON.stringify(decision.action))||fallbackAction(s,gamePolicy,rng);
  act(room,p.id,action);agent.executed(room,p,action);
 }
 const win=room.game.winner.players.includes(learnerId);
 if(train){for(const r of records){const row=model.values[r.key]||=SOCIAL_MODES.map(()=>0);for(let i=0;i<row.length;i++)row[i]=Math.max(-2,Math.min(2,row[i]+.06*(win?1:-1)*(Number(SOCIAL_MODES[i]===r.mode)-r.probabilities[i])/(.4*Math.max(1,records.length))));}}
 for(const {trace,plan}of traceRefs){trace.learnerWon=win;trace.finalStatus=plan.status;trace.outcome=plan.outcome||'종료 시점까지 실행 확인 없음';}
 return {win,calls,errors,lastDecisionError:agent.diagnostics().lastDecisionError,decisions:agent.diagnostics().decisions,revisions:agent.diagnostics().revisions,spoken:agent.diagnostics().spoken,silent:agent.diagnostics().silent,learnerDecisions:records.length,steps};
}
try{
 for(let i=0;i<episodes;i++){
  const room=newGame(3+i%3),learner=room.players[i%room.players.length],result=await run(room,learner.id,true,'candidate',seed+i,`train-${i}`);
  model.metadata.episodes++;model.metadata.training||=[];model.metadata.training.push(result);await save();console.log(JSON.stringify({episode:i+1,...result}));
 }
 for(let i=0;i<pairs;i++){
  const room=newGame(3+i%3),learner=room.players[i%room.players.length],row={index:i};
  // Same start, seat and policy RNG. Later deck draws still use engine crypto RNG.
  for(const branch of ['candidate','honest']){const result=await run(room,learner.id,false,branch,seed+10000+i,`eval-${i}-${branch}`);row[branch]=result;evaluation[branch].games++;evaluation[branch].wins+=Number(result.win);}
  evaluation.pairs.push(row);await save();console.log(JSON.stringify({pair:i+1,...row}));
 }
 model.metadata.completed=true;model.metadata.api=client.diagnostics();model.metadata.reward='terminal team win +1/loss -1; no reward for speech/lying volume';
 evaluation.promoted=false;evaluation.limitations=['Pilot sample, not a win-rate claim','Same production agent loop and memory, bounded API calls per game; fallback uses original game policy','No LLM fine tuning; only social option selection is updated','Identical initial evaluation rooms, but future deck draws are not paired','Honest comparison changes strategy, not a causal no-message ablation'];
 await save();console.log(JSON.stringify({evaluation,api:client.diagnostics()},null,2));
}catch(error){model.metadata.completed=false;model.metadata.error=/^[a-z_0-9]+$/.test(error.message)?error.message:'training_error';await save();throw error;}
