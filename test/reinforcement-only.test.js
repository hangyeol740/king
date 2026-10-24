import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient} from '../lib/agent-client.js';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {makeRoom,joinRoom} from '../lib/game.js';
import {chatAct,chatView,botChat,respondToChat} from '../lib/chat.js';

test('명시적인 API 키와 fetcher가 있어도 외부 AI를 호출하지 않음',async()=>{
 let calls=0;
 const options={apiKey:'test-key',baseURL:'https://example.com/v1',fetcher:async()=>{calls++;throw Error('unexpected network');}};
 const client=createAgentClient(options),chat=createOpenAIChat(options);
 assert.equal(client.enabled,false);assert.equal(chat.enabled,false);
 await assert.rejects(client.ask('test',{}),/external_ai_disabled/);
 await chat.respond({}, {}, {type:'chatSend',channel:'public',text:'안녕'});
 assert.equal(calls,0);assert.equal(client.diagnostics().attempts,0);
});

test('AI 자동 발언·응답과 AI를 대상으로 하는 랜덤 매칭 제거',()=>{
 const room=makeRoom('LOCAL','사람'),human=room.players[0];joinRoom(room,'AI');const bot=room.players[1];bot.bot=true;bot.online=true;
 chatAct(room,human,{type:'chatSend',channel:'public',text:'원정 같이 갈래?'});
 botChat(room,bot,{type:'expedition'});respondToChat(room,human,{type:'chatSend',channel:'public',text:'안녕'});
 assert.equal(chatView(room,human).public.length,1);
 assert.throws(()=>chatAct(room,human,{type:'pairRequest'}),/다른 플레이어/);
 joinRoom(room,'사람2');room.players[2].online=true;
 chatAct(room,human,{type:'pairRequest'});
 assert.equal(room.chat.requests[0].to,room.players[2].id);
});
