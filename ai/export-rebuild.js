import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('사용법: node ai/export-rebuild.js <experiment.json> <output-directory>');
const state=JSON.parse(await readFile(input,'utf8'));
await mkdir(output,{recursive:true});
for(const c of state.candidates){
 const policy=structuredClone(c.policy);
 policy.metadata={...policy.metadata,experimental:true,promoted:false,evaluationValidForCurrentRules:false,rebuild:{attempts:state.completed,lineageUpdates:c.lineageUpdates,engineFingerprint:state.engineFingerprint,candidateId:c.id,limitations:state.limitations,final:c.final}};
 await writeFile(path.join(output,`candidate-${c.lineageUpdates}.json`),JSON.stringify(policy),{mode:0o600});
}
await writeFile(path.join(output,'summary.json'),JSON.stringify({experimental:true,promotionAuthorized:false,phase:state.phase,attempts:state.completed,winner:state.winner,baseline:state.baselineId,limitations:state.limitations,history:state.history},null,2));
console.log(JSON.stringify({output,candidates:state.candidates.length,attempts:state.completed,promotionAuthorized:false}));
