import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, draw, makeRoom, joinRoom, view, canAct, CARDS, RECIPES, MERCHANT_BUYS, RuleError } from '../lib/game.js';
import { candidates, observe, actionFeatures, OBS_SIZE, ACTION_SIZE } from '../lib/ai-policy.js';
import { makeDevice, deviceView } from '../lib/device.js';
function setup(n=4){const r=makeRoom('MERCHA','참가1');for(let i=1;i<n;i++)joinRoom(r,`참가${i+1}`);if(n===5)act(r,r.host,{type:'config',roles:{king:1,citizen:1,rebel:1,neutral:2}});act(r,r.host,{type:'neutralJobs',jobs:n===5?['bishop','merchant']:['merchant']});act(r,r.host,{type:'start'});return r;}
const job=(r,j)=>r.players.find(p=>p.job===j),role=(r,j)=>r.players.find(p=>p.role===j);
const hand=(p,...types)=>{p.hand=types.map(card);return p.hand.map(c=>c.id);};
function evening(r){r.game.phase='evening';r.game.pending=null;act(r,role(r,'king').id,{type:'aid'});assert.equal(r.game.phase,'merchantEvening');}
function display(r,types,price=1){const m=job(r,'merchant');evening(r);const ids=hand(m,...types);act(r,m.id,{type:'displayGoods',cards:ids,price});return m.stock;}
function market(r){r.game.phase='market';r.game.pending={done:[job(r,'merchant').id,...r.players.filter(p=>p.executedDay===r.game.day&&p.job!=='merchant').map(p=>p.id)]};}
function day(r,p,round=2){r.game.phase='day';r.game.pending=null;r.game.round=round;r.game.turn=r.game.order.indexOf(p.id);}

test('상인 시작 돈0·빈 진열장, 5인 주교와 상인 각각1명·이름과 돈 비공개',()=>{
  const r=setup(5),m=job(r,'merchant'),b=job(r,'bishop');assert.ok(m&&b);assert.equal(m.money,0);assert.deepEqual(m.stock,[]);
  const mine=view(r,m.id);assert.equal(mine.me.money,0);assert.equal(mine.me.recipes.length,14);assert.equal(mine.me.recipes.filter(r=>r.job==='merchant').length,8);
  m.money=37;for(const p of r.players.filter(p=>p!==m)){const s=view(r,p.id),obs=observe(s);assert.equal(s.me.money,undefined);assert.equal(s.players.find(p=>p.id===m.id).job,null);m.money=87;assert.deepEqual(observe(view(r,p.id)),obs);m.money=37;}
});

test('저녁은 왕 정책·세금 후 상인 행동, 제작창 닫아도 진열/구매 가능하고 다음 저녁 재입장',()=>{
  const r=setup(),m=job(r,'merchant'),k=role(r,'king');r.game.phase='evening';act(r,k.id,{type:'tax'});
  for(const p of r.players.filter(p=>p!==k))act(r,p.id,{type:'payTax',cards:p.hand.slice(0,3).map(c=>c.id)});assert.equal(r.game.phase,'merchantEvening');
  m.money=20;hand(m,'infantry','infantry','infantry','infantry');act(r,m.id,{type:'beginCraft'});
  const toOfficer=RECIPES.findIndex(r=>r.job==='merchant'&&r.output==='officer'),toInfantry=RECIPES.findIndex(r=>r.job==='merchant'&&r.input==='officer');
  act(r,m.id,{type:'craft',recipe:toOfficer,count:2});act(r,m.id,{type:'craft',recipe:toInfantry,count:2});act(r,m.id,{type:'craftDone'});
  assert.equal(r.game.phase,'merchantEvening');assert.equal(r.game.pending.craftUsed,true);
  assert.throws(()=>act(r,m.id,{type:'beginCraft'}),RuleError);act(r,m.id,{type:'displayGoods',cards:m.hand.map(c=>c.id),price:3});
  act(r,m.id,{type:'merchantBuy',product:'resource',quantity:2});assert.equal(m.money,16);assert.equal(m.hand.filter(c=>c.type==='resource').length,2);
  act(r,m.id,{type:'merchantDone'});assert.equal(r.game.phase,'night');act(r,role(r,'rebel').id,{type:'revolt',cards:[]});
  evening(r);act(r,m.id,{type:'beginCraft'});assert.equal(r.game.pending.kind,'craft');
});

