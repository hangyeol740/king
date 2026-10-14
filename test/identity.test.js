import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
test('신원조사는 조사자에게만 닉네임을 공개하며 새 매칭에는 유지되지 않음',()=>{
 const r=makeRoom('IDENT1','a');joinRoom(r,'b');joinRoom(r,'c');r.players.forEach(p=>p.online=true);act(r,r.host,{type:'start'});
 const [a,b,c]=r.players;r.chat={public:[],rebel:[],spectator:[],requests:[],secret:[],pairs:[{id:'pair',members:[a.id,b.id],messages:[]}]};
 r.game.phase='day';r.game.round=3;r.game.turn=r.game.order.indexOf(a.id);
 act(r,a.id,{type:'investigateIdentity'});chatAct(r,b,{type:'chatSend',channel:'pair',room:'pair',text:'hello'});
 assert.equal(chatView(r,a).pair.messages[0].name,b.name);assert.equal(chatView(r,b).pair.partnerName,undefined);
 chatAct(r,a,{type:'pairLeave'});r.chat.pairs.push({id:'new',members:[a.id,c.id],messages:[]});assert.equal(chatView(r,a).pair.partnerName,undefined);
});
