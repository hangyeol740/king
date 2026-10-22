import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateCell,eligibleCounts} from '../ai/cell-evaluation.js';import {createPolicy,seededRandom} from '../lib/ai-policy.js';
test('모든 직업 평가가 실제 배정된 개인 관찰로 실행되고 인원·무승부를 반환',()=>{
 const p=createPolicy(10,8);p.metadata.actionConstruction=1;
 for(const role of ['king','citizen','hunter','blacksmith','rebel','bishop','merchant','neutral']){const count=eligibleCounts(role).at(-1);const r=evaluateCell(p,{role,count,opponent:'balanced',random:seededRandom(9)});assert.equal(r.role,role);assert.equal(r.count,count);assert.equal(typeof r.draw,'boolean');assert.equal(typeof r.won,'boolean');assert.ok(!(r.draw&&r.won));}
});
