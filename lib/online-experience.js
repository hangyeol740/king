import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {view} from './game.js';
import {chatView} from './chat.js';
import {candidates,observe,actionFeatures} from './ai-policy.js';

export function createOnlineExperience({directory,archive=null,failed=console.error}={}){
 let queue=Promise.resolve();const style={messages:0,characters:0,questions:0,casual:0};
 const stats={events:0,actions:0,chats:0,failures:0};
 function identity(room,p){room.trainingId ||= randomUUID();p.trainingId ||= randomUUID();return {game:room.trainingId,epoch:room.game?.startedAt||room.createdAt,actor:p.trainingId};}
 function write(event){stats.events++;queue=queue.then(async()=>{await mkdir(directory,{recursive:true});await appendFile(path.join(directory,'events.jsonl'),`${JSON.stringify(event)}\n`,{mode:0o600});if(archive)await archive(event);}).catch(error=>{stats.failures++;failed(`온라인 경험 저장 실패: ${error.message}`);});}
 return {
  capture(room,p,input){
   if(room.mode==='offline'||p.bot||p.takeover)return null;
   const base={version:1,id:randomUUID(),at:new Date().toISOString(),...identity(room,p),type:input.type,day:room.game?.day,phase:room.game?.phase,round:room.game?.round,role:p.role,job:p.job||null,players:room.players.length};
   if(input.type==='chatSend'){
    const c=chatView(room,p),history=input.channel==='pair'?c.pair?.messages:input.channel==='secret'?c.secret.find(r=>r.id===input.room&&r.joined)?.messages:c[input.channel];
    if(!history)return null;
    return {...base,kind:'chat',channel:input.channel,scope:input.channel==='secret'||input.channel==='pair'?input.room:input.channel,history:history.slice(-12).map(m=>({text:m.text,self:!!m.mine})),text:input.text,publicContext:room.game?{day:room.game.day,phase:room.game.phase,round:room.game.round}:null};
   }
   if(room.status!=='playing'||!room.players.includes(p))return null;
   const s=view(room,p.id),legal=candidates(s),same=(a,b,key)=>key==='cards'||key==='targets'?Array.isArray(b[key])&&JSON.stringify([...a[key]].sort())===JSON.stringify([...b[key]].sort()):JSON.stringify(a[key])===JSON.stringify(b[key]);
   const chosen=legal.findIndex(a=>Object.keys(a).every(key=>same(a,input,key))&&Object.keys(input).every(key=>Object.hasOwn(a,key)));
   // 수량이 다른 제작처럼 후보와 일치하지 않는 행동도 기록하되 모방 학습에서는 제외합니다.
   return {...base,kind:'action',action:{type:input.type,count:input.count,accept:input.accept,join:input.join,difficulty:input.difficulty,cardCount:input.cards?.length},observation:observe(s),features:legal.map(a=>actionFeatures(s,a)),chosen};
  },
  commit(event){if(!event)return;if(event.kind==='chat'){stats.chats++;style.messages++;style.characters+=event.text.length;style.questions+=Number(/[?？]/.test(event.text));style.casual+=Number(/ㅋㅋ|ㅎㅎ|할래|갈래|하자|어때/.test(event.text));}else stats.actions++;write(event);},
  outcome(room){if(room.status!=='finished'||room.recordedTrainingOutcome===room.game.startedAt||room.mode==='offline')return;room.recordedTrainingOutcome=room.game.startedAt;write({version:1,id:randomUUID(),kind:'outcome',game:room.trainingId,epoch:room.game.startedAt,side:room.game.winner.side,actors:room.players.map(p=>({...identity(room,p),won:room.game.winner.players.includes(p.id),role:p.role,job:p.job||null}))});},
  style(){return style.messages?{samples:style.messages,averageLength:Math.round(style.characters/style.messages),questionRate:style.questions/style.messages,casualRate:style.casual/style.messages}:null;},
  diagnostics(){return {...stats};},
  async restore(){try{const lines=(await readFile(path.join(directory,'events.jsonl'),'utf8')).trim().split('\n');for(const line of lines){try{const e=JSON.parse(line);if(e.kind==='chat'){style.messages++;style.characters+=e.text.length;style.questions+=Number(/[?？]/.test(e.text));style.casual+=Number(/ㅋㅋ|ㅎㅎ|할래|갈래|하자|어때/.test(e.text));}}catch{}}}catch(e){if(e.code!=='ENOENT')throw e;}},
  flush(){return queue;}
 };
}
