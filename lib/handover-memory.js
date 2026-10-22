import {chatView} from './chat.js';
export function handoverHistory(room,p){
 const c=chatView(room,p),result=[];
 const scopes=[['public/',c.public],['rebel/',c.rebel],...(c.pair?[[`pair/${c.pair.id}`,c.pair.messages]]:[]),...c.secret.filter(r=>r.joined).map(r=>[`secret/${r.id}`,r.messages])];
 for(const [scope,messages] of scopes){if(!messages)continue;const [channel,id]=scope.split('/');const raw=channel==='pair'?room.chat?.pairs.find(r=>r.id===id)?.messages:channel==='secret'?room.chat?.secret.find(r=>r.id===id)?.messages:room.chat?.[channel];result.push({scope,messages:messages.map(m=>({id:m.id,text:m.text,self:raw?.some(r=>r.id===m.id&&r.sender===p.id)||false}))});}
 return result;
}
