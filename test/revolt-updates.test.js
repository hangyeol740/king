import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,revoltGoal,mediationPower} from '../lib/game.js';

function setup(){const room=makeRoom('UPDATED','왕');for(let i=0;i<4;i++)joinRoom(room,`참가자${i}`);act(room,room.host,{type:'start'});return room;}
test('반란 승리 목표는 3인 2일, 4인 3일, 5인 이상 4일',()=>{
  assert.deepEqual([3,4,5,6,8].map(revoltGoal),[2,3,4,4,4]);
});
test('종교 중재의 반란군 카드 값과 금지 카드',()=>{
  assert.equal(mediationPower('rebellion','rebel','religion'),3);
  assert.equal(mediationPower('agitation','rebel','religion'),8);
  for(const type of ['infantry','officer','church','evangelism'])assert.equal(mediationPower(type,'rebel','religion'),0);
  assert.equal(mediationPower('officer','citizen','religion'),7);
});
test('종교 중재에 반란군이 반란/선동으로 11점 지원하고 보병은 거부',()=>{
  const room=setup(),rebel=room.players.find(p=>p.role==='rebel');
  room.game.phase='mediationSupport';room.game.pending={revoltType:'religion',done:[],supporters:[],total:0};
  rebel.hand=[{id:'r',type:'rebellion'},{id:'a',type:'agitation'},{id:'i',type:'infantry'}];
  assert.throws(()=>act(room,rebel.id,{type:'contribute',cards:['i']}));
  assert.equal(rebel.hand.length,3);
  act(room,rebel.id,{type:'contribute',cards:['r','a']});
  assert.equal(room.game.pending.total,11);
  assert.deepEqual(rebel.hand.map(c=>c.id),['i']);
});
test('여러 반란군 합산 폭탄 4개까지만 설치, 초과 제출은 상태 변경 없음',()=>{
  const room=setup(),rebel=room.players.find(p=>p.role==='rebel');
  room.game.phase='night';room.game.pending={done:[]};room.game.revolt=0;room.game.bombs=3;
  rebel.hand=[{id:'b1',type:'bomb'},{id:'b2',type:'bomb'}];
  assert.throws(()=>act(room,rebel.id,{type:'revolt',cards:['b1','b2']}),/최대 4개/);
  assert.equal(room.game.bombs,3);assert.equal(room.game.revolt,0);assert.equal(rebel.hand.length,2);
  act(room,rebel.id,{type:'revolt',cards:['b1']});
  assert.equal(room.game.bombs,4);
});
