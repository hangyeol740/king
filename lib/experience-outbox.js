import {mkdir,opendir,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
export function createExperienceOutbox({directory,send,failed=()=>{},delay=1000,maxDelay=60000,batchSize=20}){
 let timer=null,running=false,closed=false,attempts=0,completion=Promise.resolve();
 const stats={pending:0,sent:0,failures:0,lastError:null};
 const folder=path.join(directory,'outbox');
  function enqueue(event){if(!/^[A-Za-z0-9_-]+$/.test(event.id))throw Error('invalid-event-id');mkdirSync(folder,{recursive:true});const file=path.join(folder,`${event.id}.json`);writeFileSync(`${file}.tmp`,JSON.stringify(event),{mode:0o600});renameSync(`${file}.tmp`,file);stats.pending++;schedule(0);}
  function schedule(ms){if(!closed&&!timer){timer=setTimeout(()=>{timer=null;void drain();},ms);timer.unref?.();}}
  function drain(){if(running)return completion;completion=run();return completion;}
  async function run(){
  if(closed||!send)return;running=true;
  try{
   await mkdir(folder,{recursive:true});const batch=[];let count=0;for await(const entry of await opendir(folder)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;count++;if(batch.length<batchSize)batch.push(entry.name);}stats.pending=count;
   for(const name of batch){const file=path.join(folder,name),event=JSON.parse(await readFile(file,'utf8'));await send(event);await unlink(file);stats.sent++;stats.pending--;}
   attempts=0;stats.lastError=null;
  }catch(error){attempts++;stats.failures++;stats.lastError=error.message;failed(error);}
   finally{running=false;if(stats.pending||attempts)schedule(Math.min(maxDelay,delay*2**Math.min(attempts,10)));}
 }
 return {enqueue,restore:drain,drain,diagnostics:()=>({...stats}),close(){closed=true;clearTimeout(timer);}};
}
