import {view,CARDS} from './game.js';
import {chatView,chatEnabled} from './chat.js';

export function relationships(snapshot){
 return snapshot.players.filter(p=>p.id!==snapshot.me.id).map(p=>({
  id:p.id,name:p.name,
  relation:snapshot.me.role==='rebel'&&p.role==='rebel'?'confirmed-ally':snapshot.me.role==='citizen'&&p.role==='king'?'confirmed-ally':snapshot.me.role==='rebel'&&p.role==='king'?'confirmed-enemy':snapshot.me.role==='king'&&p.role==='rebel'?'confirmed-enemy':'unknown',
  role:p.role,job:p.job,source:p.role==='king'?'public-king':snapshot.me.role==='rebel'&&p.role==='rebel'?'rules-known-rebel-team':'personal-observation',
  online:p.online,active:!p.surrendered
 }));
}
export function aiObservation(room,bot){
 const s=structuredClone(view(room,bot.id));
 s.me.bot=!!bot.bot;s.me.takeover=!!bot.takeover;s.me.difficulty=bot.difficulty||'normal';
 s.me.voteRequestedToday=bot.voteRequestedDay===room.game?.day;
 s.me.skipAction=bot.skipActionKey===`${room.game?.day}/${room.game?.round}/${room.game?.current||room.game?.order?.[room.game?.turn]}`;
 if(['hard','frenzy','chaos'].includes(bot.difficulty))for(const p of s.players)p.job=room.players.find(q=>q.id===p.id)?.job||null;
 const chat=chatView(room,bot);
  s.chat={pair:chatEnabled(room)&&chat.pair?{id:chat.pair.id,partnerName:chat.pair.partnerName||null}:null};
 s.inspections=(s.me.notes||[]).filter(n=>n.details?.kind==='hand').map(n=>({evidenceId:n.id,target:n.details.target,observedDay:n.details.day,observedCards:n.details.cardTypes,currentStatus:'historical-observation-not-current-hand'}));
 s.relationships=relationships(s);return s;
}
export function alliedHarm(s,a){return ['ambush','battle','steal','voteExecution'].includes(a?.type)&&relationships(s).some(p=>p.id===a.target&&p.relation==='confirmed-ally');}
export function harmExceptionValid(s,a,proof){
 if(!alliedHarm(s,a))return true;
 if(typeof proof?.reason!=='string'||!proof.reason.trim()||!Number.isFinite(proof.teamGain)||!Number.isFinite(proof.teamLoss)||proof.teamLoss<0||proof.teamGain<=proof.teamLoss||!Array.isArray(proof.alternatives)||!proof.alternatives.some(v=>typeof v==='string'&&v.trim()))return false;
 const note=s.me.notes.find(n=>(n.id===proof.evidenceId||`own-note:${n.id}`===proof.evidenceId)&&n.details?.kind==='hand'&&n.details.target===a.target);
 // Earlier inspections and chat claims remain dated evidence, not a certain
 // prediction of what either side will submit in the subsequent battle.
 if(note&&proof.knownTargetAttack!==note.details.cardTypes.reduce((sum,t)=>sum+(CARDS[t]?.attack||0),0))return false;
 return !!(note||proof.consultationIds?.length||proof.urgent&&proof.urgencyReason?.trim());
}
export function teamHarmCosts(s,a){
 const target=relationships(s).find(p=>p.id===a?.target),inspection=(s.inspections||[]).filter(i=>i.target===a?.target).at(-1);
 return {target:target||null,action:a?.type,
  ruleFacts:a?.type==='voteExecution'?['처형 시 당일 행동 제한 및 규칙상 손패 몰수 가능','투표만으로 처형 확정 아님']:a?.type==='steal'?['동료 손패에서 최대2장을 본인에게 이전','동료와 본인의 카드 이동 자체는 팀 총자산 증가가 아님']:['전투 사용 비영구 카드 소모','승자는 상대 남은 손패를 이전받음','자산 이전 자체는 팀 총자산 증가가 아님'],
  ownAvailableAttack:s.me.hand.reduce((sum,c)=>sum+(CARDS[c.type].attack||0),0),
  ownSubmissionCosts:s.me.hand.filter(c=>CARDS[c.type].attack).map(c=>({id:c.id,type:c.type,attack:CARDS[c.type].attack,consumed:!CARDS[c.type].permanent})),
  targetObservation:inspection?{...inspection,currentCertain:false}:null,
  uncertainty:['상대 현재 손패/제출은 과거조사만으로 확정 불가','전략적 팀 이득은 규칙상 획득과 분리해 비교해야 함']};
}
