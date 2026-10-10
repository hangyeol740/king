import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, makeRoom, joinRoom, view, draw, CARDS, RECIPES, RuleError } from '../lib/game.js';

function setup(count = 3) {
  const room = makeRoom('ABC123', '플레이어1');
  for (let i = 1; i < count; i++) joinRoom(room, `플레이어${i + 1}`);
  act(room, room.host, { type: 'start' });
  return room;
}
const king = r => r.players.find(p => p.role === 'king');
const rebel = r => r.players.find(p => p.role === 'rebel');
const citizen = r => r.players.find(p => p.role === 'citizen');
const current = r => r.players.find(p => p.id === r.game.order[r.game.turn]);
const hand = (p, ...types) => { p.hand = types.map(card); return p.hand.map(c => c.id); };
function expedition(r, scoreCards = []) {
  const k = king(r);
  act(r, k.id, { type: 'expedition' });
  if (r.status === 'finished') return;
  r.players.filter(p => p !== k).forEach(p => act(r, p.id, { type: 'joinExpedition', join: false }));
  const ids = hand(k, ...scoreCards);
  act(r, k.id, { type: 'contribute', cards: ids });
}
function redistribute(r, accept = false) { r.players.forEach(p => act(r, p.id, { type: 'redistribute', accept })); }
function fullDay(r) {
  for (let i = 0; i < r.players.length; i++) act(r, current(r).id, { type: 'gather' });
  for (let i = 0; i < r.players.length; i++) {
    const p = current(r); act(r, p.id, { type: 'beginCraft' }); act(r, p.id, { type: 'craftDone' });
  }
  for (let i = 0; i < r.players.length; i++) act(r, current(r).id, { type: 'draw2' });
}

