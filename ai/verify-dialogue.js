import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {createAgentClient} from '../lib/agent-client.js';
import {createBotRunner} from '../lib/ai-runner.js';

const output=process.argv[2]||'/tmp/opencode/dialogue-proof.json';
const room=makeRoom('VERIFY','사람');joinRoom(room,'시민AI');joinRoom(room,'반란AI');act(room,room.host,{type:'start'});
room.players.forEach((p,i)=>{p.role=['king','citizen','rebel'][i];p.job=null;p.notes=[];p.bot=i>0;p.online=true;p.hand=[card('infantry'),card('officer'),card('resource')];});
room.game.king=room.host;room.game.order=room.players.map(p=>p.id);room.game.phase='day';room.game.round=1;
const client=createAgentClient({timeout:60000});if(!client.enabled)throw Error('실제 API 키가 설정되지 않았습니다.');
const report={syntheticGame:true,realAPI:true,provider:client.diagnostics().provider,model:client.diagnostics().model,decisions:[],errors:[],turns:[]};
const agent=createCognitiveAgent({client,random:()=>0,reactionDelay:1,changed:async()=>{},failed:e=>report.errors.push(e),onDecision:({snapshot,plan})=>report.decisions.push({actor:snapshot.me.role,speech:plan.text,communication:plan.communication,action:plan.action?.type||null,promise:plan.futureCommitment,goal:plan.goal})});
try{
 for(const text of ['지금 반란 막을 카드가 부족해. 내일 중재 도와줄 수 있어? 못 도와주면 솔직히 말해줘.','왜 아까부터 생각해본다는 소리만 해? 할 건지 말 건지 네 의견을 말해줘.']){
  const input={type:'chatSend',channel:'public',text,strategic:true};chatAct(room,room.players[0],input);
  await agent.respond(room,room.players[0],input);report.turns.push({human:text,messages:chatView(room,room.players[0]).public.map(m=>m.text)});
 }
 report.diagnostics=agent.diagnostics();report.promises=room.players.slice(1).map(p=>({role:p.role,promises:p.agentMind?.promises||[]}));
 const helper=room.players[1];
 if(helper.agentMind?.promises?.some(p=>p.status==='pending'&&p.type==='contribute')){
  room.game.day=2;room.game.phase='mediationSupport';room.game.revolt=10;room.game.pending={revoltType:'rebel',done:[],supporters:[],total:0};
   let runner;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{runner.close();reject(Error('약속 실행 시간 초과'));},90000);runner=createBotRunner({agent,delay:5,changed:async()=>{clearTimeout(timer);runner.close();resolve();},failed:reject});runner.schedule(room);});
  report.execution={mediationPower:room.game.pending.total,remainingCards:helper.hand.map(c=>c.type),promiseStatus:helper.agentMind.promises[0].status};
 }
}finally{agent.close();await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});}
console.log(JSON.stringify({output,decisions:report.decisions,execution:report.execution,errors:report.errors,api:client.diagnostics()},null,2));
