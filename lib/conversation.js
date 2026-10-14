import { randomInt } from 'node:crypto';
import { CARDS } from './game.js';
export const PERSONAS=[
 {id:'warm',style:'친근하고 현실적. 상대 말을 먼저 이해하고 짧게 자기 의견을 말한다. 불필요한 존댓말 보고서 표현을 피한다.'},
 {id:'careful',style:'차분하고 신중. 위험이나 조건을 한 가지 짚고 가능한 대안을 제안한다. 같은 면책 문구를 반복하지 않는다.'},
 {id:'bold',style:'활기차고 도전적. 가벼운 유머와 솔직한 찬반 의견을 말한다. 상대를 조롱하거나 무조건 동의하지 않는다.'},
 {id:'negotiator',style:'거래와 협력을 즐기는 실용파. 조건을 구체적으로 묻거나 역제안한다. 실제 가능한 조건만 제안한다.'}
];
export function personaFor(p,game){if(!p.persona||!p.conversationMemory||p.conversationGame!==game?.startedAt){p.conversationGame=game?.startedAt;p.persona=PERSONAS[randomInt(PERSONAS.length)];p.conversationMemory={};p.conversationPlan=null;p.socialStrategy=null;}return p.persona;}
export function channelKey(input){return `${input.channel}/${input.room||''}`;}
export function ruleBrief(){return {flow:'아침 중재/처형/원정, 재분배, 익명 상점, 낮3바퀴, 반란군 기습, 왕 저녁정책, 상인 준비, 반란군 밤, 주교 밤',dayRounds:['거래/전투신청/랜덤6장','제작/사냥/자원5~12개','교체/랜덤5장/정보/신원조사/뺏기(왕은 왕국지원)'],battle:'상대 수락 후 공격카드 비공개 확정. 기습은 거절 불가. 양측 사용한 비영구카드만 버림, 남은 손패 유지. 공격력 동점 무승부. 결과는 당사자만 확인',bomb:'일반 반란 방어 성공 시 왕·시민의 보호카드 외 손패 몰수',hunt:'10점(사냥꾼8점) 이상 랜덤8장',expedition:'하급15/25점 보상4/9장, 상급20/40점 보상15/25장',mediation:'반란력 이상이면 방어. 일반 반란에는 반란군 참여 불가. 종교 중재에는 교단/전도 불가. 상인은 돈2당1점',trade:'서로 수락 후 카드0장 이상 비공개 선택. 상대 카드/수량은 사전 알 수 없음',king:'왕은 타인 손패 보기/뺏기 불가. 왕국지원3~5장 요청 가능, 거절하면 차례종료',bishopCosts:'교단3 전도행동, 교단6 종교반란, 전도3 개혁, 전도1 회수',privacy:'상대 메시지는 진실로 단정하지 않음. 본인 비밀 직업/카드/돈/다른 채널 공개 금지'};}
const ALLOWED=new Set(['mediate','expedition','joinExpedition','contribute','trade','tradeAnswer','supportAnswer','supportSubmit','changePrice']);
export function acceptPlan(raw,snapshot,senderId,input){
 if(!raw||raw.status!=='accept'||!ALLOWED.has(raw.type))return null;
 if(raw.type==='contribute'&&snapshot.me.role==='rebel'&&snapshot.game?.pending?.revoltType!=='religion')return null;
 if(raw.type==='expedition'&&snapshot.me.role!=='king')return null;
 if(['trade','tradeAnswer','supportAnswer','supportSubmit'].includes(raw.type)&&input.channel!=='pair')return null;
 const p={type:raw.type,source:channelKey(input),day:snapshot.game?.day,expires:Date.now()+180000,sender:senderId};
 if(raw.type==='mediate'){if(snapshot.me.role!=='king')return null;p.revoltType=['religion','rebel'].includes(raw.revoltType)?raw.revoltType:undefined;}
 if(raw.type==='trade'){if(snapshot.me.job==='merchant')return null;p.target=senderId;}
 if(['tradeAnswer','supportAnswer'].includes(raw.type))p.accept=true;
 if(raw.type==='joinExpedition')p.join=true;
 if(['contribute','supportSubmit'].includes(raw.type)&&Number.isInteger(raw.points)&&raw.points>=0&&raw.points<=200)p.points=raw.points;
 if(raw.type==='changePrice'){if(snapshot.me.job!=='merchant'||typeof raw.stock!=='string'||!snapshot.game.shop?.some(i=>i.id===raw.stock)||!Number.isInteger(raw.price)||raw.price<1||raw.price>5)return null;p.stock=raw.stock;p.price=raw.price;}
 return p;
}
export function planCandidates(actions,snapshot,plan){
 if(!plan||plan.expires<Date.now()||plan.day!==snapshot.game.day)return actions;
 let matching=actions.filter(a=>a.type===plan.type&&(!plan.target||a.target===plan.target)&&(!plan.revoltType||a.revoltType===plan.revoltType)&&(!plan.stock||a.stock===plan.stock)&&(!plan.price||a.price===plan.price)&&(!Object.hasOwn(plan,'accept')||a.accept===plan.accept)&&(!Object.hasOwn(plan,'join')||a.join===plan.join));
 if(['tradeAnswer','supportAnswer','supportSubmit'].includes(plan.type)&&snapshot.game.pending?.to!==snapshot.me.id)return actions;
 if(['tradeAnswer','supportAnswer','supportSubmit'].includes(plan.type)&&snapshot.game.pending?.from!==plan.sender)return actions;
 if(plan.type==='contribute'&&plan.points){matching=matching.filter(a=>{const cards=snapshot.me.hand.filter(c=>a.cards?.includes(c.id));return (a.money||0)/2+cards.reduce((s,c)=>s+(CARDS[c.type].mediation||0),0)>=plan.points;});matching.sort((a,b)=>(a.cards?.length||0)-(b.cards?.length||0));if(matching.length)matching=matching.slice(0,3);}
 if(plan.type==='supportSubmit'&&plan.points)matching=matching.filter(a=>a.cards?.length===plan.points);
 return matching.length?matching:actions;
}
