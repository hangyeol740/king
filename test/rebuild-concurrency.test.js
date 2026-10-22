import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,commitDecision,plannedAction} from '../lib/agent-mind.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
const setup=()=>{const r=makeRoom('R','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players.find(p=>p.role==='citizen');bot.bot=true;return {r,bot};};
const output=c=>({choice:null,commitmentChoice:null,futureCommitment:null,socialChoice:null,communication:'silent',silenceReason:'새 발언 불필요',text:'',goal:c.objective.goal,desiredBelief:'판단',assessment:'근거',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false});
test('채팅·행동 계산이 동시에 실행되고 오래된 버전은 새 결정을 덮어쓰지 않음',async()=>{
 const {r,bot}=setup(),pending=[];const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:(_s,c)=>new Promise(resolve=>pending.push({c,resolve}))},changed:async()=>{},failed:()=>{}});
  try{const a=agent.deliberate(r,bot,{channel:'public',type:'chatSend',text:'거래할래?'},false),b=agent.deliberate(r,bot,{channel:'public',type:'action'},false);assert.equal(pending.length,2);pending[1].resolve(output(pending[1].c));await b;pending[0].resolve(output(pending[0].c));await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,3);pending[2].resolve({choice:null,commitmentChoice:null,revisionReason:'최신 계획과 행동만 재검토'});assert.ok((await a).plan);assert.equal(bot.agentMind.revision,2);}finally{agent.close();}
});
test('약속 철회는 내부 이유를 기록하고 허세는 실행 선호로 강제하지 않음',()=>{
 const {r,bot}=setup();const prepare=()=>{const s=view(r,bot.id);return prepareDecision({bot,epoch:r.game.startedAt,snapshot:s,actions:candidates(s),history:[],random:()=>0});};
 let p=prepare();commitDecision(p,{...output(p.context),communication:'accept',text:'나도 갈게',futureCommitment:'joinExpedition'});const promise=bot.agentMind.promises[0];
 p=prepare();commitDecision(p,{...output(p.context),retractPromises:[promise.id],revisionReason:'내 손패와 위험이 달라짐',planStatus:'revise'});assert.equal(promise.status,'retracted');
 p=prepare();commitDecision(p,{...output(p.context),strategyMode:'bluff',futureCommitment:'joinExpedition',communication:'accept',text:'나도 갈게'});r.game.phase='expeditionJoin';r.game.pending={done:[],participants:[r.game.king]};const s=view(r,bot.id);assert.equal(plannedAction(bot.agentMind,s,candidates(s)),null);assert.equal(bot.agentMind.promises[1].preferred,undefined);
});
