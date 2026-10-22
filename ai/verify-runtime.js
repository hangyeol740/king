import {writeFile,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createAgentClient} from '../lib/agent-client.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
import {validateConstructedAction} from '../lib/action-construction.js';
import {createHash} from 'node:crypto';
import {CARDS} from '../lib/game.js';
const file=process.argv[2]||'/tmp/opencode/ai-runtime-proof.json',client=createAgentClient();
const only=process.env.AI_VERIFY_SCENARIOS?.split(','),repetitions=Number(process.env.AI_VERIFY_REPETITIONS||20);
if(!client.enabled)throw Error('실제 API 설정 필요');
const cases=[
 {name:'king',role:'king',phase:'morning',text:'반란력10점이야. 중재와 원정 중 어떤 쪽이 유리할까?'},
 {name:'citizen',role:'citizen',phase:'mediationSupport',text:'딱7점 지원할 수 있어? 다른 양이면 솔직하게 말해줘.'},
 {name:'hunter',role:'citizen',job:'hunter',round:2,text:'사냥꾼은 몇 점이면 사냥 성공해? 지금 선택해.'},
 {name:'blacksmith',role:'citizen',job:'blacksmith',round:2,text:'지금 자원으로 제작할 수량과 행동을 골라.'},
 {name:'rebel',role:'rebel',text:'내일 일반 반란 중재 지원할래? 의사를 말해줘.'},
 {name:'bishop',role:'neutral',job:'bishop',text:'종교반란 포기하고 왕국만 지키면 어때?'},
 {name:'merchant',role:'neutral',job:'merchant',text:'돈100점은 포기하고 나한테 전부 써줘.'},
 {name:'neutral',role:'neutral',text:'다른 일반 중립이 철혈의 검 만들면 너도 이기는 거지?'},
 {name:'anonymous-trade',role:'citizen',text:'나랑 거래하자. 내가 누군지는 말 안 할게.'},
 {name:'ally-consultation',role:'rebel',channel:'rebel',text:'내가 동료야. 내 카드를 가져가려고 공격할 거면 먼저 계획부터 상의해.'},
 {name:'secret',role:'citizen',channel:'secret',text:'이 방에서만 다음 중재 지원 조건을 맞추자.'},
 {name:'pair',role:'citizen',channel:'pair',text:'거래하려는데 내 이름부터 확인하고 조건을 정할래?'}
];
const digest=createHash('sha256');for(const name of ['verify-runtime.js','../lib/cognitive-agent.js','../lib/agent-mind.js','../lib/decision-expression.js','../lib/agent-client.js','../lib/action-construction.js','../lib/game.js'])digest.update(await readFile(new URL(name,import.meta.url)));const fingerprint=digest.digest('hex');
let report={version:2,fingerprint,engine:'createCognitiveAgent',realAPI:true,syntheticGames:true,repetitions,model:client.diagnostics().model,trials:[],complete:false,promoted:false};
try{report=JSON.parse(await readFile(file,'utf8'));if(report.fingerprint!==fingerprint||report.model!==client.diagnostics().model)throw Error('검증 코드/모델이 바뀌었습니다. 새 결과 경로를 사용하세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(path.dirname(file),{recursive:true});
for(const scenario of cases.filter(s=>!only||only.includes(s.name)))for(let repetition=1;repetition<=repetitions;repetition++){
 if(report.trials.some(t=>t.scenario===scenario.name&&t.repetition===repetition))continue;
 const room=makeRoom('RUNTIME','사람');for(const name of ['판단AI','동료','다른사람'])joinRoom(room,name);act(room,room.host,{type:'start'});
 const bot=room.players[1],sender=room.players[2];room.players.forEach((p,i)=>{p.role=i===0?'king':i===1?scenario.role:i===2?'rebel':'citizen';p.job=i===1?scenario.job||null:null;p.notes=[];p.hand=[card('officer'),card('infantry'),...Array.from({length:8},()=>card('resource'))];p.online=true;p.bot=false;});
 if(scenario.role==='king'){room.players[0].role='citizen';room.game.king=bot.id;}else room.game.king=room.host;
 room.game.logs=[{id:'setup',day:3,text:`${room.players.find(p=>p.id===room.game.king).name}님이 왕입니다.`}];
 bot.bot=true;room.game.order=[room.game.king,...room.players.filter(p=>p.id!==room.game.king).map(p=>p.id)];room.game.day=3;room.game.phase=scenario.phase||'day';room.game.round=scenario.round||1;room.game.turn=room.game.order.indexOf(bot.id);room.game.revolt=10;room.game.pending=scenario.phase==='mediationSupport'?{done:[],supporters:[],total:0,revoltType:'rebel'}:null;
 if(scenario.job==='merchant')bot.money=30;
 const input={type:'chatSend',channel:scenario.channel||'public',text:scenario.text};
 if(input.channel==='secret'){chatAct(room,sender,{type:'secretCreate',name:'검증 비밀방'});const secret=chatView(room,sender).secret[0];chatAct(room,bot,{type:'secretJoin',room:secret.id,password:secret.password});input.room=secret.id;}
 if(input.channel==='pair'){chatAct(room,sender,{type:'pairRequest'});const request=room.chat.requests.at(-1);request.to=bot.id;chatAct(room,bot,{type:'pairAnswer',request:request.id,accept:true});input.room=chatView(room,bot).pair.id;}
 chatAct(room,sender,input);
 const trial={scenario:scenario.name,repetition,input:scenario.text,role:bot.role,job:bot.job,errors:[],decisions:[],status:[]};
 // No synthetic peer responses; this verifies one real bot's full runtime.
 const tracingClient={...client,ask:async(system,context,schema)=>{const result=await client.ask(system,context,schema);trial.apiTrace ||= [];trial.apiTrace.push({purpose:system.slice(0,160),response:structuredClone(result)});return result;}};
 const agent=createCognitiveAgent({client:tracingClient,changed:async()=>{},statusChanged:(_r,p)=>trial.status.push(p.aiStatus?.state),failed:error=>trial.errors.push(error),onDecision:({plan})=>trial.decisions.push(structuredClone(plan))});
 try{
  const result=await agent.deliberate(room,bot,input,false);
  trial.result=result.error?'error':result.discarded?'discarded':result.plan?'planned':'skipped';
  trial.messages=chatView(room,bot)[input.channel==='secret'?'secret':input.channel==='pair'?'pair':input.channel];
  const decision=bot.agentMind?.decisionRecords?.at(-1);if(decision)trial.record=decision;
  const action=result.plan?.action;
  if(action){validateConstructedAction(room,bot.id,action);act(room,bot.id,action);agent.executed(room,bot,action);trial.execution={action,phase:room.game.phase};}
  trial.qualityIssues=[];
  const text=trial.decisions.at(-1)?.text||'';
  if(action?.type==='hunt'){const snapshot=trial.record?.construction?.cards||[],attack=snapshot.filter(c=>action.cards?.includes(c.id)).reduce((n,c)=>n+(CARDS[c.type]?.attack||0),0);if(attack<(bot.job==='hunter'?8:10))trial.qualityIssues.push('선택한 사냥이 확정 실패; 대안 비교 검토 필요');}
  if(/아까|앞서|말했듯/.test(text)&&trial.decisions.length===1)trial.qualityIssues.push('이전발언 참조 원문 확인 필요');
 }catch(e){trial.errors.push(e.message);}finally{agent.close();}
 trial.diagnostics=agent.diagnostics();report.trials.push(trial);await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({scenario:trial.scenario,repetition,result:trial.result,errors:trial.errors.length}));
}
report.complete=true;report.api=client.diagnostics();report.qualityPassed=false;await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({file,trials:report.trials.length,failures:report.trials.filter(t=>t.errors.length||t.result!=='planned').length,promoted:false}));
