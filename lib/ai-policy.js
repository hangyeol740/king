import { CARDS, RECIPES, canCraft, expeditionPower, isReligionCard, isProtectedCard } from './game.js';

export const POLICY_VERSION = 4;
export const RULESET = 'v4-bishop-religious-rebellion-steal2';
export const CARD_TYPES = Object.keys(CARDS);
export const PHASES = ['morning', 'mediationSupport', 'mediationKing', 'expeditionVote', 'expeditionSelect', 'expeditionJoin', 'expeditionCards', 'redistribute', 'day', 'evening', 'tax', 'night', 'bishopNight'];
export const ACTION_TYPES = ['mediate', 'execute', 'expedition', 'voteExpedition', 'selectExpedition', 'contribute', 'joinExpedition', 'redistribute', 'trade', 'gather', 'draw3', 'beginCraft', 'hunt', 'craft', 'craftDone', 'replace', 'refresh', 'revealHand', 'steal', 'tax', 'wanted', 'aid', 'payTax', 'revolt', 'tradeAnswer', 'tradeSubmit', 'evangelize', 'religiousRevolt', 'reform', 'bishopDone'];
const ROLES = ['king', 'citizen', 'rebel', 'neutral'];
export const OBS_SIZE = ROLES.length + PHASES.length + CARD_TYPES.length + 25;
export const ACTION_SIZE = ACTION_TYPES.length + RECIPES.length + CARD_TYPES.length + 18;
const clamp = (n, scale = 1) => Math.max(-2, Math.min(2, n / scale));
const counts = hand => CARD_TYPES.map(t => hand.filter(c => c.type === t).length);
const total = (hand, key) => hand.reduce((s, c) => s + (CARDS[c.type][key] || 0), 0);
const recipeMaximum = (recipe, hand) => Math.min(...(recipe.ingredients || [recipe]).map(m => Math.floor(hand.filter(c => c.type === m.input).length / m.count)));

