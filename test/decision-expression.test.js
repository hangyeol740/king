import test from 'node:test';import assert from 'node:assert/strict';
import {expressionMismatch,rewriteExpression} from '../lib/decision-expression.js';
test('불일치 대사 재작성은 확정행동을 변경하지 않음',async()=>{
 const action={type:'joinExpedition',join:false},out={communication:'accept',text:'나도 참가할게',strategyMode:'honest'};assert.equal(expressionMismatch(out,action),true);
 const rewritten=await rewriteExpression({ask:async()=>({text:'이번 원정은 안 갈게.'})},out,action,{persona:'짧게',currentMessage:'갈래?'});assert.equal(expressionMismatch(rewritten,action),false);assert.deepEqual(action,{type:'joinExpedition',join:false});
});
