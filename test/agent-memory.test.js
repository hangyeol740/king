import test from 'node:test';import assert from 'node:assert/strict';
import {rememberEvidence,rememberSummary,retrieveEvidence,verifiedSummaries} from '../lib/agent-memory.js';
test('원본 연결 요약은 채널을 분리하고 변조된 원문 요약을 제외',()=>{
 const mind={};rememberEvidence(mind,'secret/a',[{id:'x',text:'7점 이상이면 지원'}]);rememberSummary(mind,'secret/a','조건부 지원',['x']);
 assert.equal(retrieveEvidence(mind,'public/','지원').length,0);assert.equal(verifiedSummaries(mind,'secret/a').length,1);
 mind.evidenceArchive['secret/a:x'].text='무조건 지원';assert.equal(verifiedSummaries(mind,'secret/a').length,0);
});
