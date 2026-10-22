import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,RECIPES} from '../lib/game.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {createBotRunner} from '../lib/ai-runner.js';

test('실제 실행기는 축약 후보에 없는 직접 구성 제작3회를 바꿔치기 없이 실행',async()=>{
 const r=makeRoom('LIVE','사람');joinRoom(r,'봇');joinRoom(r,'상대');act(r,r.host,{type:'start'});
 const bot=r.players[1];r.players.forEach((p,i)=>{p.role=['king','citizen','rebel'][i];p.job=null;p.notes=[];p.online=true;});bot.bot=true;
 r.game.king=r.host;r.game.order=r.players.map(p=>p.id);r.game.phase='day';r.game.round=2;r.game.turn=1;r.game.pending={kind:'craft'};
 bot.hand=Array.from({length:24},()=>card('resource'));const recipe=RECIPES.findIndex(r=>r.input==='resource'&&r.output==='sword');
 const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async(_system,c)=>({choice:null,commitmentChoice:null,futureCommitment:null,constructedAction:{type:'craft',recipe,count:3},communication:'silent',text:'',goal:c.objective.goal,desiredBelief:'',assessment:'',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false})},failed:e=>{throw Error(e);}});
 let runner;try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{runner.close();reject(Error('직접구성 실행 시간초과'));},3000);runner=createBotRunner({agent,delay:5,changed:async()=>{clearTimeout(timeout);runner.close();resolve();},failed:reject});runner.schedule(r);});
 assert.equal(bot.hand.filter(c=>c.type==='sword').length,3*(RECIPES[recipe].amount||1));assert.equal(bot.actionAudit.at(-1).action.count,3);
 }finally{runner?.close();agent.close();}
});
