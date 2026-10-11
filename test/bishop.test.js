import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, makeRoom, joinRoom, view, draw, CARDS, RECIPES, RuleError } from '../lib/game.js';
import { candidates, observe } from '../lib/ai-policy.js';

function lobby(count = 4) {
  const room = makeRoom('BISHOP', '플레이어1');
  for (let i = 1; i < count; i++) joinRoom(room, `플레이어${i + 1}`);
  return room;
}
function setup(count = 4) {
  const room = lobby(count);
  act(room, room.host, { type: 'neutralJobs', jobs: ['bishop'] });
  act(room, room.host, { type: 'start' });
  return room;
}
const king = r => r.players.find(p => p.role === 'king');
const bishop = r => r.players.find(p => p.job === 'bishop');
const role = (r, name) => r.players.find(p => p.role === name);
const hand = (p, ...types) => { p.hand = types.map(card); return p.hand.map(c => c.id); };
const types = p => p.hand.map(c => c.type);
function day(r, p, round = 3) {
  r.game.phase = 'day'; r.game.round = round; r.game.turn = r.game.order.indexOf(p.id); r.game.pending = null;
}
function trade(r, a, b, giveA, giveB = []) {
  day(r, a, 1);
  act(r, a.id, { type: 'trade', target: b.id });
  act(r, b.id, { type: 'tradeAnswer', accept: true });
  act(r, a.id, { type: 'tradeSubmit', cards: giveA });
  act(r, b.id, { type: 'tradeSubmit', cards: giveB });
}
function night(r) {
  r.game.phase = 'evening';
  act(r, king(r).id, { type: 'wanted', target: bishop(r).id });
  for (const p of r.players.filter(p => p.role === 'rebel')) act(r, p.id, { type: 'revolt', cards: [] });
  assert.equal(r.game.phase, 'bishopNight');
}
function mediate(r, revoltType, cards = new Map()) {
  const k = king(r);
  act(r, k.id, { type: 'mediate', revoltType });
  for (const p of r.players.filter(p => p !== k && (revoltType === 'religion' || p.role !== 'rebel'))) act(r, p.id, { type: 'contribute', cards: cards.get(p.id) || [] });
  act(r, k.id, { type: 'contribute', cards: cards.get(k.id) || [] });
}

test('중립 직업 선택 권한·중복 검증, 3인 제외, 여러 중립 중 주교 단 1명과 비공개 배정', () => {
  const three = lobby(3);
  assert.throws(() => act(three, three.host, { type: 'neutralJobs', jobs: ['bishop'] }), RuleError);
  const r = lobby(6);
  assert.throws(() => act(r, r.players[1].id, { type: 'neutralJobs', jobs: ['bishop'] }), RuleError);
  for (const jobs of [['bishop', 'bishop'], ['unknown']]) assert.throws(() => act(r, r.host, { type: 'neutralJobs', jobs }), RuleError);
  act(r, r.host, { type: 'config', roles: { king: 1, citizen: 1, rebel: 1, neutral: 3 } });
  act(r, r.host, { type: 'neutralJobs', jobs: ['bishop'] });
  act(r, r.host, { type: 'start' });
  assert.equal(r.players.filter(p => p.job === 'bishop').length, 1);
  assert.equal(r.players.filter(p => p.role === 'neutral' && !p.job).length, 2);
  const b = bishop(r); b.churchInfluence = 37;
  assert.equal(view(r, b.id).me.churchInfluence, 37);
  for (const p of r.players.filter(p => p !== b)) {
    const s = view(r, p.id);
    assert.equal(s.players.find(p => p.id === b.id).job, null);
    assert.equal(s.me.churchInfluence, undefined);
    const before = observe(s); b.churchInfluence = 999;
    assert.deepEqual(observe(view(r, p.id)), before); b.churchInfluence = 37;
  }
});

