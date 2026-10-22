import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPolicy,candidates,observe,actionFeatures,OBS_SIZE,ACTION_SIZE,validatePolicy} from '../lib/ai-policy.js';
import {newGame} from '../ai/environment.js';
import {view} from '../lib/game.js';
import {compatiblePolicy,transferPolicy} from '../ai/transfer.js';
test('새 모델은 전투와 기습을 서로 다른 학습 출력으로 구분',()=>{
 const r=newGame(3);r.game.phase='day';r.game.round=1;const id=r.game.order[0];
 const s=view(r,id),actions=candidates(s),battle=actions.find(a=>a.type==='battle');assert.ok(battle);
 assert.equal(observe(s).length,OBS_SIZE);assert.equal(actionFeatures(s,battle).length,ACTION_SIZE);
 assert.notDeepEqual(actionFeatures(s,battle),actionFeatures(s,{type:'draw3'}));
 r.game.phase='ambush';const rebel=r.players.find(p=>p.role==='rebel');r.game.pending={queue:[rebel.id],index:0};
 assert.ok(candidates(view(r,rebel.id)).some(a=>a.type==='ambush'));
});
test('v9 성향 가중치를 전투 상태 뒤의 입력으로 이전',()=>{
 const current=createPolicy(),source=structuredClone(current);
  source.version=9;source.metadata.episodes=10;source.observationSize-=4;source.actionSize-=24;
 for(const [kind,net] of Object.entries({actor:source.actor,critic:source.critic})){
  const oldInput=net.input;net.input=source.observationSize;net.w1=Array(net.input*net.hidden).fill(0);net.w1[net.input-1]=.123;
  if(kind==='actor'){net.output=source.actionSize;net.w2=Array(net.hidden*net.output).fill(0);net.b2=Array(net.output).fill(0);}
 }
  const adapted=transferPolicy(source);assert.equal(adapted.actor.w1[adapted.actor.input-1],.123);assert.equal(adapted.version,11);
});
test('학습 후보와 기존 배포 모델 모두 서버에서 로드 가능',async()=>{
 const saved=JSON.parse(await readFile(new URL('../models/policy.json',import.meta.url),'utf8'));
  assert.equal(compatiblePolicy(saved).version,11);
 const candidate=JSON.parse(await readFile(new URL('../models/strategy-v10-candidate.json',import.meta.url),'utf8'));
  assert.equal(compatiblePolicy(candidate).version,11);assert.ok(candidate.metadata.episodes>=240);
});
