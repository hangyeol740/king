import {createDecisionContext,decide,recordDecision} from './ai-policy.js';
import {aiObservation} from './ai-observation.js';
import {act,canAct} from './game.js';

// Store plain JSON in the room so context survives separate Vercel instances.
export function stepServerlessAI(room,policy,random=Math.random){
 const bot=room.players.find(p=>(p.bot||p.takeover)&&!p.surrendered&&canAct(room,p.id));
 if(!bot||!policy)return null;
 const saved=bot.serverlessDecisionContext;
 const context=saved?{...saved,visited:new Set(saved.visited||[]),repeatedActions:new Map(saved.repeatedActions||[])}:createDecisionContext(random);
 const action=decide(policy,aiObservation(room,bot),random,context,null,false);
 if(!action)return null;
 act(room,bot.id,action);
 recordDecision(context,action);
 bot.serverlessDecisionContext={...context,visited:[...context.visited],repeatedActions:[...context.repeatedActions]};
 bot.aiStatus={state:'local-policy'};
 return {actor:bot.id,type:action.type};
}
