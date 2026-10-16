import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,rollout} from '../ai/environment.js';
import {createPolicy,seededRandom} from '../lib/ai-policy.js';
test('평가는 진영별 최저 승률을 포함하고 혼합 상대 궤적은 한 AI만 학습',()=>{
 const policy=createPolicy(30),result=rollout(policy,{count:5,random:seededRandom(31),opponents:[{kind:'random'},{kind:'baseline',style:'cooperative'},{kind:'baseline',style:'aggressive'}]});
 assert.equal([...result.trajectories.values()].filter(rows=>rows.length).length,1);
 const score=evaluate(policy,{games:24,counts:[3,4,5,6],random:seededRandom(32),opponent:'mixed'});
 assert.ok(score.roleFloor>=0&&score.roleFloor<=1);assert.ok(Object.values(score.byRole).some(row=>row.games>=3));
});
