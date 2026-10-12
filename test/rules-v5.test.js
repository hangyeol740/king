import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, makeRoom, joinRoom, view, RuleError } from '../lib/game.js';
import { candidates } from '../lib/ai-policy.js';

function setup(count = 3, withBishop = false) {
  const r = makeRoom('RULEV5', '플레이어1');
  for (let i = 1; i < count; i++) joinRoom(r, `플레이어${i + 1}`);
  if (withBishop) act(r, r.host, { type: 'neutralJobs', jobs: ['bishop'] });
  act(r, r.host, { type: 'start' });
  return r;
}
const king = r => r.players.find(p => p.role === 'king');
const bishop = r => r.players.find(p => p.job === 'bishop');
const hand = (p, ...types) => { p.hand = types.map(card); return p.hand.map(c => c.id); };

test('인원별 기간 10/9/7/6일과 종교반란 목표 1/2/3일이 개인 상태와 실제 승리에 반영', () => {
  for (const [n, days, goal] of [[4,9,1], [5,7,2], [6,6,3], [8,6,3]]) {
    const r = setup(n, true), b = bishop(r), k = king(r);
    assert.equal(r.game.maxDays, days); assert.equal(view(r, b.id).game.religiousGoal, goal);
    for (let i = 0; i < goal; i++) {
      hand(b, ...Array(12).fill('church'));
      r.game.phase = 'night'; r.game.pending = { done: [] };
      for (const p of r.players.filter(p => p.role === 'rebel')) act(r, p.id, { type: 'revolt', cards: [] });
      b.churchInfluence = 100;
      act(r, b.id, { type: 'religiousRevolt' }); act(r, b.id, { type: 'bishopDone' });
      act(r, k.id, { type: 'mediate', revoltType: 'religion' });
      for (const p of r.players.filter(p => p !== k)) act(r, p.id, { type: 'contribute', cards: [] });
      act(r, k.id, { type: 'contribute', cards: [] });
      assert.equal(r.game.religiousSuccesses, i + 1); assert.equal(b.churchInfluence, 0);
      assert.equal(r.status, i === goal - 1 ? 'finished' : 'playing');
    }
    assert.equal(r.game.winner.side, 'bishop'); assert.deepEqual(r.game.winner.players, [b.id]);
    assert.match(r.game.winner.reason, new RegExp(`${goal}일`));
  }
});

test('3인 첫날 왕 사형 선언 → 전원 투표 → 최다 득표자 전체 몰수, 플레이 지속', () => {
  const r = setup(), k = king(r), target = r.players.find(p => p !== k), oldKing = structuredClone(k.hand);
  hand(target, 'resource', 'church', 'evangelism', 'warWeapon', 'eternalMagic');
  assert.throws(() => act(r, target.id, { type: 'execute' }), RuleError);
  assert.ok(candidates(view(r, k.id)).some(a => a.type === 'execute' && !a.target));
  act(r, k.id, { type: 'execute' });
  assert.equal(r.game.day, 1); assert.equal(r.game.phase, 'executionVote'); assert.equal(target.hand.length, 5);
  for (const p of r.players) {
    const options = candidates(view(r, p.id));
    assert.equal(options.length, 2); assert.ok(options.every(a => a.target !== k.id));
    act(r, p.id, { type: 'voteExecution', target: target.id });
  }
  assert.equal(r.game.phase, 'redistribute'); assert.equal(target.hand.length, 12); assert.equal(target.executedDay, 1);
  assert.deepEqual(k.hand, oldKing); assert.ok(r.game.order.includes(target.id));
  assert.equal(r.game.lastExecution.target, target.id);
  assert.equal(r.game.lastExecution.tallies.find(t => t.id === target.id).count, 3);
});

test('사형 투표는 왕/위조 대상/중복 차단·전원 완료 전 투표 비공개·한 표씩 확정', () => {
  const r = setup(4), k = king(r), [a, b, c] = r.players.filter(p => p !== k);
  act(r, k.id, { type: 'execute' });
  for (const target of [k.id, 'fake']) assert.throws(() => act(r, a.id, { type: 'voteExecution', target }), RuleError);
  assert.equal(r.game.pending.done.length, 0);
  act(r, a.id, { type: 'voteExecution', target: b.id });
  assert.throws(() => act(r, a.id, { type: 'voteExecution', target: c.id }), RuleError);
  const own = view(r, a.id).game.pending, other = view(r, b.id).game.pending;
  assert.equal(own.myVote, b.id); assert.equal(other.myVote, null); assert.equal(other.voteCount, 1);
  assert.equal(other.votes, undefined); assert.ok(!r.game.logs.some(l => l.text.includes(`${a.name}님이 ${b.name}`)));
  assert.deepEqual(candidates(view(r, a.id)), []);
  for (const p of [k, b, c]) act(r, p.id, { type: 'voteExecution', target: b.id });
  assert.equal(r.game.lastExecution.target, b.id);
});

