import test from 'node:test';
import assert from 'node:assert/strict';
import {act,card,makeRoom,joinRoom,view,RECIPES,RuleError} from '../lib/game.js';
function lobby(n=5){const r=makeRoom('CITIZE','1');for(let i=1;i<n;i++)joinRoom(r,String(i+1));return r;}
function setup(jobs=[],n=5){const r=lobby(n);if(n===5)act(r,r.host,{type:'config',roles:{king:1,citizen:2,rebel:1,neutral:1}});act(r,r.host,{type:'citizenJobs',jobs});act(r,r.host,{type:'start'});return r;}
const hand=(p,...types)=>{p.hand=types.map(card);return p.hand.map(c=>c.id);};
test('왕 시작20·재분배20·손패제한50, 나머지는12·30',()=>{
 const r=setup(),k=r.players.find(p=>p.role==='king'),c=r.players.find(p=>p.role==='citizen'),b=r.players.find(p=>p.role==='rebel');assert.equal(k.hand.length,20);assert.equal(c.hand.length,12);
 hand(k,...Array(51).fill('resource'));hand(c,...Array(31).fill('resource'));r.game.phase='night';r.game.pending={done:[]};act(r,b.id,{type:'revolt',cards:[]});assert.equal(k.hand.length,50);assert.equal(c.hand.length,30);
 r.game.phase='redistribute';r.game.pending={done:[]};act(r,k.id,{type:'redistribute',accept:true});assert.equal(k.hand.length,20);assert.equal(view(r,k.id).me.handLimit,50);
});
test('선택 시민 직업 중복 없음·일반 시민 유지·권한/인원 검증·3인에도 직업 선택',()=>{
 const r=setup(['hunter']),cs=r.players.filter(p=>p.role==='citizen');assert.equal(cs.filter(p=>p.job==='hunter').length,1);assert.equal(cs.filter(p=>!p.job).length,1);
 const both=setup(['hunter','blacksmith']);assert.equal(both.players.filter(p=>p.job==='hunter').length,1);assert.equal(both.players.filter(p=>p.job==='blacksmith').length,1);
 const l=lobby(3);for(const jobs of [['hunter','hunter'],['hunter','blacksmith'],['fake']])assert.throws(()=>act(l,l.host,{type:'citizenJobs',jobs}),RuleError);assert.throws(()=>act(l,l.players[1].id,{type:'citizenJobs',jobs:[]}),RuleError);
 act(l,l.host,{type:'citizenJobs',jobs:['hunter']});act(l,l.host,{type:'start'});assert.equal(l.players.find(p=>p.role==='citizen').job,'hunter');
});
test('사냥꾼 첫날 도끼1·매일아침1,8점 성공8장·도끼 일회용·전용 자원제작',()=>{
 const r=setup(['hunter']),h=r.players.find(p=>p.job==='hunter'),b=r.players.find(p=>p.role==='rebel');assert.equal(h.hand.length,13);assert.equal(h.hand.filter(c=>c.type==='huntingAxe').length,1);
 r.game.phase='night';r.game.pending={done:[]};act(r,b.id,{type:'revolt',cards:[]});assert.equal(h.hand.filter(c=>c.type==='huntingAxe').length,2);
 r.game.phase='day';r.game.round=2;r.game.turn=r.game.order.indexOf(h.id);const ids=hand(h,'huntingAxe','sword','sword','sword');act(r,h.id,{type:'hunt',cards:ids});assert.equal(h.hand.length,8);assert.ok(ids.every(id=>!h.hand.some(c=>c.id===id)));
 r.game.turn=r.game.order.indexOf(h.id);r.game.round=2;hand(h,'huntingAxe');act(r,h.id,{type:'beginCraft'});act(r,h.id,{type:'craft',recipe:RECIPES.findIndex(r=>r.job==='hunter'),count:1});assert.deepEqual(h.hand.map(c=>c.type),['resource']);
});
test('일반 사냥10점 성공8장·9점 실패',()=>{
 for(const score of [9,10]){const r=setup(),p=r.players.find(p=>p.role==='king');r.game.phase='day';r.game.round=2;r.game.turn=0;act(r,p.id,{type:'hunt',cards:hand(p,...Array(score).fill('sword'))});assert.equal(p.hand.length,score===10?8:0);}
});
test('대장장이 낮 보급1~10은 하루 한번 개인 알림·채집9·전용제작2종',()=>{
 const r=setup(['blacksmith']),s=r.players.find(p=>p.job==='blacksmith'),other=r.players.find(p=>p!==s);r.game.phase='redistribute';r.game.pending={done:[]};for(const p of r.players)act(r,p.id,{type:'redistribute',accept:false});
 const n=s.notes.find(n=>n.details?.kind==='blacksmithSupply');assert.ok(n.details.count>=1&&n.details.count<=10);assert.equal(s.hand.filter(c=>c.type==='resource').length>=n.details.count,true);assert.ok(!JSON.stringify(view(r,other.id)).includes(n.id));
 const before=s.hand.length;view(r,s.id);assert.equal(s.hand.length,before);r.game.turn=r.game.order.indexOf(s.id);r.game.round=2;hand(s);act(r,s.id,{type:'gather'});assert.ok(s.hand.length>=5&&s.hand.length<=12);
 r.game.round=2;r.game.turn=r.game.order.indexOf(s.id);act(r,s.id,{type:'beginCraft'});for(const recipe of view(r,s.id).me.recipes.filter(r=>r.job==='blacksmith')){hand(s,...Array(recipe.count).fill(recipe.input));act(r,s.id,{type:'craft',recipe:recipe.id,count:1});assert.deepEqual(s.hand.map(c=>c.type),[recipe.output]);}
});
test('다른 시민 직업과 타진영은 전용 레시피 사용 불가·직업 비공개',()=>{
 const r=setup(['hunter','blacksmith']),h=r.players.find(p=>p.job==='hunter'),s=r.players.find(p=>p.job==='blacksmith'),k=r.players.find(p=>p.role==='king');assert.equal(view(r,k.id).players.find(p=>p.id===h.id).job,null);
 r.game.phase='day';r.game.round=2;r.game.turn=r.game.order.indexOf(h.id);hand(h,'eternalSword','eternalSword');act(r,h.id,{type:'beginCraft'});assert.throws(()=>act(r,h.id,{type:'craft',recipe:RECIPES.findIndex(r=>r.job==='blacksmith'),count:1}),RuleError);assert.ok(view(r,h.id).me.recipes.every(r=>r.job!=='blacksmith'));
});
