import test from 'node:test';import assert from 'node:assert/strict';import {PPO} from '../ai/ppo.js';import {createPolicy} from '../lib/ai-policy.js';
test('한 행동의 구성 단계 수가 보상 시간할인을 늘리지 않음',()=>{
 const trainer=new PPO(createPolicy(),{gamma:.5,lambda:1});
 const rows=trainer.prepare([[{decisionId:'a',value:0,reward:0},{decisionId:'a',value:0,reward:1}]]);
 assert.equal(rows.find(r=>r.reward===0).target,1);assert.equal(rows.find(r=>r.reward===1).target,1);
 assert.equal(rows[0].jointSteps.length,2);assert.equal(rows[0].decisionWeight,.5);
 assert.deepEqual(trainer.prepare([]),[]);
});
