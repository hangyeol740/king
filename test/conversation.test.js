import test from 'node:test';
import assert from 'node:assert/strict';
import {personaFor,acceptPlan,planCandidates} from '../lib/conversation.js';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {personaFor as initPersona} from '../lib/conversation.js';
test('페르소나는 같은 게임에서 유지하고 계획은 역할/익명/유효기간을 검증',()=>{
 const p={},g={startedAt:123};assert.equal(personaFor(p,g),personaFor(p,g));
 const lobbyBot={};personaFor(lobbyBot,null);assert.deepEqual(lobbyBot.conversationMemory,{});
 const s={me:{role:'citizen'},game:{day:2,pending:null}};
 assert.equal(acceptPlan({status:'accept',type:'trade'},s,'other',{channel:'public'}),null);
 assert.equal(acceptPlan({status:'accept',type:'expedition'},s,'other',{channel:'pair'}),null);
 const plan=acceptPlan({status:'accept',type:'joinExpedition'},s,'other',{channel:'public'});assert.ok(plan);
 const actions=[{type:'joinExpedition',join:true},{type:'joinExpedition',join:false}];assert.deepEqual(planCandidates(actions,s,plan),[actions[0]]);plan.expires=0;assert.equal(planCandidates(actions,s,plan),actions);
});
test('대화 기억은 채널별로만 전달되고 행동 약속은 계획 AI가 담당, 출력에 sender 숨김',async()=>{
 const r=makeRoom('CONV','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});const bot=r.players.find(p=>p.role==='citizen'),sender=r.players.find(p=>p!==bot);bot.bot=true;let calls=[];
 initPersona(bot,r.game);bot.socialStrategy={key:`${r.game.day}/${r.game.phase}`,mode:'honest'};
 const api=createOpenAIChat({apiKey:'test',fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,json:async()=>({choices:[{message:{content:'{"reply":"좋아, 원정에 참가할게.","intent":"expedition","plan":{"status":"accept","type":"joinExpedition"}}'}}]})};}});
 chatAct(r,sender,{type:'chatSend',channel:'public',text:'원정 같이 가자'});await api.respond(r,sender,{type:'chatSend',channel:'public',text:'원정 같이 가자'});
  assert.equal(bot.conversationPlan,null);assert.equal(bot.conversationMemory['public/'].length,1);
 const context=JSON.parse(calls[0].messages[1].content);assert.ok(context.rules);assert.ok(context.persona);assert.equal(context.currentMessage,'원정 같이 가자');assert.ok(!chatView(r,sender).public.some(m=>'sender'in m));
});
