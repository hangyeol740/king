import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom} from '../lib/game.js';
import {aiChatAct,chatAct,chatView,canAIChat,botChat,respondToChat} from '../lib/chat.js';
import {socialActions,executeSocialAction} from '../lib/ai-social-actions.js';

test('사람·접속이탈·AI승계·기권승계 자리의 AI 발언을 모두 차단',()=>{
 const r=makeRoom('MUTE','사람');joinRoom(r,'상대');const p=r.players[0];
 for(const flags of [{bot:false},{bot:false,takeover:true},{bot:true,takeover:true},{bot:true,takeover:false,personalSurrender:true}]){
  Object.assign(p,{bot:false,takeover:false,personalSurrender:false},flags);
  assert.equal(canAIChat(p),false);
  assert.equal(aiChatAct(r,p,{type:'chatSend',channel:'public',text:'대리 발언'}),false);
  assert.deepEqual(socialActions(r,p,{channel:'public'}),[]);
  assert.equal(executeSocialAction(r,p,{channel:'public'},{type:'chatSend',channel:'public',text:'대리 초대'}),false);
  botChat(r,p,{type:'gather'});
 }
 assert.equal(chatView(r,r.players[1]).public.length,0);
});
test('일반 AI 참가자도 발언 불가, 본인이 직접 쓴 채팅은 유지',()=>{
 const r=makeRoom('CHAT','사람');joinRoom(r,'AI');const [human,bot]=r.players;bot.bot=true;
 assert.equal(aiChatAct(r,bot,{type:'chatSend',channel:'public',text:'AI 참가자 발언'}),false);
 assert.throws(()=>chatAct(r,bot,{type:'chatSend',channel:'public',text:'우회 발언'}),/AI는 채팅/);
 chatAct(r,human,{type:'chatSend',channel:'public',text:'직접 입력'});
 assert.equal(chatView(r,human).public.length,1);
 // A response computed before a player reconnects must be rejected at send time.
 bot.bot=false;assert.equal(aiChatAct(r,bot,{type:'chatSend',channel:'public',text:'늦은 응답'}),false);
 human.takeover=true;
 respondToChat(r,bot,{type:'chatSend',channel:'public',text:'어떻게 생각해?'});
 assert.equal(chatView(r,bot).public.length,1);
});
