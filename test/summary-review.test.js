import test from 'node:test';import assert from 'node:assert/strict';import {reviewSummary} from '../lib/summary-review.js';
test('조건부 원문을 무조건 동의로 요약한 경우 원본으로 복구',async()=>{
 const evidence=[{id:'m',kind:'anonymous-claim',text:'다른 지원이 있으면 도울게'}];
 const result=await reviewSummary({ask:async()=>({valid:false,reason:'조건 누락'})},'public/',{text:'확정 지원',evidenceIds:['m']},evidence);assert.match(result.text,/다른 지원이 있으면/);assert.ok(!result.text.includes('확정 지원'));
});
