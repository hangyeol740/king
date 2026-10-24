import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {compatiblePolicy} from '../ai/transfer.js';
import {stepServerlessAI} from '../lib/serverless-ai.js';

test('Vercel 요청 사이 JSON 복원 후에도 AI 판단 이력이 유지됨',()=>{
 const policy=compatiblePolicy(JSON.parse(fs.readFileSync('models/strategy-v10-robust2.json')));
 let room=makeRoom('HTTPAI','사람');joinRoom(room,'AI');joinRoom(room,'다른사람');act(room,room.host,{type:'start'});
 let bot=room.players.find(p=>p.id===room.game.order[0]);bot.bot=true;
 const botId=bot.id;
 room.game.phase='day';room.game.round=2;room.game.turn=0;room.game.pending={kind:'craft'};
 bot.hand=Array.from({length:24},(_,i)=>({id:`res-${i}`,type:'resource'}));
 stepServerlessAI(room,policy,()=>.3);
 const first=room.players.find(p=>p.id===botId).serverlessDecisionContext;
 assert.ok(first);assert.equal(first.decisions,1);
 room=JSON.parse(JSON.stringify(room));bot=room.players.find(p=>p.id===botId);
 assert.deepEqual(bot.serverlessDecisionContext.visited,first.visited);
 if(room.game.pending?.kind==='craft'){
   stepServerlessAI(room,policy,()=>.3);
   assert.equal(bot.serverlessDecisionContext.decisions,2);
 }
});
