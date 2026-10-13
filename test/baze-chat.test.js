import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct} from '../lib/chat.js';
test('BAZE Luna는 지정 게이트웨이·모델·추론 파라미터 사용하고 키는 진단에서 숨김',async()=>{
 const r=makeRoom('BAZE','1');joinRoom(r,'2');joinRoom(r,'3');act(r,r.host,{type:'start'});r.players[1].bot=true;chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});
 let endpoint,body;const api=createOpenAIChat({apiKey:'secret',baseURL:'https://api.baze.co/v1/gateway',model:'gpt-6-luna',fetcher:async(url,init)=>{endpoint=url;body=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"reply":"반가워요","intent":"none"}'}}]})};}});
 await api.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'안녕'});assert.equal(endpoint,'https://api.baze.co/v1/gateway/chat/completions/');assert.equal(body.model,'gpt-6-luna');assert.equal(body.temperature,undefined);assert.equal(body.max_completion_tokens,4096);assert.equal(api.diagnostics().provider,'baze');assert.equal(api.diagnostics().successes,1);assert.ok(!JSON.stringify(api.diagnostics()).includes('secret'));
});
