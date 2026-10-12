import test from 'node:test';
import assert from 'node:assert/strict';
import { act,card,makeRoom,joinRoom,view,RECIPES,visibleRecipes,RuleError } from '../lib/game.js';
import { candidates } from '../lib/ai-policy.js';
function setup(n=5){const r=makeRoom('RULEV3','플레이어1');for(let i=1;i<n;i++)joinRoom(r,`플레이어${i+1}`);act(r,r.host,{type:'start'});return r;}
const role=(r,name)=>r.players.find(p=>p.role===name);
const hand=(p,...types)=>{p.hand=types.map(card);return p.hand.map(c=>c.id);};
function high(r,targets){act(r,role(r,'king').id,{type:'expedition'});for(const p of r.players)act(r,p.id,{type:'voteExpedition',difficulty:'high'});act(r,role(r,'king').id,{type:'selectExpedition',targets});}

test('상급 명단은 왕만 전체, 각 지명자는 자기만 알고 비지명자·공개 기록·도움 카운트에 명단 유출 없음',()=>{
  const r=setup(),k=role(r,'king'),targets=r.players.filter(p=>p!==k).slice(0,3),outsider=r.players.find(p=>p!==k&&!targets.includes(p));
  high(r,targets.map(p=>p.id));
  assert.deepEqual(view(r,k.id).game.pending.participants,[k.id,...targets.map(p=>p.id)]);
  for(const p of targets){const s=view(r,p.id);assert.equal(s.game.pending.isParticipant,true);assert.deepEqual(s.game.pending.participants,[k.id,p.id]);assert.ok(!s.me.notes.some(n=>targets.filter(t=>t!==p).some(t=>n.text.includes(t.name))));}
  const out=view(r,outsider.id);assert.equal(out.game.pending.isParticipant,false);assert.deepEqual(out.game.pending.participants,[k.id]);
  const announcement=r.game.logs.at(-1).text;assert.ok(targets.every(p=>!announcement.includes(p.name)));
  act(r,k.id,{type:'contribute',cards:hand(k,'weapon')});
  assert.equal(view(r,outsider.id).game.pending.contributorCount,1);
  act(r,targets[0].id,{type:'contribute',cards:[]});assert.equal(view(r,outsider.id).game.pending.contributorCount,1);
  act(r,targets[1].id,{type:'contribute',cards:hand(targets[1],'sword')});assert.equal(view(r,outsider.id).game.pending.contributorCount,2);
  act(r,targets[2].id,{type:'contribute',cards:[]});
  assert.equal(view(r,outsider.id).game.lastExpedition.contributorCount,2);
  assert.equal(view(r,outsider.id).game.lastExpedition.participants,undefined);
  assert.ok(!JSON.stringify(r.game.logs).includes('강제 참가자:'));
});
test('반란군은 지원/0장 제출/선포 모두 금지, 시민·중립만 완료하면 왕 차례로 넘어감',()=>{
  const r=setup(4),k=role(r,'king'),c=role(r,'citizen'),b=role(r,'rebel'),n=role(r,'neutral');
  r.game.revolt=10;act(r,k.id,{type:'mediate'});
  const ids=hand(b,'warWeapon');
  for(const cards of [[],ids])assert.throws(()=>act(r,b.id,{type:'contribute',cards}),RuleError);
  assert.throws(()=>act(r,b.id,{type:'mediate'}),RuleError);assert.equal(b.hand[0].id,ids[0]);
  assert.deepEqual(candidates(view(r,b.id)),[]);
  act(r,c.id,{type:'contribute',cards:hand(c,'infantry')});assert.equal(view(r,k.id).game.pending.helperCount,1);
  act(r,n.id,{type:'contribute',cards:[]});assert.equal(r.game.phase,'mediationKing');
  act(r,k.id,{type:'contribute',cards:hand(k,'warWeapon')});
  assert.equal(r.game.lastRevolt.helperCount,1);assert.equal(r.game.lastRevolt.blocked,true);
});
test('공개 제작은 공통 9종, 본인 진영별 왕13/시민12/반란군13/중립9종만 제공',()=>{
  const r=setup(4);assert.equal(RECIPES.length,32);assert.equal(visibleRecipes(null).length,9);
  for(const [name,count] of [['king',13],['citizen',12],['rebel',13],['neutral',9]]){
    const p=role(r,name),recipes=view(r,p.id).me.recipes;assert.equal(recipes.length,count);
    assert.ok(recipes.every(recipe=>!recipe.role||recipe.role===name));
    assert.ok(recipes.every(recipe=>RECIPES[recipe.id].output===recipe.output));
  }
});
test('왕도 선동→반란→보병→장교를 반복 제작하고 다른 진영 레시피 ID 사용은 거부',()=>{
  const r=setup(4),k=role(r,'king');r.game.phase='day';r.game.round=2;
  hand(k,...Array(6).fill('agitation'));act(r,k.id,{type:'beginCraft'});
  const recipe=output=>RECIPES.findIndex(r=>r.role==='king'&&r.output===output);
  assert.throws(()=>act(r,k.id,{type:'craft',recipe:RECIPES.findIndex(r=>r.role==='citizen'&&r.output==='rebellion'),count:1}),RuleError);
  act(r,k.id,{type:'craft',recipe:recipe('rebellion'),count:6});act(r,k.id,{type:'craft',recipe:recipe('infantry'),count:3});act(r,k.id,{type:'craft',recipe:recipe('officer'),count:1});
  assert.deepEqual(k.hand.map(c=>c.type),['officer']);
});
test('두 특수 검은 영구 재료만 인정하고 부족/일반 재료는 무소모 거부, 영구 재료도 제작 때 소모',()=>{
  for(const [output,swords,magics] of [['flameSword',10,5],['northSword',2,10]]){
    const r=setup(4),k=role(r,'king'),recipe=RECIPES.findIndex(r=>r.output===output);r.game.phase='day';r.game.round=2;act(r,k.id,{type:'beginCraft'});
    const wrong=hand(k,...Array(swords).fill('sword'),...Array(magics).fill('magic'),...Array(20).fill('resource'));
    assert.throws(()=>act(r,k.id,{type:'craft',recipe,count:1}),RuleError);assert.deepEqual(k.hand.map(c=>c.id),wrong);
    const ids=hand(k,...Array(swords).fill('eternalSword'),...Array(magics).fill('eternalMagic'),...Array(20).fill('resource'));
    act(r,k.id,{type:'craft',recipe,count:1});assert.deepEqual(k.hand.map(c=>c.type),[output]);assert.ok(ids.every(id=>!k.hand.some(c=>c.id===id)));
  }
});
test('카드 도난은 피해자 개인 알림·개수 제공, 제3자/가져온 사람에게 피해 알림 유출 없음',()=>{
  const r=setup(4),k=role(r,'citizen'),victim=role(r,'rebel'),other=role(r,'neutral');r.game.phase='day';r.game.round=3;r.game.turn=r.game.order.indexOf(k.id);
  hand(victim,'warWeapon','magic','resource','infantry');act(r,k.id,{type:'steal',target:victim.id});
  const notification=victim.notes.at(-1);assert.equal(notification.effect,'stolen');assert.equal(notification.details.count,2);assert.match(notification.text,/빼앗겼습니다/);
  assert.ok(!JSON.stringify(view(r,other.id)).includes(notification.id));assert.ok(!JSON.stringify(view(r,k.id)).includes(notification.id));
});
