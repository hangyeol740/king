import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { act, makeRoom, joinRoom, view, CARDS, visibleRecipes, ROLES, NEUTRAL_JOBS } from '../lib/game.js';

async function browser() {
  const elements = new Map(), handlers = {};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener() {} });
    return elements.get(selector);
  };
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } },
    localStorage: { getItem: () => null }, location: { search: '' }, URLSearchParams,
    io: () => ({ on: (name, callback) => { handlers[name] = callback; } }),
    fetch: () => new Promise(() => {}), setTimeout: () => 1, clearTimeout() {},
    window: { kingdomEffects: { handle() {} } }
  });
  vm.runInContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  return { context, elements, handlers };
}
function setup(count) {
  const r = makeRoom('SCREEN', '첫날');
  for (let i = 1; i < count; i++) joinRoom(r, `참가${i}`);
  act(r, r.host, { type: 'start' });
  return r;
}

test('첫날 왕에게 원정과 사형 선택지가 표시되고 3인 사형도 활성화', async () => {
  for (const count of [3, 4, 5, 6]) {
    const b = await browser(), r = setup(count), king = r.players.find(p => p.role === 'king');
    vm.runInContext(`rules = ${JSON.stringify({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS })}`, b.context);
    assert.doesNotThrow(() => b.handlers.state(view(r, king.id)));
    const html = b.elements.get('#app').innerHTML;
    assert.match(html, /data-cmd="expedition"/);
    assert.match(html, /data-cmd="execute"/);
    assert.doesNotMatch(html, /data-cmd="execute"[^>]*disabled/);
  }
});

test('이전 상태·API의 중립 직업/종교 필드가 없어도 첫날 왕 화면이 렌더됨', async () => {
  const b = await browser(), r = setup(3), king = r.players.find(p => p.role === 'king'), s = view(r, king.id);
  delete s.neutralJobs;
  for (const key of ['religiousGoal', 'religiousRevolt', 'religiousSuccesses']) delete s.game[key];
  vm.runInContext(`rules = ${JSON.stringify({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES })}`, b.context);
  assert.doesNotThrow(() => b.handlers.state(s));
  assert.match(b.elements.get('#app').innerHTML, /data-cmd="expedition"/);
  assert.doesNotMatch(b.elements.get('#app').innerHTML, /data-revolt-type="religion"/);
});

test('사형 화면의 후보는 왕 제외·자신 포함이며 1표 확정 후 대기 표시', async () => {
  const b = await browser(), r = setup(3), king = r.players.find(p => p.role === 'king'), voter = r.players.find(p => p !== king);
  vm.runInContext(`rules = ${JSON.stringify({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS })}`, b.context);
  act(r, king.id, { type: 'execute' }); b.handlers.state(view(r, voter.id));
  let html = b.elements.get('#app').innerHTML;
  assert.ok(!html.includes(`data-target-player="${king.id}"`));
  assert.ok(html.includes(`data-target-player="${voter.id}"`));
  assert.match(html, /data-cmd="voteExecution"/);
  act(r, voter.id, { type: 'voteExecution', target: voter.id }); b.handlers.state(view(r, voter.id));
  html = b.elements.get('#app').innerHTML;
  assert.match(html, /사형 투표를 마쳤습니다/); assert.doesNotMatch(html, /data-cmd="voteExecution"/);
});
