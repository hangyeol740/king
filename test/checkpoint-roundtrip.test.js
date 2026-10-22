import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPolicy,seededRandom} from '../lib/ai-policy.js';
import {PPO} from '../ai/ppo.js';
import {saveExperiment,loadExperiment} from '../ai/checkpoint.js';
test('실험 체크포인트는 가중치·옵티마이저·후보·상대·정책 난수·평가 표본을 복원',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'king-checkpoint-'));try{
 const policy=createPolicy(88),trainer=new PPO(policy),rng=seededRandom(99);rng();const state={completed:60,current:{policy,optimizer:trainer.checkpoint()},candidates:[{id:'a',policy}],opponents:[{id:'b',policy}],rng:rng.state(),inProgressEvaluation:{candidate:'a',report:{roles:{king:{games:450,wins:250}}}}};
 const file=path.join(dir,'experiment.json');await saveExperiment(file,state);const restored=await loadExperiment(file);assert.deepEqual(restored.current,state.current);assert.equal(restored.inProgressEvaluation.report.roles.king.games,450);const next=rng();const resumed=seededRandom(0);resumed.restore(restored.rng);assert.equal(resumed(),next);
 }finally{await rm(dir,{recursive:true,force:true});}
});
