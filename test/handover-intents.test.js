import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';import {chatAct} from '../lib/chat.js';import {extractHandoverIntents} from '../lib/handover-intents.js';import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('사람 의사 인계는 본인 발언을 근거로 추출하고 실제 대체 판단 입력으로 연결',async()=>{
 const r=makeRoom('INHERIT','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players.find(p=>p.role==='citizen');chatAct(r,bot,{type:'chatSend',channel:'public',text:'내일 조건이 맞으면 지원할게.'});bot.takeover=true;let saw=false;
 const client={enabled:true,diagnostics:()=>({}),ask:async(system,c)=>{
  if(system.startsWith('자리를 넘긴'))return {intents:[{type:'contribute',targetName:null,day:2,phase:'mediationSupport',points:null,pointMode:null,evidenceIds:[c.history.find(m=>m.self).id],uncertain:true,conditionsText:'조건이 맞으면'}]};
  saw=c.inheritedIntents?.[0].uncertain===true;return {choice:null,commitmentChoice:null,futureCommitment:null,communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'',assessment:'',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false};
 }};
 const agent=createCognitiveAgent({client,changed:async()=>{},failed:e=>{throw Error(e);}});
 try{const result=await agent.deliberate(r,bot,{channel:'public',type:'observation'},false);assert.ok(result.plan);assert.equal(saw,true);assert.equal(bot.agentMind.handoverIntents['public/'][0].uncertain,true);}finally{agent.close();}
});