test('주교 전용 1:1 제작 4종과 랜덤 획득 확률 0%, 위조 제작은 재료 유지', () => {
  const r = setup(), b = bishop(r), c = role(r, 'citizen');
  assert.equal(CARDS.church.chance, 0); assert.equal(CARDS.evangelism.chance, 0);
  assert.ok(draw(200).every(c => !['church', 'evangelism'].includes(c.type)));
  const recipes = view(r, b.id).me.recipes.filter(r => r.job === 'bishop');
  assert.equal(recipes.length, 4);
  day(r, b, 2); hand(b, 'infantry', 'rebellion', 'officer', 'agitation');
  act(r, b.id, { type: 'beginCraft' });
  for (const recipe of recipes) act(r, b.id, { type: 'craft', recipe: recipe.id, count: 1 });
  assert.deepEqual(types(b), ['church', 'church', 'evangelism', 'evangelism']);
  day(r, c, 2); hand(c, 'infantry'); act(r, c.id, { type: 'beginCraft' });
  assert.throws(() => act(r, c.id, { type: 'craft', recipe: recipes[0].id, count: 1 }), RuleError);
  assert.deepEqual(types(c), ['infantry']);
});

test('주교와 거래한 전도 2장은 일반 카드 1장 변환 + 교단 1장 추가 지급', () => {
  const r = setup(), b = bishop(r), c = role(r, 'citizen');
  const given = hand(b, 'evangelism', 'evangelism'); hand(c, 'eternalMagic');
  trade(r, b, c, given);
  assert.deepEqual(types(c).sort(), ['church', 'church', 'evangelism', 'evangelism'].sort());
  assert.equal(b.hand.length, 0);
});

test('다른 사람끼리의 양방향 거래에도 전도 전파, 주교에게 반환하면 변환 없음', () => {
  const r = setup(), a = king(r), c = role(r, 'citizen'), b = bishop(r);
  const ac = hand(a, 'evangelism', 'resource'), cc = hand(c, 'evangelism', 'sword');
  trade(r, a, c, [ac[0]], [cc[0]]);
  assert.deepEqual(types(a).sort(), ['church', 'evangelism']);
  assert.deepEqual(types(c).sort(), ['church', 'evangelism']);
  const cards = hand(c, 'evangelism'); hand(b, 'resource');
  trade(r, c, b, cards);
  assert.deepEqual(types(b), ['resource', 'evangelism']);
});

test('랜덤 2장 뺏기 전도 전파·부족분 지급, 주교가 뺏으면 변환 없음', () => {
  const r = setup(), c = role(r, 'citizen'), a = king(r), b = bishop(r);
  hand(a, 'evangelism', 'evangelism'); hand(c); day(r, c);
  act(r, c.id, { type: 'steal', target: a.id });
  assert.equal(a.hand.length, 0); assert.equal(c.hand.length, 4);
  assert.deepEqual(types(c).sort(), ['church', 'church', 'evangelism', 'evangelism'].sort());
  hand(a, 'evangelism', 'evangelism'); hand(b, 'resource'); day(r, b);
  act(r, b.id, { type: 'steal', target: a.id });
  assert.deepEqual(types(b), ['resource', 'evangelism', 'evangelism']);
});

test('교단·전도는 교체·재분배·폭탄·상급 원정 실패에 보호, 주교 자신의 카드는 버림', () => {
  for (const action of ['replace', 'redistribute', 'bomb', 'expedition']) {
    const r = setup(), c = role(r, 'citizen'), b = bishop(r), k = king(r);
    const original = hand(c, 'church', 'evangelism', 'resource'); hand(b, 'church', 'evangelism', 'resource');
    if (action === 'replace') {
      day(r, c); act(r, c.id, { type: 'replace' }); assert.equal(c.hand.length, 3);
      day(r, b); act(r, b.id, { type: 'replace' }); assert.ok(!types(b).some(t => ['church','evangelism'].includes(t)));
    } else if (action === 'redistribute') {
      r.game.phase = 'redistribute'; r.game.pending = { done: [] };
      act(r, c.id, { type: 'redistribute', accept: true }); assert.equal(c.hand.length, 14);
      act(r, b.id, { type: 'redistribute', accept: true }); assert.equal(b.hand.length, 12);
    } else if (action === 'bomb') {
      r.game.revolt = 5; r.game.bombs = 1;
      act(r, k.id, { type: 'expedition' }); assert.equal(c.hand.length, 2);
    } else {
      act(r, k.id, { type: 'expedition' });
      for (const p of r.players) act(r, p.id, { type: 'voteExpedition', difficulty: 'high' });
      act(r, k.id, { type: 'selectExpedition', targets: [c.id, b.id] });
      for (const p of [k, c, b]) act(r, p.id, { type: 'contribute', cards: [] });
      assert.equal(c.hand.length, 2); assert.equal(b.hand.length, 0);
    }
    assert.ok(original.slice(0, 2).every(id => c.hand.some(card => card.id === id)));
  }
});

