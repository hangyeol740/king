import { randomInt, randomUUID } from 'node:crypto';

export const CARDS = {
  resource: { name: '자원', chance: 35, icon: '◆', category: 'resource' },
  rebellion: { name: '반란', chance: 18, revolt: 3, icon: '⚑', category: 'rebel' },
  agitation: { name: '선동', chance: 7, revolt: 8, icon: '♜', category: 'rebel' },
  weapon: { name: '병기', chance: 1, revolt: 20, mediation: 17, attack: 8, icon: '✹', category: 'weapon' },
  sword: { name: '칼', chance: 15, attack: 1, icon: '†', category: 'attack' },
  magic: { name: '마법', chance: 4, attack: 4, icon: '✦', category: 'magic' },
  infantry: { name: '보병', chance: 15, mediation: 2, expedition: 1, icon: '♟', category: 'royal' },
  officer: { name: '장교', chance: 5, mediation: 7, expedition: 3, icon: '♞', category: 'royal' },
  eternalSword: { name: '영구 칼', chance: 0, attack: 2, permanent: true, icon: '†', category: 'eternal' },
  eternalMagic: { name: '영구 마법', chance: 0, attack: 5, permanent: true, icon: '✦', category: 'eternal' },
  ironSword: { name: '철혈의 검', chance: 0, instantWin: true, icon: '♛', category: 'legendary' }
};
export const RECIPES = [
  { input: 'resource', count: 2, output: 'sword' },
  { input: 'sword', count: 3, output: 'magic' },
  { input: 'rebellion', count: 3, output: 'agitation' },
  { input: 'infantry', count: 2, output: 'officer' },
  { input: 'infantry', count: 2, output: 'rebellion' },
  { input: 'sword', count: 2, output: 'eternalSword' },
  { input: 'eternalSword', count: 3, output: 'eternalMagic' },
  { ingredients: [{ input: 'eternalSword', count: 10 }, { input: 'eternalMagic', count: 5 }, { input: 'resource', count: 20 }], output: 'ironSword' }
];
export const ROLES = { king: '왕', citizen: '시민', rebel: '반란군', neutral: '중립' };
export class RuleError extends Error {}
function must(value, message) { if (!value) throw new RuleError(message); }
const uid = () => randomUUID();
export const card = type => ({ id: uid(), type });
export function draw(count) {
  return Array.from({ length: count }, () => {
    let roll = randomInt(100);
    for (const [type, def] of Object.entries(CARDS)) {
      roll -= def.chance;
      if (roll < 0) return card(type);
    }
    throw new Error('Invalid card probabilities');
  });
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function defaultRoles(count) {
  return { king: 1, citizen: count === 3 ? 1 : Math.max(1, count - 3), rebel: 1, neutral: count === 3 ? 0 : 1 };
}
export function makeRoom(code, name) {
  const player = makePlayer(name);
  return { code, host: player.id, players: [player], status: 'lobby', config: defaultRoles(3), game: null, createdAt: Date.now(), updatedAt: Date.now() };
}
export function makePlayer(name) {
  return { id: uid(), token: uid(), name, role: null, hand: [], notes: [], online: false };
}
export function joinRoom(room, name) {
  must(room.status === 'lobby', '이미 시작한 게임에는 참가할 수 없습니다. 원래 브라우저에서 재접속하세요.');
  must(!room.players.some(p => p.name === name), '이미 사용 중인 닉네임입니다.');
  const p = makePlayer(name);
  room.players.push(p);
  room.config = defaultRoles(room.players.length);
  return p;
}
const player = (room, id) => room.players.find(p => p.id === id);
function log(room, text, effect = null) {
  room.game.logs.push({ id: uid(), day: room.game.day, text, effect });
  if (room.game.logs.length > 150) room.game.logs.shift();
}
function note(p, text, effect = 'notice') {
  p.notes.push({ id: uid(), text, effect });
  if (p.notes.length > 35) p.notes.shift();
}
function grant(p, count, reason) {
  p.hand.push(...draw(count));
  note(p, `${reason}: 카드 +${count}장 지급 완료 · 현재 손패 ${p.hand.length}장`, 'gain');
}
function morningCards(room) {
  for (const p of room.players) {
    if (p.hand.length > 23) {
      const removed = p.hand.length - 22;
      p.hand = shuffle(p.hand).slice(0, 22);
      note(p, `손패 초과: 무작위 ${removed}장이 사라져 22장이 되었습니다.`, 'loss');
    }
    if (p.hand.length <= 6) grant(p, 5, '아침 보급 (손패 6장 이하)');
  }
}
function selected(p, ids, allowed) {
  must(Array.isArray(ids) && ids.length <= p.hand.length && new Set(ids).size === ids.length, '카드 선택이 올바르지 않습니다.');
  const cards = ids.map(id => p.hand.find(c => c.id === id));
  must(cards.every(c => c && (!allowed || allowed(c.type))), '이 행동에 사용할 수 없는 카드가 있습니다.');
  return cards;
}
function consume(p, cards, preservePermanent = false) {
  const ids = new Set(cards.filter(c => !preservePermanent || !CARDS[c.type].permanent).map(c => c.id));
  p.hand = p.hand.filter(c => !ids.has(c.id));
}
function finish(room, side, reason) {
  room.status = 'finished';
  room.game.phase = 'finished';
  room.game.pending = null;
  room.game.winner = { side, reason, players: room.players.filter(p => side === 'royal' ? ['king', 'citizen'].includes(p.role) : p.role === side).map(p => p.id) };
  log(room, reason, 'victory');
}
function ironVictory(room) {
  const owner = room.players.find(p => p.hand.some(c => c.type === 'ironSword'));
  if (owner) finish(room, ['king', 'citizen'].includes(owner.role) ? 'royal' : owner.role, `${owner.name}님이 철혈의 검을 획득했습니다. 해당 진영이 즉시 승리합니다.`);
}
export function startGame(room, id) {
  must(room.host === id && room.status === 'lobby', '방장만 대기실에서 시작할 수 있습니다.');
  const n = room.players.length;
  must(n >= 3, '최소 3명이 필요합니다.');
  const cfg = room.config;
  must(Object.keys(ROLES).every(k => Number.isInteger(cfg[k]) && cfg[k] >= 0), '진영 인원이 올바르지 않습니다.');
  must(cfg.king === 1 && cfg.citizen >= 1 && cfg.rebel >= 1 && cfg.neutral >= (n >= 4 ? 1 : 0), '왕 1명, 시민·반란군 각 1명 이상, 4인 이상은 중립 1명 이상이 필요합니다.');
  must(Object.values(cfg).reduce((a, b) => a + b, 0) === n, '진영 인원 합계가 참가자 수와 같아야 합니다.');
  if (n === 3) must(cfg.citizen === 1 && cfg.rebel === 1 && cfg.neutral === 0, '3인은 왕·시민·반란군 각 1명입니다.');
  const roles = shuffle(Object.entries(cfg).flatMap(([role, count]) => Array(count).fill(role)));
  room.players.forEach((p, i) => { p.role = roles[i]; p.hand = draw(12); p.notes = []; note(p, `당신의 진영은 ${ROLES[p.role]}입니다. 시작 카드 12장을 받았습니다.`, 'gain'); });
  const king = room.players.find(p => p.role === 'king');
  const order = [king.id, ...shuffle(room.players.filter(p => p !== king).map(p => p.id))];
  room.status = 'playing';
  room.game = { day: 1, maxDays: n === 3 ? 7 : n === 4 ? 6 : 5, phase: 'morning', king: king.id, order, turn: 0, round: 1, revolt: 0, successes: 0, pending: null, logs: [], winner: null };
  log(room, `${king.name}님이 왕입니다. 왕국의 첫 아침이 밝았습니다.`);
}
function resolveRevolt(room, strength) {
  const g = room.game;
  if (g.revolt > 0) {
    const blocked = strength !== null && strength >= g.revolt;
    g.lastRevolt = { day: g.day, blocked, strength, revolt: g.revolt };
    if (blocked) log(room, `반란을 막았습니다! 중재력 ${strength} / 반란력 ${g.revolt}`, 'blocked');
    else { g.successes++; log(room, `반란을 막지 못했습니다! ${strength === null ? '왕이 중재하지 않았습니다.' : `중재력 ${strength} / 반란력 ${g.revolt}`} 반란 성공 누적 ${g.successes}/3일`, 'breached'); }
    g.revolt = 0;
    if (g.successes >= 3) finish(room, 'rebel', '반란이 3일 성공했습니다. 반란군의 승리입니다.');
  }
}
function redistribution(room) {
  const g = room.game;
  g.phase = 'redistribute';
  g.pending = { done: [] };
  log(room, '아침 재분배를 선택합니다. 수락·거절 여부는 비공개입니다.');
}
function daytime(room) {
  const g = room.game;
  g.phase = 'day'; g.round = 1; g.turn = 0; g.pending = null;
  log(room, '낮이 시작되었습니다. 왕부터 세 바퀴를 진행합니다.');
}
function nextTurn(room) {
  const g = room.game;
  g.pending = null;
  g.turn++;
  if (g.turn >= g.order.length) { g.turn = 0; g.round++; }
  if (g.round > 3) { g.phase = 'evening'; log(room, '저녁입니다. 왕이 정책을 선택합니다.'); }
}
function night(room) {
  const g = room.game;
  g.pending = null;
  if (g.day === g.maxDays) { finish(room, 'royal', '마지막 날까지 반란 성공을 2일 이하로 막았습니다. 왕과 시민의 승리입니다.'); return; }
  g.phase = 'night'; g.pending = { done: [] }; g.revolt = 0;
  log(room, '밤이 되었습니다. 반란군이 비밀리에 행동합니다.');
}
function nextMorning(room) {
  const g = room.game;
  g.day++; g.phase = 'morning'; g.pending = null;
  morningCards(room);
  log(room, `${g.day}일 차 아침. ${g.revolt ? `반란력 ${g.revolt}점이 공개되었습니다.` : '발생한 반란이 없습니다.'}`, 'dawn');
}
const allDone = (room, done) => room.players.every(p => done.includes(p.id));
function finishExpedition(room) {
  const g = room.game;
  const score = g.pending.total;
  const reward = score > 50 ? 30 : score > 25 ? 15 : 0;
  if (reward) room.players.forEach(p => grant(p, reward, '원정 보상'));
  log(room, `원정 ${score > 50 ? '대성공' : reward ? '성공' : '실패'}! 총 공격력 ${score}점.${reward ? ` 전원 카드 ${reward}장 지급.` : ''}`, reward ? 'success' : 'failure');
  redistribution(room);
}
export function act(room, id, action) {
  const p = player(room, id);
  must(p, '참가자를 찾을 수 없습니다.');
  must(action && typeof action.type === 'string', '행동이 올바르지 않습니다.');
  const type = action.type;
  if (type === 'config') {
    must(room.status === 'lobby' && room.host === id, '방장만 대기실에서 설정할 수 있습니다.');
    const c = action.roles;
    must(c && Object.keys(c).length === 4 && Object.keys(ROLES).every(k => Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= room.players.length), '진영 설정이 올바르지 않습니다.');
    room.config = { ...c }; return;
  }
  if (type === 'start') { startGame(room, id); return; }
  if (type === 'rematch') {
    must(room.status === 'finished' && room.host === id, '게임 종료 후 방장만 대기실로 돌아갈 수 있습니다.');
    room.status = 'lobby'; room.game = null;
    room.players.forEach(p => { p.hand = []; p.role = null; p.notes = []; }); return;
  }
  must(room.status === 'playing', '진행 중인 게임이 아닙니다.');
  const g = room.game;
  if (g.phase === 'morning') {
    must(id === g.king, '왕의 행동을 기다려주세요.');
    must(['mediate', 'execute', 'expedition'].includes(type), '아침 행동을 선택하세요.');
    if (type === 'mediate') {
      must(g.revolt > 0, '발생한 반란이 없습니다.');
      g.phase = 'mediationSupport'; g.pending = { done: [], supporters: [], total: 0 };
      log(room, '왕이 반란 중재를 선포했습니다. 지원은 취소할 수 없습니다.', 'royal');
    } else {
      if (type === 'execute') must(room.players.length >= 4 && player(room, action.target) && action.target !== id, '4인 이상에서 다른 플레이어를 지목하세요.');
      resolveRevolt(room, null);
      if (room.status === 'finished') return;
      if (type === 'execute') {
        const target = player(room, action.target); target.hand = [];
        log(room, `왕이 ${target.name}님의 손패를 전부 버렸습니다. 플레이는 계속됩니다.`, 'loss');
        redistribution(room);
      } else {
        g.phase = 'expeditionJoin'; g.pending = { done: [g.king], participants: [g.king], total: 0 };
        log(room, '왕이 원정을 선포했습니다. 참가 여부를 선택하세요.', 'royal');
      }
    }
  } else if (g.phase === 'mediationSupport' || g.phase === 'mediationKing') {
    const support = g.phase === 'mediationSupport';
    must(type === 'contribute' && (support ? id !== g.king : id === g.king), '지금은 중재 카드를 제출할 차례가 아닙니다.');
    must(!g.pending.done.includes(id), '이미 제출했습니다.');
    const cards = selected(p, action.cards, t => !!CARDS[t].mediation);
    g.pending.total += cards.reduce((sum, c) => sum + CARDS[c.type].mediation, 0);
    consume(p, cards); g.pending.done.push(id);
    note(p, `중재 카드 ${cards.length}장 제출 확정. 되돌릴 수 없습니다.`, 'submit');
    if (cards.length) { g.pending.supporters.push(id); log(room, `${p.name}님이 중재에 지원했습니다.`); }
    if (support && room.players.filter(p => p.id !== g.king).every(p => g.pending.done.includes(p.id))) g.phase = 'mediationKing';
    else if (!support) {
      resolveRevolt(room, g.pending.total);
      if (room.status !== 'finished') redistribution(room);
    }
  } else if (g.phase === 'expeditionJoin') {
    must(type === 'joinExpedition' && typeof action.join === 'boolean' && !g.pending.done.includes(id), '참가 여부를 이미 결정했거나 올바르지 않습니다.');
    g.pending.done.push(id);
    if (action.join) g.pending.participants.push(id);
    if (allDone(room, g.pending.done)) {
      g.phase = 'expeditionCards'; g.pending.done = [];
      log(room, `원정 참가자: ${g.pending.participants.map(id => player(room, id).name).join(', ')}`);
    }
  } else if (g.phase === 'expeditionCards') {
    must(type === 'contribute' && g.pending.participants.includes(id) && !g.pending.done.includes(id), '원정 참가자만 한 번 제출할 수 있습니다.');
    const cards = selected(p, action.cards, t => !!(CARDS[t].attack || CARDS[t].expedition));
    g.pending.total += cards.reduce((sum, c) => sum + (CARDS[c.type].attack || CARDS[c.type].expedition), 0);
    consume(p, cards, true); g.pending.done.push(id);
    note(p, `원정 카드 ${cards.length}장 제출 확정. 영구 카드는 유지됩니다.`, 'submit');
    if (g.pending.participants.every(id => g.pending.done.includes(id))) finishExpedition(room);
  } else if (g.phase === 'redistribute') {
    must(type === 'redistribute' && typeof action.accept === 'boolean' && !g.pending.done.includes(id), '이미 재분배를 결정했거나 올바르지 않습니다.');
    if (action.accept) { p.hand = draw(12); note(p, '아침 재분배를 수락하여 새 카드 12장을 받았습니다.'); }
    else {
      note(p, '아침 재분배를 거절하여 기존 손패를 유지합니다.');
      if (p.hand.length < 8) grant(p, 8 - p.hand.length, '재분배 거절 보충 (최소 8장)');
    }
    g.pending.done.push(id);
    if (allDone(room, g.pending.done)) daytime(room);
  } else if (g.phase === 'day') {
    if (g.pending?.kind === 'trade') handleTrade(room, p, action);
    else {
      must(g.order[g.turn] === id, '자신의 차례를 기다려주세요.');
      if (g.pending?.kind === 'craft') {
        must(type === 'craft' || type === 'craftDone', '제작 중입니다. 제작을 완료하세요.');
        if (type === 'craftDone') { nextTurn(room); }
        else {
          const recipe = RECIPES[action.recipe];
          const count = action.count;
          must(recipe && Number.isInteger(count) && count >= 1 && count <= 1000, '제작 수량이 올바르지 않습니다.');
          // 모든 재료를 먼저 검증하여 부족할 때 일부만 소모되지 않도록 합니다.
          const ingredients = (recipe.ingredients || [recipe]).flatMap(material => {
            const cards = p.hand.filter(c => c.type === material.input).slice(0, material.count * count);
            must(cards.length === material.count * count, `${CARDS[material.input].name} 제작 재료가 부족합니다.`);
            return cards;
          });
          consume(p, ingredients);
          p.hand.push(...Array.from({ length: count }, () => card(recipe.output)));
          note(p, `${CARDS[recipe.output].name} ${count}장 제작 완료.`, 'craft');
        }
      } else if (g.round === 1) {
        must(['trade', 'gather', 'draw3'].includes(type), '거래·채집·카드받기 중 선택하세요.');
        if (type === 'trade') {
          const target = player(room, action.target);
          must(target && target.id !== id, '거래 상대를 선택하세요.');
          g.pending = { kind: 'trade', from: id, to: target.id, accepted: false, submissions: {} };
          note(target, `${p.name}님이 거래를 신청했습니다.`);
        } else {
           if (type === 'gather') { p.hand.push(...Array.from({ length: 6 }, () => card('resource'))); note(p, '채집으로 자원 6장을 받았습니다.', 'gain'); }
           else grant(p, 4, '카드받기');
          nextTurn(room);
        }
      } else if (g.round === 2) {
        must(type === 'beginCraft' || type === 'hunt', '제작 또는 사냥을 선택하세요.');
        if (type === 'beginCraft') g.pending = { kind: 'craft' };
        else {
          const cards = selected(p, action.cards, t => !!CARDS[t].attack);
          const score = cards.reduce((sum, c) => sum + CARDS[c.type].attack, 0);
          consume(p, cards, true);
          if (score >= 10) p.hand.push(...draw(7));
          note(p, `사냥 ${score >= 10 ? '성공! 카드 +7장을 받았습니다.' : '실패 — 공격력 10점이 필요합니다.'} 공격력 ${score}점.`, score >= 10 ? 'success' : 'failure');
          nextTurn(room);
        }
      } else {
        must(['replace', 'draw2', 'counts', 'inspect'].includes(type), '세 번째 바퀴의 행동을 선택하세요.');
        if (type === 'replace') { p.hand = draw(p.hand.length); note(p, '손패를 같은 장수의 새 카드로 교체했습니다.'); }
        if (type === 'draw2') grant(p, 2, '카드받기');
        if (type === 'counts') note(p, `손패 수 확인 (지금 순간): ${g.order.map(id => { const t = player(room, id); return `${t.name} ${t.hand.length}장`; }).join(' / ')}`);
        if (type === 'inspect') {
          const target = player(room, action.target);
          must(target && target.id !== id, '확인할 다른 플레이어를 선택하세요.');
          const c = target.hand.length ? target.hand[randomInt(target.hand.length)] : null;
          note(p, `${target.name}님의 무작위 카드 1장: ${c ? CARDS[c.type].name : '손패 없음'}`);
        }
        nextTurn(room);
      }
    }
  } else if (g.phase === 'evening') {
    must(id === g.king, '왕이 정책을 선택할 차례입니다.');
    must(['tax', 'wanted', 'aid'].includes(type), '저녁 정책을 선택하세요.');
    if (type === 'tax') {
      g.phase = 'tax'; g.pending = { done: [g.king] };
      log(room, '왕이 세금을 신설했습니다. 각자 카드 2장을 선택하여 납부하세요.', 'royal');
    } else if (type === 'wanted') {
      const target = player(room, action.target);
      must(target && target.id !== id, '검사할 다른 플레이어를 선택하세요.');
      const rebellion = target.hand.some(c => c.type === 'rebellion');
      const agitation = target.hand.some(c => c.type === 'agitation');
      note(p, `지명수배 검사: ${target.name} / 반란 ${rebellion ? '있음' : '없음'} / 선동 ${agitation ? '있음' : '없음'}`);
      if (rebellion || agitation) target.hand = [];
      log(room, `지명수배: ${target.name}님 ${rebellion || agitation ? '혐의 발견 — 손패를 전부 버렸습니다.' : '혐의 없음.'}`, rebellion || agitation ? 'loss' : 'royal');
      night(room);
    } else {
      room.players.filter(p => p.id !== g.king).forEach(p => grant(p, 3, '시민지원'));
      log(room, '시민지원: 왕을 제외한 전원에게 카드 3장을 지급했습니다.', 'royal');
      night(room);
    }
  } else if (g.phase === 'tax') {
    must(type === 'payTax' && !g.pending.done.includes(id), '이미 납부했거나 납부 대상이 아닙니다.');
    const cards = selected(p, action.cards);
    must(cards.length === Math.min(2, p.hand.length), '손패에서 2장(부족하면 전부)을 선택하세요.');
    consume(p, cards); player(room, g.king).hand.push(...cards); g.pending.done.push(id);
    note(p, `세금 ${cards.length}장을 납부했습니다.`, 'submit');
    note(player(room, g.king), `${p.name}님의 세금 ${cards.length}장을 받았습니다.`, 'gain');
    if (allDone(room, g.pending.done)) night(room);
  } else if (g.phase === 'night') {
    must(type === 'revolt' && p.role === 'rebel' && !g.pending.done.includes(id), '반란군만 밤에 한 번 제출할 수 있습니다.');
    const cards = selected(p, action.cards, t => !!CARDS[t].revolt);
    g.revolt += cards.reduce((sum, c) => sum + CARDS[c.type].revolt, 0);
    consume(p, cards); g.pending.done.push(id); note(p, '밤 카드 제출을 완료했습니다.', 'submit');
    if (room.players.filter(p => p.role === 'rebel').every(p => g.pending.done.includes(p.id))) nextMorning(room);
  } else throw new RuleError('현재 단계에서 사용할 수 없는 행동입니다.');
  if (room.status === 'playing') ironVictory(room);
  room.updatedAt = Date.now();
}
function handleTrade(room, p, action) {
  const t = room.game.pending;
  must(p.id === t.from || p.id === t.to, '거래 당사자가 아닙니다.');
  if (!t.accepted) {
    must(action.type === 'tradeAnswer' && p.id === t.to && typeof action.accept === 'boolean', '상대방의 거래 응답을 기다려주세요.');
    if (!action.accept) {
      note(player(room, t.from), '상대방이 거래를 거절했습니다. 차례가 끝납니다.'); nextTurn(room);
    } else t.accepted = true;
  } else {
    must(action.type === 'tradeSubmit' && !Object.hasOwn(t.submissions, p.id), '이미 거래 카드를 확정했습니다.');
    const cards = selected(p, action.cards);
    // 제출 카드는 교환 확정 시까지 서버에만 보관합니다.
    t.submissions[p.id] = cards.map(c => c.id);
    if ([t.from, t.to].every(id => Object.hasOwn(t.submissions, id))) {
      const a = player(room, t.from), b = player(room, t.to);
      const ac = selected(a, t.submissions[a.id]), bc = selected(b, t.submissions[b.id]);
      consume(a, ac); consume(b, bc); a.hand.push(...bc); b.hand.push(...ac);
      note(a, `거래 완료: ${ac.length}장을 주고 ${bc.length}장을 받았습니다.`, 'trade');
      note(b, `거래 완료: ${bc.length}장을 주고 ${ac.length}장을 받았습니다.`, 'trade');
      nextTurn(room);
    }
  }
}
export function view(room, id) {
  const me = player(room, id);
  must(me, '참가자를 찾을 수 없습니다.');
  const g = room.game;
  const reveal = room.status === 'finished';
  const players = (g ? g.order.map(id => player(room, id)) : room.players).map(p => ({
    id: p.id, name: p.name, online: p.online, host: p.id === room.host,
    role: reveal || p.id === id || p.role === 'king' || (me.role === 'rebel' && p.role === 'rebel') ? p.role : null
  }));
  let pending = null;
  if (g?.pending) {
    const raw = g.pending;
    const done = raw.done || [];
    pending = {
      kind: raw.kind || null,
      myDone: done.includes(id),
      supporters: raw.supporters || [],
      participants: raw.participants || []
    };
    // 낮 행동 및 상대방 제출 여부를 제3자에게 유출하지 않습니다.
    if (g.phase === 'day') {
      pending = g.order[g.turn] === id ? { kind: raw.kind } : null;
      if (raw.kind === 'trade' && [raw.from, raw.to].includes(id)) {
        pending = { kind: 'trade', from: raw.from, to: raw.to, accepted: raw.accepted, myDone: Object.hasOwn(raw.submissions, id) };
      }
    }
  }
  return {
    code: room.code, status: room.status, host: room.host, config: room.config, players,
    me: { id: me.id, name: me.name, role: me.role, hand: me.hand, notes: me.notes },
    game: g ? { day: g.day, maxDays: g.maxDays, phase: g.phase, king: g.king, round: g.round, current: g.phase === 'day' ? g.order[g.turn] : null,
      revolt: ['morning', 'mediationSupport', 'mediationKing'].includes(g.phase) ? g.revolt : null,
      lastRevolt: g.lastRevolt || null, successes: g.successes, pending, logs: g.logs, winner: g.winner } : null
  };
}
