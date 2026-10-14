import { act, view } from './game.js';
import { candidates, distribution, observe, actionFeatures, sample } from './ai-policy.js';
import {strategyFor,socialProbabilities} from './social-strategy.js';
import {personaFor} from './conversation.js';
import {applyChatPreference} from './openai-chat.js';
import {baseline} from '../ai/environment.js';
import {botChat} from './chat.js';
import {planCandidates} from './conversation.js';
import {fallbackAction} from './cognitive-agent.js';

export function createBotRunner({ policy, socialPolicy=null, agent=null, changed, failed = console.error, delay = 750 }) {
  const timers = new Map();
  const running=new Set();
  let closed = false;
  function schedule(room) {
    if (closed || running.has(room.code) || timers.has(room.code) || room.status !== 'playing') return;
    if (!room.players.some(p => !p.bot && p.online)&&!room.players.some(p=>p.takeover)) return;
    const bot = room.players.find(p => (p.bot||p.takeover)&&!p.surrendered&&candidates(view(room, p.id)).length);
    if (!bot) return;
    const timer = setTimeout(async () => {
      timers.delete(room.code);
      if (closed || room.status !== 'playing' || !room.players.some(p => !p.bot && p.online)&&!room.players.some(p=>p.takeover)) return;
      running.add(room.code);
      try {
        // 예약 후 사람이 단계를 바꾸거나 재경기를 시작했을 수 있으므로 다시 찾습니다.
        const currentBot = room.players.find(p => (p.bot||p.takeover)&&!p.surrendered&&candidates(view(room, p.id)).length);
        if (!currentBot) return;
        const game=room.game;
        const decision=agent?await agent.beforeAction(room,currentBot):null;
        if(closed||room.game!==game||room.status!=='playing'||currentBot.surrendered||decision?.wait||decision?.stale)return;
        const snapshot=view(room,currentBot.id);
        personaFor(currentBot,room.game);
        const strategy=strategyFor(currentBot,snapshot,socialPolicy);
        const legal=candidates(snapshot),planned=agent?legal:planCandidates(legal,snapshot,currentBot.conversationPlan);
        if(!legal.length)return;
        const probabilities=policy?distribution(policy,observe(snapshot),legal.map(a=>actionFeatures(snapshot,a))).probabilities:null;
        const biased=probabilities?applyChatPreference(legal,probabilities,currentBot.chatIntent,snapshot):null;
        const exact=decision?.action&&legal.find(a=>JSON.stringify(a)===JSON.stringify(decision.action));
        const action = exact|| (agent?fallbackAction(snapshot,policy):planned.length<legal.length?planned[0]:policy?legal[sample(socialPolicy?socialProbabilities(snapshot,legal,biased,strategy.mode):biased)]:baseline(snapshot,legal));
        if (!action) { schedule(room); return; }
        act(room, currentBot.id, action);
        agent?.executed(room,currentBot,action);
        if(action.type===currentBot.conversationPlan?.type)currentBot.conversationPlan=null;
        botChat(room,currentBot,action);
        await changed(room);
        schedule(room);
      } catch (error) { failed(error); }
      finally{running.delete(room.code);schedule(room);}
    }, delay);
    timer.unref?.(); timers.set(room.code, timer);
  }
  return { schedule, close() { closed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } };
}