test('인원에 따른 기간, 왕 1명, 시작 손패 12장, 왕부터 고정 순서', () => {
  for (const [count, days] of [[3, 7], [4, 6], [5, 5], [8, 5]]) {
    const r = setup(count);
    assert.equal(r.game.maxDays, days);
    assert.equal(r.players.filter(p => p.role === 'king').length, 1);
    assert.equal(r.game.order[0], king(r).id);
    assert.ok(r.players.every(p => p.hand.length === 12));
  }
});
test('본인 손패만 제공하고 시민에게 타인 진영·손패·토큰을 숨김', () => {
  const r = setup(5), c = citizen(r), snapshot = view(r, c.id);
  assert.equal(snapshot.me.hand.length, 12);
  for (const p of snapshot.players) {
    assert.ok(!('hand' in p)); assert.ok(!('token' in p));
    if (p.id !== c.id && p.id !== king(r).id) assert.equal(p.role, null);
  }
  for (const p of r.players.filter(p => p !== c)) {
    assert.ok(!JSON.stringify(snapshot).includes(p.token));
    for (const card of p.hand) assert.ok(!JSON.stringify(snapshot).includes(card.id));
  }
});
test('추가 인원 진영을 방장이 설정하고 반란군은 서로를 앎', () => {
  const r = makeRoom('ABC123', '방장');
  for (let i = 0; i < 4; i++) joinRoom(r, `참가자${i}`);
  assert.throws(() => act(r, r.players[1].id, { type: 'config', roles: { king: 1, citizen: 1, rebel: 2, neutral: 1 } }), RuleError);
  act(r, r.host, { type: 'config', roles: { king: 1, citizen: 1, rebel: 2, neutral: 1 } });
  act(r, r.host, { type: 'start' });
  const rebels = r.players.filter(p => p.role === 'rebel');
  const v = view(r, rebels[0].id);
  assert.equal(v.players.find(p => p.id === rebels[1].id).role, 'rebel');
});
test('첫날 중재 불가, 3인 공개처형 불가, 왕 이외 아침 행동 불가', () => {
  const r = setup();
  assert.throws(() => act(r, king(r).id, { type: 'mediate' }), RuleError);
  assert.throws(() => act(r, king(r).id, { type: 'execute', target: citizen(r).id }), RuleError);
  assert.throws(() => act(r, citizen(r).id, { type: 'expedition' }), RuleError);
});
test('동점 중재 성공, 플레이어 지원 후 왕 제출, 카드는 바로 소모', () => {
  const r = setup(), k = king(r), c = citizen(r), b = rebel(r);
  r.game.day = 2; r.game.revolt = 9;
  const ci = hand(c, 'infantry'), ki = hand(k, 'officer');
  act(r, k.id, { type: 'mediate' });
  assert.throws(() => act(r, k.id, { type: 'contribute', cards: ki }), RuleError);
  act(r, c.id, { type: 'contribute', cards: ci });
  assert.equal(c.hand.length, 0); assert.equal(k.hand.length, 1);
  assert.equal(view(r, k.id).game.pending.total, undefined);
  act(r, b.id, { type: 'contribute', cards: [] });
  assert.equal(r.game.phase, 'mediationKing');
  act(r, k.id, { type: 'contribute', cards: ki });
  assert.equal(r.game.successes, 0); assert.equal(r.game.revolt, 0); assert.equal(k.hand.length, 0);
  assert.equal(r.game.phase, 'redistribute');
  assert.deepEqual(view(r, c.id).game.lastRevolt, { day: 2, blocked: true, strength: 9, revolt: 9 });
  assert.ok(view(r, c.id).game.logs.some(e => e.effect === 'blocked'));
});
test('중재 실패 시 카드 소모, 성공 횟수 증가, 점수 초기화, 제출 번복 불가', () => {
  const r = setup(), k = king(r), c = citizen(r), b = rebel(r);
  r.game.revolt = 8; r.game.day = 2;
  const ids = hand(c, 'infantry');
  act(r, k.id, { type: 'mediate' });
  act(r, c.id, { type: 'contribute', cards: ids });
  assert.throws(() => act(r, c.id, { type: 'contribute', cards: [] }), RuleError);
  assert.throws(() => act(r, k.id, { type: 'expedition' }), RuleError);
  act(r, b.id, { type: 'contribute', cards: [] });
  act(r, k.id, { type: 'contribute', cards: [] });
  assert.equal(r.game.successes, 1); assert.equal(r.game.revolt, 0); assert.equal(c.hand.length, 0);
  assert.equal(view(r, c.id).game.lastRevolt.blocked, false);
  assert.ok(view(r, c.id).game.logs.some(e => e.effect === 'breached'));
});
test('중재하지 않으면 반란 성공·초기화, 세 번째 성공에 즉시 종료', () => {
  const r = setup(); r.game.revolt = 15; r.game.successes = 2;
  act(r, king(r).id, { type: 'expedition' });
  assert.equal(r.game.successes, 3); assert.equal(r.game.revolt, 0); assert.equal(r.status, 'finished');
  assert.equal(r.game.winner.side, 'rebel'); assert.equal(r.game.phase, 'finished');
  assert.equal(view(r, king(r).id).game.lastRevolt.strength, null);
  assert.ok(r.game.logs.some(e => e.effect === 'breached'));
});
test('원정 25점 실패·26점 성공·50점 성공·51점 대성공, 전원 보상 즉시 보존', () => {
  for (const [types, reward] of [
    [[...Array(3).fill('weapon'), 'sword'], 0],
    [[...Array(3).fill('weapon'), 'eternalSword'], 15],
    [[...Array(6).fill('weapon'), 'eternalSword'], 15],
    [[...Array(6).fill('weapon'), 'officer'], 30]
  ]) {
    const r = setup(), c = citizen(r), before = c.hand.length;
    expedition(r, types);
    assert.equal(c.hand.length, before + reward);
    assert.equal(r.game.phase, 'redistribute');
    const k = king(r);
    assert.equal(k.hand.length, reward + (types.includes('eternalSword') ? 1 : 0));
    if (types.includes('eternalSword')) assert.ok(k.hand.some(c => c.type === 'eternalSword'));
  }
});
test('23장은 유지, 24장 이상이면 아침에 랜덤 22장으로 축소', () => {
  const r = setup(), c = citizen(r), b = rebel(r);
  hand(c, ...Array(24).fill('resource')); hand(b, ...Array(23).fill('resource'));
  const old = new Set(c.hand.map(c => c.id));
  r.game.phase = 'night'; r.game.pending = { done: [] };
  act(r, b.id, { type: 'revolt', cards: [] });
  assert.equal(c.hand.length, 22); assert.ok(c.hand.every(c => old.has(c.id))); assert.equal(b.hand.length, 23);
  expedition(r);
  const keep = b.hand.map(c => c.id);
  act(r, c.id, { type: 'redistribute', accept: true });
  act(r, b.id, { type: 'redistribute', accept: false });
  act(r, king(r).id, { type: 'redistribute', accept: true });
  assert.equal(c.hand.length, 12); assert.deepEqual(b.hand.map(c => c.id), keep); assert.equal(king(r).hand.length, 12);
});
test('제작 반복·연속 제작과 영구 카드의 별도 재료 처리', () => {
  const r = setup(); r.game.phase = 'day'; r.game.round = 2;
  const p = current(r); hand(p, ...Array(6).fill('resource'));
  act(r, p.id, { type: 'beginCraft' });
  act(r, p.id, { type: 'craft', recipe: 0, count: 3 });
  assert.equal(p.hand.filter(c => c.type === 'sword').length, 3);
  act(r, p.id, { type: 'craft', recipe: 1, count: 1 });
  assert.deepEqual(p.hand.map(c => c.type), ['magic']);
  hand(p, ...Array(6).fill('sword'));
  act(r, p.id, { type: 'craft', recipe: 5, count: 3 });
  assert.equal(p.hand.length, 3);
  assert.throws(() => act(r, p.id, { type: 'craft', recipe: 1, count: 1 }), RuleError);
  act(r, p.id, { type: 'craft', recipe: 6, count: 1 });
  assert.deepEqual(p.hand.map(c => c.type), ['eternalMagic']);
  act(r, p.id, { type: 'craftDone' }); assert.equal(r.game.turn, 1);
});
test('사냥 9점 실패·10점 성공, 보상 7장, 영구 카드 유지, 보병 사용 불가', () => {
  for (const [types, reward, retained] of [[['eternalMagic', 'magic'], 0, 1], [['eternalMagic', 'magic', 'sword'], 7, 1]]) {
    const r = setup(); r.game.phase = 'day'; r.game.round = 2;
    const p = current(r), ids = hand(p, ...types);
    act(r, p.id, { type: 'hunt', cards: ids });
    assert.equal(p.hand.length, reward + retained);
    assert.ok(p.hand.some(c => c.id === ids[0]));
  }
  const r = setup(); r.game.phase = 'day'; r.game.round = 2;
  const p = current(r), ids = hand(p, 'infantry');
  assert.throws(() => act(r, p.id, { type: 'hunt', cards: ids }), RuleError);
});
test('비밀 거래는 상대에게 카드·장수 비공개, 0장 교환 허용, 제3자에게 행동 숨김', () => {
  const r = setup(); r.game.phase = 'day';
  const a = current(r), b = r.players.find(p => p !== a), outsider = r.players.find(p => p !== a && p !== b);
  const ids = hand(a, ...Array(10).fill('resource')); hand(b);
  act(r, a.id, { type: 'trade', target: b.id });
  assert.equal(view(r, outsider.id).game.pending, null);
  act(r, b.id, { type: 'tradeAnswer', accept: true });
  act(r, a.id, { type: 'tradeSubmit', cards: ids });
  const bv = view(r, b.id);
  assert.equal(bv.game.pending.submissions, undefined);
  assert.equal(bv.game.pending.myDone, false);
  assert.ok(ids.every(id => !JSON.stringify(bv).includes(id)));
  act(r, b.id, { type: 'tradeSubmit', cards: [] });
  assert.equal(a.hand.length, 0); assert.equal(b.hand.length, 10); assert.equal(r.game.turn, 1);
});
test('거래 거절 시 신청자 차례 종료, 거절 후 다른 행동 불가', () => {
  const r = setup(); r.game.phase = 'day';
  const a = current(r), b = r.players.find(p => p !== a);
  act(r, a.id, { type: 'trade', target: b.id });
  act(r, b.id, { type: 'tradeAnswer', accept: false });
  assert.equal(r.game.turn, 1);
  assert.throws(() => act(r, a.id, { type: 'gather' }), RuleError);
});
test('카드 id 위조·중복 제출 차단, 손패·차례 변경 없음', () => {
  const r = setup(); r.game.phase = 'day'; r.game.round = 2;
  const p = current(r), ids = hand(p, 'weapon');
  assert.throws(() => act(r, p.id, { type: 'hunt', cards: ['fake'] }), RuleError);
  assert.throws(() => act(r, p.id, { type: 'hunt', cards: [ids[0], ids[0]] }), RuleError);
  assert.equal(p.hand.length, 1); assert.equal(r.game.turn, 0);
});
test('낮 전체 교체 장수 유지, 손패 수와 카드 검사 결과 본인에게만 공개', () => {
  const r = setup(); r.game.phase = 'day'; r.game.round = 3;
  const p = current(r), old = hand(p, 'resource', 'resource', 'resource');
  act(r, p.id, { type: 'replace' });
  assert.equal(p.hand.length, 3); assert.ok(p.hand.every(c => !old.includes(c.id)));
  const c = current(r); act(r, c.id, { type: 'counts' });
  assert.match(c.notes.at(-1).text, /손패 수 확인/);
  const b = current(r); hand(p, 'agitation');
  act(r, b.id, { type: 'inspect', target: p.id });
  assert.match(b.notes.at(-1).text, /선동/);
  assert.equal(r.game.phase, 'evening');
  assert.ok(!JSON.stringify(view(r, p.id).game.logs).includes('손패 수 확인'));
});
test('세금은 자신이 고른 카드, 부족하면 전부, 왕에게 이동', () => {
  const r = setup(); r.game.phase = 'evening';
  const k = king(r), c = citizen(r), b = rebel(r);
  hand(k); const ids = hand(c, 'resource'); hand(b);
  act(r, k.id, { type: 'tax' });
  assert.throws(() => act(r, c.id, { type: 'payTax', cards: [] }), RuleError);
  act(r, c.id, { type: 'payTax', cards: ids });
  act(r, b.id, { type: 'payTax', cards: [] });
  assert.equal(k.hand[0].id, ids[0]); assert.equal(c.hand.length, 0); assert.equal(r.game.phase, 'night');
});
test('지명수배는 반란 또는 선동 발견 시 전부 버림, 병기만 있으면 유지', () => {
  for (const [types, remain] of [[['rebellion', 'resource'], 0], [['agitation', 'resource'], 0], [['weapon'], 1]]) {
    const r = setup(); r.game.phase = 'evening'; const c = citizen(r); hand(c, ...types);
    act(r, king(r).id, { type: 'wanted', target: c.id });
    assert.equal(c.hand.length, remain);
  }
});
test('공개처형은 카드 버림만, 대상은 계속 참여', () => {
  const r = setup(4), c = citizen(r), k = king(r), old = k.hand.length;
  act(r, k.id, { type: 'execute', target: c.id });
  assert.equal(c.hand.length, 0); assert.equal(k.hand.length, old); assert.ok(r.game.order.includes(c.id));
});
test('아침 보급: 0장→5장, 6장→11장, 7장 유지, 왕 포함·재접속/재분배로 중복 지급 안 됨', () => {
  const r = setup(), k = king(r), c = citizen(r), b = rebel(r);
  hand(k); hand(c, ...Array(6).fill('resource')); hand(b, ...Array(7).fill('resource'));
  r.game.phase = 'night'; r.game.pending = { done: [] };
  act(r, b.id, { type: 'revolt', cards: [] });
  assert.equal(k.hand.length, 5); assert.equal(c.hand.length, 11); assert.equal(b.hand.length, 7);
  for (let i = 0; i < 3; i++) view(r, k.id);
  assert.equal(k.hand.length, 5);
  assert.match(c.notes.at(-1).text, /아침 보급/);
  assert.ok(!JSON.stringify(view(r, b.id)).includes('아침 보급'));
  act(r, k.id, { type: 'expedition' });
  for (const p of [c, b]) act(r, p.id, { type: 'joinExpedition', join: false });
  act(r, k.id, { type: 'contribute', cards: [] });
  redistribute(r, false);
  assert.equal(k.hand.length, 5); assert.equal(c.hand.length, 11); assert.equal(b.hand.length, 7);
});
test('시민지원은 왕 제외 모든 진영에 정확히 3장 지급하고 기존 카드 유지·개인 수령 기록 제공', () => {
  for (const lastDay of [false, true]) {
    const r = setup(4), k = king(r);
    r.game.phase = 'evening'; if (lastDay) r.game.day = r.game.maxDays;
    for (const p of r.players) hand(p, ...Array(24).fill('resource'));
    const before = new Map(r.players.map(p => [p.id, p.hand.map(c => c.id)]));
    act(r, k.id, { type: 'aid' });
    for (const p of r.players) {
      assert.equal(p.hand.length, p === k ? 24 : 27);
      assert.ok(before.get(p.id).every(id => p.hand.some(c => c.id === id)));
      if (p !== k) {
        const v = view(r, p.id);
        assert.match(v.me.notes.at(-1).text, /시민지원: 카드 \+3장 지급 완료/);
        assert.equal(v.me.notes.at(-1).effect, 'gain');
        assert.ok(!JSON.stringify(view(r, k.id)).includes(v.me.notes.at(-1).id));
      }
    }
    assert.equal(r.status, lastDay ? 'finished' : 'playing');
  }
});
test('사냥·제작의 개인 효과와 결과는 제3자에게 유출되지 않음', () => {
  const r = setup(); r.game.phase = 'day'; r.game.round = 2;
  const p = current(r), other = r.players.find(q => q !== p);
  const ids = hand(p, 'weapon', 'eternalSword');
  act(r, p.id, { type: 'hunt', cards: ids });
  const effect = p.notes.at(-1);
  assert.equal(effect.effect, 'success');
  assert.ok(!JSON.stringify(view(r, other.id)).includes(effect.id));
  assert.ok(!JSON.stringify(view(r, other.id)).includes('사냥 성공'));
});
test('밤의 점수와 제출자 숨김, 다음 아침 합계 공개, 마지막 날 밤 없이 왕·시민 승리', () => {
  const r = setup(); r.game.phase = 'evening';
  act(r, king(r).id, { type: 'aid' });
  const b = rebel(r), ids = hand(b, 'rebellion', 'agitation', 'weapon');
  assert.equal(view(r, citizen(r).id).game.revolt, null);
  assert.throws(() => act(r, citizen(r).id, { type: 'revolt', cards: [] }), RuleError);
  act(r, b.id, { type: 'revolt', cards: ids });
  assert.equal(r.game.day, 2); assert.equal(r.game.revolt, 31);
  assert.equal(view(r, citizen(r).id).game.revolt, 31);
  r.game.day = 7; r.game.phase = 'evening'; r.game.successes = 2;
  act(r, king(r).id, { type: 'aid' });
  assert.equal(r.status, 'finished'); assert.equal(r.game.winner.side, 'royal');
  assert.deepEqual(new Set(r.game.winner.players), new Set([king(r).id, citizen(r).id]));
});
test('완전한 7일 게임: 아침·낮 세 바퀴·저녁·밤, 마지막 밤 생략', () => {
  const r = setup(), order = [...r.game.order];
  for (let day = 1; day <= 7; day++) {
    assert.equal(r.game.day, day); assert.equal(r.game.phase, 'morning');
    expedition(r); redistribute(r, true); fullDay(r);
    assert.equal(r.game.phase, 'evening');
    act(r, king(r).id, { type: 'aid' });
    if (day < 7) { assert.equal(r.game.phase, 'night'); act(r, rebel(r).id, { type: 'revolt', cards: [] }); }
    assert.deepEqual(r.game.order, order);
  }
  assert.equal(r.status, 'finished'); assert.equal(r.game.winner.side, 'royal');
  act(r, r.host, { type: 'rematch' });
  assert.equal(r.status, 'lobby'); assert.equal(r.game, null); assert.ok(r.players.every(p => !p.role && !p.hand.length));
});
test('철혈의 검을 보유하면 즉시 해당 진영 승리, 랜덤에서는 제작 전용 카드가 안 나옴', () => {
  const r = setup(); r.game.phase = 'day'; const p = current(r); p.hand.push(card('ironSword'));
  act(r, p.id, { type: 'gather' });
  assert.equal(r.status, 'finished'); assert.equal(r.game.winner.side, 'royal');
  assert.ok(draw(5000).every(c => CARDS[c.type].chance > 0));
  assert.equal(Object.values(CARDS).reduce((s, c) => s + c.chance, 0), 100);
});
test('철혈의 검: 복합 재료 정확히 소모, 왕·시민·반란군·중립 제작 즉시 해당 진영 승리', () => {
  const recipe = RECIPES.findIndex(r => r.output === 'ironSword');
  for (const role of ['king', 'citizen', 'rebel', 'neutral']) {
    const r = setup(4), p = r.players.find(p => p.role === role);
    r.game.phase = 'day'; r.game.round = 2; r.game.turn = r.game.order.indexOf(p.id);
    hand(p, ...Array(11).fill('eternalSword'), ...Array(6).fill('eternalMagic'), ...Array(21).fill('resource'), 'officer');
    act(r, p.id, { type: 'beginCraft' });
    act(r, p.id, { type: 'craft', recipe, count: 1 });
    assert.deepEqual(p.hand.map(c => c.type).sort(), ['eternalSword', 'eternalMagic', 'resource', 'officer', 'ironSword'].sort());
    assert.equal(r.status, 'finished');
    const side = ['king', 'citizen'].includes(role) ? 'royal' : role;
    assert.equal(r.game.winner.side, side);
    const winners = r.players.filter(p => side === 'royal' ? ['king', 'citizen'].includes(p.role) : p.role === side).map(p => p.id);
    assert.deepEqual(r.game.winner.players, winners);
    assert.match(r.game.winner.reason, /철혈의 검/);
    assert.ok(r.game.logs.some(e => e.effect === 'victory'));
    assert.throws(() => act(r, p.id, { type: 'craftDone' }), RuleError);
  }
});
test('철혈의 검: 재료 각 종류가 1장 부족하거나 요청 수량이 과하면 아무 카드도 소모하지 않음', () => {
  const recipe = RECIPES.findIndex(r => r.output === 'ironSword');
  for (const [swords, magic, resources, count] of [[9, 5, 20, 1], [10, 4, 20, 1], [10, 5, 19, 1], [10, 5, 20, 2]]) {
    const r = setup(); r.game.phase = 'day'; r.game.round = 2;
    const p = current(r);
    hand(p, ...Array(swords).fill('eternalSword'), ...Array(magic).fill('eternalMagic'), ...Array(resources).fill('resource'));
    act(r, p.id, { type: 'beginCraft' });
    const before = structuredClone(p.hand);
    assert.throws(() => act(r, p.id, { type: 'craft', recipe, count }), RuleError);
    assert.deepEqual(p.hand, before);
    assert.equal(r.status, 'playing'); assert.equal(r.game.pending.kind, 'craft');
  }
});
