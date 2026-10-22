import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view,RECIPES} from '../lib/game.js';
import {createPolicy} from '../lib/ai-policy.js';
import {constructAction,validateConstructedAction} from '../lib/action-construction.js';
import {PPO} from '../ai/ppo.js';
function setup(){const r=makeRoom('BUILD','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const p=r.players.find(p=>p.role==='king');r.game.order=[p.id,...r.players.filter(q=>q!==p).map(q=>q.id)];r.game.turn=0;r.game.phase='day';r.game.round=2;return {r,p};}
test('구성 정책은 축약 후보에 없던 중간 제작 수량을 선택하고 PPO로 학습',()=>{
 const {r,p}=setup(),recipe=RECIPES.findIndex(r=>r.input==='resource'&&r.output==='sword');p.hand=Array.from({length:24},()=>card('resource'));r.game.pending={kind:'craft'};
 const policy=createPolicy(3),result=constructAction(policy,view(r,p.id),{choose:(label,options)=>{const index=options.findIndex(a=>label==='type'?a.type==='craft':label==='target-and-parameters'?a.recipe===recipe:label==='count'?a.count===3:false);return index<0?0:index;}});
 assert.equal(result.action.count,3);assert.equal(validateConstructedAction(r,p.id,result.action),true);
 result.steps.at(-1).reward=1;const trainer=new PPO(policy);assert.ok(trainer.update(trainer.prepare([result.steps]),{epochs:1}).updates>0);
});
test('카드 종류별 수량 구성으로 임의 제출 조합에 도달',()=>{
 const {r,p}=setup();r.game.phase='mediationKing';r.game.pending={done:[],supporters:[],total:0,revoltType:'rebel'};r.game.revolt=99;p.hand=[...Array.from({length:7},()=>card('infantry')),...Array.from({length:4},()=>card('officer'))];
 const result=constructAction(createPolicy(),view(r,p.id),{choose:(label,options)=>label==='cards:infantry'?options.findIndex(a=>a.cards.length===3):label==='cards:officer'?options.findIndex(a=>a.cards.length===5):0});
 assert.equal(result.action.cards.length,5);assert.equal(validateConstructedAction(r,p.id,result.action),true);
});
