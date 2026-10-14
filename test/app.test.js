import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { act, makeRoom, joinRoom, view, CARDS, visibleRecipes, ROLES, NEUTRAL_JOBS } from '../lib/game.js';
import { makeDevice, deviceView } from '../lib/device.js';

async function browser() {
  const elements = new Map(), handlers = {};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener() {} });
    return elements.get(selector);
  };
  const context = vm.createContext({
    document: { addEventListener() {},querySelector: element, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } },
    localStorage: { getItem: () => null }, location: { search: '' }, URLSearchParams,
    io: () => ({ on: (name, callback) => { handlers[name] = callback; } }),
    fetch: () => new Promise(() => {}), setTimeout: () => 1, clearTimeout() {},
    window: { kingdomEffects: { handle() {} } }
  });
  vm.runInContext(await readFile(new URL('../public/pass-device.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../public/merchant.js', import.meta.url), 'utf8'), context);
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
   assert.ok(!html.includes(`data-target-player="${voter.id}"`));
  assert.match(html, /data-cmd="voteExecution"/);
   assert.throws(()=>act(r,voter.id,{type:'voteExecution',target:voter.id}));
   act(r, voter.id, { type: 'voteExecution', target: r.players.find(p=>p!==voter&&p!==king).id }); b.handlers.state(view(r, voter.id));
  html = b.elements.get('#app').innerHTML;
  assert.match(html, /사형 투표를 마쳤습니다/); assert.doesNotMatch(html, /data-cmd="voteExecution"/);
});

test('공유 기기 이름 확인 전에는 직업·손패 화면이 없고 차례인 사람만 화면을 열 수 있음',async()=>{
  const b=await browser(),r=setup(3),k=r.players.find(p=>p.role==='king'),device=makeDevice(r,r.players[0]);device.players=r.players.map(p=>p.id);
  vm.runInContext(`rules = ${JSON.stringify({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS })}`, b.context);
  b.handlers.state(deviceView(r,device,null));let html=b.elements.get('#app').innerHTML;assert.match(html,/다음 사람에게 기기를 넘겨주세요/);assert.doesNotMatch(html,/class="hand-grid"|class="panel identity-panel/);
  vm.runInContext(`deviceSeatChoice=${JSON.stringify(k.id)};render()`,b.context);html=b.elements.get('#app').innerHTML;assert.match(html,/님이 맞나요/);assert.doesNotMatch(html,/class="hand-grid"/);
  b.handlers.state(deviceView(r,device,k.id));html=b.elements.get('#app').innerHTML;assert.match(html,/class="hand-grid"/);assert.match(html,/화면 가리고 다음 사람에게 넘기기/);
  b.handlers.state(deviceView(r,device,null));assert.doesNotMatch(b.elements.get('#app').innerHTML,/class="hand-grid"/);
});

test('상점은 상품 정보만 표시하고 저녁 제작창 종료와 돈 중재 화면을 구분',async()=>{
  const b=await browser(),r=makeRoom('SHOPUI','이름1');for(let i=1;i<4;i++)joinRoom(r,`이름${i+1}`);act(r,r.host,{type:'neutralJobs',jobs:['merchant']});act(r,r.host,{type:'start'});
  const m=r.players.find(p=>p.job==='merchant'),k=r.players.find(p=>p.role==='king'),c=r.players.find(p=>p.role==='citizen');
  vm.runInContext(`rules = ${JSON.stringify({ cards: CARDS, recipes: visibleRecipes(null), roles: ROLES, neutralJobs: NEUTRAL_JOBS,merchantBuys:{resource:{cost:2,count:1},random:{cost:10,count:5}} })}`, b.context);
  r.game.phase='evening';act(r,k.id,{type:'aid'});b.handlers.state(view(r,m.id));assert.match(b.elements.get('#app').innerHTML,/상인의 저녁 준비/);assert.match(b.elements.get('#app').innerHTML,/보유 돈 <strong>0점/);
  act(r,m.id,{type:'beginCraft'});b.handlers.state(view(r,m.id));assert.match(b.elements.get('#app').innerHTML,/저녁 제작창 종료/);
  act(r,m.id,{type:'craftDone'});vm.runInContext("merchantTab='craft'",b.context);b.handlers.state(view(r,m.id));assert.match(b.elements.get('#app').innerHTML,/data-cmd="beginCraft"[^>]*disabled/);
  r.game.phase='market';r.game.pending={done:[m.id]};b.handlers.state(view(r,c.id));assert.match(b.elements.get('#app').innerHTML,/익명 상점/);assert.match(b.elements.get('#app').innerHTML,/data-cmd="marketDone"/);assert.doesNotMatch(b.elements.get('#app').innerHTML,/money-counter/);
  r.game.phase='morning';r.game.pending=null;r.game.revolt=10;act(r,k.id,{type:'mediate'});b.handlers.state(view(r,m.id));assert.match(b.elements.get('#app').innerHTML,/id="mediation-money"/);assert.doesNotMatch(b.elements.get('#app').innerHTML,/data-cmd="contribute"[^>]*data-cards/);
});
