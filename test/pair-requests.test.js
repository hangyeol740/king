import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
function setup(){const room=makeRoom('PAIR01','a');for(const name of ['b','c','d'])joinRoom(room,name);room.players.forEach(p=>p.online=true);return room;}
test('이미 매칭된 사람보다 매칭되지 않은 사람에게 우선 요청',()=>{
 const r=setup(),[a,b,c,d]=r.players;
 r.chat={public:[],rebel:[],spectator:[],pairs:[{id:'busy',members:[b.id,c.id],messages:[]}],requests:[],secret:[]};
 chatAct(r,a,{type:'pairRequest'});
 assert.equal(chatView(r,d).incoming.length,1);
 assert.equal(chatView(r,b).incoming.length,0);
});
test('모두 거절하기 전에는 같은 요청자에게 거절한 사람이 다시 요청받지 않음',()=>{
 const r=setup(),[a]=r.players;const seen=new Set();
 for(let i=0;i<3;i++){
  chatAct(r,a,{type:'pairRequest'});
  const target=r.players.find(p=>chatView(r,p).incoming.length);
  assert.ok(!seen.has(target.id));seen.add(target.id);
  chatAct(r,target,{type:'pairAnswer',request:chatView(r,target).incoming[0].id,accept:false});
 }
 chatAct(r,a,{type:'pairRequest'});assert.equal(r.chat.requests.length,1);
});
test('매칭 없이 나가기만 눌러도 거절 이력이 초기화되지 않음',()=>{
 const r=setup(),[a,b]=r.players;
 r.chat={public:[],rebel:[],spectator:[],pairs:[],requests:[],secret:[],rejections:{[a.id]:[b.id]}};
 chatAct(r,a,{type:'pairLeave'});assert.deepEqual(r.chat.rejections[a.id],[b.id]);
 r.chat.pairs.push({id:'pair',members:[a.id,b.id],messages:[]});
 chatAct(r,a,{type:'pairLeave'});assert.equal(r.chat.rejections[a.id],undefined);
});