test('일부 교체는 타인의 종교카드 선택 차단, 거래와 세금 이전은 가능', () => {
  const r = setup(), c = role(r, 'citizen'), b = bishop(r), k = king(r);
  const ids = hand(c, 'church', 'evangelism'); day(r, c);
  assert.throws(() => act(r, c.id, { type: 'refresh', cards: [ids[0]] }), RuleError);
  assert.ok(candidates(view(r, c.id)).filter(a => a.type === 'refresh').every(a => a.cards.length === 0));
  const own = hand(b, 'church'); day(r, b);
  act(r, b.id, { type: 'refresh', cards: own }); assert.equal(b.hand.length, 5);
  r.game.phase = 'evening'; act(r, k.id, { type: 'tax' });
  const before = k.hand.length; act(r, c.id, { type: 'payTax', cards: ids });
  assert.equal(k.hand.length, before + 2); assert.equal(c.hand.length, 0);
});

test('매일 아침 전도 수만큼 교단 지급 후 제한: 일반 먼저 버림, 종교만 남으면 22장까지 버림', () => {
  const r = setup(), c = role(r, 'citizen'), b = bishop(r);
  hand(c, ...Array(22).fill('church'), 'evangelism', 'resource'); hand(b, 'evangelism');
  r.game.phase = 'bishopNight'; act(r, b.id, { type: 'bishopDone' });
  assert.equal(c.hand.length, 22); assert.ok(c.hand.every(c => ['church','evangelism'].includes(c.type)));
  assert.equal(b.hand.filter(c => c.type === 'church').length, 0);
  hand(c, 'evangelism', 'evangelism', ...Array(6).fill('resource'));
  r.game.phase = 'bishopNight'; act(r, b.id, { type: 'bishopDone' });
  assert.equal(c.hand.filter(c => c.type === 'church').length, 2);
  const before = structuredClone(c.hand); view(r, c.id); view(r, c.id); assert.deepEqual(c.hand, before);
});

test('일반 중재 교단3·전도7 소모와 주교 비공개 영향력 획득, 반란군 참여 불가', () => {
  const r = setup(), c = role(r, 'citizen'), b = bishop(r), rebel = role(r, 'rebel');
  const cards = hand(c, 'church', 'evangelism'); const own = hand(b, 'church');
  r.game.revolt = 13; act(r, king(r).id, { type: 'mediate' });
  assert.throws(() => act(r, rebel.id, { type: 'contribute', cards: [] }), RuleError);
  act(r, c.id, { type: 'contribute', cards }); act(r, b.id, { type: 'contribute', cards: own });
  assert.equal(b.churchInfluence, 13); assert.equal(c.hand.length, 0);
  assert.equal(view(r, c.id).me.churchInfluence, undefined);
  assert.ok(!JSON.stringify(view(r, c.id)).includes('교단영향력 +'));
  act(r, king(r).id, { type: 'contribute', cards: [] });
  assert.equal(r.game.lastRevolt.blocked, true); assert.equal(b.churchInfluence, 13);
});

