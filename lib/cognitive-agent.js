import {view} from './game.js';
import {candidates,distribution,observe,actionFeatures,sample} from './ai-policy.js';
import {baseline} from '../ai/environment.js';
import {chatView,chatAct,chatEnabled,respondToChat} from './chat.js';
import {createAgentClient} from './agent-client.js';
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
export function createCognitiveAgent({client=createAgentClient(),changed=async()=>{},failed=console.error,policy=null,random=Math.random,clock=Date.now,maxAutonomousPerDay=6,maxRepliesPerDay=24,onDecision=()=>{}}={}){
 const busy=new Map(),lastReply=new Map();
 const stats={decisions:0,revisions:0,spoken:0,silent:0,discarded:0,invalid:0,fallbacks:0,lastDecisionError:null};
 function budget(room,bot){if(bot.agentBudget?.epoch!==room.game?.startedAt||bot.agentBudget?.day!==room.game?.day)bot.agentBudget={epoch:room.game?.startedAt,day:room.game?.day,autonomous:0,replies:0};return bot.agentBudget;}
 async function deliberate(room,bot,input,proactive){
  if(!client.enabled||busy.has(bot.id)||!chatEnabled(room)||room.status!=='playing'||bot.surrendered||channelHistory(room,bot,input)===null)return {skipped:true};
   const b=budget(room,bot),kind=proactive?'autonomous':'replies';
  if(b[kind]>=(proactive?maxAutonomousPerDay:maxRepliesPerDay))return {skipped:true};
   const game=room.game,epoch=game.startedAt,s=agentView(room,bot),history=channelHistory(room,bot,input),mind=mindFor(bot,epoch);
   const actions=candidates(s);
  if(proactive){
   if(!actions.length||!STRATEGIC_PHASES.has(s.game.phase))return {skipped:true};
   if(mind.budget.day!==s.game.day)mind.budget={day:s.game.day,used:0};
    if(mind.budget.used>=maxAutonomousPerDay&&!mind.scopes[scopeKey(input)]?.plan?.action)return {skipped:true};
   const existing=mind.scopes[scopeKey(input)]?.plan;
   if(existing?.observedKey===observationKey(s,actions,history))return {skipped:true};
   mind.budget.used++;
  }
  b[kind]++;const ticket={};busy.set(bot.id,ticket);
  const prepared=prepareDecision({bot,epoch,snapshot:s,actions,history,input,proactive,policy:typeof policy==='function'?policy(s):policy,random,now:clock()});
  try{
   const out=await client.ask(AGENT_SYSTEM,prepared.context,decisionSchema(prepared));
   if(room.status!=='playing'||room.game!==game||!room.players.includes(bot)||bot.surrendered){stats.discarded++;return {discarded:true};}
    const current=agentView(room,bot),messages=channelHistory(room,bot,input);
   if(!messages||observationKey(current,candidates(current),messages)!==prepared.fingerprint){stats.discarded++;return {discarded:true};}
   const plan=commitDecision(prepared,out,clock());stats.decisions++;if(plan.revisionReason)stats.revisions++;
   onDecision({snapshot:s,prepared,plan});
    const repeated=history.filter(m=>m.self).slice(-4).some(m=>m.text.trim()===plan.text.trim());
    if(plan.communication!=='silent'&&!repeated){chatAct(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:plan.text});stats.spoken++;}else {plan.communication='silent';plan.waitUntil=clock();stats.silent++;}
   // Speech alone must not count as a new external observation.
   plan.observedKey=observationKey(current,candidates(current),channelHistory(room,bot,input));
   await changed(room);return {plan};
  }catch(error){stats.invalid++;stats.lastDecisionError=/^(http_\d+|timeout|api_error|invalid_choice|invalid_speech|invalid_plan|unsupported_belief|unintentional_broken_promise|unexplained_revision)$/.test(error.message)?error.message:'invalid_decision';failed(`통합 AI 판단 실패: ${stats.lastDecisionError}`);return {error:true};}
  finally{if(busy.get(bot.id)===ticket)busy.delete(bot.id);}
 }
 return {
  enabled:client.enabled,
  diagnostics:()=>({...client.diagnostics(),engine:'observe-plan-act',agentVersion:AGENT_VERSION,...stats}),
  isBusy:bot=>busy.has(bot.id),
  async respond(room,sender,input){
   if(input.type!=='chatSend'||input.channel==='spectator'||room.status!=='playing'||!chatEnabled(room))return;
    const bots=room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered&&p.id!==sender.id&&channelHistory(room,p,input)!==null&&budget(room,p).replies<maxRepliesPerDay).sort((a,b)=>(lastReply.get(a.id)||0)-(lastReply.get(b.id)||0));
   const bot=bots.find(p=>clock()-(lastReply.get(p.id)||0)>2000&&!busy.has(p.id));
   if(!bot)return;lastReply.set(bot.id,clock());
   if(!client.enabled){respondToChat(room,sender,input);await changed(room);return;}
   await deliberate(room,bot,input,false);
  },
  async beforeAction(room,bot){
   if(busy.has(bot.id))return {wait:true};
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
  executed(room,bot,action){recordExecution(mindFor(bot,room.game?.startedAt),action);},
  deliberate
 };
}
