import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,canAct} from '../lib/game.js';
function setup(){const r=makeRoom('COST','왕');for(let i=0;i<2;i++)joinRoom(r,`P${i}`);act(r,r.host,{type:'start'});return r;}
const swords=n=>Array.from({length:n},(_,i)=>({id:`s${i}`,type:'sword'}));
test('왕 정책 뒤 결투 시작, 신청 칼 2장·거절 칼 1장 비용',()=>{
 const r=setup(),k=r.players.find(p=>p.role==='king'),target=r.players.find(p=>p!==k);
 r.game.phase='evening';r.game.pending=null;k.hand=swords(2);
 act(r,k.id,{type:'aid'});assert.equal(r.game.phase,'eveningDuel');assert.equal(canAct(r,k.id),true);
 act(r,k.id,{type:'battle',target:target.id});assert.equal(k.hand.length,0);
 target.hand=[];assert.throws(()=>act(r,target.id,{type:'battleAnswer',accept:false}),/칼 카드 1/);
 target.hand=[{id:'reject',type:'sword'}];act(r,target.id,{type:'battleAnswer',accept:false});assert.equal(target.hand.length,0);
 assert.equal(r.game.pending.kind,undefined);
});
test('결투·습격 비용 부족은 상태 변경 없이 거부',()=>{
 const r=setup(),k=r.players.find(p=>p.role==='king'),rebel=r.players.find(p=>p.role==='rebel');
 r.game.phase='eveningDuel';r.game.pending={queue:[k.id],index:0};k.hand=swords(1);
 assert.throws(()=>act(r,k.id,{type:'battle',target:rebel.id}),/칼 카드 2/);assert.equal(k.hand.length,1);
 r.game.phase='ambush';r.game.pending={queue:[rebel.id],index:0};rebel.hand=swords(1);
 assert.throws(()=>act(r,rebel.id,{type:'ambush',target:k.id}),/칼 카드 2/);
 rebel.hand=swords(2);act(r,rebel.id,{type:'ambush',target:k.id});assert.equal(rebel.hand.length,0);assert.equal(r.game.pending.accepted,true);
});
test('낮에 결투 신청 불가',()=>{const r=setup();r.game.phase='day';r.game.round=1;r.game.turn=0;r.game.pending=null;const p=r.players.find(p=>p.id===r.game.order[0]);assert.throws(()=>act(r,p.id,{type:'battle',target:r.players.find(q=>q!==p).id}));});
