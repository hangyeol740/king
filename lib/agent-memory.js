import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
export function rememberEvidence(mind,scope,events){
  mind.evidenceArchive ||= {};
   for(const event of events){const key=`${scope}:${event.id}`;mind.evidenceArchive[key]={...structuredClone(event),scope,digest:hash(event.text)};}
}
export function rememberSummary(mind,scope,summary,evidenceIds){
  if(!Array.isArray(evidenceIds)||typeof summary!=='string')throw Error('unsupported-memory-summary');
  const sources=evidenceIds.map(id=>mind.evidenceArchive?.[`${scope}:${id}`]);
   if(!sources.length||sources.some(e=>!e||hash(e.text)!==e.digest))throw Error('unsupported-memory-summary');
 // Keep original excerpts alongside any generated interpretation. Only excerpts
 // are trusted facts; a generated sentence is never promoted to source evidence.
  mind.summaries ||= [];mind.summaries.push({scope,text:summary,interpretation:true,original:sources.map(e=>({id:e.id,text:e.text,kind:e.kind})),sources:sources.map(e=>({id:e.id,digest:e.digest}))});
}
export function retrieveEvidence(mind,scope,query,limit=16){
  const terms=String(query||'').split(/\s+/).filter(t=>t.length>1);
  return Object.values(mind.evidenceArchive||{}).filter(e=>e.scope===scope&&hash(e.text)===e.digest).map((e,index)=>({e,index,score:terms.reduce((n,t)=>n+Number(e.text.includes(t)),0)})).sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,limit).map(x=>x.e);
}
export function verifiedSummaries(mind,scope){return (mind.summaries||[]).filter(s=>s.scope===scope&&s.sources.every(src=>{const e=mind.evidenceArchive?.[`${scope}:${src.id}`];return e&&e.digest===src.digest&&hash(e.text)===src.digest;}));}
