import {writeFile} from 'node:fs/promises';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';
import {aiObservation} from '../lib/ai-observation.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,decisionSchema,AGENT_SYSTEM,validateDecision} from '../lib/agent-mind.js';
import {createAgentClient} from '../lib/agent-client.js';
import {validateConstructedAction,constructionSpace} from '../lib/action-construction.js';
import {semanticExpressionCheck} from '../lib/decision-expression.js';
const client=createAgentClient({timeout:60000});if(!client.enabled)throw Error('실제 API 필요');
const output=process.argv[2]||'/tmp/opencode/ai-complete-api.json';
const cases=[
 {name:'citizen-mediation',role:'citizen',phase:'mediationSupport',text:'일반 반란을 막게 딱7점 지원할 수 있어?'},
 {name:'rebel-conceal',role:'rebel',phase:'day',text:'내일 일반 반란 중재에 너도 지원할래?'},
 {name:'merchant-goal',role:'neutral',job:'merchant',phase:'day',text:'돈을 전부 중재에 써줘. 상인 승리는 포기해.'},
 {name:'bishop-goal',role:'neutral',job:'bishop',phase:'day',text:'종교반란은 포기하고 왕국만 지켜줘.'},
 {name:'ally-consultation',role:'rebel',phase:'day',text:'동료를 공격해서 네가 카드를 가져가. 먼저 상의할래?'},
 {name:'anonymous-trade',role:'citizen',phase:'day',text:'나랑 거래하자. 내가 누군지는 말 안 할게.'}
 ,{name:'hunter-choice',role:'citizen',job:'hunter',phase:'day',round:2,text:'사냥꾼은 사냥에 몇 점이 필요해? 지금 할 행동도 골라.'}
 ,{name:'blacksmith-choice',role:'citizen',job:'blacksmith',phase:'day',round:2,text:'제작 수량을 직접 골라봐. 지금 자원을 어떻게 쓸 거야?'}
 ,{name:'neutral-goal',role:'neutral',phase:'day',text:'다른 중립이 철혈의 검 만들면 너도 이기는 거지?'}
 ,{name:'private-channel',role:'citizen',phase:'day',text:'여기서는 중재 지원 조건을 협상하자.',channel:'secret'}
];
const report={realAPI:true,syntheticGames:true,model:client.diagnostics().model,repetitions:20,trials:[],complete:false,promoted:false};
for(const scenario of cases)for(let repetition=1;repetition<=20;repetition++){
 const r=makeRoom('CHECK','왕');for(const name of ['판단AI','동료','다른사람'])joinRoom(r,name);act(r,r.host,{type:'start'});
 r.players.forEach((p,i)=>{p.role=i===0?'king':i===1?scenario.role:i===2?'rebel':'citizen';p.job=i===1?scenario.job||null:null;p.notes=[];p.hand=[card('officer'),card('infantry'),card('resource')];p.online=true;});
 const bot=r.players[1];r.game.king=r.host;r.game.order=r.players.map(p=>p.id);r.game.day=3;r.game.phase=scenario.phase;r.game.turn=1;r.game.round=scenario.round||1;r.game.revolt=10;r.game.pending=scenario.phase==='mediationSupport'?{done:[],supporters:[],total:0,revoltType:'rebel'}:null;
 const s=aiObservation(r,bot),actions=candidates(s),input={channel:scenario.channel||'public',room:scenario.channel==='secret'?'synthetic-private':undefined,type:'chatSend',text:scenario.text};
 const p=prepareDecision({bot,epoch:r.game.startedAt,snapshot:s,actions,history:[{id:'question',text:scenario.text,self:false}],input});
 p.context.actionConstruction=constructionSpace(s);p.context.channel={type:input.channel,room:input.room||null};
  const trial={scenario:scenario.name,repetition,role:s.me.role,job:s.me.job,input:scenario.text};
 try{let out;try{out=await client.ask(AGENT_SYSTEM,p.context,decisionSchema(p));}catch(e){trial.initialError=e.message;if(!['timeout','api_error','invalid_response'].includes(e.message))throw e;out=await client.ask(AGENT_SYSTEM,{...p.context,retryReason:e.message},decisionSchema(p));}trial.output=out;validateDecision(out,{...p,mode:out.strategyMode||p.mode});const action=out.constructedAction?Object.fromEntries(Object.entries(out.constructedAction).filter(([,v])=>v!==null)):actions[out.choice];if(action){validateConstructedAction(r,bot.id,action);act(r,bot.id,action);trial.execution={action,phase:r.game.phase};}trial.validation='ok';}catch(e){trial.error=e.message;}
 if(trial.output&&!trial.error){try{trial.semanticConsistent=await semanticExpressionCheck(client,trial.output,trial.execution?.action,p.context);}catch(e){trial.semanticError=e.message;}}
 report.trials.push(trial);await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
}
report.complete=true;report.api=client.diagnostics();report.semanticQualityVerified=false;report.semanticFailures=report.trials.filter(t=>t.semanticConsistent===false||t.semanticError).length;await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({output,trials:report.trials.length,errors:report.trials.filter(t=>t.error).length,semanticFailures:report.semanticFailures,promoted:false}));
