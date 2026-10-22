import test from 'node:test';
import assert from 'node:assert/strict';
import {rollout} from '../ai/environment.js';
import {createPolicy,seededRandom} from '../lib/ai-policy.js';
test('균등 상대 풀에서는 학습 AI 한 명만 PPO 궤적과 중간 보상을 받음',()=>{
 const policy=createPolicy(4),previous=createPolicy(5),result=rollout(policy,{count:4,random:seededRandom(6),opponents:[{kind:'random'},{kind:'baseline',style:'aggressive'},{kind:'policy',policy:previous}]});
  const rows=[...result.trajectories.values()].filter(rows=>rows.length);assert.equal(rows.length,1);assert.ok(rows[0].every(row=>Number.isFinite(row.reward)));if(result.room.game.winner.side!=='draw')assert.ok(Math.abs(rows[0].at(-1).reward)>=.9);
});
