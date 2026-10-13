import test from 'node:test';
import assert from 'node:assert/strict';
import {socialProbabilities,strategyFor,observeOpponents} from '../lib/social-strategy.js';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {personaFor} from '../lib/conversation.js';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {chatAct} from '../lib/chat.js';
test('보존·블러핑 전략은 합법적 거절/0장 후보를 증가시키고 정규화',()=>{
 const s={me:{role:'citizen',hand:[]},game:{day:1,phase:'expeditionJoin'}};
 const a=[{type:'joinExpedition',join:true},{type:'joinExpedition',join:false}];const ps=socialProbabilities(s,a,[.5,.5],'reserve');assert.ok(ps[1]>.5);assert.equal(ps.reduce((x,y)=>x+y),1);
 const b=[{type:'contribute',cards:[]},{type:'contribute',cards:['x']}];assert.ok(socialProbabilities(s,b,[.5,.5],'bluff')[0]>.5);
 const p={};assert.equal(strategyFor(p,s,null,()=>0),strategyFor(p,s,null,()=>1));
});
test('상대 추론은 개인에게 보이는 공개 행동만 이용하고 진영을 확정하지 않음',()=>{
 const s={me:{id:'a',notes:[]},players:[{id:'a',name:'A'},{id:'b',name:'B',role:null}],game:{logs:[{text:'B님이 중재에 지원했습니다.'},{text:'B님이 중재에 지원했습니다.'}]}};
 const row=observeOpponents(s)[0];assert.equal(row.publicRole,null);assert.equal(row.confidence,'low');assert.equal(row.supports,2);assert.ok(row.warning.includes('진영 확정 불가'));
});
test('허세의 협력 발언은 실제 실행 계획과 강제협력 보정으로 취급하지 않음',async()=>{
 const r=makeRoom('BLUFF','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players.find(p=>p.role==='citizen'),sender=r.players.find(p=>p!==bot);bot.bot=true;personaFor(bot,r.game);bot.socialStrategy={key:`${r.game.day}/${r.game.phase}`,mode:'bluff',desiredBelief:'협력한다고 생각하게'};
 let ctx;const api=createOpenAIChat({apiKey:'test',fetcher:async(u,i)=>{ctx=JSON.parse(JSON.parse(i.body).messages[1].content);return {ok:true,json:async()=>({choices:[{message:{content:'{"reply":"원정? 내가 도와줄게.","intent":"expedition","plan":{"status":"accept","type":"joinExpedition"}}'}}]})};}});
 chatAct(r,sender,{type:'chatSend',channel:'public',text:'원정 도와줘'});await api.respond(r,sender,{type:'chatSend',channel:'public',text:'원정 도와줘'});assert.equal(bot.conversationPlan,null);assert.equal(bot.chatIntent.type,'none');assert.equal(ctx.strategy.mode,'bluff');assert.ok(ctx.opponents);assert.equal(view(r,sender.id).players.find(p=>p.id===bot.id).socialStrategy,undefined);
});
