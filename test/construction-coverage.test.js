import test from 'node:test';import assert from 'node:assert/strict';
import {newGame} from '../ai/environment.js';import {createPolicy,seededRandom} from '../lib/ai-policy.js';import {constructAction,validateConstructedAction} from '../lib/action-construction.js';import {aiObservation} from '../lib/ai-observation.js';import {act} from '../lib/game.js';
test('구성 단계별 강제 선택을 복제 게임의 서버 규칙으로 검증',()=>{
 const policy=createPolicy(100,8),rng=seededRandom(99);let tested=0;
 for(const count of [3,4,5,6,7,8]){
  const r=newGame(count,rng);
  for(let n=0;n<100&&r.status==='playing';n++){
   const ready=r.players.map(p=>({p,s:aiObservation(r,p)})).filter(x=>x.s.me.canAct);if(!ready.length)throw Error('no-ready');const {p,s}=ready[Math.floor(rng()*ready.length)];
   const first=constructAction(policy,s,{random:rng});if(!first)continue;
   for(let path=0;path<3;path++){const built=constructAction(policy,s,{choose:(_label,options)=>path===0?0:path===1?options.length-1:Math.floor(options.length/2)});assert.equal(validateConstructedAction(r,p.id,built.action),true);tested++;}
   act(r,p.id,first.action);
  }
 }
 assert.ok(tested>100);
});
