import test from 'node:test';
import assert from 'node:assert/strict';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('인증·결제 API 거부 시 차례를 기다리지 않고 로컬 정책으로 넘긴다',async()=>{
 const agent=createCognitiveAgent({client:{enabled:true},failed:()=>{}});
 for(const error of ['http_400','http_401','http_402','http_403','http_404']){
   const result=await agent.beforeAction({}, {id:'bot',aiStatus:{state:'error',error,retryAfter:Date.now()+30000}});
   assert.equal(result.localPolicyFallback,true);
   assert.equal(result.wait,undefined);
 }
 agent.close?.();
});
