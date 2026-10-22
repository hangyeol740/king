import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIChat,applyChatPreference} from '../lib/openai-chat.js';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {personaFor} from '../lib/conversation.js';
import {createSupabaseStore} from '../lib/persistent-store.js';
test('OpenAI에는 본인 상태와 해당 채널만 전송·의도 저장·합법 확률만 보정',async()=>{
 const r=makeRoom('API','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});const bot=r.players[1];bot.bot=true;bot.socialStrategy={key:`${r.game.day}/${r.game.phase}`,mode:'honest'};let body;const other=r.players[2];other.hand=[card('shiningSword')];
 chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'중재 도와줘'});
 personaFor(bot,r.game);bot.socialStrategy={key:`${r.game.day}/${r.game.phase}`,mode:'honest'};
 const api=createOpenAIChat({apiKey:'test',fetcher:async(url,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'지원 요청 확인했어요.',intent:'mediation'})}}]})};},changed:async()=>{}});
  await api.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'중재 도와줘'});assert.equal(bot.chatIntent.type,'mediation');assert.equal(chatView(r,r.players[0]).public.length,2);assert.ok(!JSON.stringify(body).includes(other.hand[0].id));assert.match(body.messages[0].content,/대화 전용/);
 const p=applyChatPreference([{type:'contribute'},{type:'hunt'}],[.5,.5],bot.chatIntent,{game:{day:r.game.day}});assert.ok(p[0]>.5);assert.equal(p.reduce((s,x)=>s+x,0),1);
});
test('키 없으면 API 호출 없음·Supabase 키는 서버 요청에만 사용',async()=>{
 const api=createOpenAIChat({apiKey:'',fetcher:()=>{throw Error('must not call');}});assert.equal(api.enabled,false);
 let sent;const store=createSupabaseStore({url:'https://example.test',key:'server-secret',fetcher:async(url,init)=>{sent=init;return {ok:true,json:async()=>[{data:{accounts:[],rooms:[]}}]};}});assert.deepEqual(await store.load(),{accounts:[],rooms:[]});await store.save({accounts:[],rooms:[]});assert.equal(sent.headers.apikey,'server-secret');assert.ok(sent.body.includes('"id":"main"'));
});
