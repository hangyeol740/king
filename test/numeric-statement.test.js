import test from 'node:test';import assert from 'node:assert/strict';import {numericStatementMismatch} from '../lib/decision-expression.js';
test('보유자원과 제작 산술은 검토모델의 추측 대신 규칙으로 검증',()=>{
 const c={state:{me:{role:'citizen',job:'blacksmith',handCounts:{resource:8}}}};
 assert.equal(numericStatementMismatch('자원 7개 중 4개로 보병 1개 만들게.',c),true);
 assert.equal(numericStatementMismatch('자원 8개로 보병 2개 만들게.',c),false);
 assert.equal(numericStatementMismatch('자원 4개로 보병 2개 만들게.',c),true);
 assert.equal(numericStatementMismatch('자원 4개로 보병 1개 만들게.',c),false);
});
