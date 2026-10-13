import {writeFile,readFile} from 'node:fs/promises';
import {newGame,readyPlayers,baseline} from './environment.js';
import {act,view} from '../lib/game.js';
import {candidates,distribution,observe,actionFeatures,sample,seededRandom} from '../lib/ai-policy.js';
import {compatiblePolicy} from './transfer.js';
import {SOCIAL_MODES,socialContext,socialDistribution,socialProbabilities,pickSocial} from '../lib/social-strategy.js';
const policy=compatiblePolicy(JSON.parse(await readFile(new URL('../models/policy.json',import.meta.url),'utf8')));
const model={version:1,algorithm:'episodic-policy-gradient-social-options',values:{},metadata:{episodes:0,externalApi:false}};
const args=process.argv.slice(2),arg=(n,d)=>args.includes(`--${n}`)?Number(args[args.indexOf(`--${n}`)+1]):d;
const episodes=arg('episodes',1200),evalGames=arg('eval-games',240),seed=arg('seed',9301);
if(!Number.isInteger(episodes)||episodes<1||!Number.isInteger(evalGames)||evalGames<1)throw Error('invalid episodes');
function game(random,training,opponent,controller=model){
 const room=newGame(3+Math.floor(random()*3)),learner=room.players[Math.floor(random()*room.players.length)],records=[],counts={honest:0,conceal:0,bluff:0,reserve:0,refuseExpedition:0,zeroSupport:0};let steps=0,signals=[];
 while(room.status==='playing'){
  if(++steps>1800)throw Error('step limit');const p=readyPlayers(room)[0],s=view(room,p.id),as=candidates(s);let index;
  if(p.id===learner.id){const mode=pickSocial(controller,s,random),ps=socialDistribution(controller,s);records.push({key:socialContext(s),mode,ps});counts[mode]++;
   const base=distribution(policy,observe(s),as.map(a=>actionFeatures(s,a))).probabilities;
   index=sample(socialProbabilities(s,as,base,mode,signals),random);
   const a=as[index];if(a.type==='joinExpedition'&&!a.join)counts.refuseExpedition++;if(a.type==='contribute'&&!a.cards?.length&&!a.money)counts.zeroSupport++;
   // 의도 신호가 상대의 선택에 영향을 줌. 자연어 설득을 검증하는 시뮬레이터는 아닙니다.
   signals.push({actor:p.id,day:s.game.day,phase:s.game.phase,claim:mode==='bluff'||mode==='honest'&&a.type==='contribute'&&a.cards?.length?'help':'uncertain'});signals=signals.slice(-16);
  }else{const choice=baseline(s,as,random);const base=opponent==='random'?as.map(()=>1/as.length):['policy','skeptic'].includes(opponent)?distribution(policy,observe(s),as.map(a=>actionFeatures(s,a))).probabilities:as.map(a=>a===choice?1:0);
   const probabilities=opponent==='skeptic'?base:socialProbabilities(s,as,base,'honest',signals);index=sample(probabilities,random);
  }
  act(room,p.id,as[index]);
 }
 const reward=room.game.winner.players.includes(learner.id)?1:-1;
 if(training){const counts=new Map();for(const r of records)counts.set(r.key,(counts.get(r.key)||0)+1);for(const r of records){const row=model.values[r.key]||=SOCIAL_MODES.map(()=>0);for(let i=0;i<row.length;i++)row[i]=Math.max(-2,Math.min(2,row[i]+.025*reward*(Number(SOCIAL_MODES[i]===r.mode)-r.ps[i])/(.4*counts.get(r.key))));}}
 return {win:reward===1,role:learner.job||learner.role,counts};
}
const opponents=['baseline','random','policy','skeptic'],random=seededRandom(seed);
for(let i=0;i<episodes;i++){game(random,true,opponents[i%4]);model.metadata.episodes++;if((i+1)%200===0)console.log(`social training ${i+1}/${episodes}`);}
function evaluate(controller){const report={games:evalGames,wins:0,byOpponent:{},byRole:{},counts:{}};const r=seededRandom(seed+100000);
 for(let i=0;i<evalGames;i++){const opponent=opponents[i%4],g=game(r,false,opponent,controller);report.wins+=Number(g.win);for(const [key,value]of Object.entries(g.counts))report.counts[key]=(report.counts[key]||0)+value;for(const [table,key]of [[report.byOpponent,opponent],[report.byRole,g.role]]){const row=table[key]||={games:0,wins:0};row.games++;row.wins+=Number(g.win);}}
 report.winRate=report.wins/evalGames;return report;
}
const evaluation={seed:seed+100000,trained:evaluate(model),untrained:evaluate({values:{}}),limitations:'Real game terminal rewards; simulated discrete help signals. No LLM calls or human persuasion evaluation. Game deck/roles use server crypto randomness, so seeds do not guarantee paired games.',};
evaluation.promoted=evaluation.trained.winRate>evaluation.untrained.winRate+.03&&Object.entries(evaluation.trained.byRole).every(([k,v])=>v.wins/v.games>=(evaluation.untrained.byRole[k]?.wins/evaluation.untrained.byRole[k]?.games||0)-.15);
model.metadata={...model.metadata,trainedAt:new Date().toISOString(),seed,opponents,evaluation,reward:'terminal team win +1 loss -1; no reward for lie count'};
await writeFile(new URL('../models/social-candidate.json',import.meta.url),JSON.stringify(model,null,2));
await writeFile(new URL('../models/social-evaluation.json',import.meta.url),JSON.stringify(evaluation,null,2));
if(evaluation.promoted)await writeFile(new URL('../models/social-policy.json',import.meta.url),JSON.stringify(model,null,2));
console.log(JSON.stringify(evaluation,null,2));
