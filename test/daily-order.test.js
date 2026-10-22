import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
test('다음 아침 왕이 첫 번째이며 모두에게 자기 순서만 개인 알림',()=>{
 const r=makeRoom('ORDER','왕');for(let i=0;i<4;i++)joinRoom(r,`참가${i}`);act(r,r.host,{type:'start'});
 const rebel=r.players.find(p=>p.role==='rebel');
 r.game.phase='night';r.game.pending={done:[]};r.game.revolt=0;
 act(r,rebel.id,{type:'revolt',cards:[]});
 assert.equal(r.game.day,2);assert.equal(r.game.order[0],r.game.king);
 assert.equal(new Set(r.game.order).size,r.players.length);
 for(const p of r.players){const n=p.notes.findLast(n=>n.effect==='turnOrder');assert.ok(n.text.includes('2일 차'));assert.ok(n.text.includes(`${r.game.order.indexOf(p.id)+1}번째`));}
});
