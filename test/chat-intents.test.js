import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretChat} from '../lib/chat-intents.js';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {chatAct,chatView,respondToChat} from '../lib/chat.js';
test('간단한 한국어 의도를 구분하고 모르는 내용은 추측하지 않음',()=>{assert.equal(interpretChat('중재 좀 도와줘').intent,'mediation');assert.equal(interpretChat('원정 가자').intent,'expedition');assert.equal(interpretChat('거래할래?').intent,'trade');assert.equal(interpretChat('안녕').intent,'greeting');assert.equal(interpretChat('너 손패 몇장이야?'),null);});
test('AI 공개 응답은 비밀값을 쓰지 않고 가입하지 않은 비밀방은 읽지 않음',()=>{const r=makeRoom('INTENT','사람');joinRoom(r,'AI');joinRoom(r,'3');act(r,r.host,{type:'start'});const a=r.players[0],b=r.players[1];b.bot=true;b.money=77;chatAct(r,a,{type:'chatSend',channel:'public',text:'안녕'});respondToChat(r,a,{type:'chatSend',channel:'public',text:'안녕'});assert.equal(chatView(r,a).public.length,2);assert.ok(chatView(r,a).public.every(m=>!m.text.includes('77')));chatAct(r,a,{type:'secretCreate',name:'비밀'});const secret=chatView(r,a).secret[0];b.lastChatReply=0;respondToChat(r,a,{type:'chatSend',channel:'secret',room:secret.id,text:'원정 가자'});assert.equal(chatView(r,a).secret[0].messages.length,0);b.takeover=true;b.name='복귀대상';assert.equal(view(r,a.id).players.find(p=>p.id===b.id).name,'복귀대상 [AI]');});
