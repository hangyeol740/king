import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
function setup(){const r=makeRoom('HUMAN','human');joinRoom(r,'bot');joinRoom(r,'other');act(r,r.host,{type:'start'});r.players[1].bot=true;return r;}
const result=c=>({choice:c.legalActions[0]?.index??null,commitmentChoice:null,futureCommitment:null,socialChoice:null,communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'조건 확인',assessment:'근거 부족',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false});
test('반복된 관찰은 대화 예산과 무관하게 기억하지만 같은 상태를 다시 판단하지 않음',async()=>{
 const r=setup();let calls=0;const agent=createCognitiveAgent({reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{calls++;return result(c);}},changed:async()=>{}});
 try{agent.observe(r);await new Promise(resolve=>setTimeout(resolve,20));agent.observe(r);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls,1);assert.ok(r.players[1].agentMind.lastObservation);}finally{agent.close();}
});
test('필수 행동을 생각 중이면 임의 행동 대신 판단 완료를 기다림',async()=>{
 const r=setup(),bot=r.players[1];r.game.phase='executionVote';r.game.pending={done:[],votes:{}};
 let release,context;const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{context=c;return await new Promise(resolve=>{release=resolve;});}},changed:async()=>{}});
 try{const pending=agent.deliberate(r,bot,{channel:'public',type:'action',text:'생각해봐'},false);await new Promise(resolve=>setTimeout(resolve,5));assert.deepEqual(await agent.beforeAction(r,bot),{wait:true});release(result(context));await pending;}finally{agent.close();}
});
test('AI 발언은 새 질문이나 제안이 없으면 다른 AI의 새 발언을 강제하지 않음',async()=>{
 const r=setup(),[human,bot,other]=r.players;other.bot=true;let calls=0;const agent=createCognitiveAgent({reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{calls++;return {...result(c),communication:'answer',text:'확인했습니다.'};}},changed:async()=>{}});
 try{chatAct(r,human,{type:'chatSend',channel:'public',text:'상태 알려줘?'});await agent.respond(r,human,{type:'chatSend',channel:'public',text:'상태 알려줘?'});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,4);assert.equal(r.chat.public.filter(m=>m.sender===bot.id||m.sender===other.id).length,2);}finally{agent.close();}
});