test('마지막 저녁도 상인 준비 후 종료하며 다른 플레이어는 상인 행동을 할 수 없음',()=>{
  const r=setup(),m=job(r,'merchant');r.game.day=r.game.maxDays;evening(r);
  assert.equal(r.status,'playing');assert.throws(()=>act(r,role(r,'king').id,{type:'merchantDone'}),RuleError);
  act(r,m.id,{type:'merchantDone'});assert.equal(r.status,'finished');assert.equal(r.game.winner.side,'royal');
});

test('상인 제작8종 재료와 출력 정확, 마법3종은 상인만 금지·강화칼과 빛날검 영구3/7',()=>{
  const r=setup(),m=job(r,'merchant'),k=role(r,'king');day(r,m);act(r,m.id,{type:'beginCraft'});
  for(const [recipe,index] of RECIPES.map((r,i)=>[r,i]).filter(([r])=>r.job==='merchant')){hand(m,...Array(recipe.count).fill(recipe.input));act(r,m.id,{type:'craft',recipe:index,count:1});assert.deepEqual(m.hand.map(c=>c.type),Array(recipe.amount||1).fill(recipe.output));}
  for(const output of ['magic','eternalMagic','highMagic']){const index=RECIPES.findIndex(r=>r.output===output),recipe=RECIPES[index],ids=hand(m,...Array(recipe.count).fill(recipe.input));assert.throws(()=>act(r,m.id,{type:'craft',recipe:index,count:1}),RuleError);assert.deepEqual(m.hand.map(c=>c.id),ids);assert.ok(view(r,k.id).me.recipes.some(r=>r.output===output));}
  assert.equal(CARDS.reinforcedSword.attack,3);assert.equal(CARDS.shiningSword.attack,7);assert.ok(CARDS.reinforcedSword.permanent&&CARDS.shiningSword.permanent);
  assert.ok(draw(500).every(c=>!['reinforcedSword','shiningSword'].includes(c.type)));assert.ok(!RECIPES.some(r=>r.input==='resource'&&r.count===10));
  day(r,m);act(r,m.id,{type:'hunt',cards:hand(m,'shiningSword','shiningSword')});assert.equal(m.hand.filter(c=>c.type==='shiningSword').length,2);
});

test('상인 구매 돈2/3/3/10의 비용과 랜덤5장 묶음, 반복 구매·돈 부족 무소모',()=>{
  const r=setup(),m=job(r,'merchant');evening(r);m.money=30;hand(m);
  for(const [product,cost,count] of [['resource',2,1],['infantry',3,1],['rebellion',3,1],['random',10,5]]){const before=m.hand.length,money=m.money;act(r,m.id,{type:'merchantBuy',product,quantity:1});assert.equal(m.money,money-cost);assert.equal(m.hand.length,before+count);assert.equal(MERCHANT_BUYS[product].cost,cost);}
  act(r,m.id,{type:'merchantBuy',product:'random',quantity:1});assert.equal(m.money,2);
  const before=structuredClone(m.hand);assert.throws(()=>act(r,m.id,{type:'merchantBuy',product:'random',quantity:1}),RuleError);assert.deepEqual(m.hand,before);assert.equal(m.money,2);assert.equal(r.game.phase,'merchantEvening');
});

test('진열장 최대5종·종류당30장·같은 종류 추가 가격유지·여섯째 종류 무소모 차단',()=>{
  const r=setup(),m=job(r,'merchant');display(r,['resource','sword','infantry','rebellion','officer'],3);assert.equal(m.hand.length,0);assert.equal(m.stock.length,5);
  const extra=hand(m,'magic');const before=structuredClone(m.stock);assert.throws(()=>act(r,m.id,{type:'displayGoods',cards:extra,price:1}),RuleError);assert.deepEqual(m.stock,before);assert.equal(m.hand.length,1);
  const resources=hand(m,...Array(29).fill('resource'));act(r,m.id,{type:'displayGoods',cards:resources,price:1});assert.equal(m.stock.find(i=>i.type==='resource').cards.length,30);assert.equal(m.stock.find(i=>i.type==='resource').price,3);
  const last=hand(m,'resource');assert.throws(()=>act(r,m.id,{type:'displayGoods',cards:last,price:1}),RuleError);assert.equal(m.hand.length,1);
  const item=m.stock[0];for(const price of [0,6,1.5])assert.throws(()=>act(r,m.id,{type:'changePrice',stock:item.id,price}),RuleError);
  act(r,m.id,{type:'changePrice',stock:item.id,price:5});assert.equal(item.price,5);assert.equal(item.type,'resource');
});

