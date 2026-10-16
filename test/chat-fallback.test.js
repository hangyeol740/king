import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('계획 API 실패해도 사람 메시지에는 AI 대체 발언을 남김',async()=>{
 const r=makeRoom('TALK','human');joinRoom(r,'bot');joinRoom(r,'other');act(r,r.host,{type:'start'});const bot=r.players[1];bot.bot=true;
 const agent=createCognitiveAgent({reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async()=>{throw Error('timeout');}},changed:async()=>{},failed:()=>{}});
 try{chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'원정 같이 갈래?'});await agent.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'원정 같이 갈래?'});assert.equal(chatView(r,r.players[0]).public.length,2);assert.match(chatView(r,r.players[0]).public.at(-1).text,/난이도|성공 조건/);}finally{agent.close();}
});
