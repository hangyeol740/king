import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolicy,seededRandom} from '../lib/ai-policy.js';
import {rollout} from '../ai/environment.js';
test('순차구성 정책이 실제 게임을 마치고 구성 단계별 학습 궤적을 생성',()=>{
 const policy=createPolicy(6,8);policy.metadata.actionConstruction=1;
 for(const count of [3,4,6]){const r=rollout(policy,{count,random:seededRandom(count)});assert.equal(r.room.status,'finished');assert.ok([...r.trajectories.values()].flat().some(row=>row.construction?.startsWith('cards:')));}
});