test('재고는 먼저 확정한 구매자에게만 판매·품절 요청과 잘못된 대금은 아무것도 소모하지 않음',()=>{
  const r=setup(),m=job(r,'merchant'),a=role(r,'king'),b=role(r,'citizen');const [item]=display(r,['eternalSword'],2);market(r);
  const ai=hand(a,'resource','resource'),bi=hand(b,'sword','magic');
  assert.throws(()=>act(r,a.id,{type:'marketBuy',stock:item.id,quantity:1,cards:[ai[0]]}),RuleError);assert.equal(item.cards.length,1);assert.equal(m.money,0);
  const soldId=item.cards[0].id;act(r,a.id,{type:'marketBuy',stock:item.id,quantity:1,cards:ai});assert.equal(m.money,4);assert.deepEqual(a.hand.map(c=>c.id),[soldId]);assert.equal(m.stock.length,0);
  assert.throws(()=>act(r,b.id,{type:'marketBuy',stock:item.id,quantity:1,cards:bi}),RuleError);assert.deepEqual(b.hand.map(c=>c.id),bi);assert.equal(m.money,4);
  assert.throws(()=>act(r,m.id,{type:'marketBuy',stock:item.id,quantity:1,cards:[]}),RuleError);
});

test('품절된 슬롯은 다른 종류 진열 가능·다종 반복 구매 후 전원 완료하면 왕부터 기존 낮',()=>{
  const r=setup(),m=job(r,'merchant'),a=role(r,'king');display(r,['resource','sword','infantry','rebellion','officer']);market(r);const ids=hand(a,'magic','magic');
  for(const type of ['resource','sword']){const item=m.stock.find(i=>i.type===type);act(r,a.id,{type:'marketBuy',stock:item.id,quantity:1,cards:[ids.shift()]});}
  assert.equal(m.money,4);for(const p of r.players.filter(p=>p!==m))act(r,p.id,{type:'marketDone'});assert.equal(r.game.phase,'day');assert.equal(r.game.order[r.game.turn],a.id);assert.equal(r.game.round,1);
  evening(r);const cards=hand(m,'magic');act(r,m.id,{type:'displayGoods',cards,price:2});assert.equal(m.stock.length,4);
});

test('낮 시작은 익명 상점부터, 구매 완료 뒤 재구매 불가·처형 대상은 구매 자동 건너뜀',()=>{
  const r=setup(),m=job(r,'merchant'),c=role(r,'citizen');r.game.phase='redistribute';r.game.pending={done:[]};
  for(const p of r.players)act(r,p.id,{type:'redistribute',accept:false});assert.equal(r.game.phase,'market');assert.equal(canAct(r,m.id),false);
  act(r,c.id,{type:'marketDone'});assert.throws(()=>act(r,c.id,{type:'marketDone'}),RuleError);assert.equal(canAct(r,c.id),false);
  for(const p of r.players.filter(p=>p!==m&&p!==c))act(r,p.id,{type:'marketDone'});assert.equal(r.game.phase,'day');
  r.game.phase='morning';r.game.pending=null;act(r,role(r,'king').id,{type:'execute'});for(const p of r.players)act(r,p.id,{type:'voteExecution',target:p===c?r.players.find(q=>q!==c&&q.role!=='king').id:c.id});
  for(const p of r.players.filter(p=>p!==c))act(r,p.id,{type:'redistribute',accept:false});assert.equal(r.game.phase,'market');assert.ok(r.game.pending.done.includes(c.id));
});

