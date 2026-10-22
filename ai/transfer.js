import { createPolicy, validatePolicy, CARD_TYPES, PHASES, ACTION_TYPES } from '../lib/ai-policy.js';
import { RECIPES } from '../lib/game.js';

export function compatiblePolicy(savedPolicy) {
  if(savedPolicy?.version===10)return transferV10(savedPolicy);
  if (![2, 3, 4, 5, 6, 7, 8, 9].includes(savedPolicy?.version)) return validatePolicy(savedPolicy);
  const policy = transferPolicy(savedPolicy);
  policy.metadata = { ...savedPolicy.metadata, ...policy.metadata, episodes: savedPolicy.metadata.episodes, adaptedRules: true };
  return validatePolicy(policy);
}

// 의미가 같은 입력/출력끼리 연결하여 이전 규칙의 학습 가중치를 보존합니다.
export function transferPolicy(source, seed = 42) {
  if(source?.version===10)return transferV10(source,seed);
  if (![2, 3, 4, 5, 6, 7, 8, 9].includes(source?.version) || !(source.metadata?.episodes > 0)) throw new Error('v2~v9 학습 모델의 이전만 지원합니다.');
  const roles = ['king', 'citizen', 'rebel', 'neutral'];
  const bishopRules = source.version >= 4, voteRules = source.version >= 5;
  const supportRules=source.version>=6,merchantRules=source.version>=7;
  const oldPhases = PHASES.filter(p => p!=='ambush' && (merchantRules || !['market','merchantEvening'].includes(p)) && (voteRules || p !== 'executionVote') && (bishopRules || p !== 'bishopNight'));
  const oldCards = CARD_TYPES.filter(t => (source.version>=9||t!=='huntingAxe') && (merchantRules || !['reinforcedSword','shiningSword'].includes(t)) && (bishopRules || !['church', 'evangelism'].includes(t)));
  const oldActions = ACTION_TYPES.slice(0, merchantRules?41:supportRules?35:voteRules ? 32 : bishopRules ? 30 : 26);
  const oldRecipeCount = source.version>=9?RECIPES.length:source.version === 2 ? 17 : merchantRules?32:bishopRules ? 24 : 20;
  const obsKeys = (phases, cards, stats) => [...roles.map(r => `role:${r}`), ...phases.map(p => `phase:${p}`), ...cards.map(t => `card:${t}`), ...Array.from({ length: stats }, (_, i) => `stat:${i}`)];
  const actionKeys = (actions, recipeCount, cards, stats) => [...actions.map(a => `action:${a}`), ...Array.from({ length: recipeCount }, (_, i) => `recipe:${i}`), ...cards.map(t => `card:${t}`), ...Array.from({ length: stats }, (_, i) => `stat:${i}`)];
  const oldObs = obsKeys(oldPhases, oldCards, source.version>=8?39:merchantRules?34:supportRules?29:voteRules ? 26 : bishopRules ? 25 : 19), newObs = obsKeys(PHASES, CARD_TYPES, 42);
  // 성향 5개는 새 전투 상태 뒤로 이동하지만 기존 가중치를 보존합니다.
  if(source.version>=8)for(let i=34;i<39;i++)oldObs[roles.length+oldPhases.length+oldCards.length+i]=`stat:${i+3}`;
  const oldOut = actionKeys(oldActions, oldRecipeCount, oldCards, source.version>=9?25+oldCards.length:merchantRules?45:bishopRules ? 18 : 17), newOut = actionKeys(ACTION_TYPES, RECIPES.length, CARD_TYPES, 25+CARD_TYPES.length);
  if (source.observationSize !== oldObs.length || source.actionSize !== oldOut.length) throw new Error('이전 모델의 신경망 구조 오류');
  for (const [kind, output] of [['actor', oldOut.length], ['critic', 1]]) {
    const net = source[kind];
    if (!net || net.input !== oldObs.length || net.output !== output || !Number.isInteger(net.hidden) || net.hidden < 1 || net.hidden > 128) throw new Error('이전 모델의 신경망 구조 오류');
    for (const [key, size] of [['w1', net.input * net.hidden], ['b1', net.hidden], ['w2', net.hidden * net.output], ['b2', net.output]]) {
      if (!Array.isArray(net[key]) || net[key].length !== size || !net[key].every(Number.isFinite)) throw new Error('이전 모델의 가중치 오류');
    }
  }
   const policy = createPolicy(seed, source.actor.hidden);
   policy.actor.w2.fill(0);policy.actor.b2.fill(0);for(const type of ['requestDraw','requestSurrender','personalSurrender'])policy.actor.b2[ACTION_TYPES.indexOf(type)]=-5;
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
function transferV10(source,seed=42){
  const p=createPolicy(seed,source.actor.hidden);
  p.actor.w2.fill(0);p.actor.b2.fill(0);
  for(const type of ['requestDraw','requestSurrender','personalSurrender'])p.actor.b2[ACTION_TYPES.indexOf(type)]=-5;
 const oldActions=ACTION_TYPES.slice(0,-4),oldSize=oldActions.length+RECIPES.length+CARD_TYPES.length+25+CARD_TYPES.length;
 if(source.observationSize!==p.observationSize||source.actionSize!==oldSize||source.actor.input!==p.observationSize)throw Error('v10 모델 차원 오류');
 for(const kind of ['actor','critic']){
  for(const key of ['w1','b1'])p[kind][key]=[...source[kind][key]];
  if(kind==='critic'){p[kind].w2=[...source[kind].w2];p[kind].b2=[...source[kind].b2];}
  else{for(let oldOutput=0;oldOutput<source.actor.output;oldOutput++){const nextOutput=oldOutput<oldActions.length?oldOutput:oldOutput+4;p.actor.b2[nextOutput]=source.actor.b2[oldOutput];for(let h=0;h<p.actor.hidden;h++)p.actor.w2[nextOutput*p.actor.hidden+h]=source.actor.w2[oldOutput*source.actor.hidden+h];}}
 }
 p.metadata={...source.metadata,adaptedRules:true,transferredFrom:{version:10,episodes:source.metadata.episodes},evaluationValidForCurrentRules:false};return validatePolicy(p);
}