// 브라우저와 동일한 개인용 상태만 입력받으며 원본 방 상태는 받지 않습니다.
export function observe(snapshot) {
  const { game: g, me, players } = snapshot;
  const hand = me.hand;
  const knownRebels = players.filter(p => p.role === 'rebel').length;
  const logs = g.logs;
  const supports = g.pending?.helperCount ?? g.lastRevolt?.helperCount ?? 0;
  const failedExpeditions = logs.filter(l => l.text.includes('원정 실패')).length;
  const ownInspections = me.notes.filter(n => n.details?.kind === 'hand').length;
  const ownTrades = me.notes.filter(n => n.text.startsWith('거래 완료:')).length;
  return [
    ...ROLES.map(r => Number(me.role === r)),
    ...PHASES.map(p => Number(g.phase === p)),
    ...counts(hand).map(n => clamp(n, 12)),
    clamp(g.day, 7), clamp(g.maxDays - g.day, 7), clamp(g.successes, 3), clamp(g.revolt || 0, 50),
    clamp(players.length, 8), clamp(g.round, 3), clamp(hand.length, 30), clamp(knownRebels, 3),
    clamp(total(hand, 'attack'), 50), clamp(total(hand, 'mediation'), 50), clamp(total(hand, 'revolt'), 50),
    clamp(supports, 10), clamp(failedExpeditions, 5), clamp(ownInspections, 5), clamp(ownTrades, 5),
    g.lastRevolt ? (g.lastRevolt.blocked ? 1 : -1) : 0,
    clamp(g.revoltGoal, 3), Number(g.pending?.difficulty === 'high'), clamp(g.lastRevolt?.bombs || 0, 3),
    Number(me.job === 'bishop'), clamp(me.churchInfluence || 0, 50), clamp(g.religiousRevolt || 0, 50),
    clamp(g.religiousSuccesses || 0, 3), Number(g.pending?.revoltType === 'religion'), Number(!!g.religiousScheduled)
  ];
}
export function actionFeatures(snapshot, action) {
  const cards = snapshot.me.hand.filter(c => action.cards?.includes(c.id));
  const target = snapshot.players.find(p => p.id === action.target);
  // 기억은 직접 본 검사와 공개 지원만 참고합니다.
  const knownHand = target ? snapshot.me.notes.filter(n => n.details?.target === target.id).at(-1)?.details?.cardTypes || [] : [];
  const inspected = target ? snapshot.me.notes.filter(n => n.text.includes(target.name) && n.text.includes('지명수배 검사:')).at(-1)?.text || '' : '';
  const suspected = knownHand.includes('rebellion') || /반란 있음/.test(inspected);
  const targets = (action.targets || []).map(id => snapshot.players.find(p => p.id === id));
  return [
    ...ACTION_TYPES.map(t => Number(t === action.type)),
    ...RECIPES.map((_, i) => Number(action.type === 'craft' && action.recipe === i)),
    ...counts(cards).map(n => clamp(n, 12)),
    clamp(cards.length, 25), clamp(cards.reduce((s,c)=>s+(expeditionPower(c.type,snapshot.me.role)||0),0), 50),
    clamp(total(cards, 'mediation'), 50), clamp(total(cards, 'revolt'), 50),
    clamp(cards.filter(c => CARDS[c.type].permanent).length, 8), clamp(action.count || 0, 10),
    action.accept === undefined ? 0 : action.accept ? 1 : -1,
    action.join === undefined ? 0 : action.join ? 1 : -1,
    Number(target?.role === 'rebel'), Number(target?.role === 'king'),
    Number(suspected), Number(!!target && snapshot.game.logs.some(l => l.text === `${target.name}님이 중재에 지원했습니다.`)),
    Number(action.difficulty === 'high'), clamp(targets.length,3), clamp(targets.filter(p=>p?.role==='rebel').length,3),
    clamp(targets.filter(p=>['king','citizen'].includes(p?.role)).length,3), clamp(knownHand.length,30), Number(action.revoltType === 'religion')
  ];
}
function subsets(hand, allowed, stat, targets = []) {
  const cards = hand.filter(c => allowed(c.type));
  const bundles = [[], cards, cards.filter((_, i) => i % 2 === 0)];
  for (const type of CARD_TYPES) {
    const group = cards.filter(c => c.type === type);
    if (group.length) { bundles.push(group, group.slice(0, Math.ceil(group.length / 2))); }
  }
  if (stat) {
    for (const target of targets) {
      // 제출 후보 생성만 담당합니다. 최종 선택은 학습된 확률 정책이 결정합니다.
      const sorted = [...cards].sort((a, b) => Number(!!CARDS[b.type].permanent) - Number(!!CARDS[a.type].permanent) || stat(b.type) - stat(a.type));
      const result = []; let score = 0;
      for (const c of sorted) { if (score >= target) break; result.push(c); score += stat(c.type); }
      if (score >= target) bundles.push(result);
    }
  }
  const unique = new Map();
  for (const bundle of bundles) { const ids = bundle.map(c => c.id).sort(); unique.set(ids.join(','), ids); }
  return [...unique.values()];
}
export function candidates(s) {
  if (s.status !== 'playing') return [];
  const { game: g, me, players } = s, p = g.pending, king = g.king === me.id;
  const others = players.filter(p => p.id !== me.id);
  const cardActions = (type, allowed, stat, targets) => subsets(me.hand, allowed, stat, targets).map(cards => ({ type, cards }));
  switch (g.phase) {
    case 'morning': return king ? [
      ...(g.revolt > 0 ? [{ type: 'mediate', revoltType: 'rebel' }] : []),
      ...(g.religiousRevolt !== null ? [{ type: 'mediate', revoltType: 'religion' }] : []), { type: 'expedition' },
      ...(players.length >= 4 ? others.map(p => ({ type: 'execute', target: p.id })) : [])
    ] : [];
    case 'mediationSupport':
    case 'mediationKing':
      if ((me.role==='rebel' && p.revoltType !== 'religion') || p.myDone || (g.phase === 'mediationSupport' ? king : !king)) return [];
      return cardActions('contribute', t => !!CARDS[t].mediation && (p.revoltType !== 'religion' || !isReligionCard(t)), t => CARDS[t].mediation, [Math.ceil((p.revoltType === 'religion' ? g.religiousRevolt : g.revolt) / 2), p.revoltType === 'religion' ? g.religiousRevolt : g.revolt]);
    case 'expeditionVote': return p.myDone ? [] : [{type:'voteExpedition',difficulty:'low'},{type:'voteExpedition',difficulty:'high'}];
    case 'expeditionSelect': {
      if(!king)return [];
      const result=[];
      function choose(start,chosen){if(result.length>=128)return;if(chosen.length===p.required){result.push({type:'selectExpedition',targets:chosen});return;}for(let i=start;i<others.length;i++)choose(i+1,[...chosen,others[i].id]);}
      choose(0,[]);return result;
    }
    case 'expeditionJoin': return p.myDone ? [] : [{ type: 'joinExpedition', join: true }, { type: 'joinExpedition', join: false }];
    case 'expeditionCards':
      if (p.myDone || !p.isParticipant) return [];
      return cardActions('contribute', t => expeditionPower(t,me.role)!==null, t => expeditionPower(t,me.role), p.difficulty==='high'?[30,50]:[10,20]);
    case 'redistribute': return p.myDone ? [] : [{ type: 'redistribute', accept: true }, { type: 'redistribute', accept: false }];
    case 'day': {
      if (p?.kind === 'trade') {
        if (!p.accepted) return p.to === me.id ? [{ type: 'tradeAnswer', accept: true }, { type: 'tradeAnswer', accept: false }] : [];
        return p.myDone ? [] : cardActions('tradeSubmit', () => true);
      }
      if (g.current !== me.id) return [];
      if (p?.kind === 'craft') {
        return [{ type: 'craftDone' }, ...RECIPES.flatMap((r, recipe) => {
          if(!canCraft(r,me.role,me.job))return [];
          const max = Math.min(1000, recipeMaximum(r, me.hand));
          return max > 0 ? [...new Set([1, max])].map(count => ({ type: 'craft', recipe, count })) : [];
        })];
      }
      if (g.round === 1) return [{ type: 'gather' }, { type: 'draw3' }, ...others.map(p => ({ type: 'trade', target: p.id }))];
      if (g.round === 2) return [{ type: 'beginCraft' }, ...cardActions('hunt', t => !!CARDS[t].attack, t => CARDS[t].attack, [10])];
      const bundles=new Map();
       for(const cards of subsets(me.hand,t=>!isProtectedCard(me,t))){const ids=cards.slice(0,5);bundles.set(ids.join(','),ids);}
      return [{ type: 'replace' }, ...[...bundles.values()].map(cards=>({type:'refresh',cards})), ...others.flatMap(p=>[{type:'revealHand',target:p.id},{type:'steal',target:p.id}])];
    }
    case 'evening': return king ? [{ type: 'tax' }, { type: 'aid' }, ...others.map(p => ({ type: 'wanted', target: p.id }))] : [];
    case 'tax': {
      if (p.myDone) return [];
      if (me.hand.length <= 3) return [{ type: 'payTax', cards: me.hand.map(c => c.id) }];
      const groups = CARD_TYPES.map(t => me.hand.filter(c => c.type === t)).filter(g => g.length);
      const result = [];
      for (let i = 0; i < groups.length; i++) for (let j = i; j < groups.length; j++) for(let k=j;k<groups.length;k++) {
        if(result.length>=128)continue;
        const used={}, cards=[];
        for(const group of [i,j,k]){const index=used[group]||0;if(!groups[group][index])break;cards.push(groups[group][index].id);used[group]=index+1;}
        if(cards.length===3)result.push({type:'payTax',cards});
      }
      return result;
    }
    case 'night': return me.role === 'rebel' && !p.myDone ? cardActions('revolt', t => !!CARDS[t].revolt, t => CARDS[t].revolt) : [];
    case 'bishopNight': {
      if (me.job !== 'bishop') return [];
      const churches = me.hand.filter(c => c.type === 'church').length;
      const evangelisms = me.hand.filter(c => c.type === 'evangelism').length;
      return [{ type: 'bishopDone' }, ...(churches >= 5 ? others.map(p => ({ type: 'evangelize', target: p.id })) : []),
        ...(churches >= 12 && !g.religiousScheduled ? [{ type: 'religiousRevolt' }] : []), ...(evangelisms >= 5 ? [{ type: 'reform' }] : [])];
    }
    default: return [];
  }
}
export function seededRandom(seed = 42) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function network(input, hidden, output, random) {
  const weights = n => Array.from({ length: n }, () => (random() * 2 - 1) * Math.sqrt(2 / input));
  return { input, hidden, output, w1: weights(input * hidden), b1: Array(hidden).fill(0), w2: weights(hidden * output), b2: Array(output).fill(0) };
}
export function createPolicy(seed = 42, hidden = 32) {
  const random = seededRandom(seed);
  return { version: POLICY_VERSION, ruleset: RULESET, observationSize: OBS_SIZE, actionSize: ACTION_SIZE,
    actor: network(OBS_SIZE, hidden, ACTION_SIZE, random), critic: network(OBS_SIZE, hidden, 1, random),
    metadata: { algorithm: 'PPO-self-play', episodes: 0, decisions: 0, seed } };
}
export function forward(net, input) {
  const hidden = new Float64Array(net.hidden), output = new Float64Array(net.output);
  for (let h = 0; h < net.hidden; h++) {
    let sum = net.b1[h]; const offset = h * net.input;
    for (let i = 0; i < net.input; i++) sum += net.w1[offset + i] * input[i];
    hidden[h] = Math.tanh(sum);
  }
  for (let o = 0; o < net.output; o++) {
    let sum = net.b2[o]; const offset = o * net.hidden;
    for (let h = 0; h < net.hidden; h++) sum += net.w2[offset + h] * hidden[h];
    output[o] = sum;
  }
  return { hidden, output };
}
export function distribution(policy, observation, features, temperature = 1) {
  const pass = forward(policy.actor, observation);
  const logits = features.map(f => f.reduce((s, x, i) => s + x * pass.output[i], 0) / temperature);
  const max = Math.max(...logits), weights = logits.map(l => Math.exp(l - max)), sum = weights.reduce((s, w) => s + w, 0);
  return { pass, probabilities: weights.map(w => w / sum) };
}
export function sample(probabilities, random = Math.random) {
  let roll = random();
  for (let i = 0; i < probabilities.length - 1; i++) { roll -= probabilities[i]; if (roll <= 0) return i; }
  return probabilities.length - 1;
}
export function decide(policy, snapshot, random = Math.random) {
  const actions = candidates(snapshot);
  if (!actions.length) return null;
  const obs = observe(snapshot), features = actions.map(a => actionFeatures(snapshot, a));
  const { probabilities } = distribution(policy, obs, features);
  return actions[sample(probabilities, random)];
}
export function validatePolicy(policy) {
  if (policy?.version !== POLICY_VERSION || policy.ruleset !== RULESET || policy.observationSize !== OBS_SIZE || policy.actionSize !== ACTION_SIZE) throw new Error('AI 모델 형식 또는 게임 규칙 버전이 맞지 않습니다. 다시 학습하세요.');
  for (const [key, output] of [['actor', ACTION_SIZE], ['critic', 1]]) {
    const net = policy[key];
    if (!net || net.input !== OBS_SIZE || net.output !== output || !Number.isInteger(net.hidden) || net.hidden < 1 || net.hidden > 128) throw new Error('AI 신경망 크기가 올바르지 않습니다.');
    for (const [name, size] of [['w1', net.input * net.hidden], ['b1', net.hidden], ['w2', net.hidden * net.output], ['b2', net.output]]) {
      if (!Array.isArray(net[name]) || net[name].length !== size || !net[name].every(Number.isFinite)) throw new Error(`AI 모델 가중치 오류: ${key}.${name}`);
    }
  }
  if (!(policy.metadata?.episodes > 0)) throw new Error('학습이 완료된 모델이 아닙니다.');
  return policy;
}