test('주교는 반란군 행동 이후에만 행동, 종교전도 반복·비용 소모·도난 알림·빈 손패 처리', () => {
  const r = setup(), b = bishop(r), c = role(r, 'citizen');
  hand(b, ...Array(10).fill('church')); hand(c, 'eternalMagic');
  r.game.phase = 'evening'; act(r, king(r).id, { type: 'wanted', target: b.id });
  assert.throws(() => act(r, b.id, { type: 'evangelize', target: c.id }), RuleError);
  act(r, role(r, 'rebel').id, { type: 'revolt', cards: [] });
  act(r, b.id, { type: 'evangelize', target: c.id });
  assert.deepEqual(types(c), ['evangelism']); assert.equal(b.hand.filter(c => c.type === 'church').length, 5);
  assert.ok(b.hand.some(c => c.type === 'eternalMagic'));
  assert.equal(c.notes.findLast(n => n.effect === 'stolen').details.count, 1);
  hand(c); act(r, b.id, { type: 'evangelize', target: c.id });
  assert.deepEqual(types(c), ['evangelism']);
  const before = structuredClone(b.hand);
  assert.throws(() => act(r, b.id, { type: 'evangelize', target: c.id }), RuleError);
  assert.deepEqual(b.hand, before);
  act(r, b.id, { type: 'bishopDone' }); assert.equal(r.game.day, 2);
});

test('종교개혁은 전도5 소모·타인의 모든 종교카드 정리·교단만 2배 영향력, 본인 유지', () => {
  const r = setup(), b = bishop(r), c = role(r, 'citizen'), k = king(r);
  hand(b, ...Array(6).fill('evangelism'), 'church'); hand(c, 'church', 'church', 'evangelism', 'resource'); hand(k, 'church', 'evangelism');
  night(r); b.churchInfluence = 7;
  act(r, b.id, { type: 'reform' });
  assert.deepEqual(types(b), ['evangelism', 'church']); assert.deepEqual(types(c), ['resource']); assert.equal(k.hand.length, 0);
  assert.equal(b.churchInfluence, 13);
  assert.ok(!JSON.stringify(view(r, c.id)).includes('현재 13점'));
});

test('종교반란은 밤마다 한번, 다음 밤 재선언·3일 성공 시 주교 단독 승리', () => {
  const r = setup(6), b = bishop(r);
  for (let i = 0; i < 3; i++) {
    hand(b, ...Array(24).fill('church'));
    night(r); b.churchInfluence = 20;
    act(r, b.id, { type: 'religiousRevolt' });
    const before = structuredClone(b.hand);
    assert.throws(() => act(r, b.id, { type: 'religiousRevolt' }), RuleError); assert.deepEqual(b.hand, before);
    assert.equal(view(r, king(r).id).game.religiousRevolt, null);
    act(r, b.id, { type: 'bishopDone' });
    assert.equal(r.game.religiousRevolt, 20);
    mediate(r, 'religion');
    assert.equal(r.game.religiousSuccesses, i + 1); assert.equal(b.churchInfluence, 0);
    assert.equal(r.status, i === 2 ? 'finished' : 'playing');
  }
  assert.equal(r.game.winner.side, 'bishop'); assert.deepEqual(r.game.winner.players, [b.id]);
});

test('종교중재에는 반란군 참여, 교단·전도 금지, 동점 방어·타인 종교카드 정리·본인 유지', () => {
  const r = setup(), b = bishop(r), rebel = role(r, 'rebel'), c = role(r, 'citizen'), k = king(r);
  hand(b, 'church', 'evangelism'); hand(c, 'church', 'evangelism');
  const cards = hand(rebel, 'officer', 'evangelism'); hand(k, 'church');
  r.game.religiousActive = true; r.game.religiousRevolt = 7; b.churchInfluence = 7;
  act(r, k.id, { type: 'mediate', revoltType: 'religion' });
  assert.throws(() => act(r, c.id, { type: 'contribute', cards: c.hand.map(c => c.id) }), RuleError);
  assert.ok(candidates(view(r, rebel.id)).some(a => a.cards.includes(cards[0])));
  assert.ok(candidates(view(r, rebel.id)).every(a => !a.cards.includes(cards[1])));
  act(r, rebel.id, { type: 'contribute', cards: [cards[0]] });
  for (const p of [c, b]) act(r, p.id, { type: 'contribute', cards: [] });
  act(r, k.id, { type: 'contribute', cards: [] });
  assert.equal(r.game.lastReligiousRevolt.blocked, true); assert.equal(r.game.religiousSuccesses, 0);
  assert.deepEqual(types(b), ['church', 'evangelism']); assert.equal(c.hand.length, 0); assert.equal(rebel.hand.length, 0); assert.equal(k.hand.length, 0);
  assert.equal(b.churchInfluence, 0);
});

