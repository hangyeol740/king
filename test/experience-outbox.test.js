import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createExperienceOutbox} from '../lib/experience-outbox.js';
test('원격 장애는 디스크에 남고 재시작 후 같은ID로 재전송',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'outbox-'));let box;try{
 box=createExperienceOutbox({directory:dir,send:async()=>{throw Error('offline');},delay:60000});await box.enqueue({id:'event-1',text:'x'});await box.drain();box.close();
 assert.ok((await readdir(path.join(dir,'outbox'))).includes('event-1.json'));
 const sent=[];box=createExperienceOutbox({directory:dir,send:async e=>sent.push(e.id)});await box.restore();assert.deepEqual(sent,['event-1']);assert.equal((await readdir(path.join(dir,'outbox'))).length,0);
 }finally{box?.close();await rm(dir,{recursive:true,force:true});}
});
