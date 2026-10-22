import {candidates,distribution,observe,actionFeatures,sample} from './ai-policy.js';
import {baseline} from '../ai/environment.js';
import {chatView,chatAct,chatEnabled} from './chat.js';
import {createAgentClient} from './agent-client.js';
import {socialActions,executeSocialAction} from './ai-social-actions.js';
import {aiObservation,alliedHarm,harmExceptionValid,teamHarmCosts} from './ai-observation.js';
import {AGENT_SYSTEM,AGENT_VERSION,STRATEGIC_PHASES,scopeKey,mindFor,prepareDecision,observationKey,commitDecision,plannedAction,recordExecution,decisionSchema,decisionStage,validateDecision} from './agent-mind.js';
import {HUMAN_SPEECH_INSTRUCTION} from './human-speech.js';
import {constructionSpace,validateConstructedAction} from './action-construction.js';
import {consultationAllows,consultEvidence} from './ally-consultation.js';
import {expressionMismatch,rewriteExpression,semanticExpressionCheck} from './decision-expression.js';
import {handoverHistory} from './handover-memory.js';
import {randomUUID} from 'node:crypto';
import {reviewSummary} from './summary-review.js';
import {rememberEvidence} from './agent-memory.js';
import {decisionPrerequisites,unreadMessages} from './decision-validity.js';
import {extractHandoverIntents} from './handover-intents.js';
import {actionComparison} from './action-comparison.js';

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
const agentView=aiObservation;
export function createCognitiveAgent({client=createAgentClient(),changed=async()=>{},statusChanged=()=>{},failed=console.error,policy=null,learning=null,speechStyle=()=>null,random=Math.random,clock=Date.now,onDecision=()=>{},reactionDelay=120}={}){
  const busy=new Map();
   const busyKey=(bot,input)=>`${bot.id}/${input.type==='action'?'action':'dialogue'}`;
 const queues=new Map(),observed=new WeakMap();let closed=false;
 const remember=(room,bot,input)=>{
     const history=channelHistory(room,bot,input);if(history===null)return false;
   const mind=mindFor(bot,room.game.startedAt),key=scopeKey(input);
   rememberEvidence(mind,key,[...history.map(m=>({id:`message:${m.id}`,kind:m.self?'own-speech':'anonymous-claim',text:m.text})),...room.game.logs.map(l=>({id:`event:${l.id}`,kind:'public-event',text:l.text})),...bot.notes.map(n=>({id:`own-note:${n.id}`,kind:'private-observation',text:n.text}))]);
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
  if(closed||room.status!=='playing'||bot.surrendered||!remember(room,bot,input)||!client.enabled||bot.aiStatus?.state==='configuration-error')return Promise.resolve();
   const key=busyKey(bot,input);let queue=queues.get(key);if(!queue){queue={pending:new Map(),running:false,timer:null,waiters:[],epoch:room.game};queues.set(key,queue);}
   if(queue.epoch!==room.game){queue.pending.clear();queue.waiters.splice(0).forEach(resolve=>resolve());queue.epoch=room.game;}
   const visible=channelHistory(room,bot,input),messageId=input.messageId||visible?.at(-1)?.id;
   const queueKey=input.type==='chatSend'?`${scopeKey(input)}/message:${messageId||input.text}`:`${scopeKey(input)}/state`;
   queue.pending.set(queueKey,{room,bot,input:{...input,continuous:true}});
   if(input.type==='chatSend'){bot.pendingDialogue=true;bot.pendingDialogueText=input.text;}
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
     if(busy.has(busyKey(event.bot,event.input))){queue.pending.set(key,event);break;}
     if(event.bot.aiStatus?.retryAfter>clock()){queue.pending.set(key,event);break;}
     const result=await deliberate(event.room,event.bot,event.input,false);
     if(result.error&&event.bot.aiStatus?.state!=='configuration-error'){queue.pending.set(key,event);queue.waiters.splice(0).forEach(resolve=>resolve());break;}
   }
    }finally{queue.running=false;if(queue.pending.size&&!closed){queue.timer=setTimeout(()=>{queue.timer=null;void drain(queue);},reactionDelay);}else queue.waiters.splice(0).forEach(resolve=>resolve());}
 }
 function fanout(room,sender,input){
  return Promise.all(room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered&&p.id!==sender?.id).map(bot=>{
   if(!remember(room,bot,input))return Promise.resolve();
    // 관련 여부/침묵은 각자의 판단 결과로 결정합니다. 특정 단어로 발언을 제외하지 않습니다.
   return enqueue(room,bot,input);
  }));
 }
   const stats={decisions:0,revisions:0,spoken:0,silent:0,discarded:0,invalid:0,fallbacks:0,lastDecisionError:null};
 function budget(room,bot){if(bot.agentBudget?.epoch!==room.game?.startedAt||bot.agentBudget?.day!==room.game?.day)bot.agentBudget={epoch:room.game?.startedAt,day:room.game?.day,autonomous:0,replies:0};return bot.agentBudget;}
 async function deliberate(room,bot,input,proactive){
     if(!client.enabled||busy.has(busyKey(bot,input))||!chatEnabled(room)||room.status!=='playing'||bot.surrendered||channelHistory(room,bot,input)===null||bot.aiStatus?.state==='configuration-error'||bot.aiStatus?.retryAfter>clock())return {skipped:true};
    const b=budget(room,bot),kind=proactive?'autonomous':'replies';
     const game=room.game,epoch=game.startedAt,s=agentView(room,bot),history=channelHistory(room,bot,input),mind=mindFor(bot,epoch);
     const actions=candidates(s);
     if(s.me.canAct&&!actions.length){const rebuilt=candidates(agentView(room,bot));if(rebuilt.length)actions.push(...rebuilt);else{bot.aiStatus={state:'candidate-error',error:'canAct-without-actions',retryAfter:clock()+30000};statusChanged(room,bot);failed(`AI 행동 후보 누락:${s.game.phase}`);return {error:true};}}
     if(input.type==='action'&&s.game.phase==='day'&&!s.game.pending&&!s.game.vote?.eligible){
     const key=`${s.game.day}/${s.game.round}/${s.game.current}`;
     if(bot.extraActionKey!==key){bot.extraActionKey=key;const roll=random();bot.extraDayActions=bot.difficulty==='chaos'?(roll<.25?2:roll<.85?1:0):bot.difficulty==='frenzy'&&roll<.35?1:0;
     if(bot.difficulty==='veryEasy'&&random()<.35){bot.skipActionKey=key;actions.splice(0,actions.length,{type:'skipTurn'});}
     }
     if(bot.skipActionKey===key)actions.splice(0,actions.length,{type:'skipTurn'});
    }
     if(bot.skipActionKey===`${s.game.day}/${s.game.round}/${s.game.current}`)s.me.skipAction=true;
     if(proactive){
     if(!actions.length||!STRATEGIC_PHASES.has(s.game.phase)&&input.type!=='action')return {skipped:true};
   if(mind.budget.day!==s.game.day)mind.budget={day:s.game.day,used:0};
     const existing=mind.scopes[scopeKey(input)]?.plan;
   if(existing?.observedKey===observationKey(s,actions,history))return {skipped:true};
   mind.budget.used++;
  }
       b[kind]++;const ticket={};busy.set(busyKey(bot,input),ticket);const previousFailures=bot.aiStatus?.failures||0,previousError=bot.aiStatus?.error||null;bot.aiStatus={state:'thinking',failures:previousFailures};statusChanged(room,bot);
    const prepared=prepareDecision({bot,epoch,snapshot:s,actions,history,input,proactive,policy:typeof policy==='function'?policy(s):policy,random,now:clock()});
    prepared.socialActions=socialActions(room,bot,input,history);
    prepared.context.actionConstruction=constructionSpace(s);
    prepared.context.channel={type:input.channel,room:input.room||null};
    prepared.context.previousError=previousError;
    prepared.context.memorySummaries=prepared.scope.verifiedSummaries||[];
    prepared.context.requestId=randomUUID();
    if(bot.takeover&&!mind.handoverReviewed?.[prepared.key])prepared.context.handover={instruction:'원래 사람이 이 채널에서 한 의사·조건·상대를 추출하되 불확실하면 질문한다. 다른 채널 내용을 현재 발언에 옮기지 않는다.',history:handoverHistory(room,bot).filter(h=>h.scope===scopeKey(input))};
     prepared.context.allyConsultations=s.players.filter(p=>p.role==='rebel'&&p.id!==bot.id).map(p=>({target:p.id,messages:consultEvidence(mind,s,p.id)}));
     prepared.context.teamHarmCostRules=actions.filter(a=>alliedHarm(s,a)).map(a=>teamHarmCosts(s,a));
    prepared.context.previousStance=prepared.scope.stance||null;
      prepared.context.promises=(mind.promises||[]).filter(p=>p.status==='pending'&&(p.scope===scopeKey(input)||p.sources?.includes(scopeKey(input))));
      prepared.context.preferredActions=(mind.promises||[]).filter(p=>p.status==='pending'&&!p.deception&&p.preferred&&(p.scope===prepared.key||p.sources?.includes(prepared.key))).map(p=>({promise:p.id,action:p.preferred,conditions:p.conditions}));
    prepared.context.strategic=!!input.strategic;
   prepared.context.humanDialogueIntent=bot.liveExperience?.intent||null;
   prepared.context.observedHumanStyle=speechStyle();
     prepared.context.socialActions=prepared.socialActions.map((a,index)=>({index,...a}));
     prepared.context.pendingQuestions=history.filter(m=>!m.self&&!(mind.resolvedMessages||[]).includes(m.id)).slice(-12).map(m=>({id:m.id,text:m.text}));
  try{
         if(prepared.context.handover){
          const intents=await extractHandoverIntents(client,room,bot,prepared.key);
          if(room.game!==game||room.status!=='playing')return {discarded:true};
          mind.handoverIntents ||= {};mind.handoverIntents[prepared.key]=intents;prepared.context.inheritedIntents=intents;
         }
         let out,validationError=null;
        for(let attempt=0;attempt<3;attempt++){
          try{out=await client.ask(`${AGENT_SYSTEM}\n${HUMAN_SPEECH_INSTRUCTION}`,validationError?{...prepared.context,previousInvalidDecision:out,validationError,instruction:'오류가 난 행동/의사 조건을 다시 판단한다. mediate는 카드 제출이 아니고 카드 제출은 다음 contribute다. 상대 미확정 질문은 현재 거래 수락이 아니다. action trigger에서는 실제 합법행동을 선택한다.'}:prepared.context,decisionSchema(prepared));}
          catch(error){if(error.message!=='invalid_response'||attempt===2)throw error;validationError='invalid_response: JSON 스키마의 필수필드·타입·범위·enum을 지켜 다시 판단한다.';continue;}
         try{
          if(decisionStage(agentView(room,bot))!==decisionStage(s)){stats.discarded++;if(input.continuous)void enqueue(room,bot,input);return {discarded:true};}
          if(out.constructedAction){
           const built=Object.fromEntries(Object.entries(out.constructedAction).filter(([,value])=>value!==null));
           if(!prepared.context.actionConstruction.templates.some(a=>a.type===built.type)&&!(alliedHarm(s,built)&&out.teamHarm))throw Error('invalid_choice');
           validateConstructedAction(room,bot.id,built);
           const index=actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(built));out.choice=index<0?actions.push(built)-1:index;
          }
          validateDecision(out,{...prepared,mode:out.strategyMode||prepared.mode});validationError=null;break;
          }catch(error){validationError=error.message==='invalid_craft_conditions'?'invalid_craft_conditions: cardCount는 제작 결과 카드수가 아니라 재료 카드 총수다. 제공된 recipe의 각재료수×count를 합산한다. 발언에 입력장수 조건이 없으면 null. phase는 day 또는 merchantEvening이다.':error.message;if(error.message==='stale_plan'||attempt===2)throw error;}
        }
         const comparison=actionComparison(s,prepared.actions[out.choice]);
         if(comparison?.reconsider&&client.reviewExpression===true){
          const fields={keep:{type:'boolean'},choice:{type:['integer','null'],enum:[null,...prepared.actions.map((_,i)=>i)]},reason:{type:'string'}};
          const review=await client.ask('현재 선택의 규칙상 손익과 대안을 비교해 재검토한다. 확정실패 사냥도 합법이지만 자원얻기/제작보다 구체적 이득이 있어야 유지할 이유가 된다. 점수계산 오류라면 keep=false. 새 합법index를 본인이 선택한다.',{state:prepared.context.state,comparison,legalActions:prepared.context.legalActions,previousDecision:out},{type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false});
          if(!review.keep){out={...out,choice:review.choice,commitmentChoice:null,constructedAction:null,revisionReason:review.reason,planStatus:'revise'};validateDecision(out,prepared);if(out.communication!=='silent')out=await rewriteExpression(client,out,prepared.actions[out.choice],prepared.context);}
          prepared.context.actionComparison={...comparison,review};
         }
         const needsSemantic=client.reviewExpression===true&&out.communication!=='silent';
       if(expressionMismatch(out,actions[out.choice])||needsSemantic&&!await semanticExpressionCheck(client,out,actions[out.choice],prepared.context)){out=await rewriteExpression(client,out,actions[out.choice],prepared.context);if(expressionMismatch(out,actions[out.choice])||!await semanticExpressionCheck(client,out,actions[out.choice],prepared.context))throw Error('invalid_speech');}
       if(alliedHarm(s,actions[out.choice])&&!harmExceptionValid(s,actions[out.choice],out.teamHarm))throw Error('unsupported_team_harm');
       if(alliedHarm(s,actions[out.choice])&&!consultationAllows(mind,s,actions[out.choice],out.teamHarm)){
        void enqueue(room,bot,{channel:'rebel',type:'consultation',text:'동료 피해 행동을 실행하기 전 해당 동료와 목적·손실·대안을 상의하라. 상대 응답 전에는 다른 합리적인 행동을 고려한다.'});throw Error('unsupported_team_harm');
       }
       if(alliedHarm(s,actions[out.choice])&&client.reviewExpression===true){const review=await client.ask('동료 피해 예외의 팀 손익을 검토한다. 주어진 개인 관찰·동료 주장만 사용한다. 카드 이전 자체를 새 팀 이득으로 중복 계산하지 않고 실제 소모와 대안·협의/거절·긴급근거를 비교한다. 근거 없는 수치나 동료 거절 무시는 승인하지 않는다.',{action:actions[out.choice],proof:out.teamHarm,state:prepared.context.state,consultations:prepared.context.allyConsultations},{type:'object',properties:{approved:{type:'boolean'},reason:{type:'string'}},required:['approved','reason'],additionalProperties:false});if(!review.approved)throw Error('unsupported_team_harm');}
    if(closed||room.status!=='playing'||room.game!==game||!room.players.includes(bot)||bot.surrendered){stats.discarded++;return {discarded:true};}
     const current=agentView(room,bot),messages=channelHistory(room,bot,input);
        const sameState=decisionPrerequisites(current)===decisionPrerequisites(s);
      if(!messages){stats.discarded++;return {discarded:true};}
      prepared.context.latestObservation=current;
      if((mind.revision||0)!==prepared.revision){
       const latest=prepareDecision({bot,epoch,snapshot:current,actions:candidates(current),history:messages,input,policy:typeof policy==='function'?policy(current):policy,random,now:clock()});
       // Reconsider only action/commitment fields; retain the independent dialogue.
       const fields={choice:decisionSchema(latest).properties.choice,commitmentChoice:decisionSchema(latest).properties.commitmentChoice,revisionReason:{type:'string',maxLength:350}};
       const review=await client.ask('병렬 판단 충돌을 검토한다. 기존 발언은 보존하고 최신 계획·약속에 영향받은 현재 행동만 다시 선택한다. 최신 legalActions index를 반환한다.',{state:latest.context.state,legalActions:latest.context.legalActions,previousDecision:out,latestPlan:latest.scope.plan,promises:mind.promises},{type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false});
       if((mind.revision||0)!==latest.revision){stats.discarded++;if(input.continuous)void enqueue(room,bot,input);return {discarded:true};}
        const oldSocial=out.socialChoice==null?null:prepared.socialActions[out.socialChoice];
        out={...out,...review,planStatus:'revise',constructedAction:null};const requestId=prepared.context.requestId;Object.assign(prepared,latest);prepared.context.requestId=requestId;prepared.context.actionConstruction=constructionSpace(current);prepared.socialActions=socialActions(room,bot,input,messages);
        if(oldSocial){const next=prepared.socialActions.findIndex(a=>a.type===oldSocial.type&&a.room===oldSocial.room&&a.request===oldSocial.request&&a.accept===oldSocial.accept);out.socialChoice=next<0?null:next;}
        // Re-selecting the action can also change the meaning of the retained
        // sentence. Re-check it before applying the independent dialogue.
        if(client.reviewExpression===true&&!await semanticExpressionCheck(client,out,prepared.actions[out.choice],prepared.context)){
         out=await rewriteExpression(client,out,prepared.actions[out.choice],prepared.context);
         if(!await semanticExpressionCheck(client,out,prepared.actions[out.choice],prepared.context))throw Error('invalid_speech');
        }
      }
      if(!sameState||unreadMessages(history,messages).length){
       const currentActions=candidates(current),oldAction=prepared.actions[out.choice];
       let index=oldAction?currentActions.findIndex(a=>JSON.stringify(a)===JSON.stringify(oldAction)):-1;
       if(oldAction&&index<0&&out.constructedAction){validateConstructedAction(room,bot.id,oldAction);index=currentActions.push(oldAction)-1;}
      // 날/행동 기회가 같고 선택이 여전히 합법인 경우에만 재기반화합니다. 다른 단계의 발언은 재판단합니다.
       if(decisionStage(s)!==decisionStage(current)||(oldAction&&index<0)){stats.discarded++;if(input.continuous)void enqueue(room,bot,input);return {discarded:true};}
        if(oldAction){
         const promised=prepared.actions[out.commitmentChoice];out.choice=index;
         if(out.commitmentChoice!==null){const promisedIndex=currentActions.findIndex(a=>JSON.stringify(a)===JSON.stringify(promised));if(promisedIndex<0)throw Error('invalid_choice');out.commitmentChoice=promisedIndex;}
         prepared.actions=currentActions;
        }
       const material=JSON.stringify({hand:s.me.hand,money:s.me.money,revolt:s.game.revolt,religion:s.game.religiousRevolt,pending:s.game.pending})!==JSON.stringify({hand:current.me.hand,money:current.me.money,revolt:current.game.revolt,religion:current.game.religiousRevolt,pending:current.game.pending});
        const newMessages=unreadMessages(history,messages);
       if(material||newMessages.length){
        const result=await client.ask('판단이 사용한 전제를 최신 개인 관찰과 대조한다. 이전 발언·행동의 대상/수량/조건/근거가 여전히 유효한지 각각 판정한다. 무관한 인사나 접속로그만으로 무효화하지 않는다. JSON만.',{previous:prepared.context.state,current:current,newMessages:newMessages.map(m=>({id:m.id,text:m.text})),decision:out},{type:'object',properties:{speechValid:{type:'boolean'},actionValid:{type:'boolean'},reason:{type:'string'}},required:['speechValid','actionValid','reason'],additionalProperties:false});
         if(!result.actionValid){
          const fresh=candidates(current),context={...prepared.context,state:prepareDecision({bot,epoch,snapshot:current,actions:fresh,history:messages,input,now:clock()}).context.state,legalActions:fresh.map((a,index)=>({index,...a}))};
          const fields={choice:{type:['integer','null'],enum:[null,...fresh.map((_,i)=>i)]},revisionReason:{type:'string'}};
          const changed=await client.ask('새 정보에 영향받은 현재 행동만 다시 고른다. 대사·목표·독립된 미래의사는 바꾸지 않는다. 최신 후보index를 반환한다.',{...context,previousDecision:out,reviewReason:result.reason},{type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false});
          prepared.actions=fresh;out={...out,choice:changed.choice,commitmentChoice:null,constructedAction:null,revisionReason:changed.revisionReason,planStatus:'revise'};
          if(out.choice!==null)validateConstructedAction(room,bot.id,fresh[out.choice]);
         }
         if(!result.speechValid||!result.actionValid){
          out=await rewriteExpression(client,out,prepared.actions[out.choice],{...prepared.context,state:current});
          if(!await semanticExpressionCheck(client,out,prepared.actions[out.choice],{...prepared.context,state:current}))throw Error('invalid_speech');
         }
       }
     }
       if(out.memorySummary?.text){out.memorySummary=await reviewSummary(client,prepared.key,out.memorySummary,prepared.context.evidence);if((mind.revision||0)!==prepared.revision){stats.discarded++;void enqueue(room,bot,input);return {discarded:true};}}
       // Every additional API await can let the game advance. Validate again
       // immediately before applying either speech or an executable plan.
        const finalSnapshot=agentView(room,bot),finalHistory=channelHistory(room,bot,input);
        if(closed||room.status!=='playing'||room.game!==game||!finalHistory||decisionPrerequisites(finalSnapshot)!==decisionPrerequisites(current)||unreadMessages(messages,finalHistory).length){
        stats.discarded++;if(!closed&&room.status==='playing')void enqueue(room,bot,input);return {discarded:true};
       }
        if(out.choice!==null)validateConstructedAction(room,bot.id,prepared.actions[out.choice]);
        const finalAction=prepared.actions[out.choice];
        if(alliedHarm(finalSnapshot,finalAction)&&(!harmExceptionValid(finalSnapshot,finalAction,out.teamHarm)||!consultationAllows(mind,finalSnapshot,finalAction,out.teamHarm)))throw Error('unsupported_team_harm');
        if(out.socialChoice!==undefined&&out.socialChoice!==null){const selected=prepared.socialActions[out.socialChoice],live=socialActions(room,bot,input,finalHistory);if(!selected||!live.some(a=>a.type===selected.type&&a.room===selected.room&&a.request===selected.request&&a.accept===selected.accept))throw Error('invalid_choice');}
       const plan=commitDecision(prepared,out,clock());plan.prerequisites=decisionPrerequisites(finalSnapshot);bot.aiStatus={state:out.communication==='silent'?'silent':'ready',silent:out.communication==='silent'};statusChanged(room,bot);stats.decisions++;if(plan.revisionReason)stats.revisions++;
       if(prepared.context.handover){mind.handoverReviewed ||= {};mind.handoverReviewed[prepared.key]=true;}
      mind.resolvedMessages ||= [];for(const id of out.resolvedMessages||[])if(history.some(m=>m.id===id))mind.resolvedMessages.push(id);mind.resolvedMessages=[...new Set(mind.resolvedMessages)].slice(-100);
    learning?.record(room,bot,s,prepared,plan);
    mind.decisionRecords ||= [];mind.decisionRecords.push({id:prepared.context.requestId,revision:plan.revision,scope:prepared.key,stage:prepared.stage,candidates:structuredClone(prepared.actions),construction:prepared.context.actionConstruction,decision:structuredClone(out),status:'planned'});
    onDecision({snapshot:s,prepared,plan});
     mind.spokenPurposes ||= {};
     const topic=out.dialogueTopic||null,purpose=out.dialoguePurpose||out.communication;
     const knowledge=JSON.stringify([game.day,game.phase,game.round,s.me.hand.map(c=>[c.id,c.type]),s.game.logs.map(l=>l.id),s.me.notes.map(n=>n.id),input.humanTurn||null]);
     const purposeKey=topic?`${scopeKey(input)}/${topic}/${purpose}`:null;
     const repeated=history.filter(m=>m.self).slice(-4).some(m=>m.text.trim()===plan.text.trim())||!!(purposeKey&&input.fromBot&&mind.spokenPurposes[purposeKey]===knowledge);
     if(purposeKey&&!repeated)mind.spokenPurposes[purposeKey]=knowledge;
     if(plan.communication!=='silent'&&!repeated){chatAct(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:plan.text});stats.spoken++;}else {plan.communication='silent';plan.waitUntil=clock();stats.silent++;}
      if(out.socialChoice!==undefined&&out.socialChoice!==null)executeSocialAction(room,bot,input,prepared.socialActions[out.socialChoice]);
     if(out.socialChoice!==undefined&&out.socialChoice!==null){const action=prepared.socialActions[out.socialChoice];for(const promise of mind.promises||[])if(promise.status==='pending'&&!promise.deception&&promise.type===action.type&&(!promise.conditions?.target||promise.conditions.target===action.target)&&(!promise.conditions?.day||promise.conditions.day===game.day)){promise.status='fulfilled';promise.outcome='사회 행동 실제 실행';}}
   // Speech alone must not count as a new external observation.
     plan.observedKey=observationKey(current,candidates(current),channelHistory(room,bot,input)||[]);
    remember(room,bot,input);
       if(plan.communication!=='silent'&&!repeated)void fanout(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:plan.text,messageId:channelHistory(room,bot,input)?.at(-1)?.id,fromBot:true,humanTurn:input.humanTurn});
      if(input.type!=='action'){const queue=queues.get(`${bot.id}/dialogue`);bot.pendingDialogue=!!queue&&[...queue.pending.values()].some(event=>event.input.type==='chatSend');}await changed(room);return {plan};
     }catch(error){stats.invalid++;stats.lastDecisionError=/^(http_\d+|timeout|api_error|invalid_response|invalid_choice|invalid_speech|invalid_plan|unsupported_belief|unintentional_broken_promise|unexplained_revision|unsupported_team_harm|stale_plan)$/.test(error.message)?error.message:'invalid_decision';const attempts=(bot.aiStatus?.failures||0)+1;bot.aiStatus={state:/^http_40[0134]/.test(error.message)?'configuration-error':'error',error:stats.lastDecisionError,failures:attempts,retryAfter:clock()+Math.min(30000,1000*2**Math.min(attempts,5))};failed(`통합 AI 판단 실패: ${stats.lastDecisionError}`);return {error:true};}
     finally{if(busy.get(busyKey(bot,input))===ticket)busy.delete(busyKey(bot,input));if([...busy.keys()].some(key=>key.startsWith(`${bot.id}/`))&&['ready','silent'].includes(bot.aiStatus?.state))bot.aiStatus={...bot.aiStatus,state:'thinking'};statusChanged(room,bot);}
 }
 return {
  enabled:client.enabled,
  diagnostics:()=>({...client.diagnostics(),engine:'observe-plan-act',agentVersion:AGENT_VERSION,...stats}),
    isBusy:bot=>busy.has(`${bot.id}/action`)||busy.has(`${bot.id}/dialogue`),
   observe(room){
    if(closed||room.status!=='playing')return;
     for(const bot of room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered)){
      const chat=chatView(room,bot);
      if(chat.rebel)remember(room,bot,{channel:'rebel'});
      if(chat.pair)remember(room,bot,{channel:'pair',room:chat.pair.id});
      for(const secret of chat.secret.filter(r=>r.joined))remember(room,bot,{channel:'secret',room:secret.id});
       const s=agentView(room,bot),signature=JSON.stringify({day:s.game.day,phase:s.game.phase,round:s.game.round,current:s.game.current,pending:s.game.pending,hand:s.me.hand,notes:s.me.notes,logs:s.game.logs,incoming:chatView(room,bot).incoming});
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
     if(!client.enabled){for(const bot of bots)remember(room,bot,input);await changed(room);return;}
      const latest=channelHistory(room,sender,input)?.at(-1)?.id;await fanout(room,sender,{...input,messageId:input.messageId||latest,humanTurn:input.messageId||latest||input.text});
  },
    async beforeAction(room,bot){
       // A rejected API account must not freeze the game when a local policy
       // is available in the runner. Do not fabricate API dialogue.
       if(['http_400','http_401','http_402','http_403','http_404'].includes(bot.aiStatus?.error))return {localPolicyFallback:true};
      if(bot.aiStatus?.state==='configuration-error'||bot.aiStatus?.retryAfter>clock())return {wait:true};
      const promisedState=agentView(room,bot),promisedMind=mindFor(bot,room.game?.startedAt);
      plannedAction(promisedMind,promisedState,candidates(promisedState),clock());
    // 실게임 관찰 큐가 독립적으로 계획을 갱신합니다. 게임 전체를 API 대기로 멈추지 않습니다.
    if(observed.has(bot)){
     const s=agentView(room,bot),mind=mindFor(bot,room.game?.startedAt),plan=plannedAction(mind,s,candidates(s),clock());
       if(plan&&bot.pendingDialogue){
        const relevance=await client.ask('새 메시지가 현재 행동의 대상·수량·조건·약속·팀 손익을 바꿀 수 있는지 판정한다. 무관한 인사·이미 해결한 반복은 relevant=false.',{action:plan.action,message:bot.pendingDialogueText,state:{phase:s.game.phase,day:s.game.day},promises:mind.promises},{type:'object',properties:{relevant:{type:'boolean'}},required:['relevant'],additionalProperties:false});
        if(relevance.relevant)return {wait:true};
        if(room.status!=='playing'||decisionStage(agentView(room,bot))!==decisionStage(s))return {stale:true};
       }
       if(plan&&alliedHarm(s,plan.action)&&!consultationAllows(mind,s,plan.action,plan.plan.teamHarm)){plan.plan.status='invalidated';void enqueue(room,bot,{channel:'rebel',type:'consultation',text:'동료 협의 상태가 바뀌었으므로 다시 판단하라.'});return {wait:true};}
       if(plan?.plan.prerequisites&&plan.plan.prerequisites!==decisionPrerequisites(s)){plan.plan.status='needs-review';void enqueue(room,bot,{channel:'public',type:'action'});return {wait:true};}
       if(plan)return plan;
    if(busy.has(`${bot.id}/action`))return {wait:true};
      if(bot.aiStatus?.state==='configuration-error')return {wait:true};
      if(bot.aiStatus?.retryAfter>clock())return {wait:true};
     void enqueue(room,bot,{channel:'public',type:'action'});return {wait:true};
    }
     if(busy.has(`${bot.id}/action`))return {wait:true};
    let s=agentView(room,bot),actions=candidates(s),mind=mindFor(bot,room.game?.startedAt),planned=plannedAction(mind,s,actions,clock());
   // Revisit a pending plan when a new response/event is visible, before executing it.
   if(planned){const [channel,channelRoom]=planned.plan.scope.split('/'),input={channel,room:channelRoom||undefined},history=channelHistory(room,bot,input);
    if(history&&observationKey(s,actions,history)!==planned.plan.observedKey&&client.enabled){await deliberate(room,bot,input,true);}
   }else if(client.enabled){
      await deliberate(room,bot,{channel:'public',type:'action'},true);
   }
      if(room.status!=='playing'||bot.surrendered)return {stale:true};
    s=agentView(room,bot);actions=candidates(s);planned=plannedAction(mind,s,actions,clock());
      if(planned&&alliedHarm(s,planned.action)&&!consultationAllows(mind,s,planned.action,planned.plan.teamHarm)){planned.plan.status='invalidated';return {wait:true};}
      if(planned?.plan.prerequisites&&planned.plan.prerequisites!==decisionPrerequisites(s)){planned.plan.status='needs-review';void enqueue(room,bot,{channel:'public',type:'action'});return {wait:true};}
      if(planned)return planned;
    if(client.enabled){void enqueue(room,bot,{channel:'public',type:'action'});return {wait:true};}stats.fallbacks++;return {};
  },
    executed(room,bot,action,transition=null){const mind=mindFor(bot,room.game?.startedAt);recordExecution(mind,action);if(transition)learning?.observe(room,transition);const record=[...(mind.decisionRecords||[])].reverse().find(r=>r.status==='planned'&&JSON.stringify(r.decision.constructedAction?Object.fromEntries(Object.entries(r.decision.constructedAction).filter(([,v])=>v!==null)):r.candidates[r.decision.choice])===JSON.stringify(action));if(record){record.status='executed';record.executedAction=structuredClone(action);}for(const record of bot.liveExperience?.records||[]){if(record.plan.status==='pending'&&record.plan.action){record.plan.status=JSON.stringify(record.plan.action)===JSON.stringify(action)?'executed':'superseded';}}},
  deliberate
 };
}
