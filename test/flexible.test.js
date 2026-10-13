import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,ratingEligible} from '../lib/game.js';
import {chatView,chatAct} from '../lib/chat.js';
test('2인 왕/반란군 기본 구성·중재는 지원 대기 없이 왕 제출·비레이팅',()=>{
 const r=makeRoom('TWO','1');joinRoom(r,'2');act(r,r.host,{type:'start'});assert.equal(r.game.maxDays,10);assert.equal(r.game.revoltGoal,1);assert.equal(ratingEligible(r),false);const k=r.players.find(p=>p.role==='king');r.game.revolt=3;act(r,k.id,{type:'mediate'});assert.equal(r.game.phase,'mediationKing');act(r,k.id,{type:'contribute',cards:[]});assert.equal(r.status,'finished');
});
test('3/4인 자유 구성은 시민/중립 필수 아님·비레이팅, 기본 구성은 레이팅',()=>{
 for(const [n,cfg] of [[3,{king:1,citizen:0,rebel:1,neutral:1}],[4,{king:1,citizen:0,rebel:2,neutral:1}]]){const r=makeRoom('FREE','1');for(let i=1;i<n;i++)joinRoom(r,String(i+1));act(r,r.host,{type:'config',roles:cfg});act(r,r.host,{type:'start'});assert.equal(ratingEligible(r),false);}
 const r=makeRoom('STD','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});assert.equal(ratingEligible(r),true);
});
test('반란군1명 채팅 숨김·전송 거부,2명 채팅 활성·AI도 랜덤매치 대상',()=>{
 const r=makeRoom('R','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});const rebel=r.players.find(p=>p.role==='rebel');assert.equal(chatView(r,rebel).rebel,undefined);r.players.find(p=>p.role==='citizen').role='rebel';assert.ok(chatView(r,rebel).rebel);chatAct(r,rebel,{type:'chatSend',channel:'rebel',text:'협력'});assert.equal(chatView(r,rebel).rebel[0].text,'협력');
});
