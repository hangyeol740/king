// Runtime status/connection logs are observations, but not prerequisites of an
// already checked action. Material changes still require a fresh review.
export function decisionPrerequisites(s){
 const g=s.game;
 return JSON.stringify({status:s.status,me:s.me,players:s.players.map(p=>({id:p.id,role:p.role,job:p.job,executed:p.executed,surrendered:p.surrendered})),game:g?{day:g.day,phase:g.phase,round:g.round,current:g.current,pending:g.pending,vote:g.vote,revolt:g.revolt,religiousRevolt:g.religiousRevolt,successes:g.successes,religiousSuccesses:g.religiousSuccesses,shop:g.shop,lastRevolt:g.lastRevolt,lastReligiousRevolt:g.lastReligiousRevolt,lastExpedition:g.lastExpedition,lastExecution:g.lastExecution}:null});
}
export function unreadMessages(previous,current){const ids=new Set(previous.map(m=>m.id));return current.filter(m=>!m.self&&!ids.has(m.id));}
