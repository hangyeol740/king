import {writeFile} from 'node:fs/promises';
import {newGame} from './environment.js';
import {act,view,canAct} from '../lib/game.js';
import {candidates,seededRandom} from '../lib/ai-policy.js';
const random=seededRandom(2040),report={games:0,checked:0,invalid:0,canActMismatches:0,errors:[]};
for(const count of [3,4,5,6,7,8]){
 const room=newGame(count,random);let steps=0;
 while(room.status==='playing'&&steps++<1800){
  const ready=[];
  for(const p of room.players){const options=candidates(view(room,p.id));if(options.length)ready.push({p,options});
   if(!!options.length!==canAct(room,p.id)){report.canActMismatches++;if(report.errors.length<30)report.errors.push({kind:'canAct',count,phase:room.game.phase,role:p.role,canAct:canAct(room,p.id),options:options.length});}
  }
  if(!ready.length){report.errors.push({kind:'stuck',count,phase:room.game.phase});break;}
  const {p,options}=ready[Math.floor(random()*ready.length)];
  const sample=options.length>40?[...options.slice(0,20),...options.slice(-20)]:options;
  for(const action of sample){const copy=structuredClone(room);try{act(copy,p.id,action);}catch(error){report.invalid++;if(report.errors.length<30)report.errors.push({kind:'invalid',count,phase:room.game.phase,role:p.role,action,error:error.message});}report.checked++;}
  try{act(room,p.id,options[Math.floor(random()*options.length)]);}catch(error){report.errors.push({kind:'chosen',count,phase:room.game.phase,error:error.message});break;}
 }
 report.games++;if(steps>=1800)report.errors.push({kind:'limit',count,phase:room.game.phase});
}
await writeFile('/tmp/opencode/king-ai-candidate-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
