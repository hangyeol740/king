import { act, view, canAct, CARDS } from './game.js';
import { candidates, decide, createDecisionContext } from './ai-policy.js';
import {baseline} from '../ai/environment.js';
import {botChat,chatAct} from './chat.js';
import {planCandidates} from './conversation.js';

export function createBotRunner({ policy, agent=null, changed, failed = console.error, delay = 750 }) {
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
      running.add(room.code);
      try {
        // 예약 후 사람이 단계를 바꾸거나 재경기를 시작했을 수 있으므로 다시 찾습니다.
        const currentBot = nextBot(room);
        if (!currentBot) return;
        const game=room.game;
        lastActor.set(game,currentBot.id);
        for(const request of [...(room.chat?.requests||[])].filter(r=>r.to===currentBot.id))chatAct(room,currentBot,{type:'pairAnswer',request:request.id,accept:true});
        const decision=agent?await agent.beforeAction(room,currentBot):null;
        if(closed||room.game!==game||room.status!=='playing'||currentBot.surrendered||!canAct(room,currentBot.id)||decision?.wait||decision?.stale)return;
        let gameContexts=contexts.get(room.game);
        if(!gameContexts){gameContexts=new Map();contexts.set(room.game,gameContexts);}
        if(!gameContexts.has(currentBot.id))gameContexts.set(currentBot.id,createDecisionContext());
        const snapshot=view(room,currentBot.id),actions=candidates(snapshot);
        const difficulty=currentBot.difficulty||'normal',g=room.game;
        if(['hard','frenzy','chaos'].includes(difficulty))snapshot.players.forEach(q=>{q.job=room.players.find(p=>p.id===q.id)?.job;});
        let action = policy?decide(policy, snapshot,Math.random,gameContexts.get(currentBot.id),currentBot.chatIntent):baseline(snapshot,actions);
        const planned=planCandidates(actions,snapshot,currentBot.conversationPlan);
        if(planned.length<actions.length)action=planned[0];
        if(decision?.action){const exact=actions.find(a=>JSON.stringify(a)===JSON.stringify(decision.action));if(exact)action=exact;}
        if(g.phase==='day'&&!g.pending){
          const key=`${g.day}/${g.round}/${g.turn}`;
          if(currentBot.extraActionKey!==key){currentBot.extraActionKey=key;const roll=Math.random();currentBot.extraDayActions=difficulty==='chaos'?(roll<.25?2:roll<.85?1:0):difficulty==='frenzy'&&roll<.35?1:0;
            if(difficulty==='veryEasy'&&Math.random()<.35)action={type:'skipTurn'};
          }
        }
        if(['normal','frenzy','chaos'].includes(difficulty)&&g.day===1&&action?.type==='execute')action={type:'expedition'};
        if(['veryEasy','easy'].includes(difficulty)&&action?.type!=='skipTurn'){
          if(g.phase==='day'&&g.round===2&&!g.pending)action={type:'beginCraft'};
          if(g.pending?.kind==='craft'){
            const craftActions=actions.filter(a=>a.type==='craft'&&a.recipe>=(currentBot.easyRecipe||0));
            action=craftActions[0]||{type:'craftDone'};
            if(action.type==='craft'){currentBot.easyRecipe=action.recipe;action=craftActions.filter(a=>a.recipe===action.recipe).sort((a,b)=>b.count-a.count)[0];}
          }else currentBot.easyRecipe=0;
          if(difficulty==='veryEasy'&&action?.type==='steal')action={type:'refresh',cards:[]};
          if(['expeditionCards','mediationSupport','mediationKing','night'].includes(g.phase)&&action?.cards&&currentBot.job!=='merchant'){const allowed=g.phase==='night'?t=>!!CARDS[t].revolt:g.phase==='expeditionCards'?t=>actions.some(a=>a.cards?.some(id=>currentBot.hand.find(c=>c.id===id)?.type===t)):t=>!!CARDS[t].mediation&&(g.pending.revoltType!=='religion'||!['church','evangelism'].includes(t));action={...action,cards:currentBot.hand.filter(c=>allowed(c.type)).map(c=>c.id)};}
        }
        if (!action) { schedule(room); return; }
        act(room, currentBot.id, action);
        agent?.executed(room,currentBot,action);
        if(action.type===currentBot.conversationPlan?.type)currentBot.conversationPlan=null;
        if(!agent?.enabled)botChat(room,currentBot,action);
        await changed(room);
        schedule(room);
      } catch (error) { failed(error); }
      finally {running.delete(room.code);schedule(room);}
    }, delay);
    timer.unref?.(); timers.set(room.code, timer);
  }
  return { schedule, close() { closed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } };
}
