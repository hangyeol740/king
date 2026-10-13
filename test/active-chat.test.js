import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatEnabled,chatAct,chatView,botChat,respondToChat} from '../lib/chat.js';
import {createOpenAIChat} from '../lib/openai-chat.js';
function setup(){const r=makeRoom('ACTIVE','사람');joinRoom(r,'AI1');joinRoom(r,'AI2');r.players[1].bot=true;r.players[2].bot=true;act(r,r.host,{type:'start'});return r;}
test('혼자+AI 오프라인도 채팅 가능, 공유 오프라인은 차단',()=>{const r=setup();r.mode='offline';assert.equal(chatEnabled(r),true);chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});respondToChat(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});assert.equal(chatView(r,r.players[0]).public.length,2);r.players[2].bot=false;assert.equal(chatEnabled(r),false);});
test('AI는 질문에도 응답하고 자발 발언을 제한된 간격으로 보냄',()=>{const r=setup();botChat(r,r.players[1],{type:'gather'});assert.equal(chatView(r,r.players[0]).public.length,1);botChat(r,r.players[1],{type:'hunt'});assert.equal(chatView(r,r.players[0]).public.length,1);respondToChat(r,r.players[0],{type:'chatSend',channel:'public',text:'어떻게 생각해?'});assert.equal(chatView(r,r.players[0]).public.length,2);});
test('OpenAI 오류여도 기본 AI 응답으로 대화 유지',async()=>{const r=setup();let changed=0;const api=createOpenAIChat({apiKey:'test',fetcher:async()=>({ok:false,status:429}),failed:()=>{},changed:async()=>{changed++;}});await api.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});assert.equal(changed,1);assert.equal(chatView(r,r.players[0]).public.length,1);});
