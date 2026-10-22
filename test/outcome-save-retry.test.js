import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createOnlineExperience} from '../lib/online-experience.js';
test('결과 기록 실패는 완료 플래그를 남기지 않으며 복구 후 같은 사건을 한번 기록',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'outcome-retry-')),target=path.join(dir,'blocked');await writeFile(target,'x');
 const recorder=createOnlineExperience({directory:target,failed:()=>{}}),room={status:'finished',createdAt:1,players:[{id:'p',role:'king'}],game:{startedAt:2,winner:{side:'royal',players:['p']}}};
 try{recorder.outcome(room);assert.equal(room.recordedTrainingOutcome,undefined);await unlink(target);recorder.outcome(room);recorder.outcome(room);assert.equal(room.recordedTrainingOutcome,2);assert.equal((await readFile(path.join(target,'events.jsonl'),'utf8')).trim().split('\n').length,1);}finally{recorder.close();await rm(dir,{recursive:true,force:true});}
});
