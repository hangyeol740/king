import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('시간초과 후 최신 차례에서 재판단하며 실패 응답은 실행하지 않음',async()=>{
 const room=makeRoom('TIMEOUT','a');joinRoom(room,'b');joinRoom(room,'c');act(room,room.host,{type:'start'});
 const bot=room.players.find(p=>p.role==='king');bot.bot=true;let now=100,calls=0,seen;
 const agent=createCognitiveAgent({clock:()=>now,failed:()=>{},changed:async()=>{},client:{enabled:true,diagnostics:()=>({}),ask:async(_system,c)=>{
  if(++calls===1)throw Error('timeout');seen=c;
  return {choice:c.legalActions.find(a=>a.type==='expedition').index,commitmentChoice:null,futureCommitment:null,communication:'silent',silenceReason:'행동만 선택',text:'',goal:c.objective.goal,desiredBelief:'',assessment:'',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false};
 }}});
 try{
  assert.equal((await agent.deliberate(room,bot,{channel:'public',type:'action'},false)).error,true);
  assert.equal(room.game.phase,'morning');assert.deepEqual(await agent.beforeAction(room,bot),{wait:true});
  now=bot.aiStatus.retryAfter+1;room.game.day=2;
  const result=await agent.deliberate(room,bot,{channel:'public',type:'action'},false);
  assert.equal(seen.previousError,'timeout');assert.equal(seen.state.game.day,2);assert.equal(result.plan.action.type,'expedition');assert.equal(room.game.phase,'morning');
 }finally{agent.close();}
});
