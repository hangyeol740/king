import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';
test('전투는 양쪽 확정 후 비영구 제출카드를 소모하고 패자의 남은 손패를 승자에게 이전',()=>{
 const r=makeRoom('BATTLE','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});
 r.game.phase='day';r.game.round=1;const a=r.players.find(p=>p.id===r.game.order[0]),b=r.players.find(p=>p!==a);
 a.hand=[card('eternalSword'),card('sword'),card('resource')];b.hand=[card('sword'),card('resource')];
 act(r,a.id,{type:'battle',target:b.id});act(r,b.id,{type:'battleAnswer',accept:true});
 act(r,a.id,{type:'battleSubmit',cards:a.hand.slice(0,2).map(c=>c.id)});
 assert.equal(view(r,b.id).game.pending.myDone,false);assert.equal(a.hand.length,3);
 act(r,b.id,{type:'battleSubmit',cards:[b.hand[0].id]});
 assert.deepEqual(a.hand.map(c=>c.type),['eternalSword','resource','resource']);assert.deepEqual(b.hand,[]);
 assert.ok(a.notes.some(n=>n.text.includes('전투 승리')));assert.ok(b.notes.some(n=>n.text.includes('전투 패배')));
});
test('전투 동점은 비영구 제출 카드만 버리고 양측 남은 손패 유지',()=>{
 const r=makeRoom('TIE001','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});
 r.game.phase='day';r.game.round=1;const a=r.players.find(p=>p.id===r.game.order[0]),b=r.players.find(p=>p!==a);
 a.hand=[card('sword'),card('resource')];b.hand=[card('sword'),card('eternalSword')];
 act(r,a.id,{type:'battle',target:b.id});act(r,b.id,{type:'battleAnswer',accept:true});
 act(r,a.id,{type:'battleSubmit',cards:[a.hand[0].id]});act(r,b.id,{type:'battleSubmit',cards:[b.hand[0].id]});
 assert.deepEqual(a.hand.map(c=>c.type),['resource']);assert.deepEqual(b.hand.map(c=>c.type),['eternalSword']);
 assert.ok(a.notes.some(n=>n.text.includes('전투 무승부')));assert.ok(b.notes.some(n=>n.text.includes('전투 무승부')));
});
