import {readFile} from 'node:fs/promises';
import {compatiblePolicy} from './transfer.js';
import {EVALUATED_ROLES} from './evaluation-gate.js';
import {evaluateCell,eligibleCounts} from './cell-evaluation.js';
import {statisticalGate} from './statistical-gate.js';
import {saveExperiment} from './checkpoint.js';
import {createHash} from 'node:crypto';
import {seededRandom} from '../lib/ai-policy.js';
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(`--${name}`)?args[args.indexOf(`--${name}`)+1]:fallback;
const source=arg('candidate',null),baseFile=arg('baseline',null),output=arg('output',null);
const alpha=Number(arg('alpha',.05));if(!(alpha>0&&alpha<1))throw Error('alpha 범위 오류');
if(!source||!baseFile||!output)throw Error('--candidate --baseline --output 필요');
const candidate=compatiblePolicy(JSON.parse(await readFile(source,'utf8'))),baseline=compatiblePolicy(JSON.parse(await readFile(baseFile,'utf8')));
const opponents=['random','balanced','cooperative','aggressive','builder','trader','mixed',baseline];
const names=['random','balanced','cooperative','aggressive','builder','trader','mixed','baseline'];
const poolFile=arg('pool',null);if(poolFile){const files=JSON.parse(await readFile(poolFile,'utf8'));for(let i=0;i<files.length;i++){opponents.push(compatiblePolicy(JSON.parse(await readFile(files[i],'utf8'))));names.push(`verified-${i}`);}}
const inputHash=createHash('sha256').update(JSON.stringify([candidate,baseline,opponents,alpha])).digest('hex');
const codeHash=createHash('sha256');for(const name of ['evaluate-complete.js','cell-evaluation.js','statistical-gate.js','environment.js','../lib/game.js','../lib/action-construction.js','../lib/construction-rules.js','../lib/action-fields.js','../lib/ai-policy.js','../lib/ai-observation.js','transfer.js'])codeHash.update(await readFile(new URL(name,import.meta.url)));const engine=codeHash.digest('hex');
let report={version:2,engine,inputHash,candidate:source,baseline:baseFile,poolFile,cells:{candidate:{},baseline:{}},byCount:{candidate:{},baseline:{}},opponentGames:{candidate:{},baseline:{}},complete:false};
try{report=JSON.parse(await readFile(output,'utf8'));if(report.engine!==engine||report.inputHash!==inputHash)throw Error('평가 코드/가중치/상대풀 변경: 새 결과 경로 필요');}catch(e){if(e.code!=='ENOENT')throw e;}
const random=seededRandom(881);if(report.rng!==undefined)random.restore(report.rng);const save=async()=>{report.rng=random.state();await saveExperiment(output,report);};
if(report.complete){console.log(JSON.stringify({output,state:report.gate.state,promoted:false}));process.exit(0);}
const keys=EVALUATED_ROLES.flatMap(role=>names.map(n=>`${role}/${n}`));
for(let look=report.look||500;look<=5000;look+=500){
 report.look=look;
 for(const who of ['candidate','baseline'])for(const role of EVALUATED_ROLES)for(let i=0;i<opponents.length;i++){
  const key=`${role}/${names[i]}`,row=report.cells[who][key] ||= {games:0,wins:0,draws:0};
  while(row.games<look){
   const counts=eligibleCounts(role),count=counts[row.games%counts.length],r=evaluateCell(who==='candidate'?candidate:baseline,{role,count,opponent:opponents[i],random});
   row.games++;row.wins+=Number(r.won);row.draws+=Number(r.draw);
   const countKey=`${role}/${count}/${names[i]}`,c=report.byCount[who][countKey] ||= {games:0,wins:0,draws:0};c.games++;c.wins+=Number(r.won);c.draws+=Number(r.draw);
   report.opponentGames[who][names[i]]=(report.opponentGames[who][names[i]]||0)+1;
   if(row.games%50===0)await save();
  }
 }
   report.gate=statisticalGate(report.cells.candidate,report.cells.baseline,keys,{alpha});await save();
   if(['pass','fail','hold'].includes(report.gate.state))break;
   report.look=look+500;await save();
}
report.complete=true;report.promoted=false;await save();console.log(JSON.stringify({output,state:report.gate.state,promoted:false}));
