import {chatAct,chatView} from './chat.js';

// 채팅방 행동은 게임 차례를 소비하지 않습니다. 각 AI가 볼 수 있는 채널만 사용합니다.
export function socialActions(room,bot,input,history=[]){
  const chat=chatView(room,bot),actions=[];
 bot.socialActionsUsed ||= [];
 const context=`${room.game.startedAt}/${input.channel}/${input.room||''}/${history.filter(m=>!m.self).at(-1)?.id||input.text||'state'}/${chat.pair?.id||''}/${chat.outgoing}`;
  const used=key=>bot.socialActionsUsed.includes(`${context}/${key}`);
 for(const request of chat.incoming)for(const accept of [true,false])actions.push({type:'pairAnswer',request:request.id,accept,reason:accept?'별도 대화 수락':'현재 협상 목적에 맞지 않아 거절'});
  if(!chat.outgoing&&!used('pairRequest')&&room.players.some(p=>p.id!==bot.id&&p.online&&!p.surrendered))actions.push({type:'pairRequest',reason:chat.pair?'현재 대화를 교체할 협상 이득이 더 클 때만 새 요청':'개별 협상이나 질문이 필요할 때만 요청'});
 if(chat.pair)actions.push({type:'pairLeave',reason:'협상 종료 또는 새 대화 목적을 위해 현재 매칭 종료'});
 for(const secret of chat.secret.filter(r=>r.joined)){actions.push({type:secret.owned?'secretDelete':'secretLeave',room:secret.id,reason:'협의 목적이 끝나거나 자리를 정리할 때'});}
 if(chat.secret.filter(r=>r.owned).length<3&&!used('secretCreate'))actions.push({type:'secretCreate',name:`대화 ${room.game.day}-${chat.secret.filter(r=>r.owned).length+1}`,reason:'여러 사람과 별도 협의할 목적이 있을 때만 개설'});
 for(const secret of chat.secret.filter(r=>r.joined&&!used(`invite:${r.id}`)))actions.push({type:'secretInvite',room:secret.id,reason:'현재 채널의 참가자에게 비밀방 초대 코드를 전달'});
  const messages=input.text?[{text:input.text,self:false}]:history.slice(-8);
 for(const message of messages.filter(m=>!m.self)){
  const match=message.text.match(/(?:비밀방|비밀채팅|초대|코드|비밀번호)[^\d]{0,20}(\d{3})(?!\d)/)||message.text.match(/^\s*(\d{3})\s*$/);
  if(!match)continue;
   const named=chat.secret.filter(r=>!r.joined&&message.text.includes(r.name));
   const possible=named.length?named:chat.secret.filter(r=>!r.joined);
   for(const secret of possible)if(!used(`join:${secret.id}`)&&!actions.some(a=>a.type==='secretJoin'&&a.room===secret.id))actions.push({type:'secretJoin',room:secret.id,password:match[1],reason:'현재 채널에서 받은 코드로 이 방 참가를 시도(서버가 일치 여부 검증)'});
 }
  return actions;
}
export function executeSocialAction(room,bot,input,action){
  const before=chatView(room,bot),beforeHistory=input.channel==='pair'?before.pair?.messages:input.channel==='secret'?before.secret.find(r=>r.id===input.room)?.messages:before[input.channel];
   const raw=input.channel==='pair'?room.chat?.pairs.find(r=>r.id===input.room)?.messages:input.channel==='secret'?room.chat?.secret.find(r=>r.id===input.room)?.messages:room.chat?.[input.channel];
   const latestOther=beforeHistory?.filter(m=>!raw?.some(r=>r.id===m.id&&r.sender===bot.id)).at(-1)?.id;
   const context=`${room.game.startedAt}/${input.channel}/${input.room||''}/${latestOther||input.text||'state'}/${before.pair?.id||''}/${before.outgoing}`;
 if(action.type==='secretInvite'){
   const secret=chatView(room,bot).secret.find(r=>r.id===action.room&&r.joined);if(!secret)return;
  chatAct(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:`비밀방 「${secret.name}」에서 이야기해볼까요? 초대 코드 ${secret.password}`});
 }else chatAct(room,bot,action);
  const key=action.type==='secretInvite'?`invite:${action.room}`:action.type==='secretJoin'?`join:${action.room}`:action.type;
  bot.socialActionsUsed ||= [];bot.socialActionsUsed.push(`${context}/${key}`);bot.socialActionsUsed=bot.socialActionsUsed.slice(-100);
}
