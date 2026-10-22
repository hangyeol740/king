import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';import {createPolicy} from '../lib/ai-policy.js';import {constructAction,validateConstructedAction} from '../lib/action-construction.js';
test('상인 진열은 여러 카드 종류와 가격2·4도 구성 가능',()=>{
 const r=makeRoom('SHOP','a');for(const n of ['b','c','d'])joinRoom(r,n);act(r,r.host,{type:'start'});const p=r.players[1];p.role='neutral';p.job='merchant';p.money=0;p.stock=[];p.hand=[card('sword'),card('magic'),card('resource')];r.game.phase='merchantEvening';r.game.pending={craftUsed:false,kind:null};
 const result=constructAction(createPolicy(),view(r,p.id),{choose:(label,options)=>label==='type'?options.findIndex(a=>a.type==='displayGoods'):label==='price'?options.findIndex(a=>a.price===4):label.startsWith('cards:')?options.length-1:0});
 assert.equal(result.action.price,4);assert.equal(result.action.cards.length,3);assert.equal(validateConstructedAction(r,p.id,result.action),true);
});