test('두 반란 동시 판정은 중재하지 않은 쪽 자동 성공·동시 목표 달성 시 그쪽 우선 승리', () => {
  for (const chosen of ['rebel', 'religion']) {
    const r = setup(6), b = bishop(r), k = king(r);
    r.game.revolt = 10; r.game.religiousActive = true; r.game.religiousRevolt = 10;
    r.game.successes = 2; r.game.religiousSuccesses = 2; b.churchInfluence = 10;
    assert.throws(() => act(r, k.id, { type: 'mediate' }), RuleError);
    mediate(r, chosen);
    assert.equal(r.game.successes, 3); assert.equal(r.game.religiousSuccesses, 3);
    assert.equal(r.game.winner.side, chosen === 'rebel' ? 'bishop' : 'rebel');
    assert.equal(b.churchInfluence, 0);
  }
});

test('종교반란 0점도 발생·0장 중재로 방어, 일반 반란을 막으면 종교반란 자동 성공', () => {
  const r = setup(), b = bishop(r);
  r.game.religiousActive = true; r.game.religiousRevolt = 0;
  mediate(r, 'religion'); assert.equal(r.game.lastReligiousRevolt.blocked, true);
  r.game.phase = 'morning'; r.game.pending = null;
  r.game.revolt = 7; r.game.religiousActive = true; r.game.religiousRevolt = 20; b.churchInfluence = 20;
  const cards = hand(king(r), 'officer');
  mediate(r, 'rebel', new Map([[king(r).id, cards]]));
  assert.equal(r.game.lastRevolt.blocked, true); assert.equal(r.game.lastReligiousRevolt.strength, null);
  assert.equal(r.game.religiousSuccesses, 1); assert.equal(b.churchInfluence, 0);
});

test('주교의 철혈의 검 승리는 다른 중립을 포함하지 않음', () => {
  const r = lobby(5);
  act(r, r.host, { type: 'config', roles: { king: 1, citizen: 1, rebel: 1, neutral: 2 } });
  act(r, r.host, { type: 'neutralJobs', jobs: ['bishop'] }); act(r, r.host, { type: 'start' });
  const b = bishop(r); day(r, b, 1); hand(b, 'ironSword');
  act(r, b.id, { type: 'gather' });
  assert.equal(r.game.winner.side, 'bishop'); assert.deepEqual(r.game.winner.players, [b.id]);
});

test('두 쪽 모두 중재 시도가 없고 동시에 목표에 도달하면 두 쪽 모두 승리', () => {
  for (const action of ['expedition', 'execute']) {
    const r = setup(6), b = bishop(r), rebel = role(r, 'rebel');
    r.game.revolt = 10; r.game.religiousActive = true; r.game.religiousRevolt = 20;
    r.game.successes = 2; r.game.religiousSuccesses = 2; b.churchInfluence = 20;
    act(r, king(r).id, { type: action, target: role(r, 'citizen').id });
    assert.equal(r.status, 'finished'); assert.equal(r.game.winner.side, 'rebel+bishop');
    assert.deepEqual(new Set(r.game.winner.players), new Set([b.id, rebel.id]));
    assert.equal(r.game.lastRevolt.strength, null); assert.equal(r.game.lastReligiousRevolt.strength, null);
    assert.equal(b.churchInfluence, 0);
  }
});
