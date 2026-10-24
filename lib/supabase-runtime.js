import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export function createSupabaseRuntime({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,fetcher=fetch,restore,snapshot}={}){
 if(!url||!key)throw Error('공유 저장소 Supabase 설정이 필요합니다.');
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/rpc/';let queue=Promise.resolve(),owner=null,pending=null;
 async function rpc(name,body){const start=Date.now(),encoded=JSON.stringify(body);const r=await fetcher(endpoint+name,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:encoded,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`공유 저장소 ${name} 오류 ${r.status}`);const result=await r.json();console.log('runtime timing',name,Date.now()-start,'ms',encoded.length,'bytes');return result;}
 const serial=work=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
 const unpack=data=>data?.encoding==='gzip-base64'?JSON.parse(gunzipSync(Buffer.from(data.payload,'base64')).toString()):data;
 const pack=data=>data?{encoding:'gzip-base64',payload:gzipSync(JSON.stringify(data)).toString('base64')}:null;
 async function load(){const data=await rpc('kingdom_runtime_read',{});if(data)restore(unpack(data));}
 return {
   run(work){return serial(async()=>{const id=randomUUID(),until=Date.now()+15000;let result;while(!(result=await rpc('kingdom_runtime_begin',{owner_id:id})).acquired){if(Date.now()>until)throw Error('게임 요청 대기시간 초과');await new Promise(r=>setTimeout(r,150));}owner=id;pending=null;try{if(result.data)restore(unpack(result.data));const output=await work();if(!await rpc('kingdom_runtime_commit',{owner_id:id,payload:pack(pending)}))throw Error('공유 상태 저장 잠금이 만료되었습니다.');owner=null;return output;}finally{if(owner){owner=null;await rpc('kingdom_runtime_unlock',{owner_id:id});}pending=null;}});},
  read(work){return serial(async()=>{await load();return work();});},
   async save(){if(!owner)throw Error('공유 상태 저장 잠금이 없습니다.');pending=snapshot();}
 };
}
