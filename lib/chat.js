import { randomInt, randomUUID } from 'node:crypto';
import { RuleError } from './game.js';
import {interpretChat} from './chat-intents.js';
function must(v,s){if(!v)throw new RuleError(s);}
function data(room){return room.chat ||= {public:[],rebel:[],spectator:[],pairs:[],requests:[],secret:[]};}
export const chatEnabled = room => room.mode!=='offline'||room.players.filter(p=>!p.bot&&!p.surrendered).length===1&&room.players.some(p=>p.bot);
const human=p=>!p.surrendered;
function messages(list,p,names=null){return list.map(m=>({id:m.id,text:m.text,...(m.name||names?.[m.sender]?{name:m.name||names[m.sender]}:{}),...(m.sender===p?.id?{mine:true}:{})}));}
function endPair(c,id){
 const ended=c.pairs.filter(p=>p.members.includes(id));
 c.pairs=c.pairs.filter(p=>!p.members.includes(id));
 // 실제 매칭이 종료된 경우에만 거절 이력을 새로 시작합니다.
 c.rejections ||= {};
 for(const pair of ended)for(const member of pair.members)delete c.rejections[member];
}
export function chatView(room,p,spectator=false){
 const c=data(room),pair=c.pairs.find(t=>t.members.includes(p.id));
 const names=pair?.identified?.includes(p.id)?Object.fromEntries(room.players.filter(q=>pair.members.includes(q.id)&&q.id!==p.id).map(q=>[q.id,q.name])):null;
    return {public:messages(c.public,p),...(spectator?{spectator:messages(c.spectator,p)}:{...(p.role==='rebel'&&room.players.filter(q=>q.role==='rebel'&&!q.surrendered).length>1?{rebel:messages(c.rebel,p)}:{}),pair:pair?{id:pair.id,messages:messages(pair.messages,p,names),...(names?{partnerName:Object.values(names)[0]}:{})}:null,incoming:c.requests.filter(r=>r.to===p.id).map(r=>({id:r.id})),outgoing:c.requests.some(r=>r.from===p.id),secret:c.secret.map(r=>({id:r.id,name:r.name,joined:r.members.includes(p.id),owned:r.owner===p.id,...(r.members.includes(p.id)?{password:r.password,messages:messages(r.messages,p)}:{})}))})};
}
export function chatAct(room,p,a,spectator=false){
  must(chatEnabled(room),'여러 사람이 돌려 쓰는 오프라인 방에는 채팅이 없습니다.');const c=data(room);
 if(a.type==='chatSend'){
  must(typeof a.text==='string'&&a.text.trim().length>0&&a.text.length<=500,'채팅은 1~500자 입력하세요.');let list;
  if(a.channel==='public')list=c.public;
  else if(a.channel==='spectator'){must(spectator,'관전자 전용 채팅입니다.');list=c.spectator;}
  else {must(!spectator,'관전자는 비밀채팅에 참가할 수 없습니다.');
    if(a.channel==='rebel'){must(p.role==='rebel'&&room.players.filter(q=>q.role==='rebel'&&!q.surrendered).length>1,'반란군이 2명 이상일 때만 사용하는 채팅입니다.');list=c.rebel;}
   if(a.channel==='pair'){const pair=c.pairs.find(r=>r.id===a.room&&r.members.includes(p.id));must(pair,'종료된 1대1 대화입니다.');list=pair.messages;}
   if(a.channel==='secret'){const r=c.secret.find(r=>r.id===a.room&&r.members.includes(p.id));must(r,'가입한 비밀방만 이용할 수 있습니다.');list=r.messages;}
  }
   must(list,'채팅방을 선택하세요.');list.push({id:randomUUID(),sender:p.id,text:a.text.trim(),...(a.channel==='spectator'||a.channel==='public'&&room.status==='lobby'?{name:p.name}:{})});if(list.length>100)list.shift();return;
 }
 must(!spectator,'관전자는 공개·관전 채팅만 이용할 수 있습니다.');
 if(a.type==='pairRequest'){
   must(!c.requests.some(r=>r.from===p.id),'이미 요청 중입니다.');
   const peers=room.players.filter(q=>q.id!==p.id&&human(q));
   c.rejections ||= {};let rejected=c.rejections[p.id] ||= [];
   if(peers.length&&peers.every(q=>rejected.includes(q.id)))rejected=c.rejections[p.id]=[];
   const candidates=peers.filter(q=>q.online&&!rejected.includes(q.id));
   must(candidates.length,'지금은 요청을 보낼 수 있는 다른 플레이어가 없습니다.');
   const available=candidates.filter(q=>!c.pairs.some(pair=>pair.members.includes(q.id)));
   const pool=available.length?available:candidates,target=pool[randomInt(pool.length)];
   c.requests.push({id:randomUUID(),from:p.id,to:target.id});
 }else if(a.type==='pairAnswer'){
  const r=c.requests.find(r=>r.id===a.request&&r.to===p.id);must(r&&typeof a.accept==='boolean','유효한 매칭 요청이 아닙니다.');c.requests=c.requests.filter(t=>t!==r);
   if(a.accept){must(room.players.some(p=>p.id===r.from&&human(p)),'요청자가 더 이상 게임에 없습니다.');endPair(c,p.id);endPair(c,r.from);c.pairs.push({id:randomUUID(),members:[p.id,r.from],messages:[]});c.requests=c.requests.filter(t=>![p.id,r.from].includes(t.from)&&![p.id,r.from].includes(t.to));}
   else {c.rejections ||= {};const rejected=c.rejections[r.from] ||= [];if(!rejected.includes(p.id))rejected.push(p.id);}
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
 if(!chatEnabled(room)||!(p.bot||p.takeover)||p.surrendered)return;
 const c=data(room);for(const request of c.requests.filter(r=>r.to===p.id))chatAct(room,p,{type:'pairAnswer',request:request.id,accept:true});
 const key=`${room.game?.day}/${room.game?.phase}`;if(p.chatStage===key||Date.now()-(p.lastBotSpeech||0)<12000)return;p.chatStage=key;
 const lines={gather:'이번 차례는 준비를 해둘게요. 다음엔 어떤 선택을 할 생각인가요?',draw3:'다음 선택을 고민 중이에요. 원정과 사냥 중 어느 쪽이 좋을까요?',hunt:'사냥 결과가 기대되네요. 다음 행동도 같이 고민해볼까요?',trade:'서로 도움이 되는 거래면 좋겠네요. 원하는 거래가 있나요?',mediate:'중재는 상황을 보고 판단해볼게요. 어떻게 생각하세요?',expedition:'원정에 힘을 모아볼까요?',aid:'이번 지원이 도움이 됐으면 좋겠네요.',marketDone:'상점 상품과 가격은 어땠나요?',craftDone:'준비를 마쳤어요. 다음 차례에 무엇을 할지 고민해봐요.'};
 const pair=c.pairs.find(r=>r.members.includes(p.id));
 if(pair&&randomInt(3)===0)chatAct(room,p,{type:'chatSend',channel:'pair',room:pair.id,text:'상황을 보고 협력해볼까요?'});
 if(lines[action.type]){p.lastBotSpeech=Date.now();chatAct(room,p,{type:'chatSend',channel:'public',text:lines[action.type]});}
}
export function respondToChat(room,sender,a){
 if(a.type!=='chatSend'||a.channel==='spectator'||!chatEnabled(room))return;
 const parsed=interpretChat(a.text)||{reply:'메시지 확인했어요. 중재·원정·거래 요청을 구체적으로 말해주면 판단에 참고할게요.'};
 const c=data(room);
 const eligible=room.players.filter(p=>p.id!==sender.id&&(p.bot||p.takeover)&&!p.surrendered&&
  (a.channel==='public'||a.channel==='rebel'&&p.role==='rebel'||a.channel==='pair'&&c.pairs.some(r=>r.id===a.room&&r.members.includes(p.id))||a.channel==='secret'&&c.secret.some(r=>r.id===a.room&&r.members.includes(p.id))));
 const p=eligible.find(p=>Date.now()-(p.lastChatReply||0)>=2000);if(!p)return;
 p.lastChatReply=Date.now();chatAct(room,p,{type:'chatSend',channel:a.channel,room:a.room,text:parsed.reply});
}
