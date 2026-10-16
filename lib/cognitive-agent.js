import {view} from './game.js';
import {candidates,distribution,observe,actionFeatures,sample} from './ai-policy.js';
import {baseline} from '../ai/environment.js';
import {chatView,chatAct,chatEnabled,respondToChat} from './chat.js';
import {createAgentClient} from './agent-client.js';
import {socialActions,executeSocialAction} from './ai-social-actions.js';
import {AGENT_SYSTEM,AGENT_VERSION,STRATEGIC_PHASES,scopeKey,mindFor,prepareDecision,observationKey,commitDecision,plannedAction,recordExecution,decisionSchema} from './agent-mind.js';

export function channelHistory(room,bot,input){
 const c=chatView(room,bot);let visible,raw;
 if(input.channel==='public'){visible=c.public;raw=room.chat?.public;}
 else if(input.channel==='rebel'){visible=c.rebel;raw=room.chat?.rebel;}
 else if(input.channel==='pair'&&c.pair?.id===input.room){visible=c.pair.messages;raw=room.chat?.pairs.find(p=>p.id===input.room)?.messages;}
 else if(input.channel==='secret'){visible=c.secret.find(p=>p.id===input.room&&p.joined)?.messages;raw=room.chat?.secret.find(p=>p.id===input.room)?.messages;}
 if(!visible)return null;
 // Only annotate the bot's own messages. Never give it the anonymous sender identity.
 return visible.map(m=>({...m,self:raw?.some(r=>r.id===m.id&&r.sender===bot.id)||false}));
}
export function fallbackAction(snapshot,policy,random=Math.random){
 const legal=candidates(snapshot);if(!legal.length)return null;
 return policy?legal[sample(distribution(policy,observe(snapshot),legal.map(a=>actionFeatures(snapshot,a))).probabilities,random)]:baseline(snapshot,legal,random);
}
function agentView(room,bot){const s=view(room,bot.id);if(['hard','frenzy','chaos'].includes(bot.difficulty))s.players.forEach(p=>{p.job=room.players.find(q=>q.id===p.id)?.job||null;});return s;}
export function createCognitiveAgent({client=createAgentClient(),changed=async()=>{},failed=console.error,policy=null,learning=null,speechStyle=()=>null,random=Math.random,clock=Date.now,onDecision=()=>{},reactionDelay=120}={}){
 const busy=new Map();
 const queues=new Map(),observed=new WeakMap();let closed=false;
 const remember=(room,bot,input)=>{
  const history=channelHistory(room,bot,input);if(history===null)return false;
  const mind=mindFor(bot,room.game.startedAt),key=scopeKey(input);
  mind.inbox ||= {};mind.inbox[key]={day:room.game.day,phase:room.game.phase,messages:history.slice(-30).map(m=>({id:m.id,text:m.text,self:m.self})),updatedAt:clock()};
  mind.lastObservation={day:room.game.day,phase:room.game.phase,logs:room.game.logs.slice(-16),notes:bot.notes.slice(-8)};
  return true;
 };
 function reactionDelayFor(room,input){
  if(input.strategic||['battle','ambush','mediationSupport','mediationKing'].includes(room.game.phase))return Math.max(reactionDelay,700);
  if(input.type==='chatSend'&&/[?？]|왜|어떻게|거래|원정|중재|전투|기습/.test(input.text||''))return Math.max(reactionDelay,350);
  return reactionDelay;
 }
 function enqueue(room,bot,input){
  if(closed||room.status!=='playing'||bot.surrendered||!remember(room,bot,input)||!client.enabled)return Promise.resolve();
  let queue=queues.get(bot.id);if(!queue){queue={pending:new Map(),running:false,timer:null,waiters:[],epoch:room.game};queues.set(bot.id,queue);}
  if(queue.epoch!==room.game){queue.pending.clear();queue.epoch=room.game;}
  queue.pending.set(scopeKey(input),{room,bot,input:{...input,continuous:true}});
  const completion=new Promise(resolve=>queue.waiters.push(resolve));
  if(!queue.running&&!queue.timer){queue.timer=setTimeout(()=>{queue.timer=null;void drain(queue);},reactionDelayFor(room,input));}
  return completion;
 }
 async function drain(queue){
  if(closed)return;queue.running=true;
  try{
   while(queue.pending.size&&!closed){
    const [key,event]=queue.pending.entries().next().value;queue.pending.delete(key);
    if(event.room.game!==queue.epoch||event.room.status!=='playing')continue;
    if(busy.has(event.bot.id)){queue.pending.set(key,event);break;}
    await deliberate(event.room,event.bot,event.input,false);
   }
  }finally{queue.running=false;if(queue.pending.size&&!closed){queue.timer=setTimeout(()=>{queue.timer=null;void drain(queue);},reactionDelay);}else queue.waiters.splice(0).forEach(resolve=>resolve());}
 }
 function fanout(room,sender,input){
  return Promise.all(room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered&&p.id!==sender?.id).map(bot=>{
   if(!remember(room,bot,input))return Promise.resolve();
   // AI의 발언은 질문·제안·기존 약속과 관련될 때만 다시 판단합니다.
   if(input.fromBot&&!/[?？]|거래|원정|중재|전투|기습|약속|참가|지원/.test(input.text||''))return Promise.resolve();
   return enqueue(room,bot,input);
  }));
 }
 const stats={decisions:0,revisions:0,spoken:0,silent:0,discarded:0,invalid:0,fallbacks:0,lastDecisionError:null};
 function budget(room,bot){if(bot.agentBudget?.epoch!==room.game?.startedAt||bot.agentBudget?.day!==room.game?.day)bot.agentBudget={epoch:room.game?.startedAt,day:room.game?.day,autonomous:0,replies:0};return bot.agentBudget;}
 async function deliberate(room,bot,input,proactive){
  if(!client.enabled||busy.has(bot.id)||!chatEnabled(room)||room.status!=='playing'||bot.surrendered||channelHistory(room,bot,input)===null)return {skipped:true};
   const b=budget(room,bot),kind=proactive?'autonomous':'replies';
   const game=room.game,epoch=game.startedAt,s=agentView(room,bot),history=channelHistory(room,bot,input),mind=mindFor(bot,epoch);
   const actions=candidates(s);
  if(proactive){
   if(!actions.length||!STRATEGIC_PHASES.has(s.game.phase))return {skipped:true};
   if(mind.budget.day!==s.game.day)mind.budget={day:s.game.day,used:0};
     const existing=mind.scopes[scopeKey(input)]?.plan;
   if(existing?.observedKey===observationKey(s,actions,history))return {skipped:true};
   mind.budget.used++;
  }
  b[kind]++;const ticket={};busy.set(bot.id,ticket);
   const prepared=prepareDecision({bot,epoch,snapshot:s,actions,history,input,proactive,policy:typeof policy==='function'?policy(s):policy,random,now:clock()});
   prepared.socialActions=socialActions(room,bot,input,history);
   prepared.context.previousStance=prepared.scope.stance||null;
   prepared.context.humanDialogueIntent=bot.liveExperience?.intent||null;
   prepared.context.observedHumanStyle=speechStyle();
   prepared.context.socialActions=prepared.socialActions.map((a,index)=>({index,...a}));
  try{
    let out=await client.ask(AGENT_SYSTEM,prepared.context,decisionSchema(prepared));
    if(closed||room.status!=='playing'||room.game!==game||!room.players.includes(bot)||bot.surrendered){stats.discarded++;return {discarded:true};}
    const current=agentView(room,bot),messages=channelHistory(room,bot,input);
    const sameState=observationKey(current,candidates(current),[])===observationKey(s,actions,[]);
    if(!messages||(!input.continuous&&observationKey(current,candidates(current),messages)!==prepared.fingerprint)||!sameState){stats.discarded++;if(input.continuous)void enqueue(room,bot,{...input,text:null});return {discarded:true};}
    const plan=commitDecision(prepared,out,clock());stats.decisions++;if(plan.revisionReason)stats.revisions++;
    learning?.record(room,bot,s,prepared,plan);
    if(out.socialChoice!==undefined&&out.socialChoice!==null)executeSocialAction(room,bot,input,prepared.socialActions[out.socialChoice]);
   onDecision({snapshot:s,prepared,plan});
    const repeated=history.filter(m=>m.self).slice(-4).some(m=>m.text.trim()===plan.text.trim());
    if(plan.communication!=='silent'&&!repeated){chatAct(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:plan.text});stats.spoken++;}else {plan.communication='silent';plan.waitUntil=clock();stats.silent++;}
   // Speech alone must not count as a new external observation.
    plan.observedKey=observationKey(current,candidates(current),channelHistory(room,bot,input));
    remember(room,bot,input);
     if(plan.communication!=='silent'&&!repeated)void fanout(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:plan.text,fromBot:true});
    await changed(room);return {plan};
    }catch(error){stats.invalid++;stats.lastDecisionError=/^(http_\d+|timeout|api_error|invalid_choice|invalid_speech|invalid_plan|unsupported_belief|unintentional_broken_promise|unexplained_revision)$/.test(error.message)?error.message:'invalid_decision';failed(`통합 AI 판단 실패: ${stats.lastDecisionError}`);return {error:true};}
  finally{if(busy.get(bot.id)===ticket)busy.delete(bot.id);}
 }
 return {
  enabled:client.enabled,
  diagnostics:()=>({...client.diagnostics(),engine:'observe-plan-act',agentVersion:AGENT_VERSION,...stats}),
   isBusy:bot=>busy.has(bot.id),
   observe(room){
    if(closed||room.status!=='playing')return;
    for(const bot of room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered)){
     const s=agentView(room,bot),signature=JSON.stringify({day:s.game.day,phase:s.game.phase,round:s.game.round,current:s.game.current,pending:s.game.pending,hand:s.me.hand,notes:s.me.notes,logs:s.game.logs});
     if(observed.get(bot)===signature)continue;observed.set(bot,signature);
     void enqueue(room,bot,{channel:'public',type:'observation',depth:0});
    }
   },
   close(){closed=true;for(const q of queues.values()){clearTimeout(q.timer);q.pending.clear();q.waiters.splice(0).forEach(resolve=>resolve());}queues.clear();},
   async respond(room,sender,input){
    if(input.type!=='chatSend'||input.channel==='spectator'||room.status!=='playing'||!chatEnabled(room))return;
    if(!sender.bot&&!sender.takeover)for(const bot of room.players.filter(p=>(p.bot||p.takeover)&&p.id!==sender.id&&!p.surrendered&&channelHistory(room,p,input)!==null))learning?.hear(room,bot,input);
     const bots=room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered&&p.id!==sender.id&&channelHistory(room,p,input)!==null);
     if(!bots.length)return;
     if(!client.enabled){for(const bot of bots)remember(room,bot,input);respondToChat(room,sender,input);await changed(room);return;}
      await fanout(room,sender,input);
  },
   async beforeAction(room,bot){
    // 실게임 관찰 큐가 독립적으로 계획을 갱신합니다. 게임 전체를 API 대기로 멈추지 않습니다.
    if(observed.has(bot)){
     if(busy.has(bot.id))return {};
     const s=agentView(room,bot),mind=mindFor(bot,room.game?.startedAt),plan=plannedAction(mind,s,candidates(s),clock());
     if(plan)return {action:plan.action,wait:plan.wait};
     return {};
    }
   if(busy.has(bot.id))return {};
    let s=agentView(room,bot),actions=candidates(s),mind=mindFor(bot,room.game?.startedAt),planned=plannedAction(mind,s,actions,clock());
   // Revisit a pending plan when a new response/event is visible, before executing it.
   if(planned){const [channel,channelRoom]=planned.plan.scope.split('/'),input={channel,room:channelRoom||undefined},history=channelHistory(room,bot,input);
    if(history&&observationKey(s,actions,history)!==planned.plan.observedKey&&client.enabled){await deliberate(room,bot,input,true);}
   }else if(client.enabled){
    const result=await deliberate(room,bot,{channel:'public'},true);
    if(result.plan?.waitUntil>clock()&&result.plan.communication!=='silent'){
     const peer=room.players.find(p=>p.id!==bot.id&&(p.bot||p.takeover)&&!p.surrendered&&!busy.has(p.id));
     if(peer)await deliberate(room,peer,{channel:'public',text:result.plan.text},false);
    }
   }
   if(room.status!=='playing'||bot.surrendered)return {stale:true};
    s=agentView(room,bot);actions=candidates(s);planned=plannedAction(mind,s,actions,clock());
   if(planned)return {action:planned.action,wait:planned.wait};
   stats.fallbacks++;return {};
  },
   executed(room,bot,action){recordExecution(mindFor(bot,room.game?.startedAt),action);for(const record of bot.liveExperience?.records||[]){if(record.plan.status==='pending'&&record.plan.action){record.plan.status=JSON.stringify(record.plan.action)===JSON.stringify(action)?'executed':'superseded';}}},
  deliberate
 };
}
