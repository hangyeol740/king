import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct} from '../lib/chat.js';
function setup(){const r=makeRoom('DIAG','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});r.players[1].bot=true;chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});return r;}
test('진단은 키·메시지를 숨기고 키없음/429/성공을 구분',async()=>{
 for(const scenario of ['missing','quota','success']){const r=setup(),api=createOpenAIChat({apiKey:scenario==='missing'?'':'secret-test-key',failed:()=>{},fetcher:async()=>scenario==='quota'?{ok:false,status:429,json:async()=>({error:{code:'insufficient_quota',message:'private'}})}:{ok:true,json:async()=>({choices:[{message:{content:'{"reply":"안녕하세요","intent":"none"}'}}]})}});await api.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});const d=api.diagnostics();assert.ok(!JSON.stringify(d).includes('secret-test-key'));if(scenario==='missing')assert.equal(d.lastError,'api_key_missing');if(scenario==='quota')assert.equal(d.lastError,'http_429:insufficient_quota');if(scenario==='success'){assert.equal(d.successes,1);assert.equal(d.lastOutcome,'openai');}}
});
