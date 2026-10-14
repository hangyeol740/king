import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,act,card,view,handLimit} from '../lib/game.js';
test('AI 난이도 변경은 방장만 가능하고 손패 제한에 반영',()=>{
 const r=makeRoom('LEVEL1','host');act(r,r.host,{type:'addBot'});const bot=r.players[1];
 assert.throws(()=>act(r,bot.id,{type:'botDifficulty',target:bot.id,difficulty:'chaos'}));
 act(r,r.host,{type:'botDifficulty',target:bot.id,difficulty:'chaos'});act(r,r.host,{type:'start'});
 assert.equal(view(r,bot.id).me.handLimit,(bot.role==='king'?50:30)+25);
 assert.equal(handLimit('citizen',{bot:true,difficulty:'veryEasy'}),20);
});
test('제작 재료 반환과 밤 추가 행동은 지정 확률에 따라 적용',()=>{
 const r=makeRoom('LEVEL2','host');act(r,r.host,{type:'addBot'});const bot=r.players[1];act(r,r.host,{type:'start'});
 bot.difficulty='chaos';bot.role='rebel';r.players[0].role='king';r.game.phase='day';r.game.round=2;r.game.turn=r.game.order.indexOf(bot.id);bot.hand=[card('resource'),card('resource')];
 const random=Math.random;try{
  Math.random=()=>0;
  act(r,bot.id,{type:'beginCraft'});act(r,bot.id,{type:'craft',recipe:0,count:1});
  assert.deepEqual(bot.hand.map(c=>c.type),['resource','resource','sword']);
  r.game.phase='night';r.game.pending={done:[]};bot.hand=[card('rebellion')];
  act(r,bot.id,{type:'revolt',cards:[bot.hand[0].id]});assert.equal(r.game.phase,'night');assert.ok(!r.game.pending.done.includes(bot.id));
  act(r,bot.id,{type:'revolt',cards:[]});assert.notEqual(r.game.phase,'night');
 }finally{Math.random=random;}
});
