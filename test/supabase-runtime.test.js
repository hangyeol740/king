import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseRuntime} from '../lib/supabase-runtime.js';
import {gunzipSync} from 'node:zlib';
test('중복 저장 요청을 최종 상태 하나로 합쳐 DB 왕복은 두 번만 수행',async()=>{
 const calls=[];let state={value:0};
 const runtime=createSupabaseRuntime({url:'https://test.example',key:'test',restore:data=>state=data,snapshot:()=>structuredClone(state),fetcher:async(url,init)=>{
  const name=url.split('/').at(-1),body=JSON.parse(init.body);calls.push({name,body});return {ok:true,json:async()=>name==='kingdom_runtime_begin'?{acquired:true,data:{value:1}}:true};
 }});
 await runtime.run(async()=>{state.value=2;await runtime.save();state.value=3;await runtime.save();});
 assert.deepEqual(calls.map(c=>c.name),['kingdom_runtime_begin','kingdom_runtime_commit']);assert.equal(JSON.parse(gunzipSync(Buffer.from(calls[1].body.payload.payload,'base64'))).value,3);
});
