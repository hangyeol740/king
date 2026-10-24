import {CARDS,RECIPES,MERCHANT_BUYS,expeditionPower,isReligionCard,mediationPower,act,view as gameView} from './game.js';
import {candidates,observe,actionFeatures,distribution,sample,forward,ACTION_SIZE,CARD_TYPES,CONSTRUCTION_STAGES} from './ai-policy.js';
import {randomUUID} from 'node:crypto';
import {ACTION_FIELDS,validateActionFields} from './action-fields.js';
import {constructionTemplates} from './construction-rules.js';

// Each conditional choice is a PPO decision. Card counts are chosen by type;
// identical cards are exchangeable, but every legal multiset remains reachable.
export const CONSTRUCTION_VERSION=1;
export function constructionSpace(s){return {version:CONSTRUCTION_VERSION,templates:templates(s),actionFields:ACTION_FIELDS,cards:s.me.hand.map(c=>({id:c.id,type:c.type,name:CARDS[c.type].name,attack:CARDS[c.type].attack||0,mediation:CARDS[c.type].mediation||0,expedition:expeditionPower(c.type,s.me.role),revolt:CARDS[c.type].revolt||0})),recipes:RECIPES.map((r,index)=>({index,...r})),shop:s.game.shop||[],huntGoal:s.me.huntGoal,maximumCraftCount:1000,allyHarm:'동료 행동은 검증된 협의·팀손익 근거가 있을 때만 별도 예외로 구성 가능'};}
const range=(lo,hi)=>Array.from({length:Math.max(0,hi-lo+1)},(_,i)=>lo+i);
function cardRules(s,a){
 const {me,game:g}=s;
 if(a.type==='battleSubmit')return {allowed:t=>!isReligionCard(t)&&!!CARDS[t].attack,min:0,max:me.hand.length};
 if(a.type==='contribute')return {allowed:t=>me.job!=='merchant'&&(g.phase==='expeditionCards'?expeditionPower(t,me.role)!==null:mediationPower(t,me.role,g.pending?.revoltType)>0),min:0,max:me.hand.length};
 if(a.type==='revolt')return {allowed:t=>!!CARDS[t].revolt||me.job==='assassin'&&t==='sword',min:0,max:me.hand.length};
 if(a.type==='hunt')return {allowed:t=>!!CARDS[t].attack,min:0,max:me.hand.length};
 if(a.type==='refresh')return {allowed:t=>!isReligionCard(t),min:0,max:5};
 if(a.type==='payTax')return {allowed:()=>true,min:Math.min(3,me.hand.length),max:Math.min(3,me.hand.length)};
 if(a.type==='supportSubmit')return {allowed:()=>true,min:3,max:5};
 if(a.type==='marketBuy'){const n=g.shop.find(i=>i.id===a.stock).price*a.quantity;return {allowed:t=>!isReligionCard(t)||me.job==='bishop',min:n,max:n};}
 if(a.type==='displayGoods')return {allowed:t=>{const stock=g.shop.find(i=>i.type===t);return (stock?.quantity||0)<30;},min:1,max:me.hand.length};
 if(a.type==='tradeSubmit')return {allowed:()=>true,min:0,max:me.hand.length};
 return null;
}
function templates(s){
 const map=new Map();for(const raw of constructionTemplates(s)){
   const a=structuredClone(raw);if(a.type!=='claimBattleLoot')delete a.cards;
  if(a.type==='selectExpedition')delete a.targets;
  if(a.type==='craft')delete a.count;
  if(a.type==='merchantBuy'||a.type==='marketBuy')delete a.quantity;
  if(a.type==='contribute'&&s.me.job==='merchant')delete a.money;
  if(['displayGoods','changePrice'].includes(a.type))delete a.price;
   const ally=s.me.role==='rebel'&&s.players.some(p=>p.id===a.target&&p.role==='rebel');
   if(ally&&['ambush','battle','steal','voteExecution'].includes(a.type)&&!s.approvedAllyActions?.some(approved=>approved.type===a.type&&approved.target===a.target))continue;
  map.set(JSON.stringify(a),a);
 }
 // Market's sampled payment bundles must not hide a purchasable stock item.
 if(s.game.phase==='market'&&s.me.canAct&&s.me.job!=='merchant'&&!s.game.pending?.myDone&&!s.game.vote?.eligible){for(const item of s.game.shop||[]){const eligible=s.me.hand.filter(c=>!isReligionCard(c.type)||s.me.job==='bishop').length;if(item.quantity>0&&eligible>=item.price){const a={type:'marketBuy',stock:item.id};map.set(JSON.stringify(a),a);}}}
   return [...map.values()];
}
export function constructAction(policy,s,{random=Math.random,traits,choose=null,context=null}={}){
 const obs=observe(s,traits),steps=[],decisionId=randomUUID();let prefix=null;
 function pick(label,options){
  if(!options.length)throw Error(`empty-construction:${label}`);
   const features=options.map(a=>actionFeatures(s,a));
    const [stage,cardType]=label.split(':');
    const actorObs=policy.constructionActor?[...obs,...(prefix?actionFeatures(s,prefix):Array(ACTION_SIZE).fill(0)),...CARD_TYPES.map(t=>Number(t===cardType)),...CONSTRUCTION_STAGES.map(t=>Number(t===stage))]:obs;
   const actorPolicy=policy.constructionActor?{...policy,actor:policy.constructionActor}:policy;
   const {probabilities}=distribution(actorPolicy,actorObs,features);
   const chosen=choose?choose(label,structuredClone(options)):sample(probabilities,random);
  if(!Number.isInteger(chosen)||chosen<0||chosen>=options.length)throw Error(`invalid-construction:${label}`);
   steps.push({decisionId,obs:[...obs],actorObs:[...actorObs],actorKind:policy.constructionActor?'constructionActor':'actor',features,chosen,oldLogProbability:Math.log(Math.max(1e-12,probabilities[chosen])),value:forward(policy.critic,obs).output[0],reward:0,construction:label});
   prefix=structuredClone(options[chosen]);return structuredClone(prefix);
 }
 let all=templates(s);
  if(context){
  const stage=JSON.stringify([s.game.day,s.game.phase,s.game.round,s.game.current,s.game.pending?.kind]);
  if(context.constructionStage!==stage){context.constructionStage=stage;context.constructionSteps=0;context.constructionInventories=new Set();}
  context.constructionInventories.add(s.me.hand.map(c=>c.type).sort().join(','));
  all=all.filter(a=>{
   if(a.type!=='craft')return true;
   const recipe=RECIPES[a.recipe],hand=s.me.hand.map(c=>c.type);for(const material of recipe.ingredients||[recipe])for(let i=0;i<material.count;i++){const j=hand.indexOf(material.input);if(j>=0)hand.splice(j,1);}for(let i=0;i<(recipe.amount||1);i++)hand.push(recipe.output);
   return !context.constructionInventories.has(hand.sort().join(','));
  });
  if(context.constructionSteps>=40){const finish=all.filter(a=>['craftDone','merchantDone','bishopDone','marketDone'].includes(a.type));if(finish.length)all=finish;}
 }
   if(!all.length)return null;
   const types=[...new Set(all.map(a=>a.type))];let a=pick('type',types.map(type=>({type})));
  const matching=all.filter(x=>x.type===a.type);a=pick('target-and-parameters',matching);
 const {me,game:g}=s;
 if(a.type==='selectExpedition'){
  a.targets=[];for(let i=0;i<g.pending.required;i++)a=pick('expedition-target',s.players.filter(p=>p.id!==me.id&&!p.surrendered&&!a.targets.includes(p.id)).map(p=>({...a,targets:[...a.targets,p.id]})));
 }
 if(a.type==='craft'){
  const recipe=RECIPES[a.recipe],max=Math.min(1000,...(recipe.ingredients||[recipe]).map(m=>Math.floor(me.hand.filter(c=>c.type===m.input).length/m.count)));
  let counts=['easy','veryEasy'].includes(me.difficulty)?[max]:range(1,max);
  if(context)counts=counts.filter(count=>{const hand=me.hand.map(c=>c.type);for(const material of recipe.ingredients||[recipe])for(let i=0;i<material.count*count;i++){const j=hand.indexOf(material.input);if(j>=0)hand.splice(j,1);}for(let i=0;i<(recipe.amount||1)*count;i++)hand.push(recipe.output);return !context.constructionInventories.has(hand.sort().join(','));});
  if(!counts.length)throw Error('construction-cycle');a=pick('count',counts.map(count=>({...a,count})));
 }
 if(a.type==='merchantBuy')a=pick('quantity',range(1,Math.min(1000,Math.floor(me.money/MERCHANT_BUYS[a.product].cost))).map(quantity=>({...a,quantity})));
 if(a.type==='marketBuy'){
  const item=g.shop.find(i=>i.id===a.stock),n=me.hand.filter(c=>!isReligionCard(c.type)||me.job==='bishop').length;
  a=pick('quantity',range(1,Math.min(item.quantity,Math.floor(n/item.price))).map(quantity=>({...a,quantity})));
 }
 if(a.type==='contribute'&&me.job==='merchant')a=pick('money',range(0,Math.floor(me.money/2)).map(n=>({...a,money:2*n,cards:[]})));
 if(['displayGoods','changePrice'].includes(a.type)){
  const prices=range(1,5).filter(price=>a.type!=='changePrice'||price!==g.shop.find(i=>i.id===a.stock)?.price);
  a=pick('price',prices.map(price=>({...a,price})));
 }
  const rules=cardRules(s,a);
 if(rules){
   const groups=Object.keys(CARDS).map(type=>me.hand.filter(c=>c.type===type&&rules.allowed(type))).filter(cards=>cards.length);
  a.cards=[];
  for(let i=0;i<groups.length;i++){
   const cards=groups[i],remaining=groups.slice(i+1).reduce((n,c)=>n+c.length,0);
   let lo=Math.max(0,rules.min-a.cards.length-remaining),hi=Math.min(cards.length,rules.max-a.cards.length);
   if(a.type==='displayGoods'){
    const stock=g.shop.find(item=>item.type===cards[0].type),selectedTypes=new Set(me.hand.filter(c=>a.cards.includes(c.id)).map(c=>c.type));
    const newTypes=[...selectedTypes].filter(t=>!g.shop.some(item=>item.type===t)).length;
    hi=Math.min(hi,30-(stock?.quantity||0));if(!stock&&g.shop.length+newTypes>=5)hi=0;
    const futureCapacity=groups.slice(i+1).some(group=>g.shop.some(item=>item.type===group[0].type&&item.quantity<30)||g.shop.length+newTypes<5);
    lo=a.cards.length||futureCapacity?0:1;
   }
   const forced=['easy','veryEasy'].includes(me.difficulty)&&['contribute','revolt'].includes(a.type);
   a=pick(`cards:${cards[0].type}`,(forced?[hi]:range(lo,hi)).map(count=>({...a,cards:[...a.cards,...cards.slice(0,count).map(c=>c.id)]})));
  }
  if(a.cards.length<rules.min||a.cards.length>rules.max)throw Error('invalid-card-count');
 }
 for(const step of steps){step.action=structuredClone(a);step.phase=g.phase;step.day=g.day;}
  if(context)context.constructionSteps++;
 return {action:a,steps,space:{version:CONSTRUCTION_VERSION,types,templates:all,cardRules:rules?{min:rules.min,max:rules.max,eligible:me.hand.filter(c=>rules.allowed(c.type)).map(c=>c.id)}:null}};
}
export function validateConstructedAction(room,id,action){
 validateActionFields(action);
  const original=room.players.find(p=>p.id===id),copy=structuredClone(room);act(copy,id,structuredClone(action));
 if(original&&(original.bot||original.takeover)){
  const s=aiViewForValidation(room,original),options=candidates(s),d=original.difficulty||'normal';
   if(d==='veryEasy'&&action.type==='steal')throw Error('difficulty-restricted-action');
   if(original.skipActionKey===`${room.game.day}/${room.game.round}/${room.game.order?.[room.game.turn]}`&&d==='veryEasy'&&room.game.phase==='day'&&!room.game.pending&&action.type!=='skipTurn'&&action.type!=='gameVote')throw Error('difficulty-skip-required');
  if(['normal','frenzy','chaos'].includes(d)&&room.game.day===1&&action.type==='execute')throw Error('difficulty-restricted-action');
  if(['easy','veryEasy'].includes(d)){
   const sameType=options.filter(a=>a.type===action.type);
   if(!sameType.length&&action.type!=='skipTurn')throw Error('difficulty-restricted-action');
   if(['contribute','revolt'].includes(action.type)&&Array.isArray(action.cards)){const max=Math.max(...sameType.map(a=>a.cards?.length||0));if(action.cards.length!==max)throw Error('difficulty-restricted-submission');}
   if(action.type==='craft'&&!sameType.some(a=>a.recipe===action.recipe&&a.count===action.count))throw Error('difficulty-restricted-craft');
  }
 }
 return true;
}
function aiViewForValidation(room,p){const s=gameView(room,p.id);s.me.bot=!!p.bot;s.me.takeover=!!p.takeover;s.me.difficulty=p.difficulty||'normal';return s;}
