import { act, makeRoom, joinRoom, view, CARDS, RECIPES, expeditionPower } from '../lib/game.js';
import { candidates, actionFeatures, observe, distribution, sample, forward } from '../lib/ai-policy.js';

export function readyPlayers(room) {
  if (room.status !== 'playing') return [];
  return room.players.filter(p => candidates(view(room, p.id)).length > 0);
}
export function newGame(count = 3) {
  const room = makeRoom('TRAIN', '학습 1');
  for (let i = 1; i < count; i++) joinRoom(room, `학습 ${i + 1}`);
  if (count >= 4) act(room, room.host, { type: 'neutralJobs', jobs: ['bishop'] });
  act(room, room.host, { type: 'start' });
  return room;
}
// 학습 및 평가의 상대. 이 전략은 배포용 학습 모델과 구분합니다.
export function baseline(snapshot, actions, random = Math.random) {
  const { me, game: g } = snapshot;
  const royal = ['king', 'citizen'].includes(me.role);
  const score = (action, key) => me.hand.filter(c => action.cards?.includes(c.id)).reduce((s, c) => s + (CARDS[c.type][key] || 0), 0);
  if (g.phase === 'morning') return actions.find(a => a.type === 'mediate') || actions.find(a => a.type === 'expedition');
  if (g.phase.startsWith('mediation')) {
    const sorted = [...actions].sort((a, b) => score(b, 'mediation') - score(a, 'mediation'));
    return royal ? sorted[0] : sorted.at(-1);
  }
  if (g.phase === 'night') return [...actions].sort((a, b) => score(b, 'revolt') - score(a, 'revolt'))[0];
  if (g.phase === 'bishopNight') return actions.find(a => a.type === 'religiousRevolt' && me.churchInfluence >= 10) || actions.find(a => a.type === 'reform') || actions.find(a => a.type === 'evangelize') || actions[0];
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
export function rollout(policy, { count = 3, random = Math.random, opponents = [], collect = true, maxSteps = 1800 } = {}) {
  const room = newGame(count), trajectories = new Map(room.players.map(p => [p.id, []]));
  const choices = new Map(room.players.map(p => [p.id, opponents.length && random() < .25 ? opponents[Math.floor(random() * opponents.length)] : policy]));
  let steps = 0;
  while (room.status === 'playing') {
    if (++steps > maxSteps) throw new Error(`학습 게임 단계 제한 초과: ${room.game.phase}`);
    const ready = readyPlayers(room);
    if (!ready.length) throw new Error(`행동 가능한 참가자 없음: ${room.game.phase}`);
    const p = ready[0], snapshot = view(room, p.id), actions = candidates(snapshot), controller = choices.get(p.id);
    let index;
    if (!controller) index = actions.indexOf(baseline(snapshot, actions, random));
    else {
      const obs = observe(snapshot), features = actions.map(a => actionFeatures(snapshot, a));
      const { probabilities } = distribution(controller, obs, features);
      index = sample(probabilities, random);
      if (collect && controller === policy) trajectories.get(p.id).push({ obs, features, chosen: index, oldLogProbability: Math.log(Math.max(1e-12, probabilities[index])), value: forward(policy.critic, obs).output[0], reward: 0 });
    }
    act(room, p.id, actions[index]);
  }
  for (const p of room.players) {
    const records = trajectories.get(p.id);
    if (records.length) records.at(-1).reward = room.game.winner.players.includes(p.id) ? 1 : -1;
  }
  return { room, trajectories, steps };
}
export function evaluate(policy, { games = 60, counts = [3, 4, 5], random = Math.random, opponent = 'baseline' } = {}) {
  const results = { games, opponent, wins: 0, byRole: {}, averageDecisions: 0 };
  for (let game = 0; game < games; game++) {
    const room = newGame(counts[game % counts.length]), learner = room.players[Math.floor(random() * room.players.length)];
    let steps = 0;
    while (room.status === 'playing') {
      if (++steps > 1800) throw new Error('평가 게임 단계 제한 초과');
      const p = readyPlayers(room)[0], s = view(room, p.id), actions = candidates(s);
      let index;
      if (p.id === learner.id) {
        const probabilities = distribution(policy, observe(s), actions.map(a => actionFeatures(s, a))).probabilities;
        index = sample(probabilities, random);
      } else if (opponent === 'random') index = Math.floor(random() * actions.length);
      else index = actions.indexOf(baseline(s, actions, random));
      act(room, p.id, actions[index]);
    }
    const won = room.game.winner.players.includes(learner.id);
    results.wins += Number(won); results.averageDecisions += steps;
    const row = results.byRole[learner.job || learner.role] ||= { games: 0, wins: 0 };
    row.games++; row.wins += Number(won);
  }
  results.winRate = results.wins / games; results.averageDecisions /= games;
  return results;
}
