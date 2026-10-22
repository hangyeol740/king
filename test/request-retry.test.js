import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('형식/행동 오류의 재판단은 오류 원인을 전달하고 실패행동을 실행하지 않음',async()=>{
 const r=makeRoom('RETRY','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players.find(p=>p.role==='king');bot.bot=true;let calls=0,feedback;
 const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async(_s,c)=>{calls++;if(calls===1)return {choice:999,commitmentChoice:null};feedback=c.validationError;return {choice:0,commitmentChoice:null,futureCommitment:null,communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'',assessment:'',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false};}},failed:()=>{}});
 try{const result=await agent.deliberate(r,bot,{channel:'public',type:'action'},false);assert.ok(result.plan);assert.equal(feedback,'invalid_choice');assert.equal(r.game.phase,'morning');assert.equal(calls,2);}finally{agent.close();}
});
