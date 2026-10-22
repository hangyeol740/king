import {readFile,writeFile} from 'node:fs/promises';
import {promotionGate} from './evaluation-gate.js';
const [file='/tmp/opencode/king-rebuild-v11/experiment.json',output='/tmp/opencode/king-rebuild-v11/report.json']=process.argv.slice(2);
const s=JSON.parse(await readFile(file,'utf8')),base=s.candidates.find(c=>c.id===s.baselineId);
const report={version:1,source:{oldEpisodes:s.sourceEpisodes,oldDatasetsExcluded:s.oldDatasetsExcluded,oldEvaluationNotComparable:true},attempts:s.completed,phase:s.phase,winner:s.winner,baseline:s.baselineId,validation:s.validation,history:s.history,candidates:s.candidates.map(c=>({id:c.id,lineageUpdates:c.lineageUpdates,score:c.final?.score,roles:c.final?.roles,opponents:c.final?.rows.map(r=>({opponent:r.opponent,games:r.games,wins:r.wins,byRole:r.byRole})),gate:c.final?promotionGate(c.final.roles,base.final.roles):null})),promoteNewModel:s.winner!==null&&s.winner!==s.baselineId};
await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,attempts:report.attempts,phase:report.phase,promoteNewModel:report.promoteNewModel,candidates:report.candidates.map(({opponents,...c})=>c)},null,2));
