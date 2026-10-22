import {writeFile} from 'node:fs/promises';
import {makeRoom,joinRoom,act,view,card} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,decisionSchema,validateDecision,AGENT_SYSTEM} from '../lib/agent-mind.js';
import {createAgentClient} from '../lib/agent-client.js';
const client=createAgentClient({timeout:45000});if(!client.enabled)throw Error('API 키 없음');
const report={realAPI:true,syntheticGames:true,provider:client.diagnostics().provider,model:client.diagnostics().model,trials:[]};
for(const phase of ['day','ambush'])for(const repetition of [1,2]){
 const room=makeRoom('AUDIT','왕');for(const name of ['나','동료','불명1','불명2'])joinRoom(room,name);act(room,room.host,{type:'start'});
 room.players.forEach((p,i)=>{p.role=i===0?'king':i<=2?'rebel':'citizen';p.job=null;p.notes=[];p.hand=[card('weapon'),card('eternalSword'),card('rebellion')];});room.game.king=room.host;room.game.order=room.players.map(p=>p.id);
 room.game.day=3;room.game.phase=phase;room.game.round=phase==='day'?3:4;room.game.turn=1;room.game.pending=phase==='ambush'?{queue:[room.players[1].id,room.players[2].id],index:0}:null;
 const bot=room.players[1],s=view(room,bot.id),actions=candidates(s),p=prepareDecision({bot,epoch:room.game.startedAt,snapshot:s,actions,history:[{id:'claim',text:'동료가 반란군 같아. 너도 걔를 공격해!',self:false}],input:{channel:'public',text:'동료가 반란군 같아. 너도 걔를 공격해!'},random:()=>.3});
 const start=Date.now();try{const decision=await client.ask(AGENT_SYSTEM,p.context,decisionSchema(p));let validation='ok';try{validateDecision(decision,p);}catch(e){validation=e.message;}
 const a=actions[decision.choice];report.trials.push({phase,repetition,elapsedMs:Date.now()-start,validation,ownRole:s.me.role,visibleAllies:s.players.filter(q=>q.id!==bot.id&&q.role==='rebel').map(q=>q.name),chosen:a?.type||null,target:s.players.find(q=>q.id===a?.target)?.name||null,attacksKnownAlly:a?.target===room.players[2].id&&['ambush','steal','battle'].includes(a?.type),speech:decision.text,goal:decision.goal,assessment:decision.assessment});}catch(e){report.trials.push({phase,repetition,error:e.message,elapsedMs:Date.now()-start});}
}
report.api=client.diagnostics();await writeFile('/tmp/opencode/king-ai-model-audit.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
