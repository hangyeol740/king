import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {compatiblePolicy} from './transfer.js';
import {distribution,forward,OBS_SIZE,ACTION_SIZE} from '../lib/ai-policy.js';
import {PPO} from './ppo.js';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(`--${key}`)?args[args.indexOf(`--${key}`)+1]:fallback;
const input=arg('input','.data/training/events.jsonl'),output=arg('output','models/online-candidate.json'),source=arg('model','models/strategy-v10-robust2.json');
const events=(await readFile(input,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const results=new Map(events.filter(e=>e.kind==='outcome').flatMap(e=>e.actors.map(a=>[`${e.game}/${e.epoch}/${a.actor}`,{won:a.won,draw:e.side==='draw'}])));
const actions=events.filter(e=>e.kind==='action'&&e.observation?.length===OBS_SIZE&&e.chosen>=0&&e.chosen<e.features?.length&&e.features.every(f=>f.length===ACTION_SIZE));
const completed=actions.filter(e=>results.has(`${e.game}/${e.epoch}/${e.actor}`)&&!results.get(`${e.game}/${e.epoch}/${e.actor}`).draw);
if(!completed.length)throw Error('완료된 온라인 게임의 호환 행동 데이터가 없습니다. 기록이 쌓인 뒤 실행하세요.');
const policy=compatiblePolicy(JSON.parse(await readFile(source,'utf8'))),trainer=new PPO(policy,{learningRate:.0001,entropy:0});
// 사람이 선택한 합법 행동의 확률을 높이는 클리핑된 모방 업데이트. 승패는 가중치로만 사용합니다.
const rows=completed.map(e=>({obs:e.observation,features:e.features,chosen:e.chosen,oldLogProbability:Math.log(Math.max(1e-12,distribution(policy,e.observation,e.features).probabilities[e.chosen])),advantage:results.get(`${e.game}/${e.epoch}/${e.actor}`).won?1:.25,target:forward(policy.critic,e.observation).output[0]}));
const stats=trainer.update(rows,{epochs:1});
policy.metadata={...policy.metadata,onlineImitation:{actions:rows.length,games:new Set(completed.map(e=>`${e.game}/${e.epoch}`)).size,at:new Date().toISOString(),stats,promoted:false,source},algorithm:'PPO-with-online-imitation'};
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(policy));
console.log(JSON.stringify({output,...policy.metadata.onlineImitation}));
