import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, makeRoom, joinRoom, view, canAct, RuleError } from '../lib/game.js';
import { candidates } from '../lib/ai-policy.js';
import { makeDevice, deviceView } from '../lib/device.js';
function lobby(n) { const r = makeRoom('RULEV6', '참가1'); for (let i=1;i<n;i++) joinRoom(r,`참가${i+1}`); return r; }
function setup(n=4, church=false) { const r=lobby(n); if(church)act(r,r.host,{type:'neutralJobs',jobs:['bishop']}); act(r,r.host,{type:'start'}); return r; }
const role=(r,name)=>r.players.find(p=>p.role===name);
const hand=(p,...types)=>{p.hand=types.map(card);return p.hand.map(c=>c.id);};
function day(r,p,round=3){r.game.phase='day';r.game.pending=null;r.game.round=round;r.game.turn=r.game.order.indexOf(p.id);}
function execute(r,target){act(r,role(r,'king').id,{type:'execute'});for(const p of r.players)act(r,p.id,{type:'voteExecution',target:target.id});}

test('세금은 전원 확정 전 손패와 왕 손패를 유지하고 마지막 확정 때 모든 카드가 동시에 이전',()=>{
  const r=setup(3),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel');
  hand(k);const ci=hand(c,'resource','warWeapon','evangelism'),bi=hand(b,'church','sword');r.game.phase='evening';act(r,k.id,{type:'tax'});
  act(r,c.id,{type:'payTax',cards:ci});assert.equal(k.hand.length,0);assert.deepEqual(c.hand.map(c=>c.id),ci);
  assert.equal(view(r,k.id).game.pending.payments,undefined);assert.equal(view(r,b.id).game.pending.myDone,false);
  assert.throws(()=>act(r,c.id,{type:'payTax',cards:ci}),RuleError);
  act(r,b.id,{type:'payTax',cards:bi});assert.equal(k.hand.length,5);assert.equal(c.hand.length,0);assert.equal(b.hand.length,0);
  assert.ok([...ci,...bi].every(id=>k.hand.some(c=>c.id===id)));assert.equal(r.game.phase,'night');
});

test('왕의 손패 확인·뺏기는 서버와 AI에서 금지, 왕국지원 거절은 바로 차례 종료',()=>{
  const r=setup(),k=role(r,'king'),c=role(r,'citizen'),other=role(r,'neutral');day(r,k);hand(c,'resource','resource','resource');
  const before=structuredClone(c.hand);
  for(const type of ['revealHand','steal'])assert.throws(()=>act(r,k.id,{type,target:c.id}),RuleError);
  assert.deepEqual(c.hand,before);const options=candidates(view(r,k.id));assert.ok(options.every(a=>!['steal','revealHand'].includes(a.type)));assert.ok(options.some(a=>a.type==='royalSupport'));
  act(r,k.id,{type:'royalSupport',target:c.id});assert.equal(view(r,other.id).game.pending,null);assert.equal(canAct(r,k.id),false);assert.equal(canAct(r,c.id),true);
  act(r,c.id,{type:'supportAnswer',accept:false});assert.equal(r.game.pending,null);assert.notEqual(r.game.order[r.game.turn],k.id);assert.deepEqual(c.hand,before);
});

test('왕국지원 최소3·최대5장, 부족 시 거절만 가능, 수락·제출은 요청받은 사람만 가능',()=>{
  for(const size of [3,4,5]){const r=setup(),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel');day(r,k);hand(k);const ids=hand(c,...Array(6).fill('resource'));
    act(r,k.id,{type:'royalSupport',target:c.id});assert.throws(()=>act(r,b.id,{type:'supportAnswer',accept:true}),RuleError);act(r,c.id,{type:'supportAnswer',accept:true});
    for(const count of [0,2,6])assert.throws(()=>act(r,c.id,{type:'supportSubmit',cards:ids.slice(0,count)}),RuleError);
    act(r,c.id,{type:'supportSubmit',cards:ids.slice(0,size)});assert.equal(k.hand.length,size);assert.equal(c.hand.length,6-size);assert.equal(r.game.pending,null);
  }
  const r=setup(),k=role(r,'king'),c=role(r,'citizen');day(r,k);hand(c,'resource','resource');act(r,k.id,{type:'royalSupport',target:c.id});
  assert.throws(()=>act(r,c.id,{type:'supportAnswer',accept:true}),RuleError);assert.deepEqual(candidates(view(r,c.id)),[{type:'supportAnswer',accept:false}]);
  act(r,c.id,{type:'supportAnswer',accept:false});
});

