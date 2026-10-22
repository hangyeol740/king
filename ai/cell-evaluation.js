import {newGame,baseline,OPPONENT_STYLES} from './environment.js';
import {act} from '../lib/game.js';
import {aiObservation} from '../lib/ai-observation.js';
import {decisionInputs,decide,createDecisionContext,recordDecision} from '../lib/ai-policy.js';
export function evaluateCell(policy,{role,count,opponent,random=Math.random}){
 let room,learner;
 for(let attempt=0;attempt<1000;attempt++){
  room=newGame(count,random);
  learner=room.players.find(p=>(p.job||p.role)===role);if(learner)break;
 }
 if(!learner)throw Error(`평가 조합 생성 불가:${role}/${count}`);
 const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)])),styles=new Map(room.players.map(p=>[p.id,OPPONENT_STYLES[Math.floor(random()*OPPONENT_STYLES.length)]]));
 let steps=0;
 while(room.status==='playing'){
  if(++steps>3000)throw Error(`평가 교착:${role}/${count}/${room.game.phase}`);
  const ready=room.players.map(p=>({p,s:aiObservation(room,p)})).filter(({s})=>s.me.canAct);
  if(!ready.length)throw Error('평가 행동 참가자 없음');
  const {p,s}=ready[Math.floor(random()*ready.length)],context=contexts.get(p.id),{actions}=decisionInputs(s,context);
  if(!actions.length)throw Error('평가 후보 누락');
  const active=p===learner?policy:typeof opponent==='object'?opponent:null;
   const action=active?decide(active,s,random,context):opponent==='random'?actions[Math.floor(random()*actions.length)]:baseline(s,actions,random,opponent==='mixed'?styles.get(p.id):opponent);
   act(room,p.id,action);
   if(!active)recordDecision(context,action);
 }
 return {won:room.game.winner.side!=='draw'&&room.game.winner.players.includes(learner.id),draw:room.game.winner.side==='draw',role,count,steps};
}
export function eligibleCounts(role){return ['bishop','merchant','neutral'].includes(role)?[4,5,6,7,8]:['hunter','blacksmith','citizen'].includes(role)?[3,4,5,6,7,8]:[2,3,4,5,6,7,8];}
