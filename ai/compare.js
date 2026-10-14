import {readFile,writeFile} from 'node:fs/promises';
import {compatiblePolicy} from './transfer.js';
import {evaluate} from './environment.js';
import {seededRandom,validatePolicy} from '../lib/ai-policy.js';
const [candidatePath='models/strategy-v10-candidate.json',previousPath='models/policy.json',output='models/strategy-v10-evaluation.json']=process.argv.slice(2);
const candidate=validatePolicy(JSON.parse(await readFile(candidatePath,'utf8'))),previous=compatiblePolicy(JSON.parse(await readFile(previousPath,'utf8')));
const report={candidate:candidatePath,previous:previousPath,trainingEpisodes:candidate.metadata.episodes,externalApi:false,seeds:[740,1740,2740],runs:[]};
for(const seed of report.seeds){
 const run={seed};
 for(const opponent of ['mixed','random']){
   const summarize=r=>({games:r.games,wins:r.wins,winRate:r.winRate,byRole:r.byRole,actions:r.actions,averageDecisions:r.averageDecisions});
   run[opponent]={before:summarize(evaluate(previous,{games:60,counts:[3,4,5,6],random:seededRandom(seed),opponent})),after:summarize(evaluate(candidate,{games:60,counts:[3,4,5,6],random:seededRandom(seed),opponent}))};
 }
 report.runs.push(run);console.log(JSON.stringify(run));
}
report.summary=Object.fromEntries(['mixed','random'].map(opponent=>{const aggregate=phase=>{const results=report.runs.map(r=>r[opponent][phase]);const games=results.reduce((sum,r)=>sum+r.games,0),wins=results.reduce((sum,r)=>sum+r.wins,0);return {games,wins,winRate:wins/games};};return [opponent,{before:aggregate('before'),after:aggregate('after')}];}));
await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
