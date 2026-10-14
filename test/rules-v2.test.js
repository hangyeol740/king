import test from 'node:test';
import assert from 'node:assert/strict';
import { act, card, makeRoom, joinRoom, view, RECIPES, expeditionPower, RuleError } from '../lib/game.js';

function setup(n=4){const r=makeRoom('RULEV2','왕국1');for(let i=1;i<n;i++)joinRoom(r,`왕국${i+1}`);act(r,r.host,{type:'start'});return r;}
const role=(r,name)=>r.players.find(p=>p.role===name);
const hand=(p,...types)=>{p.hand=types.map(card);return p.hand.map(c=>c.id);};
function vote(r,difficulty='high'){const k=role(r,'king');act(r,k.id,{type:'expedition'});for(const p of r.players)act(r,p.id,{type:'voteExpedition',difficulty});}
function readyCraft(r,p){r.game.phase='day';r.game.round=2;r.game.turn=r.game.order.indexOf(p.id);act(r,p.id,{type:'beginCraft'});}

test('인원별 반란 목표 1/2/3일: 목표 직전은 진행, 목표 도달 즉시 종료',()=>{
  for(const [n,goal] of [[3,1],[4,2],[5,3],[8,3]]){
    const r=setup(n),k=role(r,'king');assert.equal(view(r,k.id).game.revoltGoal,goal);
    for(let success=1;success<=goal;success++){
      r.game.phase='morning';r.game.pending=null;r.game.revolt=3;
      act(r,k.id,{type:'expedition'});
      assert.equal(r.game.successes,success);assert.equal(r.game.revolt,0);
      assert.equal(r.status,success===goal?'finished':'playing');
    }
    assert.equal(r.game.winner.side,'rebel');
  }
});
test('원정 투표 전원 참여·중복 투표 차단·개별 표 비공개·동률 하급',()=>{
  const r=setup(4),k=role(r,'king');act(r,k.id,{type:'expedition'});
  act(r,r.players[0].id,{type:'voteExpedition',difficulty:'high'});
  const other=view(r,r.players[1].id);assert.equal(other.game.pending.myVote,null);assert.equal(other.game.pending.votes,undefined);
  assert.throws(()=>act(r,r.players[0].id,{type:'voteExpedition',difficulty:'low'}),RuleError);
  act(r,r.players[1].id,{type:'voteExpedition',difficulty:'high'});act(r,r.players[2].id,{type:'voteExpedition',difficulty:'low'});
  assert.equal(r.game.phase,'expeditionVote');
  act(r,r.players[3].id,{type:'voteExpedition',difficulty:'low'});
  assert.equal(r.game.phase,'expeditionJoin');assert.equal(r.game.pending.difficulty,'low');
  assert.deepEqual(r.game.pending.participants,[k.id]);
});
test('상급 원정 왕이 3/4/5인에서 1/2/3명 강제 지명·거절 불가·비참가자는 제출 불가',()=>{
  for(const [n,required] of [[3,1],[4,2],[5,3]]){
    const r=setup(n),k=role(r,'king');vote(r);assert.equal(r.game.phase,'expeditionSelect');
    assert.equal(view(r,k.id).game.pending.required,required);
    const targets=r.players.filter(p=>p!==k).slice(0,required).map(p=>p.id);
    assert.throws(()=>act(r,k.id,{type:'selectExpedition',targets:[k.id,...targets.slice(1)]}),RuleError);
    assert.throws(()=>act(r,k.id,{type:'selectExpedition',targets:targets.slice(1)}),RuleError);
    assert.throws(()=>act(r,targets[0],{type:'selectExpedition',targets}),RuleError);
    act(r,k.id,{type:'selectExpedition',targets});
    assert.deepEqual(r.game.pending.participants,[k.id,...targets]);
    assert.throws(()=>act(r,targets[0],{type:'joinExpedition',join:false}),RuleError);
    const outsider=r.players.find(p=>p!==k&&!targets.includes(p.id));
    assert.throws(()=>act(r,outsider.id,{type:'contribute',cards:[]}),RuleError);
  }
});
test('상급 19점 실패·20점 성공·39점 성공·40점 대성공, 반란군 제외 전원 보상/몰수',()=>{
  for(const [score,reward] of [[19,0],[20,15],[39,15],[40,25]]){
    const r=setup(4),k=role(r,'king'),b=role(r,'rebel'),c=role(r,'citizen'),n=role(r,'neutral');
    for(const p of [b,c,n])hand(p,'resource','resource');
    vote(r);act(r,k.id,{type:'selectExpedition',targets:[b.id,n.id]});
    const ids=hand(k,...Array(score).fill('sword'));
    act(r,k.id,{type:'contribute',cards:ids});act(r,b.id,{type:'contribute',cards:[]});
    assert.equal(view(r,n.id).game.pending.total,undefined);
    act(r,n.id,{type:'contribute',cards:[]});
    assert.equal(b.hand.length,2);assert.equal(k.hand.length,reward);
    assert.equal(c.hand.length,reward?2+reward:0);assert.equal(n.hand.length,reward?2+reward:0);
    assert.equal(r.game.phase,'redistribute');
  }
});
test('원정 진영별 카드 사용과 방해 점수 -2/-6 적용, 영구 전쟁병기 보존',()=>{
  for(const name of ['king','citizen','rebel','neutral']){
    const r=setup(),p=role(r,name);
    r.game.phase='expeditionCards';r.game.pending={difficulty:'low',participants:[p.id],done:[],total:0};
    const denied=['king','citizen'].includes(name)?['rebellion','agitation']:name==='rebel'?['infantry','officer']:[];
    for(const type of denied){const ids=hand(p,type);assert.throws(()=>act(r,p.id,{type:'contribute',cards:ids}),RuleError);assert.equal(p.hand.length,1);}
    const types=['weapon','warWeapon',...(['king','citizen'].includes(name)?['infantry','officer']:name==='rebel'?['rebellion','agitation']:['infantry','officer','rebellion','agitation'])];
    const ids=hand(p,...types);const war=p.hand.find(c=>c.type==='warWeapon').id;
    act(r,p.id,{type:'contribute',cards:ids});
    const expected=['king','citizen'].includes(name)?38:name==='rebel'?26:30;
    assert.ok(r.game.logs.some(e=>e.text.includes(`총 공격력 ${expected}점`)));
    assert.ok(p.hand.some(c=>c.id===war));
  }
  assert.equal(expeditionPower('rebellion','neutral'),-2);assert.equal(expeditionPower('agitation','rebel'),-6);
});
test('반란군 방해 때문에 성공 원정이 실패하면 상급 몰수 적용',()=>{
  const r=setup(),k=role(r,'king'),b=role(r,'rebel'),c=role(r,'citizen'),n=role(r,'neutral');
  hand(c,'resource');hand(n,'resource');vote(r);act(r,k.id,{type:'selectExpedition',targets:[b.id,n.id]});
  act(r,k.id,{type:'contribute',cards:hand(k,'northSword')});
  act(r,b.id,{type:'contribute',cards:hand(b,'agitation')});
  act(r,n.id,{type:'contribute',cards:[]});
  assert.ok(r.game.logs.some(e=>e.text.includes('총 공격력 14점')));assert.equal(k.hand.length,0);assert.equal(c.hand.length,0);assert.equal(n.hand.length,0);
});
test('5장 받기: 교체 0/3/5장 선택, 기존 선택 카드만 버림, 6장·중복·위조 거절',()=>{
  for(const replaced of [0,3,5]){
    const r=setup(),p=role(r,'king');r.game.phase='day';r.game.round=3;
    const ids=hand(p,...Array(8).fill('eternalSword'));
    act(r,p.id,{type:'refresh',cards:ids.slice(0,replaced)});
    assert.equal(p.hand.length,13-replaced);assert.ok(ids.slice(replaced).every(id=>p.hand.some(c=>c.id===id)));
    assert.ok(ids.slice(0,replaced).every(id=>!p.hand.some(c=>c.id===id)));
  }
  const r=setup(),p=role(r,'king');r.game.phase='day';r.game.round=3;const ids=hand(p,...Array(6).fill('resource'));
  for(const cards of [ids,[ids[0],ids[0]],['fake']]){assert.throws(()=>act(r,p.id,{type:'refresh',cards}),RuleError);assert.equal(p.hand.length,6);}
});
test('가져오기: 부족한 손패는 전부, 빈 손패도 처리하고 영구 카드도 이전',()=>{
  for(const count of [0,1,2]){
    const r=setup(),k=role(r,'citizen'),b=role(r,'rebel');r.game.phase='day';r.game.round=3;r.game.turn=r.game.order.indexOf(k.id);
    hand(k);const ids=hand(b,...Array(count).fill('warWeapon'));
    act(r,k.id,{type:'steal',target:b.id});assert.equal(b.hand.length,0);assert.deepEqual(k.hand.map(c=>c.id).sort(),ids.sort());
  }
});
test('특수 제작 11종 진영 제한·출력 2장 정확히 적용, 잘못된 진영은 재료 무소모',()=>{
  assert.equal(RECIPES.filter(r=>r.role).length,11);
  for(const recipe of RECIPES.filter(r=>r.role)){
    const index=RECIPES.indexOf(recipe),r=setup(),p=role(r,recipe.role),other=role(r,recipe.role==='king'?'citizen':'king');
    readyCraft(r,p);hand(p,...Array(recipe.count).fill(recipe.input));act(r,p.id,{type:'craft',recipe:index,count:1});
    assert.deepEqual(p.hand.map(c=>c.type),Array(recipe.amount||1).fill(recipe.output));
    r.game.pending=null;readyCraft(r,other);const ids=hand(other,...Array(recipe.count).fill(recipe.input));
    assert.throws(()=>act(r,other.id,{type:'craft',recipe:index,count:1}),RuleError);assert.deepEqual(other.hand.map(c=>c.id),ids);
  }
});
test('고위 마법·병기·화염대검·북부의 검 공통 제작과 새 철혈 경로',()=>{
  const r=setup(),p=role(r,'neutral');readyCraft(r,p);
  for(const output of ['highMagic','weapon','flameSword','northSword']){
    const index=RECIPES.findIndex(r=>r.output===output),recipe=RECIPES[index];
    const types=(recipe.ingredients||[recipe]).flatMap(m=>Array(m.count).fill(m.input));hand(p,...types);
    act(r,p.id,{type:'craft',recipe:index,count:1});assert.deepEqual(p.hand.map(c=>c.type),[output]);
  }
  hand(p,'flameSword','northSword');act(r,p.id,{type:'craft',recipe:RECIPES.findIndex(r=>r.output==='ironSword'),count:1});
  assert.equal(r.status,'finished');assert.equal(r.game.winner.side,'neutral');
});
test('폭탄 설치는 판정 전 비공개, 실패하면 왕·시민만 손패 몰수·중립/반란군 유지',()=>{
  const r=setup(),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel'),n=role(r,'neutral');
  for(const p of [k,c,n])hand(p,...Array(10).fill('resource'));
  r.game.phase='night';r.game.pending={done:[]};act(r,b.id,{type:'revolt',cards:hand(b,'bomb','rebellion')});
  assert.equal(r.game.revolt,8);
  const before=JSON.stringify(view(r,c.id));assert.ok(!before.includes('"bombs":'));assert.ok(!before.includes('폭탄'));
  act(r,k.id,{type:'mediate'});for(const p of r.players.filter(p=>p!==k&&p.role!=='rebel'))act(r,p.id,{type:'contribute',cards:[]});
  act(r,k.id,{type:'contribute',cards:[]});
  assert.equal(k.hand.length,10);assert.equal(c.hand.length,10);assert.equal(n.hand.length,10);assert.equal(b.hand.length,5);
  assert.equal(view(r,c.id).game.lastRevolt.bombs,1);assert.equal(r.game.bombs,0);assert.equal(r.game.revolt,0);
});
test('폭탄 반란 방어 성공 시 몰수 없음·전쟁병기 재사용, 중재 미선택도 폭탄 처리',()=>{
  for(const blocked of [true,false]){
    const r=setup(),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel');
    hand(c,...Array(10).fill('resource'));const war=hand(k,'warWeapon')[0];
    r.game.phase='night';r.game.pending={done:[]};act(r,b.id,{type:'revolt',cards:hand(b,'bomb')});
    if(blocked){act(r,k.id,{type:'mediate'});for(const p of r.players.filter(p=>p!==k&&p.role!=='rebel'))act(r,p.id,{type:'contribute',cards:[]});act(r,k.id,{type:'contribute',cards:[war]});assert.equal(k.hand.length,0);assert.equal(c.hand.length,0);}
    else {act(r,k.id,{type:'expedition'});assert.ok(k.hand.some(c=>c.id===war));assert.equal(c.hand.length,10);}
    assert.equal(r.game.lastRevolt.blocked,blocked);assert.equal(r.game.lastRevolt.bombs,1);
  }
});
test('세금 징수는 3장 정확히 납부·영구 카드 이전·부족하면 전부',()=>{
  const r=setup(3),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel');r.game.phase='evening';
  hand(k);const ids=hand(c,'warWeapon','resource','sword','magic');hand(b,'infantry');act(r,k.id,{type:'tax'});
  assert.throws(()=>act(r,c.id,{type:'payTax',cards:ids.slice(0,2)}),RuleError);
  act(r,c.id,{type:'payTax',cards:ids.slice(0,3)});act(r,b.id,{type:'payTax',cards:b.hand.map(c=>c.id)});
  assert.equal(k.hand.length,4);assert.equal(c.hand.length,1);assert.equal(b.hand.length,0);assert.ok(k.hand.some(c=>c.id===ids[0]));
});