test('자원 → 일반 → 보호 종교 카드 순으로 30장까지 줄이며 주교 자신의 종교 카드는 일반 취급',()=>{
  const r=setup(4,true),b=r.players.find(p=>p.job==='bishop'),c=role(r,'citizen');
  const ordinary=hand(c,...Array(6).fill('resource'),...Array(4).fill('sword'),...Array(25).fill('church'));
  hand(b,...Array(7).fill('resource'),...Array(25).fill('evangelism'));
  r.game.phase='bishopNight';act(r,b.id,{type:'bishopDone'});
  assert.equal(c.hand.length,30);assert.equal(c.hand.filter(c=>c.type==='resource').length,1);assert.equal(c.hand.filter(c=>c.type==='sword').length,4);assert.equal(c.hand.filter(c=>c.type==='church').length,25);
  assert.ok(ordinary.slice(6).every(id=>c.hand.some(c=>c.id===id)));
  assert.equal(b.hand.length,30);assert.equal(b.hand.filter(c=>c.type==='resource').length,5);assert.equal(b.hand.filter(c=>c.type==='evangelism').length,25);
  hand(c,...Array(40).fill('church'));r.game.phase='bishopNight';act(r,b.id,{type:'bishopDone'});assert.equal(c.hand.length,30);
});

test('주교 본인도 5장 교체에서 교단·전도를 선택할 수 없음',()=>{
  const r=setup(4,true),b=r.players.find(p=>p.job==='bishop');day(r,b);const ids=hand(b,'church','evangelism','resource');
  for(const id of ids.slice(0,2))assert.throws(()=>act(r,b.id,{type:'refresh',cards:[id]}),RuleError);
  const options=candidates(view(r,b.id)).filter(a=>a.type==='refresh');assert.ok(options.every(a=>a.cards.every(id=>id===ids[2])));
  act(r,b.id,{type:'refresh',cards:[ids[2]]});assert.ok(ids.slice(0,2).every(id=>b.hand.some(c=>c.id===id)));
});

test('교단은 모든 진영 원정에서2점·소모·영향력+2, 사냥은 사용 불가',()=>{
  for(const name of ['king','citizen','rebel','neutral']){const r=setup(4,true),p=role(r,name),b=r.players.find(p=>p.job==='bishop');
    const ids=hand(p,'church','church','church');r.game.phase='expeditionCards';r.game.pending={difficulty:'low',participants:[p.id],done:[],total:0};
    act(r,p.id,{type:'contribute',cards:ids});assert.equal(r.game.lastExpedition.score,6);assert.equal(b.churchInfluence,6);assert.equal(p.hand.length,0);
    day(r,p,2);const own=hand(p,'church');assert.throws(()=>act(r,p.id,{type:'hunt',cards:own}),RuleError);
  }
});

test('처형은 모든 기존 카드 몰수 후 재분배 자동수락·낮 차례 건너뜀·저녁과 밤 허용·다음 아침 정상',()=>{
  const r=setup(3),k=role(r,'king'),b=role(r,'rebel'),c=role(r,'citizen');const lost=hand(b,'church','evangelism','eternalMagic','resource');execute(r,b);
  assert.ok(lost.every(id=>!b.hand.some(c=>c.id===id)));assert.equal(b.hand.length,12);assert.equal(r.game.pending.done.includes(b.id),true);assert.equal(canAct(r,b.id),false);
  assert.throws(()=>act(r,b.id,{type:'redistribute',accept:false}),RuleError);
  for(const p of [k,c])act(r,p.id,{type:'redistribute',accept:false});
  while(r.game.phase==='day'){const p=r.players.find(p=>p.id===r.game.order[r.game.turn]);assert.notEqual(p.id,b.id);act(r,p.id,r.game.round===1?{type:'gather'}:r.game.round===2?{type:'hunt',cards:[]}:{type:'refresh',cards:[]});}
  assert.throws(()=>act(r,k.id,{type:'wanted',target:b.id}),RuleError);act(r,k.id,{type:'tax'});
  for(const p of [b,c])act(r,p.id,{type:'payTax',cards:p.hand.slice(0,3).map(c=>c.id)});
  assert.equal(canAct(r,b.id),true);act(r,b.id,{type:'revolt',cards:[]});assert.equal(r.game.day,2);assert.equal(view(r,b.id).me.executed,false);
  assert.throws(()=>act(r,k.id,{type:'execute'}),RuleError);
  r.game.day=3;act(r,k.id,{type:'execute'});assert.equal(r.game.phase,'executionVote');
});

