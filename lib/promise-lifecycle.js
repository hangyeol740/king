export function promiseConditionsKey(conditions={}){return JSON.stringify(Object.fromEntries(Object.entries(conditions).filter(([key,value])=>key!=='reason'&&value!=null).sort(([a],[b])=>a.localeCompare(b))));}
export function isPromiseSource(p,key){return p.scope===key||p.sources?.includes(key);}
export function opportunityKey(s){return JSON.stringify([s.game.day,s.game.phase,s.game.round,s.game.current,s.game.pending?.eventId,s.game.pending?.kind,s.game.pending?.from,s.game.pending?.to,s.game.vote?.id]);}
export function compatiblePromise(p,type,conditions,key){
 return p.status==='pending'&&p.type===type&&isPromiseSource(p,key)&&
  (p.conditions?.target??null)===(conditions?.target??null)&&
  (p.conditions?.day??null)===(conditions?.day??null)&&
  (p.conditions?.phase??null)===(conditions?.phase??null)&&
  (p.conditions?.revoltType??null)===(conditions?.revoltType??null);
}
