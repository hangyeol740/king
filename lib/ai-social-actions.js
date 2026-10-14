import {chatAct,chatView} from './chat.js';

// 채팅방 행동은 게임 차례를 소비하지 않습니다. 각 AI가 볼 수 있는 채널만 사용합니다.
export function socialActions(room,bot,input,history=[]){
 const chat=chatView(room,bot),actions=[];
 bot.socialActionsUsed ||= [];
 const used=key=>bot.socialActionsUsed.includes(`${room.game.startedAt}/${room.game.day}/${key}`);
 if(!chat.pair&&!chat.outgoing&&!used('pairRequest')&&room.players.some(p=>p.id!==bot.id&&p.online&&!p.surrendered))actions.push({type:'pairRequest',reason:'개별 협상이나 질문이 필요할 때만 요청'});
 if(chat.secret.filter(r=>r.owned).length<3&&!used('secretCreate'))actions.push({type:'secretCreate',name:`대화 ${room.game.day}-${chat.secret.filter(r=>r.owned).length+1}`,reason:'여러 사람과 별도 협의할 목적이 있을 때만 개설'});
 for(const secret of chat.secret.filter(r=>r.joined&&!used(`invite:${r.id}`)))actions.push({type:'secretInvite',room:secret.id,reason:'현재 채널의 참가자에게 비밀방 초대 코드를 전달'});
 const messages=input.text?[{text:input.text,self:false}]:history.slice(-8);
 for(const message of messages.filter(m=>!m.self)){
  const match=message.text.match(/(?:비밀방|비밀채팅|초대|코드|비밀번호)[^\d]{0,20}(\d{3})(?!\d)/)||message.text.match(/^\s*(\d{3})\s*$/);
  if(!match)continue;
  const secret=chat.secret.find(r=>!r.joined&&room.chat?.secret.find(raw=>raw.id===r.id)?.password===match[1]);
  if(secret&&!used(`join:${secret.id}`)&&!actions.some(a=>a.type==='secretJoin'&&a.room===secret.id))actions.push({type:'secretJoin',room:secret.id,password:match[1],reason:'이 채널에서 실제 전달받은 초대 코드로 참가'});
 }
 return actions;
}
export function executeSocialAction(room,bot,input,action){
 if(action.type==='secretInvite'){
  const secret=chatView(room,bot).secret.find(r=>r.id===action.room&&r.joined);if(!secret)return;
  chatAct(room,bot,{type:'chatSend',channel:input.channel,room:input.room,text:`비밀방 「${secret.name}」에서 이야기해볼까요? 초대 코드 ${secret.password}`});
 }else chatAct(room,bot,action);
 const key=action.type==='secretInvite'?`invite:${action.room}`:action.type==='secretJoin'?`join:${action.room}`:action.type;
 bot.socialActionsUsed ||= [];bot.socialActionsUsed.push(`${room.game.startedAt}/${room.game.day}/${key}`);bot.socialActionsUsed=bot.socialActionsUsed.slice(-60);
}
