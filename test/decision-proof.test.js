import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {createBotRunner} from '../lib/ai-runner.js';
import {plannedAction} from '../lib/agent-mind.js';
import {candidates} from '../lib/ai-policy.js';

function setup(){const r=makeRoom('PROOF','사람');joinRoom(r,'지원AI');joinRoom(r,'반란AI');act(r,r.host,{type:'start'});r.players[0].role='king';r.players[1].role='citizen';r.players[2].role='rebel';r.game.king=r.host;r.game.order=r.players.map(p=>p.id);r.players[0].online=true;r.players.slice(1).forEach(p=>{p.bot=true;p.online=true;});return r;}
const response=(c,extra={})=>({choice:c.legalActions[0]?.index??null,commitmentChoice:null,futureCommitment:null,socialChoice:null,communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'자기 목표',assessment:'공개 근거만 사용',evidenceIds:[],planStatus:c.previousPlan?.status==='pending'?'keep':'new',revisionReason:'',waitForReply:false,...extra});
test('증명: 사람 채팅→서로 다른 AI 발언→다른 대화 뒤에도 약속 보존→봇 실행기로 실제 유료 지원',async()=>{
 const r=setup(),[human,helper,rebel]=r.players;helper.hand=[card('infantry')];
  const failures=[];const agent=createCognitiveAgent({random:()=>0,reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>response(c,c.state.game.phase==='mediationSupport'?{choice:c.legalActions.find(a=>a.cardCount>0)?.index??0,communication:'silent',text:''}:c.currentMessage==='내일 중재 도와줄래?'?(c.actorId===helper.id?{choice:null,futureCommitment:'contribute',communication:'accept',text:'응, 내가 보탤게.'}:{choice:null,communication:'decline',text:'난 다른 데 쓸 게 있어서 못 도와줘.'}):{choice:null,communication:'answer',text:'하급이 낫겠는데?'})},changed:async()=>{},failed:e=>failures.push(e)});
 try{
  const input={type:'chatSend',channel:'public',text:'내일 중재 도와줄래?'};chatAct(r,human,input);await agent.respond(r,human,input);
  assert.ok(chatView(r,human).public.some(m=>m.text==='응, 내가 보탤게.'));assert.ok(chatView(r,human).public.some(m=>m.text==='난 다른 데 쓸 게 있어서 못 도와줘.'));
  await agent.deliberate(r,helper,{channel:'public',text:'원정 난이도는?'},false);
  assert.equal(helper.agentMind.promises[0].status,'pending');
  r.game.phase='expeditionCards';r.game.pending={participants:[helper.id],done:[],total:0,difficulty:'low'};
  // 같은 contribute 이름이어도 중재 약속을 원정 제출로 소모하지 않습니다.
   plannedAction(helper.agentMind,view(r,helper.id),candidates(view(r,helper.id)));assert.equal(helper.agentMind.promises[0].preferred,undefined);assert.equal(helper.agentMind.promises[0].status,'pending');
  r.game.day=2;r.game.phase='mediationSupport';r.game.pending={done:[],supporters:[],total:0,revoltType:'rebel'};r.game.revolt=10;
  let runner;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{runner.close();reject(Error('실제 지원 실행 시간 초과'));},1000);runner=createBotRunner({agent,delay:5,changed:async()=>{clearTimeout(timer);runner.close();resolve();},failed:reject});runner.schedule(r);});
  assert.equal(r.game.pending.total,2);assert.equal(helper.hand.length,0);assert.equal(helper.agentMind.promises[0].status,'fulfilled');assert.deepEqual(failures,[]);
 }finally{agent.close();}
});
test('증명: 지원 카드가 없으면 0장 제출로 약속 이행이라고 기록하지 않음',async()=>{
 const r=setup(),bot=r.players[1];bot.hand=[];bot.agentMind={version:1,epoch:r.game.startedAt,scopes:{},budget:{day:0,used:0},audit:[],promises:[{type:'contribute',scope:'public/',status:'pending'}]};
 r.game.phase='mediationSupport';r.game.pending={done:[],supporters:[],total:0,revoltType:'rebel'};
 const agent=createCognitiveAgent({client:{enabled:false,diagnostics:()=>({})}});try{const result=await agent.beforeAction(r,bot);assert.equal(result.action,undefined);assert.equal(bot.agentMind.promises[0].status,'pending');}finally{agent.close();}
});
