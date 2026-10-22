import test from 'node:test';import assert from 'node:assert/strict';
import {createPolicy,enableActionConstruction,OBS_SIZE,CONSTRUCTION_INPUT_SIZE} from '../lib/ai-policy.js';import {PPO} from '../ai/ppo.js';import {constructAction} from '../lib/action-construction.js';import {newGame} from '../ai/environment.js';import {view} from '../lib/game.js';
test('구성 신경망은 이전 선택을 입력으로 받고 해당 가중치·옵티마이저가 실제 갱신',()=>{
 const policy=enableActionConstruction(createPolicy(18,8)),room=newGame(3),king=room.players.find(p=>p.role==='king'),s=view(room,king.id);
 const built=constructAction(policy,s,{choose:()=>0});assert.equal(policy.constructionActor.input,CONSTRUCTION_INPUT_SIZE);assert.equal(built.steps[0].actorKind,'constructionActor');assert.ok(built.steps[1].actorObs.slice(OBS_SIZE).some(x=>x!==0));
 const before=[...policy.constructionActor.w1];built.steps.at(-1).reward=1;const trainer=new PPO(policy);trainer.update(trainer.prepare([built.steps]),{epochs:1});assert.notDeepEqual(policy.constructionActor.w1,before);assert.ok(trainer.checkpoint().moments.constructionActor);const restored=new PPO(policy);restored.restore(trainer.checkpoint());assert.equal(restored.step,trainer.step);
});
