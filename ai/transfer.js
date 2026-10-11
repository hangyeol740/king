import { createPolicy, validatePolicy, CARD_TYPES, PHASES, ACTION_TYPES } from '../lib/ai-policy.js';
import { RECIPES } from '../lib/game.js';

export function compatiblePolicy(savedPolicy) {
  if (![2, 3, 4].includes(savedPolicy?.version)) return validatePolicy(savedPolicy);
  const policy = transferPolicy(savedPolicy);
  policy.metadata = { ...savedPolicy.metadata, ...policy.metadata, episodes: savedPolicy.metadata.episodes, adaptedRules: true };
  return validatePolicy(policy);
}

// 의미가 같은 입력/출력끼리 연결하여 이전 규칙의 학습 가중치를 보존합니다.
export function transferPolicy(source, seed = 42) {
  if (![2, 3, 4].includes(source?.version) || !(source.metadata?.episodes > 0)) throw new Error('v2/v3/v4 학습 모델의 이전만 지원합니다.');
  const roles = ['king', 'citizen', 'rebel', 'neutral'];
  const bishopRules = source.version === 4;
  const oldPhases = PHASES.filter(p => p !== 'executionVote' && (bishopRules || p !== 'bishopNight'));
  const oldCards = CARD_TYPES.filter(t => bishopRules || !['church', 'evangelism'].includes(t));
  const oldActions = ACTION_TYPES.slice(0, bishopRules ? 30 : 26);
  const oldRecipeCount = source.version === 2 ? 17 : bishopRules ? 24 : 20;
  const obsKeys = (phases, cards, stats) => [...roles.map(r => `role:${r}`), ...phases.map(p => `phase:${p}`), ...cards.map(t => `card:${t}`), ...Array.from({ length: stats }, (_, i) => `stat:${i}`)];
  const actionKeys = (actions, recipeCount, cards, stats) => [...actions.map(a => `action:${a}`), ...Array.from({ length: recipeCount }, (_, i) => `recipe:${i}`), ...cards.map(t => `card:${t}`), ...Array.from({ length: stats }, (_, i) => `stat:${i}`)];
  const oldObs = obsKeys(oldPhases, oldCards, bishopRules ? 25 : 19), newObs = obsKeys(PHASES, CARD_TYPES, 26);
  const oldOut = actionKeys(oldActions, oldRecipeCount, oldCards, bishopRules ? 18 : 17), newOut = actionKeys(ACTION_TYPES, RECIPES.length, CARD_TYPES, 18);
  if (source.observationSize !== oldObs.length || source.actionSize !== oldOut.length) throw new Error('이전 모델의 신경망 구조 오류');
  for (const [kind, output] of [['actor', oldOut.length], ['critic', 1]]) {
    const net = source[kind];
    if (!net || net.input !== oldObs.length || net.output !== output || !Number.isInteger(net.hidden) || net.hidden < 1 || net.hidden > 128) throw new Error('이전 모델의 신경망 구조 오류');
    for (const [key, size] of [['w1', net.input * net.hidden], ['b1', net.hidden], ['w2', net.hidden * net.output], ['b2', net.output]]) {
      if (!Array.isArray(net[key]) || net[key].length !== size || !net[key].every(Number.isFinite)) throw new Error('이전 모델의 가중치 오류');
    }
  }
  const policy = createPolicy(seed, source.actor.hidden);
  for (const kind of ['actor', 'critic']) {
    const old = source[kind], next = policy[kind];
    next.hidden = old.hidden;
    next.w1 = Array(next.input * next.hidden).fill(0);
    next.b1 = [...old.b1];
    for (let h = 0; h < old.hidden; h++) for (let i = 0; i < oldObs.length; i++) next.w1[h * next.input + newObs.indexOf(oldObs[i])] = old.w1[h * old.input + i];
    if (kind === 'critic') { next.w2 = [...old.w2]; next.b2 = [...old.b2]; }
    else for (let o = 0; o < oldOut.length; o++) {
      const index = newOut.indexOf(oldOut[o]);
      next.b2[index] = old.b2[o];
      for (let h = 0; h < old.hidden; h++) next.w2[index * old.hidden + h] = old.w2[o * old.hidden + h];
    }
  }
  policy.metadata.transferredFrom = { version: source.version, ruleset: source.ruleset, episodes: source.metadata.episodes };
  return policy;
}
