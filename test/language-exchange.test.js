import test from 'node:test';
import assert from 'node:assert/strict';
import {languageExchange,createLanguageClient} from '../ai/language-exchange.js';
test('자연어 발언만 상대에게 전달, 실제 전략/행동은 비공개, 기억과 합법 선택 전달',async()=>{
 const speaker={status:'playing',me:{id:'s',role:'rebel',hand:[],notes:[]},players:[],game:{phase:'expeditionJoin',day:1,logs:[]}};
 const listener={...speaker,me:{id:'l',role:'citizen',hand:[],notes:[]}};let inputs=[];
 const client={ask:async(system,context)=>{inputs.push(context);return inputs.length===1?{utterance:'같이 가자. 내가 힘을 보탤게.',desiredBelief:'협조한다고 믿게'}:{choice:1,reply:'이번에는 빠질게.',belief:'약속만으로 충분하지 않음'};}};
 const result=await languageExchange(client,{speaker,speakerAction:{type:'joinExpedition',join:false},listener,listenerActions:[{type:'joinExpedition',join:true},{type:'joinExpedition',join:false}],baselineIndex:0,mode:'bluff',history:[{utterance:'지난 말',reply:'지난 답'}]});
 assert.equal(result.changed,true);assert.equal(inputs[1].actualAction,undefined);assert.equal(inputs[1].strategy,undefined);assert.equal(inputs[1].desiredBelief,undefined);assert.equal(inputs[1].state.me.role,'citizen');assert.equal(inputs[1].history[0].utterance,'지난 말');
 client.ask=async()=>({utterance:'hello',desiredBelief:'help',choice:9,reply:'x',belief:'x'});
 await assert.rejects(languageExchange(client,{speaker,speakerAction:{type:'joinExpedition',join:false},listener,listenerActions:[{type:'joinExpedition',join:true}],baselineIndex:0,mode:'bluff'}),/invalid_listener_choice/);
});
test('언어 API 오류는 고정문구로 성공 처리하지 않으며 키는 오류에서 제외',async()=>{
 const client=createLanguageClient({apiKey:'secret-test',fetcher:async()=>({ok:false,status:401})});await assert.rejects(client.ask('test',{}),/language_api_http_401/);assert.equal(client.calls,1);
});
