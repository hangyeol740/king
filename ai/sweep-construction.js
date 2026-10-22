import {createPolicy,seededRandom,enableActionConstruction} from '../lib/ai-policy.js';
import {rollout} from './environment.js';
const policy=enableActionConstruction(createPolicy(124,16));
const summary={games:0,decisions:0,constructionSteps:0,counts:{},failures:[]};
for(const count of [2,3,4,5,6,7,8])for(let i=0;i<20;i++){
 try{const r=rollout(policy,{count,random:seededRandom(count*100+i),maxSteps:4000});summary.games++;summary.decisions+=r.steps;summary.constructionSteps+=[...r.trajectories.values()].flat().length;summary.counts[count]=(summary.counts[count]||0)+1;}
 catch(e){summary.failures.push({count,i,error:e.message});}
}
console.log(JSON.stringify(summary,null,2));if(summary.failures.length)process.exitCode=1;
