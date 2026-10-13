import {readFile,writeFile} from 'node:fs/promises';
import {newGame,readyPlayers} from './environment.js';
import {act,view} from '../lib/game.js';
import {candidates,distribution,observe,actionFeatures,sample,seededRandom} from '../lib/ai-policy.js';
import {compatiblePolicy} from './transfer.js';
import {SOCIAL_MODES,socialContext,socialDistribution,socialProbabilities,pickSocial} from '../lib/social-strategy.js';
import {createLanguageClient,languageExchange,safeAction} from './language-exchange.js';

const args=process.argv.slice(2),arg=(k,d)=>args.includes(`--${k}`)?Number(args[args.indexOf(`--${k}`)+1]):d;
const episodes=arg('episodes',24),evalPairs=arg('eval-pairs',12),seed=arg('seed',141026),maxExchanges=arg('exchanges',3);
if(!Number.isInteger(episodes)||episodes<1||!Number.isInteger(evalPairs)||evalPairs<1||!Number.isInteger(maxExchanges)||maxExchanges<1||maxExchanges>20)throw Error('invalid episode counts');
const client=createLanguageClient(),random=seededRandom(seed);
const policy=compatiblePolicy(JSON.parse(await readFile(new URL('../models/policy.json',import.meta.url),'utf8')));
const model={version:1,algorithm:'REINFORCE-natural-language-social-options',values:{},metadata:{episodes:0,externalApi:true,model:process.env.OPENAI_CHAT_MODEL||'gpt-6-luna'}};
const traces=[],styles=['주의 깊게 의심하고 공개 증거 우선','협력 제안에 열린 태도지만 손해는 피함','자원 보존 위주, 약속만으로 지원하지 않음'];
const out=new URL('../models/language-candidate.json',import.meta.url),tracePath=new URL('../models/language-traces.json',import.meta.url);
function probs(s,as){return distribution(policy,observe(s),as.map(a=>actionFeatures(s,a))).probabilities;}
function prepare(count,gameIndex){
 const room=newGame(count),learner=room.players[gameIndex%count];let steps=0;
 // 서로 실제로 선택할 수 있는 원정/중재/거래 단계로 이동. 원본 방의 비밀은 모델 입력에 사용하지 않습니다.
 while(room.status==='playing'&&steps++<1800){const p=readyPlayers(room)[0],s=view(room,p.id),as=candidates(s);const listener=room.players.find(q=>q.id!==learner.id&&candidates(view(room,q.id)).length>1);
  if(listener&&['expeditionJoin','mediationSupport','expeditionVote','expeditionCards'].includes(s.game.phase)&&candidates(view(room,learner.id)).length>1)return {room,learnerId:learner.id,listenerId:listener.id,steps};
  act(room,p.id,as[sample(probs(s,as),random)]);
 }
 return null;
}
async function run(setup,fixedMode,opponent,branchSeed,training=false){
 const room=structuredClone(setup.room),rng=seededRandom(branchSeed),learner=room.players.find(p=>p.id===setup.learnerId),records=[],history=[],gameTraces=[];let steps=0,changed=0;
 while(room.status==='playing'){
  if(++steps>1800)throw Error('step_limit');const s=view(room,learner.id),as=candidates(s);
  const listener=room.players.find(p=>p.id!==learner.id&&candidates(view(room,p.id)).length>1);
  if(gameTraces.length<maxExchanges&&as.length>1&&listener&&['expeditionJoin','mediationSupport','expeditionVote','expeditionCards'].includes(s.game.phase)){
   const ls=view(room,listener.id),las=candidates(ls),mode=fixedMode||pickSocial(model,s,rng),ps=socialDistribution(model,s);
   const learnerAction=as[sample(socialProbabilities(s,as,probs(s,as),mode),rng)],baseIndex=sample(probs(ls,las),rng);
   const exchange=await languageExchange(client,{speaker:s,speakerAction:learnerAction,listener:ls,listenerActions:las,baselineIndex:baseIndex,mode,opponent,history});
   act(room,listener.id,las[exchange.choice]);act(room,learner.id,learnerAction);
   history.push({utterance:exchange.utterance,reply:exchange.reply});records.push({key:socialContext(s),mode,ps});changed+=Number(exchange.changed);
   gameTraces.push({role:s.me.job||s.me.role,day:s.game.day,phase:s.game.phase,mode,opponent,utterance:exchange.utterance,desiredBelief:exchange.desiredBelief,listenerBelief:exchange.belief,listenerReply:exchange.reply,baselineAction:safeAction(ls,las[baseIndex]),chosenAction:safeAction(ls,las[exchange.choice]),actualSpeakerAction:safeAction(s,learnerAction),changed:exchange.changed});
  }else{const p=readyPlayers(room)[0],v=view(room,p.id),actions=candidates(v);act(room,p.id,actions[sample(probs(v,actions),rng)]);}
 }
 const win=room.game.winner.players.includes(learner.id),reward=win?1:-1;
 if(training)for(const r of records){const row=model.values[r.key]||=SOCIAL_MODES.map(()=>0);for(let k=0;k<row.length;k++)row[k]=Math.max(-2,Math.min(2,row[k]+.08*reward*(Number(SOCIAL_MODES[k]===r.mode)-r.ps[k])/(.4*records.length)));}
 traces.push(...gameTraces.map(t=>({...t,win,split:training?'train':'evaluation'})));
 return {win,changed,exchanges:records.length};
}
async function save(extra={}){model.metadata={...model.metadata,...extra,calls:client.calls,updatedAt:new Date().toISOString()};await writeFile(out,JSON.stringify(model,null,2));await writeFile(tracePath,JSON.stringify(traces,null,2));}
try{
 await client.ask('JSON {"ok":true} を返してください。',{connectionCheck:true});
 for(let i=0;i<episodes;i++){
  let setup;for(let n=0;n<20&&!setup;n++)setup=prepare(3+i%3,i);if(!setup)throw Error('no_social_decision');
  const result=await run(setup,null,styles[i%styles.length],seed+i,true);
  model.metadata.episodes++;await save();console.log(`language train ${i+1}/${episodes} exchanges=${result.exchanges} win=${result.win} listenerChanged=${result.changed}`);
 }
 const trained={games:0,wins:0,changed:0},honest={games:0,wins:0,changed:0};
 for(let i=0;i<evalPairs;i++){
  let setup;for(let n=0;n<20&&!setup;n++)setup=prepare(3+i%3,i);if(!setup)throw Error('no_eval_decision');
  for(const [report,m]of [[trained,null],[honest,'honest']]){const g=await run(setup,m,styles[i%3],seed+100000+i);report.games++;report.wins+=Number(g.win);report.changed+=Number(g.changed);report.exchanges=(report.exchanges||0)+g.exchanges;}
  await save({evaluationProgress:{trained,honest}});console.log(`language eval pair ${i+1}/${evalPairs}`);
 }
 trained.winRate=trained.wins/trained.games;honest.winRate=honest.wins/honest.games;
 const evaluation={trained,honest,promoted:false,reason:'Pilot sample too small for deployment; retain existing game policy. Initial room is cloned for pairs, but later deck draws use crypto randomness.',limitations:`Up to ${maxExchanges} real natural-language exchanges with shared dialogue history per complete game; trains social strategy selection, not LLM weights. Only selectable expedition/mediation phases; not human-player validation.`};
 await save({evaluation,reward:'terminal team victory only; listener change logged but not rewarded',completed:true});console.log(JSON.stringify(evaluation,null,2));
}catch(e){await save({completed:false,error:e.message});throw e;}
