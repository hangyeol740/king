import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';import {chatAct,chatView} from '../lib/chat.js';
test('채팅 화면100개 제한과 원문 보관은 독립·비밀작성자ID는 화면에 노출되지 않음',()=>{
 const r=makeRoom('ARC','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const p=r.players[0];for(let i=0;i<125;i++)chatAct(r,p,{type:'chatSend',channel:'public',text:`원문${i}`});assert.equal(chatView(r,r.players[1]).public.length,100);assert.equal(r.chatArchive.length,125);assert.equal(r.chatArchive[0].text,'원문0');assert.ok(!JSON.stringify(chatView(r,r.players[1])).includes('sender'));
});
