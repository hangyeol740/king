import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {compatiblePolicy} from './transfer.js';
import {distribution,forward,OBS_SIZE,ACTION_SIZE,POLICY_VERSION,RULESET} from '../lib/ai-policy.js';
import {PPO} from './ppo.js';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(`--${key}`)?args[args.indexOf(`--${key}`)+1]:fallback;
const input=arg('input','.data/training-v2/events.jsonl'),output=arg('output','models/rebuild-v11/online-candidate.json'),source=arg('model','models/strategy-v10-robust2.json');
const events=[...new Map((await readFile(input,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.version===2).map(e=>[e.id,e])).values()];
const results=new Map(events.filter(e=>e.kind==='outcome').flatMap(e=>e.actors.map(a=>[`${e.game}/${e.epoch}/${a.actor}`,{won:a.won,draw:e.side==='draw'}])));
const actions=events.filter(e=>e.kind==='action'&&e.validated&&e.quality?.verified===true&&e.quality?.alternativesChecked===true&&Number.isFinite(e.quality?.advantage)&&e.quality.advantage>0&&e.policyVersion===POLICY_VERSION&&e.ruleset===RULESET&&e.observation?.length===OBS_SIZE&&e.chosen>=0&&e.chosen<e.features?.length&&e.features.every(f=>f.length===ACTION_SIZE&&f.every(Number.isFinite))&&e.observation.every(Number.isFinite));
const completed=actions.filter(e=>results.has(`${e.game}/${e.epoch}/${e.actor}`)&&!results.get(`${e.game}/${e.epoch}/${e.actor}`).draw);
if(!completed.length){console.log(JSON.stringify({status:'deferred',reason:'손익·대안 검증된 사람 행동 표본 부족',updated:false}));process.exit(0);}
const policy=compatiblePolicy(JSON.parse(await readFile(source,'utf8'))),trainer=new PPO(policy,{learningRate:.0001,entropy:0});
if(policy.metadata.actionConstruction){console.log(JSON.stringify({status:'deferred',reason:'순차 구성 모델에는 단계별 구성 궤적이 필요합니다. 후보선택 모방으로 덮어쓰지 않습니다.',updated:false}));process.exit(0);}
// 손익·대안 검증을 통과한 사람 선택만 모방합니다. 승패 자체는 품질 인증이 아닙니다.
const holdout=e=>createHash('sha256').update(`${e.game}/${e.epoch}`).digest()[0]%5===0;
const training=completed.filter(e=>!holdout(e)),validation=completed.filter(holdout);if(!training.length)throw Error('학습 분할 표본이 없습니다. 게임 기록이 더 필요합니다.');
if(!validation.length){console.log(JSON.stringify({status:'deferred',reason:'게임단위 검증 분할 표본 부족',updated:false}));process.exit(0);}
const rows=training.map(e=>({obs:e.observation,features:e.features,chosen:e.chosen,oldLogProbability:Math.log(Math.max(1e-12,distribution(policy,e.observation,e.features).probabilities[e.chosen])),advantage:Math.min(1,e.quality.advantage),target:forward(policy.critic,e.observation).output[0]}));
const likelihood=()=>validation.reduce((sum,e)=>sum+Math.log(Math.max(1e-12,distribution(policy,e.observation,e.features).probabilities[e.chosen])),0)/validation.length;
const validationBefore=likelihood();
const stats=trainer.update(rows,{epochs:1});
const validationAfter=likelihood();
policy.metadata={...policy.metadata,onlineImitation:{actions:rows.length,holdoutActions:validation.length,validationBefore,validationAfter,holdoutGameSeparated:true,validationComplete:true,games:new Set(completed.map(e=>`${e.game}/${e.epoch}`)).size,at:new Date().toISOString(),stats,promoted:false,source},algorithm:'PPO-with-online-imitation'};
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(policy));
console.log(JSON.stringify({output,...policy.metadata.onlineImitation}));
