import { act, makeRoom, joinRoom, view, CARDS, RECIPES, expeditionPower } from '../lib/game.js';
import { candidates, decisionInputs, createDecisionContext, recordDecision, distribution, sample, forward } from '../lib/ai-policy.js';

export function readyPlayers(room) {
  if (room.status !== 'playing') return [];
  return room.players.filter(p => candidates(view(room, p.id)).length > 0);
}
export function newGame(count = 3, random = Math.random) {
  const room = makeRoom('TRAIN', '학습 1');
  for (let i = 1; i < count; i++) joinRoom(room, `학습 ${i + 1}`);
  if (count >= 4) {
    const choices=[[],['bishop'],['merchant'],['bishop','merchant']];
    act(room,room.host,{type:'neutralJobs',jobs:choices[Math.floor(random()*choices.length)]});
    const roles={king:1,citizen:1,rebel:1,neutral:1};
    for(let i=4;i<count;i++){const extra=['citizen','rebel','neutral'][Math.floor(random()*3)];roles[extra]++;}
    act(room,room.host,{type:'config',roles});
  }
  act(room, room.host, { type: 'start' });
  return room;
}
// 학습 및 평가의 상대. 이 전략은 배포용 학습 모델과 구분합니다.
export const OPPONENT_STYLES = ['balanced','cooperative','aggressive','builder','trader'];
export const TRAINING_OPPONENTS = ['random', ...OPPONENT_STYLES, 'previous'];
export function baseline(snapshot, actions, random = Math.random, style = 'balanced') {
  const { me, game: g } = snapshot;
  const royal = ['king', 'citizen'].includes(me.role);
  const score = (action, key) => me.hand.filter(c => action.cards?.includes(c.id)).reduce((s, c) => s + (CARDS[c.type][key] || 0), 0);
  const pick=type=>{const list=actions.filter(a=>a.type===type);return list[Math.floor(random()*list.length)];};
  if(g.pending?.kind==='battle')return actions.find(a=>a.type==='battleAnswer'&&a.accept===(style==='aggressive'))||[...actions].sort((a,b)=>score(b,'attack')-score(a,'attack'))[0];
  if(g.phase==='ambush')return style==='aggressive'?(pick('ambush')||actions[0]):pick('ambushSkip');
  if(g.phase==='day'&&!g.pending?.kind){
    if(g.round===1&&style==='trader'&&random()<.65){const a=pick('trade');if(a)return a;}
    if(g.round===1&&style==='aggressive'&&random()<.4)return pick('battle')||actions[0];
    if(g.round===2&&style==='builder')return pick('gather')||actions[0];
    if(g.round===3&&style==='aggressive')return pick('steal')||pick('royalSupport')||actions[0];
    if(g.round===3&&style==='trader')return pick('revealHand')||pick('refresh')||actions[0];
  }
  if(g.pending?.kind==='trade'&&style==='trader'){
    return actions.find(a=>a.type==='tradeAnswer'&&a.accept)||actions.filter(a=>a.type==='tradeSubmit'&&a.cards.length>0&&a.cards.length<=3)[0]||actions[0];
  }
  if (g.phase === 'morning') return actions.find(a => a.type === 'mediate') || actions.find(a => a.type === 'expedition');
  if (g.phase.startsWith('mediation')) {
    const sorted = [...actions].sort((a, b) => score(b, 'mediation') - score(a, 'mediation'));
    return royal ? sorted[0] : sorted.at(-1);
  }
  if (g.phase === 'night') return [...actions].sort((a, b) => score(b, 'revolt') - score(a, 'revolt'))[0];
  if (g.phase === 'bishopNight') return actions.find(a => a.type === 'religiousRevolt' && me.churchInfluence >= 10) || actions.find(a => a.type === 'reform') || actions.find(a => a.type === 'evangelize') || actions[0];
  if(g.phase==='market')return style==='trader'&&random()<.6?(pick('marketBuy')||actions[0]):actions.find(a=>a.type==='marketDone');
  if(g.phase==='merchantEvening'){
    if(g.pending.kind==='craft')return actions.find(a=>a.type==='craftDone');
    return actions.find(a=>a.type==='displayGoods'&&a.price===(style==='trader'?1:style==='aggressive'?5:3))||actions.find(a=>a.type==='merchantDone');
  }
  if (g.phase === 'expeditionVote') return actions[0];
  if (g.phase === 'expeditionSelect') return actions[0];
  if (g.phase === 'expeditionJoin') return actions[0];
  if (g.phase === 'expeditionCards') {
    const value=a=>me.hand.filter(c=>a.cards?.includes(c.id)).reduce((s,c)=>s+expeditionPower(c.type,me.role),0);
    return [...actions].sort((a,b)=>me.role==='rebel'?value(a)-value(b):value(b)-value(a))[0];
  }
  if (g.phase === 'redistribute') return actions.find(a => a.accept === (me.hand.length < 12));
  if (g.phase === 'day') {
    if (g.pending?.kind === 'royalSupport') return actions.find(a => a.type === 'supportAnswer' && !a.accept) || actions[0];
    if (g.pending?.kind === 'trade') return actions.find(a => a.accept === false || a.cards?.length === 0) || actions[0];
    if (g.pending?.kind === 'craft') {
      if(me.job==='merchant')return actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output==='shiningSword')||actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output==='reinforcedSword')||actions.find(a=>a.type==='craftDone');
       const priorities=['ironSword',...(me.job==='bishop'?['evangelism','church']:[]),'warWeapon','flameSword','northSword','highMagic',...(me.role==='rebel'?['bomb','agitation','rebellion','infantry']:['officer','infantry','rebellion']),'eternalMagic','eternalSword','weapon','magic','sword'];
      for(const output of priorities){const choice=actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output===output);if(choice)return choice;}
      return actions[0];
    }
    if (g.round === 1) return actions.find(a => a.type === 'draw3');
    if (g.round === 2) return actions.filter(a => a.type === 'hunt' && score(a, 'attack') >= 10).sort((a, b) => a.cards.length - b.cards.length)[0] || actions[0];
    return actions.find(a => a.type === 'refresh' && a.cards.length===0);
  }
  if (g.phase === 'evening') return actions.find(a => a.type === 'aid');
  return actions[Math.floor(random() * actions.length)];
}
function shapedReward(before, room, p, action, previousNotes) {
 const after=room.game, royal=['king','citizen'].includes(p.role), rebel=p.role==='rebel', bishop=p.job==='bishop';
 let reward=0;
 if(before.successes!==after.successes){const blocked=after.lastRevolt?.blocked;reward+=royal?(blocked?.06:-.06):rebel?(blocked?-.06:.06):0;}
 if(before.religiousSuccesses!==after.religiousSuccesses){const blocked=after.lastReligiousRevolt?.blocked;reward+=bishop?(blocked?-.06:.06):royal?(blocked?.04:-.04):0;}
 if(before.lastExpedition!==after.lastExpedition&&after.lastExpedition){const result=after.lastExpedition.result;reward+=result==='great'?.04:result==='success'?.02:result==='failure'?-0.025:0;}
 const notes=p.notes.slice(previousNotes);if(notes.some(n=>n.text.startsWith('전투 승리')))reward+=.05;if(notes.some(n=>n.text.startsWith('전투 패배')))reward-=.05;
 if(action.type==='ambush'&&rebel)reward+=.01;
 return reward;
}
export function rollout(policy, { count = 3, random = Math.random, opponents = [], collect = true, maxSteps = 1800, opponentOffset = 0 } = {}) {
 const room = newGame(count,random), trajectories = new Map(room.players.map(p => [p.id, []]));
 const learner=room.players[Math.floor(random()*room.players.length)],mixedTraining=opponents.length>0;
 const choices = new Map(room.players.map((p,index) => [p.id,!mixedTraining?{kind:'learner'}:p===learner?{kind:'learner'}:opponents[(opponentOffset+index)%opponents.length]]));
  const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)]));
  const styles=new Map(room.players.map(p=>[p.id,OPPONENT_STYLES[Math.floor(random()*OPPONENT_STYLES.length)]]));
  const metrics={actions:{},byRole:{},byPersonality:{},phaseActions:{},candidateEntropy:0,decisions:0};
  let steps = 0;
  while (room.status === 'playing') {
    if (++steps > maxSteps) throw new Error(`학습 게임 단계 제한 초과: ${room.game.phase}`);
    const ready = readyPlayers(room);
    if (!ready.length) throw new Error(`행동 가능한 참가자 없음: ${room.game.phase}`);
    const p = ready[Math.floor(random()*ready.length)], snapshot = view(room, p.id),context=contexts.get(p.id), {actions,obs,features}=decisionInputs(snapshot,context), controller = choices.get(p.id);
    let index;
    if (controller.kind==='random') index=Math.floor(random()*actions.length);
    else if (controller.kind==='baseline') index = actions.indexOf(baseline(snapshot, actions, random,controller.style));
    else if (controller.kind==='policy') { const probabilities=distribution(controller.policy,obs,features).probabilities;index=sample(probabilities,random); }
    else {
      const { probabilities } = distribution(policy, obs, features);
      metrics.candidateEntropy-=probabilities.reduce((s,p)=>s+p*Math.log(Math.max(p,1e-12)),0);metrics.decisions++;
      index = sample(probabilities, random);
       if (collect) trajectories.get(p.id).push({ obs, features, chosen: index, oldLogProbability: Math.log(Math.max(1e-12, probabilities[index])), value: forward(policy.critic, obs).output[0], reward: 0 });
    }
    const type=actions[index].type,role=p.job||p.role;
    metrics.actions[type]=(metrics.actions[type]||0)+1;
    for(const [bucket,key] of [[metrics.byRole,role],[metrics.byPersonality,context.name],[metrics.phaseActions,`${room.game.phase}/${room.game.round}`]]){bucket[key]||={};bucket[key][type]=(bucket[key][type]||0)+1;}
    recordDecision(context,actions[index]);
    const before={successes:room.game.successes,religiousSuccesses:room.game.religiousSuccesses,lastExpedition:room.game.lastExpedition,lastRevolt:room.game.lastRevolt,lastReligiousRevolt:room.game.lastReligiousRevolt},notes=p.notes.length;
    act(room, p.id, actions[index]);
    if (controller.kind==='learner'&&collect&&mixedTraining) trajectories.get(p.id).at(-1).reward+=shapedReward(before,room,p,actions[index],notes);
  }
  for (const p of room.players) {
    const records = trajectories.get(p.id);
     if (records.length) records.at(-1).reward += room.game.winner.players.includes(p.id) ? 1 : -1;
  }
  return { room, trajectories, steps, metrics };
}
export function evaluate(policy, { games = 60, counts = [3, 4, 5], random = Math.random, opponent = 'baseline' } = {}) {
  const results = { games, opponent:typeof opponent==='object'?'previous-model':opponent, wins: 0, byRole: {}, byPersonality:{}, actions:{}, phaseActions:{}, candidateEntropy:0,policyDecisions:0, averageDecisions: 0 };
  for (let game = 0; game < games; game++) {
    const room = newGame(counts[game % counts.length],random), learner = room.players[Math.floor(random() * room.players.length)];
    const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)]));
    const styles=new Map(room.players.map(p=>[p.id,OPPONENT_STYLES[Math.floor(random()*OPPONENT_STYLES.length)]]));
    let steps = 0;
    while (room.status === 'playing') {
      if (++steps > 1800) throw new Error('평가 게임 단계 제한 초과');
      const ready=readyPlayers(room),p=ready[Math.floor(random()*ready.length)], s = view(room, p.id),context=contexts.get(p.id),{actions,obs,features}=decisionInputs(s,context);
      let index;
      if (p.id === learner.id) {
        const probabilities = distribution(policy, obs, features).probabilities;
        index = sample(probabilities, random);
        results.candidateEntropy-=probabilities.reduce((sum,p)=>sum+p*Math.log(Math.max(p,1e-12)),0);results.policyDecisions++;
        const type=actions[index].type,key=`${room.game.phase}/${room.game.round}`;
        results.actions[type]=(results.actions[type]||0)+1;results.phaseActions[key]||={};results.phaseActions[key][type]=(results.phaseActions[key][type]||0)+1;
      } else if (opponent === 'random') index = Math.floor(random() * actions.length);
      else if(opponent && typeof opponent==='object')index=sample(distribution(opponent,obs,features).probabilities,random);
      else index = actions.indexOf(baseline(s, actions, random,opponent==='mixed'?styles.get(p.id):'balanced'));
      recordDecision(context,actions[index]);
      act(room, p.id, actions[index]);
    }
    const won = room.game.winner.players.includes(learner.id);
    results.wins += Number(won); results.averageDecisions += steps;
    const row = results.byRole[learner.job || learner.role] ||= { games: 0, wins: 0 };
    row.games++; row.wins += Number(won);
    const personality=results.byPersonality[contexts.get(learner.id).name]||={games:0,wins:0};personality.games++;personality.wins+=Number(won);
  }
  results.winRate = results.wins / games; results.averageDecisions /= games;
  results.roleFloor=Math.min(...Object.values(results.byRole).filter(row=>row.games>=3).map(row=>row.wins/row.games),1);
  results.averageCandidateEntropy=results.candidateEntropy/Math.max(1,results.policyDecisions);
  results.distinctActionTypes=Object.keys(results.actions).length;
  results.phaseDiversity=Object.fromEntries(Object.entries(results.phaseActions).map(([phase,actions])=>{const n=Object.values(actions).reduce((s,n)=>s+n,0),probs=Object.values(actions).map(x=>x/n);return [phase,{decisions:n,types:probs.length,entropy:-probs.reduce((s,p)=>s+p*Math.log(p),0),topShare:Math.max(...probs)}];}));
  return results;
}