test('교단·전도 대금은 주교만 가능·영구 카드는 누구나 가능·상점 전도는 즉시 전파하지 않음',()=>{
  const r=setup(5),m=job(r,'merchant'),b=job(r,'bishop'),c=role(r,'citizen');display(r,['evangelism','resource','resource']);market(r);
  const religious=hand(c,'church','evangelism','eternalMagic'),source=m.stock.find(i=>i.type==='resource');
  for(const id of religious.slice(0,2))assert.throws(()=>act(r,c.id,{type:'marketBuy',stock:source.id,quantity:1,cards:[id]}),RuleError);
  act(r,c.id,{type:'marketBuy',stock:source.id,quantity:1,cards:[religious[2]]});assert.ok(!c.hand.some(c=>c.id===religious[2]));
  const payment=hand(b,'church');act(r,b.id,{type:'marketBuy',stock:source.id,quantity:1,cards:payment});assert.equal(b.hand[0].type,'resource');
  const evangel=m.stock.find(i=>i.type==='evangelism'),ci=hand(c,'sword','resource');act(r,c.id,{type:'marketBuy',stock:evangel.id,quantity:1,cards:[ci[0]]});assert.deepEqual(c.hand.map(c=>c.type),['resource','evangelism']);assert.equal(b.churchInfluence,0);
});

test('진열 카드는 손패 제한·교체·지명수배·처형·상급 원정 실패에서 그대로 유지',()=>{
  for(const effect of ['limit','replace','wanted','execute','expedition']){const r=setup(),m=job(r,'merchant'),k=role(r,'king');display(r,['resource','evangelism','officer']);const stock=structuredClone(m.stock);
    if(effect==='limit'){hand(m,...Array(40).fill('resource'));act(r,m.id,{type:'merchantDone'});act(r,role(r,'rebel').id,{type:'revolt',cards:[]});assert.equal(m.hand.length,30);}
    if(effect==='replace'){day(r,m,3);act(r,m.id,{type:'replace'});}
    if(effect==='wanted'){hand(m,'rebellion','agitation','weapon');r.game.phase='evening';act(r,k.id,{type:'wanted',target:m.id});assert.equal(m.hand.length,0);}
    if(effect==='execute'){r.game.phase='morning';r.game.pending=null;act(r,k.id,{type:'execute'});for(const p of r.players)act(r,p.id,{type:'voteExecution',target:p===m?r.players.find(q=>q!==m&&q!==k).id:m.id});assert.equal(m.hand.length,12);}
    if(effect==='expedition'){r.game.phase='morning';r.game.pending=null;act(r,k.id,{type:'expedition'});for(const p of r.players)act(r,p.id,{type:'voteExpedition',difficulty:'high'});const c=role(r,'citizen');act(r,k.id,{type:'selectExpedition',targets:[m.id,c.id]});for(const p of [k,c])act(r,p.id,{type:'contribute',cards:[]});}
    assert.deepEqual(m.stock,stock);
  }
});

test('상인은 비밀거래 시작 불가·상대의 요청은 익명 자동 거절로 차례 종료',()=>{
  const r=setup(),m=job(r,'merchant'),c=role(r,'citizen');day(r,m,1);assert.throws(()=>act(r,m.id,{type:'trade',target:c.id}),RuleError);assert.ok(candidates(view(r,m.id)).every(a=>a.type!=='trade'));
  day(r,c,1);const before=structuredClone(m.hand);act(r,c.id,{type:'trade',target:m.id});assert.equal(r.game.pending,null);assert.notEqual(r.game.order[r.game.turn],c.id);assert.deepEqual(m.hand,before);
  assert.ok(!c.notes.at(-1).text.includes('상인'));
});

test('두 원정의 상인 제출은 자동0장·지원자수에 미포함·카드/0장 수동 제출 차단',()=>{
  for(const difficulty of ['low','high']){const r=setup(),m=job(r,'merchant'),k=role(r,'king');act(r,k.id,{type:'expedition'});for(const p of r.players)act(r,p.id,{type:'voteExpedition',difficulty});
    if(difficulty==='high')act(r,k.id,{type:'selectExpedition',targets:[m.id,role(r,'citizen').id]});else for(const p of r.players.filter(p=>p!==k))act(r,p.id,{type:'joinExpedition',join:p===m});
    assert.equal(view(r,m.id).game.pending.myDone,true);assert.equal(canAct(r,m.id),false);assert.deepEqual(candidates(view(r,m.id)),[]);
    assert.throws(()=>act(r,m.id,{type:'contribute',cards:[]}),RuleError);assert.equal(r.game.pending.total,0);assert.equal(r.game.pending.contributors.length,0);
  }
});

