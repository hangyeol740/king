import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,ratingEligible,makePlayer} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
test('AI 포함·오프라인은 비레이팅, 이탈 AI 대체는 시작 레이팅 상태를 유지',()=>{
 for(const [mode,bot,rated] of [['online',false,true],['online',true,false],['offline',false,false]]){
 const r=makeRoom('RATE','1');joinRoom(r,'2');joinRoom(r,'3');r.mode=mode;r.players[1].bot=bot;act(r,r.host,{type:'start'});assert.equal(ratingEligible(r),rated);
 r.players[1].takeover=true;assert.equal(ratingEligible(r),rated);
 }
});
test('로비 공개와 관전 채팅만 실명, 게임 공개 메시지는 익명',()=>{
 const r=makeRoom('CHAT','1');joinRoom(r,'2');joinRoom(r,'3');const p=r.players[0];
 chatAct(r,p,{type:'chatSend',channel:'public',text:'로비'});assert.equal(chatView(r,p).public[0].name,'1');
 act(r,r.host,{type:'start'});chatAct(r,p,{type:'chatSend',channel:'public',text:'게임'});assert.equal(chatView(r,p).public[0].name,undefined);
 const s=makePlayer('관전');chatAct(r,s,{type:'chatSend',channel:'spectator',text:'관전'},true);assert.equal(chatView(r,s,true).spectator[0].name,'관전');
});
