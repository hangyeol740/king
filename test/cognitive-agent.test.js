import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {chatAct,chatView} from '../lib/chat.js';
import {prepareDecision,commitDecision,plannedAction,recordExecution,mindFor,decisionSchema} from '../lib/agent-mind.js';
import {createAgentClient} from '../lib/agent-client.js';
import {createCognitiveAgent,channelHistory} from '../lib/cognitive-agent.js';
import {createBotRunner} from '../lib/ai-runner.js';

function setup(){const room=makeRoom('MIND','one');joinRoom(room,'two');joinRoom(room,'three');act(room,room.host,{type:'start'});const bot=room.players.find(p=>p.role==='king');bot.bot=true;return {room,bot};}
function prepared(room,bot,random=()=>0,input={channel:'public'}){return prepareDecision({bot,epoch:room.game.startedAt,snapshot:view(room,bot.id),actions:candidates(view(room,bot.id)),history:channelHistory(room,bot,input),input,random,now:1000});}
function output(p,extra={}){return {choice:p.actions.length?0:null,commitmentChoice:null,communication:'propose',text:'이번엔 원정은 어떨까?',goal:'우리 진영 승리',desiredBelief:'서로 준비를 확인',assessment:'아직 판단 근거 부족',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false,...extra};}
test('발언/행동 하나의 계획, 의도 없는 약속 위반 거절, 실행 기록',()=>{
 const {room,bot}=setup(),p=prepared(room,bot);assert.ok(p.actions.length>1);
 assert.throws(()=>commitDecision(p,output(p,{choice:0,commitmentChoice:1})),/broken_promise/);
 const plan=commitDecision(p,output(p,{commitmentChoice:0}),1000);const selected=plannedAction(p.mind,view(room,bot.id),p.actions,1001);assert.deepEqual(selected.action,plan.commitment);
 recordExecution(p.mind,selected.action);assert.equal(plan.status,'executed');
  delete p.scope.stance;const b=prepared(room,bot,()=>.6);const bluff=commitDecision(b,output(b,{commitmentChoice:1}),1002);assert.equal(bluff.mode,'bluff');assert.equal(bluff.deception,true);assert.notDeepEqual(bluff.action,bluff.commitment);
 assert.equal(view(room,bot.id).me.agentMind,undefined);
});
test('익명 관찰과 채널 기억 분리, 근거 없는 추정 거절, 재경기 초기화',()=>{
 const {room,bot}=setup(),human=room.players.find(p=>p!==bot);chatAct(room,human,{type:'chatSend',channel:'public',text:'지원할게'});
 const h=channelHistory(room,bot,{channel:'public'});assert.equal(h[0].sender,undefined);assert.equal(h[0].self,false);
 const p=prepared(room,bot);p.mind.scopes['secret/hidden']={plan:{goal:'SECRET-SENTINEL'}};
 const next=prepared(room,bot);assert.ok(!JSON.stringify(next.context).includes('SECRET-SENTINEL'));
 assert.throws(()=>commitDecision(next,output(next,{evidenceIds:['made-up']})),/unsupported_belief/);
 assert.equal(channelHistory(room,bot,{channel:'secret',room:'hidden'}),null);
 assert.deepEqual(mindFor(bot,room.game.startedAt+1).scopes,{});
});
test('새 반응을 근거로 계획 수정, 무설명 행동 변경과 만료 후보 실행 방지',()=>{
 const {room,bot}=setup(),p=prepared(room,bot);commitDecision(p,output(p,{commitmentChoice:0}),1000);
 const human=room.players.find(p=>p!==bot);chatAct(room,human,{type:'chatSend',channel:'public',text:'나는 원정에 못 가'});
 const q=prepared(room,bot);assert.ok(q.context.newEvidenceIds.some(i=>i.startsWith('message:')));
 assert.throws(()=>commitDecision(q,output(q,{choice:1})),/unexplained_revision/);
 const revised=commitDecision(q,output(q,{choice:1,planStatus:'revise',revisionReason:'협력이 어렵다는 새 답변을 받음'}),1002);assert.equal(revised.action.type,q.actions[1].type);
 assert.equal(plannedAction(q.mind,view(room,bot.id),[],1003),null);assert.equal(revised.status,'invalidated');
});
test('API 도중 바뀐 게임 상태는 폐기',async()=>{
 const {room,bot}=setup();let finish;const client={enabled:true,diagnostics:()=>({}),ask:()=>new Promise(resolve=>{finish=resolve;})};const agent=createCognitiveAgent({client,random:()=>0,failed:()=>{}});
 const work=agent.deliberate(room,bot,{channel:'public'},true);const p=prepared(room,bot);act(room,bot.id,{type:'expedition'});finish(output(p));const result=await work;assert.equal(result.discarded,true);assert.equal(chatView(room,bot).public.length,0);
});
test('일일 대화 예산·침묵 후 실제 선택 실행',async()=>{
 const {room,bot}=setup();let calls=0,now=1000;const client={enabled:true,diagnostics:()=>({}),ask:async(system,c)=>{calls++;return output({actions:c.legalActions},{communication:'silent',text:'',choice:0});}};
 const agent=createCognitiveAgent({client,maxAutonomousPerDay:1,random:()=>0,clock:()=>now});const first=await agent.beforeAction(room,bot);assert.ok(first.action);assert.equal(calls,1);assert.equal(chatView(room,bot).public.length,0);
 const second=await agent.beforeAction(room,bot);assert.deepEqual(second.action,first.action);assert.equal(calls,1);
});
test('비밀방 권한을 요청 후 잃으면 응답 폐기',async()=>{
 const {room,bot}=setup(),owner=room.players.find(p=>p!==bot);chatAct(room,owner,{type:'secretCreate',name:'비밀'});const secret=chatView(room,owner).secret[0];chatAct(room,bot,{type:'secretJoin',room:secret.id,password:secret.password});
 const input={channel:'secret',room:secret.id};let finish;const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:()=>new Promise(r=>{finish=r;})},random:()=>0});
 const work=agent.deliberate(room,bot,input,false),p=prepared(room,bot,()=>0,input);chatAct(room,bot,{type:'secretLeave',room:secret.id});finish(output(p));assert.equal((await work).discarded,true);assert.equal(chatView(room,owner).secret[0].messages.length,0);
});
test('실제 새 반응으로 계획을 수정하고 그 후보가 실행되며 대기는 제한됨',async()=>{
 const {room,bot}=setup(),human=room.players.find(p=>p!==bot);let now=1000,count=0;
 const client={enabled:true,diagnostics:()=>({}),ask:async(system,c)=>{count++;return output({actions:c.legalActions},{choice:count===1?0:1,waitForReply:count===1,planStatus:count===1?'new':'revise',revisionReason:count===1?'':'상대가 제안을 거절했다',text:count===1?'원정 같이 갈까?':'그럼 다른 선택을 할게.'});}};
  const agent=createCognitiveAgent({client,random:()=>0,clock:()=>now});let result=await agent.beforeAction(room,bot);assert.equal(result.wait,false);
 chatAct(room,human,{type:'chatSend',channel:'public',text:'나는 못 가'});now+=100;result=await agent.beforeAction(room,bot);assert.equal(result.wait,false);assert.equal(result.action.type,candidates(view(room,bot.id))[1].type);assert.equal(agent.diagnostics().revisions,1);
 act(room,bot.id,result.action);agent.executed(room,bot,result.action);assert.equal(bot.agentMind.scopes['public/'].plan.status,'executed');
});
test('잘못된 API 계획은 발언이나 행동으로 적용하지 않고 대기 해제',async()=>{
 const {room,bot}=setup();const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async()=>({choice:999})},failed:()=>{}});
 assert.deepEqual(await agent.beforeAction(room,bot),{});assert.equal(chatView(room,bot).public.length,0);assert.equal(agent.isBusy(bot),false);assert.equal(agent.diagnostics().invalid,1);
});
test('API 스키마는 현재 후보와 근거만 허용하고 진단은 키를 숨김',async()=>{
 const {room,bot}=setup(),p=prepared(room,bot),schema=decisionSchema(p);let body;
 const client=createAgentClient({apiKey:'test-secret',baseURL:'https://api.baze.co/v1/gateway',fetcher:async(u,i)=>{body=JSON.parse(i.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(output(p))}}]})};}});
 await client.ask('test',p.context,schema);assert.equal(body.response_format.json_schema.strict,true);assert.deepEqual(schema.properties.choice.enum,p.actions.map((_,i)=>i));assert.deepEqual(schema.properties.evidenceIds.items.enum,p.scope.facts.map(f=>f.id));assert.ok(!JSON.stringify(client.diagnostics()).includes('test-secret'));
});
test('봇 runner는 비동기 판단 중 중복 실행하지 않으며 고른 후보를 실행',async()=>{
 const {room,bot}=setup();room.players.find(p=>p!==bot).online=true;let calls=0,release,changes=0,error;
 const agent={beforeAction:async()=>{calls++;await new Promise(r=>{release=r;});return {action:{type:'expedition'}};},executed:()=>{}};
 const runner=createBotRunner({agent,delay:5,changed:()=>{changes++;runner.close();},failed:e=>error=e});runner.schedule(room);
 await new Promise(r=>setTimeout(r,20));runner.schedule(room);await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);release();await new Promise(r=>setTimeout(r,20));runner.close();assert.equal(error,undefined);assert.equal(changes,1);assert.equal(room.game.phase,'expeditionVote');
});
