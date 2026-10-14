import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {prepareDecision,mindFor,objectiveFor} from '../lib/agent-mind.js';
import {candidates} from '../lib/ai-policy.js';
import {createBotRunner} from '../lib/ai-runner.js';
import {chatAct,chatView,respondToChat} from '../lib/chat.js';
function setup(){const r=makeRoom('MINDS','human');joinRoom(r,'AI1');joinRoom(r,'AI2');act(r,r.host,{type:'start'});r.players.slice(1).forEach(p=>{p.bot=true;p.online=true;});return r;}
const output=context=>({choice:context.legalActions[0]?.index??null,commitmentChoice:null,communication:'silent',text:'',goal:'자기 진영 목표',desiredBelief:'불확실성 유지',assessment:'근거 부족',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false});
test('한 AI의 일일 판단 예산이 다른 AI의 판단을 막지 않음',async()=>{
 const r=setup(),calls=[];const agent=createCognitiveAgent({maxAutonomousPerDay:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_system,c)=>{calls.push(c.actorId);return output(c);}},changed:async()=>{},failed:()=>{}});
 r.game.phase='executionVote';r.game.pending={done:[],votes:{}};
 for(const bot of r.players.slice(1))await agent.deliberate(r,bot,{channel:'public'},true);
 assert.equal(new Set(calls).size,2);assert.notEqual(r.players[1].agentBudget,r.players[2].agentBudget);assert.equal(r.agentBudget,undefined);
});
test('AI별 기억과 진영 목표를 분리하고 비공개 타인 직업을 전달하지 않음',()=>{
 const r=setup(),a=r.players[1],b=r.players[2];a.role='rebel';b.role='citizen';b.job='hunter';
 const s=view(r,a.id),prepared=prepareDecision({bot:a,epoch:r.game.startedAt,snapshot:s,actions:candidates(s),history:[]});
 assert.equal(prepared.context.objective.side,'rebel');assert.equal(objectiveFor(view(r,b.id)).side,'royal');
 mindFor(a,r.game.startedAt).audit.push({goal:'반란 준비'});assert.equal(mindFor(b,r.game.startedAt).audit.length,0);
 assert.equal(prepared.context.state.players.find(p=>p.id===b.id).job,null);
});
test('같은 AI의 동일한 발언 반복을 억제하고 실제 행동 계획은 유지',async()=>{
 const r=setup(),bot=r.players[1];r.game.phase='redistribute';r.game.pending={done:[]};
 const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async(_system,c)=>({...output(c),communication:'answer',text:'조건을 먼저 확인해볼게요.'})},changed:async()=>{},failed:()=>{}});
 await agent.deliberate(r,bot,{channel:'public'},false);await agent.deliberate(r,bot,{channel:'public'},false);
 assert.equal(r.chat.public.length,1);assert.ok(bot.agentMind.scopes['public/'].plan.action);
});
test('앞 AI가 답변을 기다려도 뒤 AI에게 독립 판단 기회 제공',async()=>{
 const r=setup();r.players[0].online=true;r.game.phase='executionVote';r.game.pending={votes:{},done:[]};
 const calls=[];let resolveDone;const done=new Promise(resolve=>resolveDone=resolve);
 const runner=createBotRunner({delay:5,agent:{enabled:true,beforeAction:async(_room,bot)=>{calls.push(bot.id);if(calls.length>=2){runner.close();resolveDone();}return {wait:true};}},changed:async()=>{},failed:error=>{runner.close();resolveDone();assert.fail(error);}});
 runner.schedule(r);const timer=setTimeout(()=>{runner.close();resolveDone();},500);
 await done;clearTimeout(timer);assert.deepEqual(calls.slice(0,2),r.players.slice(1).map(p=>p.id));
});
test('반란군 기본 응답은 왕국 지원을 자동 약속하지 않음',()=>{
 const r=setup(),bot=r.players[1];bot.role='rebel';r.players[2].bot=false;
 chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'중재 좀 도와줘'});
 respondToChat(r,r.players[0],{type:'chatSend',channel:'public',text:'중재 좀 도와줘'});
 assert.ok(!chatView(r,bot).public.at(-1).text.includes('지원 요청 확인'));assert.equal(bot.conversationPlan,undefined);
});
test('학습 없이도 각 진영·중립 직업의 승리 목표를 정확히 제공',()=>{
 const r=setup(),bot=r.players[1];bot.role='neutral';
 for(const [job,side] of [['bishop','bishop'],['merchant','merchant'],[null,'neutral']]){bot.job=job;assert.equal(objectiveFor(view(r,bot.id)).side,side);}
});
