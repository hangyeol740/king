import { randomInt, randomUUID } from 'node:crypto';
import { RuleError } from './game.js';
import {interpretChat} from './chat-intents.js';
function must(v,s){if(!v)throw new RuleError(s);}
function data(room){return room.chat ||= {public:[],rebel:[],spectator:[],pairs:[],requests:[],secret:[]};}
const human=p=>!p.surrendered;
function messages(list){return list.map(m=>({id:m.id,text:m.text,...(m.name?{name:m.name}:{})}));}
function endPair(c,id){c.pairs=c.pairs.filter(p=>!p.members.includes(id));}
export function chatView(room,p,spectator=false){
 const c=data(room),pair=c.pairs.find(t=>t.members.includes(p.id));
  return {public:messages(c.public),...(spectator?{spectator:messages(c.spectator)}:{...(p.role==='rebel'&&room.players.filter(q=>q.role==='rebel'&&!q.surrendered).length>1?{rebel:messages(c.rebel)}:{}),pair:pair?{id:pair.id,messages:messages(pair.messages)}:null,incoming:c.requests.filter(r=>r.to===p.id).map(r=>({id:r.id})),outgoing:c.requests.some(r=>r.from===p.id),secret:c.secret.map(r=>({id:r.id,name:r.name,joined:r.members.includes(p.id),owned:r.owner===p.id,...(r.members.includes(p.id)?{password:r.password,messages:messages(r.messages)}:{})}))})};
}
export function chatAct(room,p,a,spectator=false){
 must(room.mode!=='offline','오프라인 방에는 채팅이 없습니다.');const c=data(room);
 if(a.type==='chatSend'){
  must(typeof a.text==='string'&&a.text.trim().length>0&&a.text.length<=500,'채팅은 1~500자 입력하세요.');let list;
  if(a.channel==='public')list=c.public;
  else if(a.channel==='spectator'){must(spectator,'관전자 전용 채팅입니다.');list=c.spectator;}
  else {must(!spectator,'관전자는 비밀채팅에 참가할 수 없습니다.');
    if(a.channel==='rebel'){must(p.role==='rebel'&&room.players.filter(q=>q.role==='rebel'&&!q.surrendered).length>1,'반란군이 2명 이상일 때만 사용하는 채팅입니다.');list=c.rebel;}
   if(a.channel==='pair'){const pair=c.pairs.find(r=>r.id===a.room&&r.members.includes(p.id));must(pair,'종료된 1대1 대화입니다.');list=pair.messages;}
   if(a.channel==='secret'){const r=c.secret.find(r=>r.id===a.room&&r.members.includes(p.id));must(r,'가입한 비밀방만 이용할 수 있습니다.');list=r.messages;}
  }
  must(list,'채팅방을 선택하세요.');list.push({id:randomUUID(),text:a.text.trim(),...(a.channel==='spectator'||a.channel==='public'&&room.status==='lobby'?{name:p.name}:{})});if(list.length>100)list.shift();return;
 }
 must(!spectator,'관전자는 공개·관전 채팅만 이용할 수 있습니다.');
 if(a.type==='pairRequest'){
  must(!c.requests.some(r=>r.from===p.id),'이미 요청 중입니다.');const candidates=room.players.filter(q=>q.id!==p.id&&human(q)&&q.online);
  must(candidates.length,'매칭 가능한 다른 플레이어가 없습니다.');const target=candidates[randomInt(candidates.length)];c.requests.push({id:randomUUID(),from:p.id,to:target.id});
 }else if(a.type==='pairAnswer'){
  const r=c.requests.find(r=>r.id===a.request&&r.to===p.id);must(r&&typeof a.accept==='boolean','유효한 매칭 요청이 아닙니다.');c.requests=c.requests.filter(t=>t!==r);
  if(a.accept){must(room.players.some(p=>p.id===r.from&&human(p)),'요청자가 더 이상 게임에 없습니다.');endPair(c,p.id);endPair(c,r.from);c.pairs.push({id:randomUUID(),members:[p.id,r.from],messages:[]});c.requests=c.requests.filter(t=>![p.id,r.from].includes(t.from)&&![p.id,r.from].includes(t.to));}
 }else if(a.type==='pairLeave'){endPair(c,p.id);c.requests=c.requests.filter(r=>r.from!==p.id);}
 else if(a.type==='secretCreate'){
  must(typeof a.name==='string'&&a.name.trim().length>0&&a.name.length<=30,'비밀방 이름은 1~30자로 입력하세요.');must(c.secret.filter(r=>r.owner===p.id).length<3,'한 사람은 비밀방을 최대 3개 개설할 수 있습니다.');
  const codes=Array.from({length:1000},(_,i)=>String(i).padStart(3,'0')).filter(code=>!c.secret.some(r=>r.password===code));must(codes.length,'더 이상 비밀방을 생성할 수 없습니다.');
  c.secret.push({id:randomUUID(),name:a.name.trim(),password:codes[randomInt(codes.length)],owner:p.id,members:[p.id],messages:[]});
 }else if(a.type==='secretJoin'){
  const r=c.secret.find(r=>r.id===a.room);must(r&&typeof a.password==='string'&&r.password===a.password,'비밀방 또는 비밀번호가 다릅니다.');if(!r.members.includes(p.id))r.members.push(p.id);
 }else if(a.type==='secretLeave') {const r=c.secret.find(r=>r.id===a.room);must(r,'비밀방이 없습니다.');r.members=r.members.filter(id=>id!==p.id);}
 else if(a.type==='secretDelete'){const r=c.secret.find(r=>r.id===a.room&&r.owner===p.id);must(r,'개설자만 삭제할 수 있습니다.');c.secret=c.secret.filter(t=>t!==r);}
 else throw new RuleError('알 수 없는 채팅 요청입니다.');
}
export function removeChatMember(room,id){const c=data(room);endPair(c,id);c.requests=c.requests.filter(r=>r.from!==id&&r.to!==id);c.secret=c.secret.filter(r=>r.owner!==id);for(const r of c.secret)r.members=r.members.filter(p=>p!==id);}
export function botChat(room,p,action){
 if(room.mode==='offline'||!(p.bot||p.takeover)||p.surrendered)return;
 const c=data(room);for(const request of c.requests.filter(r=>r.to===p.id))chatAct(room,p,{type:'pairAnswer',request:request.id,accept:true});
 const key=`${room.game?.day}/${room.game?.phase}`;if(p.chatStage===key)return;p.chatStage=key;
 const lines={gather:'오늘은 준비를 좀 해둘게요.',draw3:'다음 선택을 고민해 볼게요.',hunt:'사냥에 도전해 볼게요.',trade:'서로 도움이 되는 거래면 좋겠네요.',mediate:'이번 반란은 막아보죠.',expedition:'원정에 힘을 모아볼까요?',aid:'이번에는 모두 지원할게요.'};
 const pair=c.pairs.find(r=>r.members.includes(p.id));
 if(pair&&randomInt(3)===0)chatAct(room,p,{type:'chatSend',channel:'pair',room:pair.id,text:'상황을 보고 협력해볼까요?'});
 if(lines[action.type]&&randomInt(3)===0)chatAct(room,p,{type:'chatSend',channel:'public',text:lines[action.type]});
}
export function respondToChat(room,sender,a){
 if(a.type!=='chatSend'||a.channel==='spectator'||room.mode==='offline')return;
 const parsed=interpretChat(a.text);if(!parsed)return;
 const c=data(room);
 const eligible=room.players.filter(p=>p.id!==sender.id&&(p.bot||p.takeover)&&!p.surrendered&&
  (a.channel==='public'||a.channel==='rebel'&&p.role==='rebel'||a.channel==='pair'&&c.pairs.some(r=>r.id===a.room&&r.members.includes(p.id))||a.channel==='secret'&&c.secret.some(r=>r.id===a.room&&r.members.includes(p.id))));
 const p=eligible[0];if(!p||Date.now()-(p.lastChatReply||0)<4000)return;
 p.lastChatReply=Date.now();chatAct(room,p,{type:'chatSend',channel:a.channel,room:a.room,text:parsed.reply});
}
