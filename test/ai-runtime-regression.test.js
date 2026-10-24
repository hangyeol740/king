import test from 'node:test';
import assert from 'node:assert/strict';
import {act,makeRoom,joinRoom,view} from '../lib/game.js';
import {constructionTemplates} from '../lib/construction-rules.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {candidates} from '../lib/ai-policy.js';

function room(){const r=makeRoom('AICHECK','사람');for(let i=0;i<3;i++)joinRoom(r,`동행${i}`);act(r,r.host,{type:'start'});r.game.day=3;return r;}
test('중립 기권이 원정 투표·참가의 마지막 미응답이면 다음 단계로 진행',()=>{
 for(const phase of ['expeditionVote','expeditionJoin']){
  const r=room(),neutral=r.players.find(p=>p.role==='neutral');
  r.game.phase=phase;r.game.pending={eventId:'test-event',done:r.players.filter(p=>p!==neutral).map(p=>p.id),votes:Object.fromEntries(r.players.filter(p=>p!==neutral).map(p=>[p.id,'low'])),participants:[r.game.king],total:0,contributors:[],difficulty:'low'};
  act(r,neutral.id,{type:'requestSurrender'});
  assert.equal(neutral.surrendered,true);assert.notEqual(r.game.phase,phase);
 }
});
test('순차 행동은 이미 사용한 무승부 요청을 다시 구성하지 않음',()=>{
 const r=room(),king=r.players.find(p=>p.role==='king');king.drawRequested=true;
 r.game.phase='morning';r.game.pending=null;
 assert.equal(constructionTemplates(view(r,king.id)).some(a=>a.type==='requestDraw'),false);
});
test('저녁 결투 순서의 중립이 기권하면 다음 참가자로 진행',()=>{
 const r=room(),neutral=r.players.find(p=>p.role==='neutral'),king=r.players.find(p=>p.role==='king');
 r.game.phase='eveningDuel';r.game.pending={queue:[neutral.id,king.id],index:0};
 act(r,neutral.id,{type:'requestSurrender'});
 assert.equal(r.game.pending.queue[r.game.pending.index],king.id);
});
test('실제 결제 거부 응답은 설정 오류로 분류되고 정책 행동을 막지 않음',async()=>{
 const r=room(),bot=r.players.find(p=>p.role==='king');bot.bot=true;r.game.phase='morning';r.game.pending=null;
 const client={enabled:true,ask:async()=>{throw Error('http_402');},diagnostics:()=>({configured:true})};
 const agent=createCognitiveAgent({client,failed:()=>{}});
 try{await agent.deliberate(r,bot,{channel:'public',type:'action'},true);assert.equal(bot.aiStatus.state,'configuration-error');assert.equal((await agent.beforeAction(r,bot)).localPolicyFallback,true);}finally{agent.close();}
});
test('AI와 사람 대체 AI는 기권 요청·찬성을 후보와 서버 양쪽에서 금지',()=>{
 for(const takeover of [false,true]){
  const r=room(),p=r.players.find(p=>p.role==='king');p.bot=!takeover;p.takeover=takeover;r.game.phase='morning';r.game.pending=null;
  let s=view(r,p.id);s.me.bot=p.bot;s.me.takeover=p.takeover;
  for(const choices of [candidates(s),constructionTemplates(s)])assert.equal(choices.some(a=>a.type==='requestSurrender'),false);
  assert.throws(()=>act(r,p.id,{type:'requestSurrender'}),/AI는 기권/);
  assert.throws(()=>act(r,p.id,{type:'requestDraw'}),/AI는 무승부/);
  for(const choices of [candidates(s),constructionTemplates(s)])assert.equal(choices.some(a=>a.type==='requestDraw'),false);
  r.game.vote={id:'surrender-vote',kind:'surrender',eligible:[p.id],ballots:{},side:'royal'};
  s=view(r,p.id);s.me.bot=p.bot;s.me.takeover=p.takeover;
  for(const choices of [candidates(s),constructionTemplates(s)])assert.deepEqual(choices,[{type:'gameVote',vote:'surrender-vote',accept:false}]);
  assert.throws(()=>act(r,p.id,{type:'gameVote',vote:'surrender-vote',accept:true}),/AI는 기권/);
 }
});
