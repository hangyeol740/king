export function identifyRebelSpeaker(snapshot,history,message){
 const allies=snapshot.players.filter(p=>p.id!==snapshot.me.id&&p.role==='rebel');
 if(allies.length===1)return {id:allies[0].id,certainty:'deduced-two-rebels'};
 const mentions=allies.filter(p=>message.text.includes(p.name)&&/(나는|난|내가|본인|접니다|저는)/.test(message.text));
 if(mentions.length!==1)return {id:null,certainty:'unresolved'};
  const who=mentions[0],conflict=history.filter(m=>!m.self&&m.text.includes(who.name)).some(m=>/아니|거짓|사칭/.test(m.text));
 return conflict?{id:null,certainty:'conflicting-claims'}:{id:who.id,certainty:'self-identification-claim'};
}
export function consultEvidence(mind,snapshot,target){
 const inbox=mind.inbox?.['rebel/'];if(!inbox)return [];
 return inbox.messages.filter(m=>!m.self).map(m=>({...m,speaker:identifyRebelSpeaker(snapshot,inbox.messages,m)})).filter(m=>m.speaker.id===target);
}
export function consultationAllows(mind,snapshot,action,proof){
  const messages=consultEvidence(mind,snapshot,action.target);
  const selected=messages.filter(m=>proof?.consultationIds?.includes(m.id));
  const latest=messages.at(-1);if(latest&&!selected.some(m=>m.id===latest.id)&&/하지\s*마|거절|싫|안\s*돼/.test(latest.text))return !!proof?.urgent&&!!proof?.urgencyReason?.trim();
 if(selected.length&&selected.some(m=>/하지\s*마|거절|싫|안\s*돼/.test(m.text)))return !!proof?.urgent&&!!proof?.urgencyReason?.trim();
  if(selected.length)return selected.some(m=>/동의|좋아|해도|하자|괜찮|가져가|공격해|처형해|그래|응/.test(m.text))||!!proof?.urgent&&!!proof?.urgencyReason?.trim();
  return !!proof?.urgent&&!!proof?.urgencyReason?.trim();
}
