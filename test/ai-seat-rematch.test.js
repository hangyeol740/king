import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,act,damagePlayer} from '../lib/game.js';
import {repairAISeats} from '../lib/repair-ai-seats.js';
test('사망한 AI는 재경기 후에도 AI, 사람은 사람으로 유지',()=>{
 const r=makeRoom('REPRO','사람');act(r,r.host,{type:'addBot'});act(r,r.host,{type:'addBot'});act(r,r.host,{type:'start'});
 const p=r.players.find(p=>p.bot&&p.role!=='king');damagePlayer(r,p,3);r.status='finished';r.game.phase='finished';
 act(r,r.host,{type:'rematch'});assert.equal(p.bot,true);assert.equal(p.dead,false);assert.equal(r.players[0].bot,undefined);
 act(r,r.host,{type:'start'});assert.equal(p.bot,true);
});
test('이전 데이터의 사망 AI도 bot 값을 보존',()=>{
 const r=makeRoom('LEGACY','사람');act(r,r.host,{type:'addBot'});const p=r.players[1];delete p.seatKind;p.surrendered=true;p.dead=true;r.status='finished';
 act(r,r.host,{type:'rematch'});assert.equal(p.bot,true);
});
test('복구는 확인된 방/참가자 ID에만 적용, 이름으로는 변경하지 않음',()=>{
 const p={id:'e2edf32d-944d-47ff-8af4-6c77abb0ef63',bot:false};const human={id:'other',name:'루카 [AI 1]',bot:false};
 assert.deepEqual(repairAISeats({code:'4XYEKF',players:[p,human]}),[p.id]);assert.equal(p.bot,true);assert.equal(human.bot,false);
});
