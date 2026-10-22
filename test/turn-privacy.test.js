import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,view,turnDisplay} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
function setup(){const r=makeRoom('TURN','왕');for(let i=0;i<4;i++)joinRoom(r,`사람${i}`);act(r,r.host,{type:'start'});return r;}
test('익명 차례는 왕·본인·신원조사 상대만 이름 식별',()=>{
 const r=setup(),k=r.players.find(p=>p.role==='king'),others=r.players.filter(p=>p!==k),[a,b]=others;
 r.game.phase='day';r.game.turn=r.game.order.indexOf(a.id);
 assert.equal(turnDisplay(r,a.id).kind,'self');assert.equal(turnDisplay(r,b.id).kind,'anonymous');
 r.chat={public:[],rebel:[],spectator:[],requests:[],secret:[],pairs:[{id:'pair',members:[a.id,b.id],identified:[b.id],messages:[]}]};
 assert.equal(turnDisplay(r,b.id).kind,'identified');assert.ok(turnDisplay(r,b.id).text.includes(a.name));
 r.game.turn=0;assert.equal(turnDisplay(r,b.id).kind,'king');
 assert.deepEqual(view(r,b.id).players.map(p=>p.id),r.players.map(p=>p.id));
 assert.ok(r.players.every(p=>p.notes.some(n=>n.effect==='turnOrder')));
});
test('다른 반란군의 공개 채팅 표시는 반란군 수신자에게만 제공',()=>{
 const r=setup(),[a,b,c]=r.players;a.role='rebel';b.role='rebel';c.role='citizen';
 chatAct(r,a,{type:'chatSend',channel:'public',text:'지원'});
 assert.equal(chatView(r,b).public[0].rebelAlly,true);
 assert.equal(chatView(r,a).public[0].rebelAlly,undefined);
 assert.equal(chatView(r,c).public[0].rebelAlly,undefined);
 assert.equal(chatView(r,b,true).public[0].rebelAlly,undefined);
});