test('두 반란 모두 돈2점당 중재1·돈 소모·카드/홀수/초과금액 거부·교단영향력 미증가',()=>{
  for(const revoltType of ['rebel','religion']){const r=setup(5),m=job(r,'merchant'),b=job(r,'bishop'),k=role(r,'king');m.money=17;const ids=hand(m,'church','officer');
    r.game.revolt=revoltType==='rebel'?6:0;r.game.religiousActive=revoltType==='religion';r.game.religiousRevolt=6;act(r,k.id,{type:'mediate',revoltType});
    for(const money of [-2,3,18])assert.throws(()=>act(r,m.id,{type:'contribute',cards:[],money}),RuleError);
    assert.throws(()=>act(r,m.id,{type:'contribute',cards:[ids[0]],money:2}),RuleError);assert.equal(m.money,17);
    act(r,m.id,{type:'contribute',cards:[],money:12});assert.equal(m.money,5);assert.equal(b.churchInfluence,0);assert.deepEqual(m.hand.map(c=>c.id),ids);
    for(const p of r.players.filter(p=>p!==k&&p!==m&&(revoltType==='religion'||p.role!=='rebel')))act(r,p.id,{type:'contribute',cards:[]});act(r,k.id,{type:'contribute',cards:[]});
    const result=revoltType==='religion'?r.game.lastReligiousRevolt:r.game.lastRevolt;assert.equal(result.blocked,true);assert.equal(result.strength,6);assert.equal(result.helperCount,1);
  }
});

test('판매 돈100점 이상 즉시 상인 단독 승리, 다른 중립은 승리자에 포함하지 않음',()=>{
  const r=setup(5),m=job(r,'merchant'),buyer=role(r,'king');const [item]=display(r,['sword'],3);m.money=96;market(r);
  act(r,buyer.id,{type:'marketBuy',stock:item.id,quantity:1,cards:hand(buyer,'resource','resource','resource')});assert.equal(m.money,102);assert.equal(r.status,'finished');assert.equal(r.game.winner.side,'merchant');assert.deepEqual(r.game.winner.players,[m.id]);
});

test('상품 종류/수량/가격만 공개·재고 카드ID와 돈은 숨기고 공유 기기에서도 상인 신원을 숨김',()=>{
  const r=setup(5),m=job(r,'merchant'),c=role(r,'citizen');display(r,['sword','sword','magic'],4);m.money=73;
  const s=view(r,c.id);assert.equal(s.game.pending,null);assert.deepEqual(Object.keys(s.game.shop[0]).sort(),['id','price','quantity','type']);assert.equal(s.game.shop[0].quantity,2);assert.equal(s.game.shop[0].price,4);
  const serialized=JSON.stringify(s);assert.ok(!serialized.includes('"money":'));for(const item of m.stock)for(const card of item.cards)assert.ok(!serialized.includes(card.id));assert.equal(s.players.find(p=>p.id===m.id).job,null);
  const d=makeDevice(r,c);d.players=r.players.map(p=>p.id);const locked=deviceView(r,d,null);assert.equal(locked.device.checkOnly,true);assert.ok(locked.device.players.every(p=>p.ready));assert.equal(locked.me.money,undefined);
  market(r);assert.ok(deviceView(r,d,null).device.players.every(p=>p.ready));
});

test('상인·구매 후보는 개인 정보만 사용하고 관측과 행동 크기가 일치',()=>{
  const r=setup(),m=job(r,'merchant'),c=role(r,'citizen');display(r,['sword','sword'],2);m.money=19;
  for(const p of [m,c]){const s=view(r,p.id);assert.equal(observe(s).length,OBS_SIZE);assert.ok(candidates(s).every(a=>actionFeatures(s,a).length===ACTION_SIZE));}
  market(r);hand(c,'resource','resource','church');const s=view(r,c.id),choices=candidates(s);assert.ok(choices.some(a=>a.type==='marketBuy'));assert.ok(choices.filter(a=>a.type==='marketBuy').every(a=>a.cards.every(id=>c.hand.find(c=>c.id===id).type!=='church')));
});
