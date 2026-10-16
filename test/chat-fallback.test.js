import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('계획 API 실패를 기계적인 접수 문구로 위장하지 않고 진단에 기록',async()=>{
 const r=makeRoom('TALK','human');joinRoom(r,'bot');joinRoom(r,'other');act(r,r.host,{type:'start'});const bot=r.players[1];bot.bot=true;
 const agent=createCognitiveAgent({reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async()=>{throw Error('timeout');}},changed:async()=>{},failed:()=>{}});
  try{chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'원정 같이 갈래?'});await agent.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'원정 같이 갈래?'});assert.equal(chatView(r,r.players[0]).public.length,1);assert.equal(agent.diagnostics().lastDecisionError,'timeout');assert.equal(agent.diagnostics().spoken,0);}finally{agent.close();}
});
