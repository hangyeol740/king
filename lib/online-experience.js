import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {view} from './game.js';
import {chatView} from './chat.js';
import {candidates,observe,actionFeatures,POLICY_VERSION,RULESET} from './ai-policy.js';
import {createHumanSpeech} from './human-speech.js';
import {createExperienceOutbox} from './experience-outbox.js';
import {constructionSpace} from './action-construction.js';
import {mkdirSync,appendFileSync} from 'node:fs';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';

async function readEvents(file,visit){
 const stream=createReadStream(file,{encoding:'utf8'});
 const lines=createInterface({input:stream,crlfDelay:Infinity});
 try{for await(const line of lines){if(!line.trim())continue;await visit(JSON.parse(line));}}
 finally{lines.close();stream.destroy();}
}

export function createOnlineExperience({directory,archive=null,loadRemote=null,failed=console.error,speechModel={},captureSpeech=true}={}){
   const speech=createHumanSpeech(speechModel);
   const learnSpeech=event=>{if(captureSpeech)speech.learn(event);};
  const outbox=archive?createExperienceOutbox({directory,send:archive,failed:error=>failed(`원격 기록 재시도:${error.message}`)}):null;
  const seen=new Set();
   const stats={events:0,actions:0,chats:0,failures:0};
  const archivedMessages=new Set();
   function identity(room,p){room.trainingId ||= randomUUID();p.trainingId ||= randomUUID();return {game:room.trainingId,epoch:room.game?.startedAt||room.createdAt,actor:p.trainingId};}
   function write(event){if(seen.has(event.id))return true;try{
    // Persist before returning: a slow remote must not retain an unbounded
    // promise chain containing complete observations/candidate arrays.
    mkdirSync(directory,{recursive:true});outbox?.enqueue(event);appendFileSync(path.join(directory,'events.jsonl'),`${JSON.stringify(event)}\n`,{mode:0o600});seen.add(event.id);stats.events++;return true;
   }catch(error){stats.failures++;stats.lastError=error.message;stats.lastLostEvent=event.id;failed(`온라인 경험 저장 실패: ${error.message}`);return false;}}
  return {
    archiveMessages(room){
     if(!captureSpeech)return;
    room.trainingId ||= randomUUID();
    for(const message of room.chatArchive||[]){if(archivedMessages.has(message.id))continue;
     const sender=room.players.find(p=>p.id===message.sender)||room.spectators?.find(p=>p.id===message.sender);
     const event={version:2,id:`message_${message.id}`,kind:'channel-original',game:room.trainingId,epoch:room.game?.startedAt||room.createdAt,channel:message.channel,scope:message.room,text:message.text,day:message.day,actor:sender?identity(room,sender).actor:null,source:message.source||'unknown'};
     if(write(event))archivedMessages.add(message.id);
    }
   },
  capture(room,p,input){
   if(room.mode==='offline'||p.bot||p.takeover)return null;
    const base={version:2,policyVersion:POLICY_VERSION,ruleset:RULESET,id:randomUUID(),at:new Date().toISOString(),...identity(room,p),type:input.type,day:room.game?.day,phase:room.game?.phase,round:room.game?.round,role:p.role,job:p.job||null,players:room.players.length};
   if(input.type==='chatSend'){
     if(!captureSpeech)return null;
     const c=chatView(room,p),history=input.channel==='pair'?c.pair?.messages:input.channel==='secret'?c.secret.find(r=>r.id===input.room&&r.joined)?.messages:c[input.channel];
     if(!history)return null;
     const raw=input.channel==='pair'?room.chat?.pairs.find(r=>r.id===input.room)?.messages:input.channel==='secret'?room.chat?.secret.find(r=>r.id===input.room)?.messages:room.chat?.[input.channel];
     return {...base,kind:'chat',source:'human',channel:input.channel,scope:input.channel==='secret'||input.channel==='pair'?input.room:input.channel,history:history.map(m=>({id:m.id,text:m.text,self:raw?.some(r=>r.id===m.id&&r.sender===p.id)||false})),text:input.text,publicContext:room.game?{day:room.game.day,phase:room.game.phase,round:room.game.round}:null};
   }
   if(room.status!=='playing'||!room.players.includes(p))return null;
    const s=view(room,p.id);const visibleChat=chatView(room,p);s.chat={pair:visibleChat.pair?{id:visibleChat.pair.id,partnerName:visibleChat.pair.partnerName||null}:null};const legal=candidates(s),same=(a,b,key)=>key==='cards'||key==='targets'?Array.isArray(b[key])&&JSON.stringify([...a[key]].sort())===JSON.stringify([...b[key]].sort()):JSON.stringify(a[key])===JSON.stringify(b[key]);
    const chosen=legal.findIndex(a=>Object.keys(a).every(key=>same(a,input,key))&&Object.keys(input).every(key=>Object.hasOwn(a,key)));
    // 모델 축약 후보에 없는 합법적인 사람 선택도 자체 후보로 추가해 선택을 재현합니다.
     const aliases=new Map(room.players.map(q=>[q.id,identity(room,q).actor])),full=structuredClone(input);if(full.target)full.target=aliases.get(full.target);if(full.targets)full.targets=full.targets.map(id=>aliases.get(id));
   const features=legal.map(a=>actionFeatures(s,a));if(chosen<0)features.push(actionFeatures(s,input));
      const construction=constructionSpace(s);construction.templates=construction.templates.map(a=>({...a,...(a.target?{target:aliases.get(a.target)}:{}),...(a.targets?{targets:a.targets.map(id=>aliases.get(id))}:{})}));
      return {...base,kind:'action',action:full,construction,personalState:{me:{id:base.actor,role:p.role,job:p.job,hand:p.hand.map(c=>({...c})),money:p.money,churchInfluence:p.churchInfluence},game:{day:s.game.day,phase:s.game.phase,round:s.game.round}},observation:observe(s),features,chosen:chosen<0?features.length-1:chosen,validated:true};
  },
      commit(event){if(!event||seen.has(event.id))return;if(!write(event))return;if(event.kind==='chat'){learnSpeech(event);stats.chats++;}else stats.actions++;},
     outcome(room){if(room.status!=='finished'||room.recordedTrainingOutcome===room.game.startedAt||room.mode==='offline')return;room.trainingId ||= randomUUID();const saved=write({version:2,id:`outcome_${room.trainingId}_${room.game.startedAt}`,kind:'outcome',game:room.trainingId,epoch:room.game.startedAt,side:room.game.winner.side,actors:room.players.map(p=>({...identity(room,p),won:!p.personalSurrender&&room.game.winner.side!=='draw'&&room.game.winner.players.includes(p.id),humanExitOutcome:p.humanExitOutcome||null,role:p.role,job:p.job||null}))});if(saved)room.recordedTrainingOutcome=room.game.startedAt;},
   style(){return speech.profile();},
   speechSnapshot(){return speech.snapshot();},
   diagnostics(){return {...stats,outbox:outbox?.diagnostics()||null};},
       async restore(){await outbox?.restore();try{await readEvents(path.join(directory,'events.jsonl'),event=>{seen.add(event.id);learnSpeech(event);});}catch(e){if(e.code!=='ENOENT'){stats.failures++;stats.lastError=e.message;failed(`로컬 경험 복구 실패:${e.message}`);}}
        if(loadRemote)try{for(let offset=0;;offset+=500){const events=await loadRemote(offset,500);for(const event of events){if(event.version!==2||seen.has(event.id))continue;await mkdir(directory,{recursive:true});await appendFile(path.join(directory,'events.jsonl'),`${JSON.stringify(event)}\n`,{mode:0o600});seen.add(event.id);learnSpeech(event);}if(events.length<500)break;}}catch(error){stats.failures++;stats.lastError=error.message;failed(`원격 경험 복구 지연:${error.message}`);}
       if(outbox)try{await readEvents(path.join(directory,'archive-pending.jsonl'),event=>outbox.enqueue(event));await writeFile(path.join(directory,'archive-pending.jsonl.tmp'),'',{mode:0o600});await rename(path.join(directory,'archive-pending.jsonl.tmp'),path.join(directory,'archive-pending.jsonl'));}catch(e){if(e.code!=='ENOENT'){stats.failures++;failed(`기록 대기열 복구 실패:${e.message}`);}}
    },
    async flush(){await outbox?.drain();await outbox?.drain();},
   close(){outbox?.close();}
 };
}
