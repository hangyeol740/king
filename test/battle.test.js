import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';
test('전투는 양쪽 확정 후 판정하고 영구 카드·남은 손패를 유지',()=>{
 const r=makeRoom('BATTLE','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});
 r.game.phase='day';r.game.round=1;const a=r.players.find(p=>p.id===r.game.order[0]),b=r.players.find(p=>p!==a);
 a.hand=[card('eternalSword'),card('sword'),card('resource')];b.hand=[card('sword'),card('resource')];
 act(r,a.id,{type:'battle',target:b.id});act(r,b.id,{type:'battleAnswer',accept:true});
 act(r,a.id,{type:'battleSubmit',cards:a.hand.slice(0,2).map(c=>c.id)});
 assert.equal(view(r,b.id).game.pending.myDone,false);assert.equal(a.hand.length,3);
 act(r,b.id,{type:'battleSubmit',cards:[b.hand[0].id]});
 assert.deepEqual(a.hand.map(c=>c.type),['eternalSword','resource']);assert.deepEqual(b.hand.map(c=>c.type),['resource']);
 assert.ok(a.notes.some(n=>n.text.includes('전투 승리')));assert.ok(b.notes.some(n=>n.text.includes('전투 패배')));
});