test('동률이면 아무도 처형하지 않고 다음날 투표 허용, 6인 이상은 실제 처형 후에도 다음날 투표 가능',()=>{
  const r=setup(4),k=role(r,'king'),[a,b,c]=r.players.filter(p=>p!==k);act(r,k.id,{type:'execute'});
  for(const [p,t] of [[k,a],[a,b],[b,a],[c,b]])act(r,p.id,{type:'voteExecution',target:t.id});assert.equal(r.game.lastExecution.target,null);
  assert.ok(r.players.every(p=>p.executedDay===null));r.game.phase='morning';r.game.pending=null;r.game.day=2;act(r,k.id,{type:'execute'});
  const six=setup(6);six.game.lastExecutionDay=1;six.game.day=2;act(six,role(six,'king').id,{type:'execute'});assert.equal(six.game.phase,'executionVote');
});

test('5인 추가 자리는 시민·반란군 가능, 중립 직업 1종인 현재 중립2명은 불가',()=>{
  for(const config of [{king:1,citizen:2,rebel:1,neutral:1},{king:1,citizen:1,rebel:2,neutral:1}]){const r=lobby(5);act(r,r.host,{type:'config',roles:config});act(r,r.host,{type:'start'});assert.equal(r.status,'playing');}
  const r=lobby(5);act(r,r.host,{type:'config',roles:{king:1,citizen:1,rebel:1,neutral:2}});assert.throws(()=>act(r,r.host,{type:'start'}),RuleError);
});

test('공유 기기 잠금 상태는 모든 손패·직업·개인 기록·비공개 중재/원정 목록을 숨김',()=>{
  const r=setup(4,true),members=r.players.filter(p=>p.role!=='king').slice(0,2),device=makeDevice(r,members[0]);device.players.push(members[1].id);
  const bishop=r.players.find(p=>p.job==='bishop');bishop.churchInfluence=137;
  const locked=deviceView(r,device,null);assert.equal(locked.me.id,null);assert.equal(locked.me.hand.length,0);assert.equal(locked.me.notes.length,0);
  assert.ok(locked.players.every(p=>p.role===null||p.role==='king'));assert.ok(locked.players.every(p=>!p.job));
  const serialized=JSON.stringify(locked);for(const p of r.players){assert.ok(!serialized.includes(p.token));for(const c of p.hand)assert.ok(!serialized.includes(c.id));}
  assert.ok(!serialized.includes('churchInfluence'));
  r.game.phase='redistribute';r.game.pending={done:[]};const opened=deviceView(r,device,members[0].id);assert.equal(opened.me.id,members[0].id);assert.equal(opened.me.hand.length,12);
  assert.equal(opened.players.find(p=>p.id===members[1].id).role,null);assert.equal(deviceView(r,device,role(r,'king').id).me.id,null);
});

test('공유 기기 대기 명단에서도 밤 직업·비공개 원정 지명·거래 상대를 숨김',()=>{
  const r=setup(4,true),device=makeDevice(r,r.players[0]);device.players=r.players.map(p=>p.id);
  for(const phase of ['night','bishopNight','mediationSupport','expeditionCards']){
    r.game.phase=phase;r.game.pending={done:[],revoltType:'rebel',difficulty:'high',participants:[role(r,'king').id]};
    const snapshot=deviceView(r,device,null);assert.equal(snapshot.device.checkOnly,true);assert.ok(snapshot.device.players.every(p=>p.ready));
    assert.equal(snapshot.game.pending,null);assert.ok(snapshot.players.every(p=>p.role===null||p.role==='king'));
  }
  r.game.phase='day';r.game.pending={kind:'royalSupport',from:role(r,'king').id,to:role(r,'citizen').id,accepted:false};
  assert.ok(deviceView(r,device,null).device.players.every(p=>p.ready));
});