test('사형 동률은 아무도 처형하지 않고 손패를 유지', () => {
  for (let i = 0; i < 8; i++) {
    const r = setup(4), k = king(r), [a, b, c] = r.players.filter(p => p !== k);
    for (const p of r.players) hand(p, 'resource', 'evangelism');
    act(r, k.id, { type: 'execute' });
    for (const [p, target] of [[k,a], [a,b], [b,a], [c,b]]) act(r, p.id, { type: 'voteExecution', target: target.id });
    assert.equal(r.game.lastExecution.target, null);
    assert.deepEqual(new Set(r.game.lastExecution.tied), new Set([a.id,b.id]));
    assert.equal(r.players.filter(p => !p.hand.length).length, 0);
    assert.equal(c.hand.length, 2); assert.equal(k.hand.length, 2);
  }
});

test('사형 투표는 반란 판정 후 시작하고 미중재 반란이 승리하면 투표 없이 종료', () => {
  const r = setup(4), k = king(r);
  r.game.revolt = 10;
  act(r, k.id, { type: 'execute' });
  assert.equal(r.game.successes, 1); assert.equal(r.game.phase, 'executionVote');
  const r2 = setup(4); r2.game.revolt = 10; r2.game.successes = 1;
  act(r2, king(r2).id, { type: 'execute' });
  assert.equal(r2.status, 'finished'); assert.equal(r2.game.winner.side, 'rebel'); assert.equal(r2.game.pending, null);
});

test('주교 밤 교단회수는 전도2 소모, 원하는 한 사람의 교단 전부 실제 이전·전도/일반 유지·반복 가능', () => {
  const r = setup(4, true), b = bishop(r), target = r.players.find(p => p.role === 'citizen');
  hand(b, 'evangelism', 'evangelism', 'evangelism', 'evangelism', 'church');
  const ids = hand(target, ...Array(30).fill('church'), 'evangelism', 'warWeapon', 'resource');
  r.game.phase = 'bishopNight'; r.game.pending = null;
  const options = candidates(view(r, b.id));
  assert.ok(options.some(a => a.type === 'reclaimChurch' && a.target === target.id));
  const oldInfluence = b.churchInfluence;
  act(r, b.id, { type: 'reclaimChurch', target: target.id });
  assert.equal(b.hand.filter(c => c.type === 'church').length, 31);
  assert.equal(b.hand.filter(c => c.type === 'evangelism').length, 2);
  assert.ok(ids.slice(0,30).every(id => b.hand.some(c => c.id === id)));
  assert.deepEqual(target.hand.map(c => c.type), ['evangelism','warWeapon','resource']);
  assert.equal(b.churchInfluence, oldInfluence); assert.equal(r.game.phase, 'bishopNight');
  const stolen = target.notes.at(-1); assert.equal(stolen.effect, 'stolen'); assert.equal(stolen.details.count, 30);
  assert.ok(!JSON.stringify(view(r, king(r).id)).includes(stolen.id));
  act(r, b.id, { type: 'reclaimChurch', target: target.id });
  assert.equal(b.hand.filter(c => c.type === 'evangelism').length, 0);
  assert.equal(b.hand.filter(c => c.type === 'church').length, 31);
});

test('교단회수는 주교 밤만 가능, 비용 부족·자기/위조 대상은 무소모 거부', () => {
  const r = setup(4, true), b = bishop(r), c = r.players.find(p => p.role === 'citizen');
  hand(b, 'evangelism', 'evangelism'); hand(c, 'church');
  assert.throws(() => act(r, b.id, { type: 'reclaimChurch', target: c.id }), RuleError);
  r.game.phase = 'bishopNight'; r.game.pending = null;
  assert.throws(() => act(r, c.id, { type: 'reclaimChurch', target: b.id }), RuleError);
  const before = structuredClone(b.hand);
  for (const target of [b.id, 'fake']) assert.throws(() => act(r, b.id, { type: 'reclaimChurch', target }), RuleError);
  assert.deepEqual(b.hand, before); assert.equal(c.hand.length, 1);
  hand(b, 'evangelism');
  assert.throws(() => act(r, b.id, { type: 'reclaimChurch', target: c.id }), RuleError);
  assert.equal(b.hand.length, 1); assert.ok(candidates(view(r, b.id)).every(a => a.type !== 'reclaimChurch'));
});

test('인원별 서로 다른 목표에서도 동시 도달 시 중재 시도하지 않은 쪽이 우선 승리', () => {
  for (const n of [4,5,6]) for (const chosen of ['rebel','religion']) {
    const r = setup(n, true), k = king(r);
    r.game.successes = r.game.revoltGoal - 1; r.game.religiousSuccesses = r.game.religiousGoal - 1;
    r.game.revolt = 10; r.game.religiousActive = true; r.game.religiousRevolt = 10;
    act(r, k.id, { type: 'mediate', revoltType: chosen });
    for (const p of r.players.filter(p => p !== k && (chosen === 'religion' || p.role !== 'rebel'))) act(r, p.id, { type: 'contribute', cards: [] });
    act(r, k.id, { type: 'contribute', cards: [] });
    assert.equal(r.game.successes, r.game.revoltGoal); assert.equal(r.game.religiousSuccesses, r.game.religiousGoal);
    assert.equal(r.game.winner.side, chosen === 'rebel' ? 'bishop' : 'rebel');
  }
});
