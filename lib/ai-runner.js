import { act, canAct, CARDS, mediationPower } from './game.js';
import { candidates, decide, createDecisionContext,recordDecision } from './ai-policy.js';
import {baseline} from '../ai/environment.js';
import {aiObservation,alliedHarm} from './ai-observation.js';
import {validateConstructedAction} from './action-construction.js';
import {assets} from '../ai/reward-ledger.js';

export function createBotRunner({ policy, agent=null, changed, failed = console.error, delay = 750, runExclusive=null, currentRoom=null }) {
  const timers = new Map();
  const running=new Set();
  const contexts = new WeakMap();
  const lastActor=new WeakMap();
   function nextBot(room){const ready=room.players.filter(p=>(p.bot||p.takeover)&&!p.surrendered&&canAct(room,p.id));const index=ready.findIndex(p=>p.id===lastActor.get(room.game));return ready[(index+1)%ready.length];}
  let closed = false;
  function schedule(room) {
    if (closed || running.has(room.code) || timers.has(room.code) || room.status !== 'playing') return;
    if (!room.players.some(p => !p.bot && p.online)&&!room.players.some(p=>p.takeover)) return;
    const bot = nextBot(room);
    if (!bot) return;
    const timer = setTimeout(async () => {
      timers.delete(room.code);
      if (closed || room.status !== 'playing' || !room.players.some(p => !p.bot && p.online)&&!room.players.some(p=>p.takeover)) return;
      const code=room.code;running.add(code);
      const execute=async()=>{
      if(currentRoom){room=currentRoom(room.code);if(!room||room.status!=='playing')return;}
      try {
        // 예약 후 사람이 단계를 바꾸거나 재경기를 시작했을 수 있으므로 다시 찾습니다.
        const currentBot = nextBot(room);
        if (!currentBot) return;
        const game=room.game;
        lastActor.set(game,currentBot.id);
         // The trained policy owns game turns. Optional API conversation must
         // never block gameplay when the API is disabled, slow or unavailable.
         const decision=agent&&!policy?await agent.beforeAction(room,currentBot):null;
         if(decision?.localPolicyFallback)currentBot.aiStatus={...currentBot.aiStatus,state:'local-policy',error:currentBot.aiStatus.error};
        if(closed||room.game!==game||room.status!=='playing'||currentBot.surrendered||!canAct(room,currentBot.id)||decision?.wait||decision?.stale)return;
        let gameContexts=contexts.get(room.game);
        if(!gameContexts){gameContexts=new Map();contexts.set(room.game,gameContexts);}
        if(!gameContexts.has(currentBot.id))gameContexts.set(currentBot.id,createDecisionContext());
        const snapshot=aiObservation(room,currentBot),actions=candidates(snapshot);
        const difficulty=currentBot.difficulty||'normal',g=room.game;
        if(['hard','frenzy','chaos'].includes(difficulty))snapshot.players.forEach(q=>{q.job=room.players.find(p=>p.id===q.id)?.job;});
        let action = policy?decide(policy, snapshot,Math.random,gameContexts.get(currentBot.id),null,false):baseline(snapshot,actions);
        const reviewed=action;currentBot.actionAudit ||= [];currentBot.actionAudit.push({day:g.day,phase:g.phase,kind:'reviewed',action:structuredClone(action),source:'policy',candidates:structuredClone(actions)});
        // Legacy conversationPlan must not override the unified decision.
        if(decision?.action){const exact=actions.find(a=>JSON.stringify(a)===JSON.stringify(decision.action));if(exact)action=exact;else{validateConstructedAction(room,currentBot.id,decision.action);action=decision.action;}}
        if(!decision?.action&&g.phase==='day'&&!g.pending&&action?.type!=='gameVote'){
          const key=`${g.day}/${g.round}/${g.turn}`;
          if(currentBot.extraActionKey!==key){currentBot.extraActionKey=key;const roll=Math.random();currentBot.extraDayActions=difficulty==='chaos'?(roll<.25?2:roll<.85?1:0):difficulty==='frenzy'&&roll<.35?1:0;
            if(difficulty==='veryEasy'&&Math.random()<.35)action={type:'skipTurn'};
          }
        }
        if(!decision?.action&&['normal','frenzy','chaos'].includes(difficulty)&&g.day===1&&action?.type==='execute')action={type:'expedition'};
        if(!decision?.action&&['veryEasy','easy'].includes(difficulty)&&action?.type!=='skipTurn'&&action?.type!=='gameVote'){
          if(g.phase==='day'&&g.round===2&&!g.pending)action={type:'beginCraft'};
          if(g.pending?.kind==='craft'){
            const craftActions=actions.filter(a=>a.type==='craft'&&a.recipe>=(currentBot.easyRecipe||0));
            action=craftActions[0]||{type:'craftDone'};
            if(action.type==='craft'){currentBot.easyRecipe=action.recipe;action=craftActions.filter(a=>a.recipe===action.recipe).sort((a,b)=>b.count-a.count)[0];}
          }else currentBot.easyRecipe=0;
          if(difficulty==='veryEasy'&&action?.type==='steal')action={type:'refresh',cards:[]};
          if(['expeditionCards','mediationSupport','mediationKing','night'].includes(g.phase)&&action?.cards&&currentBot.job!=='merchant'){const allowed=g.phase==='night'?t=>!!CARDS[t].revolt||currentBot.job==='assassin'&&t==='sword':g.phase==='expeditionCards'?t=>actions.some(a=>a.cards?.some(id=>currentBot.hand.find(c=>c.id===id)?.type===t)):t=>mediationPower(t,currentBot.role,g.pending.revoltType)>0;let bombs=g.bombs||0;action={...action,cards:currentBot.hand.filter(c=>allowed(c.type)&&(g.phase!=='night'||!CARDS[c.type].bomb||++bombs<=4)).map(c=>c.id)};}
        }
        if (!action) {currentBot.aiStatus={state:'candidate-error'};failed(Error('AI 실행 후보 없음'));schedule(room);return;}
        if(alliedHarm(snapshot,action)&&!decision?.teamHarmApproved){if(decision?.action){currentBot.aiStatus={state:'error',error:'team-harm-recheck-required'};return;}const alternatives=actions.filter(a=>!alliedHarm(snapshot,a));action=baseline(snapshot,alternatives)||alternatives[0];}
        if(!action)return;
        validateConstructedAction(room,currentBot.id,action);const before=assets(room),eventId=room.game.pending?.eventId;act(room, currentBot.id, action);
        recordDecision(gameContexts.get(currentBot.id),action);currentBot.actionAudit.push({day:g.day,phase:g.phase,kind:'executed',action:structuredClone(action),changed:JSON.stringify(reviewed)!==JSON.stringify(action)});currentBot.actionAudit=currentBot.actionAudit.slice(-100);
        agent?.executed(room,currentBot,action,{before,actor:currentBot.id,action,eventId:eventId||room.game.pending?.eventId});
        if(action.type===currentBot.conversationPlan?.type)currentBot.conversationPlan=null;
        currentBot.aiStatus={state:'local-policy'};
        await changed(room);
        schedule(room);
      } catch (error) { failed(error); }
      finally {if(room)schedule(room);}
      };
      try{if(runExclusive)await runExclusive(execute);else await execute();}
      catch(error){failed(error);}
      finally{running.delete(code);if(room)schedule(room);}
    }, delay);
    timer.unref?.(); timers.set(room.code, timer);
  }
  return { schedule, close() { closed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } };
}
