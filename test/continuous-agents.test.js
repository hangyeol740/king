import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {prepareDecision,commitDecision} from '../lib/agent-mind.js';
import {view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
function setup(){const r=makeRoom('WATCH','human');joinRoom(r,'bot1');joinRoom(r,'bot2');act(r,r.host,{type:'start'});r.players.slice(1).forEach(p=>p.bot=true);return r;}
const out=c=>({choice:c.legalActions[0]?.index??null,commitmentChoice:null,socialChoice:null,communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'조건 확인',assessment:'근거 부족',evidenceIds:[],planStatus:c.previousPlan?.status==='pending'?'keep':'new',revisionReason:'',waitForReply:false});
test('공개 메시지 하나를 모든 AI가 차례 밖에서 독립 판단',async()=>{
 const r=setup(),contexts=[];r.game.phase='day';r.game.round=1;r.game.turn=r.game.order.indexOf(r.host);
 const agent=createCognitiveAgent({reactionDelay:1,maxRepliesPerDay:0,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{contexts.push(c);return out(c);}},changed:async()=>{}});
 try{chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'누구랑 거래하는 게 좋을까?'});await agent.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'누구랑 거래하는 게 좋을까?'});
 assert.equal(new Set(contexts.map(c=>c.actorId)).size,2);assert.ok(contexts.every(c=>!c.state.me.canAct));
 assert.ok(r.players.slice(1).every(p=>p.agentMind.inbox['public/'].messages.length===1));
 }finally{agent.close();}
});
test('API 미설정이어도 모든 AI의 사건 기억은 갱신',()=>{
 const r=setup(),agent=createCognitiveAgent({client:{enabled:false,diagnostics:()=>({})}});
 try{agent.observe(r);assert.ok(r.players.slice(1).every(p=>p.agentMind.lastObservation.day===1));const b=r.players[1];b.notes.push({id:'private',text:'개인 획득'});agent.observe(r);assert.equal(b.agentMind.lastObservation.notes.at(-1).id,'private');assert.ok(!r.players[2].agentMind.lastObservation.notes.some(n=>n.id==='private'));}finally{agent.close();}
});
test('입장은 다음 판단에도 유지하고 근거 없는 목표 변경은 거부',()=>{
 const r=setup(),bot=r.players[1],s=view(r,bot.id);
 const make=()=>prepareDecision({bot,epoch:r.game.startedAt,snapshot:s,actions:candidates(s),history:[],random:()=>.9});
 const first=make();commitDecision(first,out(first.context));const next=make();assert.equal(next.mode,first.mode);
 assert.throws(()=>commitDecision(next,{...out(next.context),goal:'반대 목표'}),/unexplained_revision/);
});
test('비밀 메시지는 가입한 AI에게만 관찰·판단 전달',async()=>{
 const r=setup(),calls=[];const [human,a,b]=r.players;chatAct(r,human,{type:'secretCreate',name:'private'});const room=chatView(r,human).secret[0];chatAct(r,a,{type:'secretJoin',room:room.id,password:room.password});
 const agent=createCognitiveAgent({reactionDelay:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{calls.push(c.actorId);return out(c);}},changed:async()=>{}});
 try{chatAct(r,human,{type:'chatSend',channel:'secret',room:room.id,text:'비밀 제안'});await agent.respond(r,human,{type:'chatSend',channel:'secret',room:room.id,text:'비밀 제안'});assert.deepEqual(calls,[a.id]);assert.equal(b.agentMind,undefined);}finally{agent.close();}
});
test('복수 AI가 발언할 수 있고 AI끼리의 대화 연쇄는 유한함',async()=>{
 const r=setup();r.game.phase='day';r.game.round=1;r.game.turn=r.game.order.indexOf(r.host);let calls=0;
 const agent=createCognitiveAgent({reactionDelay:1,maxConversationDepth:1,client:{enabled:true,diagnostics:()=>({}),ask:async(_,c)=>{calls++;return {...out(c),communication:'answer',text:`의견 ${c.actorId} ${calls}`};}},changed:async()=>{}});
 try{chatAct(r,r.players[0],{type:'chatSend',channel:'public',text:'각자 의견은?'});await agent.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'각자 의견은?'});await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(new Set(r.chat.public.filter(m=>m.sender!==r.host).map(m=>m.sender)).size,2);assert.ok(calls<=4);assert.ok(r.players.slice(1).every(p=>p.agentMind.inbox['public/'].messages.length>=3));
 }finally{agent.close();}
});
