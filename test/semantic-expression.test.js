import test from 'node:test';import assert from 'node:assert/strict';import {semanticExpressionCheck} from '../lib/decision-expression.js';
test('의미 검토는 행동·수량과 대사를 함께 보내고 검토결과로 판단',async()=>{
 let seen;const client={ask:async(_s,c)=>{seen=c;return {consistent:false,reason:'거절과 수락 발언 충돌'};}};
 assert.equal(await semanticExpressionCheck(client,{communication:'accept',text:'좋아 갈게',strategyMode:'honest'},{type:'joinExpedition',join:false},{currentMessage:'갈래?'}),false);assert.equal(seen.aiAction.join,false);assert.equal(seen.aiStatement,'좋아 갈게');assert.equal(seen.incomingOpponentMessage,'갈래?');
});
