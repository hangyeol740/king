import test from 'node:test';import assert from 'node:assert/strict';import {semanticExpressionCheck} from '../lib/decision-expression.js';
test('장교7점은 원정력과 합산하지 않고 서버 산술로 확인',async()=>{
 const c={state:{me:{role:'citizen'},game:{phase:'mediationSupport'}},actionConstruction:{cards:[{id:'o',type:'officer'}]}};
 const client={ask:async()=>{throw Error('검증된 산술을 모델이 재해석하면 안 됨');}};
 assert.equal(await semanticExpressionCheck(client,{communication:'accept',text:'장교로 딱 7점 낼게.',strategyMode:'honest'},{type:'contribute',cards:['o']},c),true);
 assert.equal(await semanticExpressionCheck(client,{communication:'accept',text:'딱 9점 낼게.',strategyMode:'honest'},{type:'contribute',cards:['o']},c),false);
});
