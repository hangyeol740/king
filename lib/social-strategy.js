import {CARDS} from './game.js';
export const SOCIAL_MODES=['honest','conceal','bluff','reserve'];
export function socialContext(s){return `${s.me.job||s.me.role}/${s.game?.phase?.startsWith('expedition')?'expedition':s.game?.phase?.startsWith('mediation')||s.game?.phase==='morning'?'crisis':'other'}`;}
export function socialDistribution(model,s){const row=model?.values?.[socialContext(s)]||SOCIAL_MODES.map(()=>0);const max=Math.max(...row),w=row.map(x=>Math.exp((x-max)/.4)),sum=w.reduce((a,b)=>a+b,0);return w.map(x=>x/sum);}
export function pickSocial(model,s,random=Math.random){const ps=socialDistribution(model,s);let r=random();for(let i=0;i<ps.length;i++){r-=ps[i];if(r<=0)return SOCIAL_MODES[i];}return SOCIAL_MODES.at(-1);}
export function strategyFor(p,s,model=null,random=Math.random){
 const key=`${s.game?.day||0}/${s.game?.phase||'lobby'}`;
 if(!p.socialStrategy||p.socialStrategy.key!==key){const r=random(),enemy=s.me.role==='rebel'||s.me.job==='bishop';const mode=model?pickSocial(model,s,random):r<(enemy?.3:.1)?'bluff':r<.55?'conceal':r<.7?'reserve':'honest';p.socialStrategy={key,mode,...socialBrief(mode,s)};}
 return p.socialStrategy;
}
export function socialProbabilities(s,actions,probabilities,mode,signals=[]){
 const loyal=['king','citizen'].includes(s.me.role),crisis=s.game.revolt||s.game.religiousRevolt||0;
 const power=a=>s.me.hand.filter(c=>a.cards?.includes(c.id)).reduce((n,c)=>n+(CARDS[c.type].mediation||0),0)+(a.money||0)/2;
 const promised=signals.filter(x=>x.actor!==s.me.id&&x.day===s.game.day&&x.phase===s.game.phase&&x.claim==='help').length;
 const weights=probabilities.map((p,i)=>{const a=actions[i];let f=1;
  if(mode==='reserve'){if(a.type==='joinExpedition'&&!a.join)f=3;if(a.type==='contribute'&&!a.cards?.length&&!a.money)f=3;}
  if(mode==='honest'&&loyal){if(a.type==='joinExpedition'&&a.join)f=1.4;if(a.type==='contribute'&&power(a)>=crisis&&crisis>0)f=1.4;}
  if(mode==='bluff'){if(a.type==='joinExpedition'&&a.join)f=1.6;if(a.type==='contribute'&&!a.cards?.length&&!a.money)f=3;}
  // 상대 신호는 증거가 아니라 확률적 정보. 과신하지 않게 영향 상한을 둡니다.
  if(promised&&mode!=='conceal'&&a.type==='contribute'&&!a.cards?.length&&!a.money)f*=1+Math.min(.8,promised*.2);
  return p*f;
 });const sum=weights.reduce((a,b)=>a+b,0);return weights.map(p=>p/sum);
}
export function observeOpponents(s){
 return s.players.filter(p=>p.id!==s.me.id).map(p=>{
 const supports=s.game?.logs.filter(l=>l.text===`${p.name}님이 중재에 지원했습니다.`).length||0;
 const expeditions=s.game?.logs.filter(l=>l.text.startsWith('원정 참가자:')&&l.text.slice(7).split(', ').includes(p.name)).length||0;
 const inspections=s.me.notes.filter(n=>n.details?.target===p.id&&n.details?.kind==='hand').at(-1);
 const known=inspections?.details?.cardTypes||[];
 return {id:p.id,name:p.name,publicRole:p.role,supports,expeditions,assessment:supports>=2?'지원에 협조적이라는 약한 증거':expeditions>=2?'원정 참여 선호라는 약한 증거':'판단 근거 부족',rebelCardSeen:known.includes('rebellion'),confidence:supports+expeditions>=2?'low':'unknown',warning:'협조와 반란카드 보유만으로 진영 확정 불가. 익명 채팅은 이 플레이어에게 귀속하지 않는다.'};
 });
}
export function socialBrief(mode,s){
 const enemy=s.me.role==='rebel'||s.me.job==='bishop';
 const intents={honest:'자신의 진영 목표에 유리한 협력을 유도한다. 실제 행동 의사와 발언을 맞춘다.',conceal:'상대가 내 진영·능력·다음 행동을 확신하지 못하게 만든다. 답변을 회피하거나 조건부로 말한다.',bluff:enemy?'상대가 나를 협조적인 참가자로 생각해 경계를 낮추거나 지원을 줄이게 유도한다. 게임 내 의도에 대해 거짓 약속/허세를 쓸 수 있다.':'상대가 내가 대응 준비를 했다고 생각해 공격을 망설이게 유도한다. 숨겨진 패를 실제로 공개하지 말고 준비 여부를 암시한다.',reserve:'원정/중재에 무조건 참가하지 않고 상대에게 먼저 부담하게 유도해 자원을 보존한다.'};
 const objective=s.me.job==='merchant'?'자신의 돈100점 승리. 판매·자본과 위험 비교':s.me.job==='bishop'?'자신의 종교반란 승리. 일반 반란군과 독립 목표':s.me.role==='neutral'?'자신만의 철혈의 검 승리':s.me.role==='rebel'?'반란군 공동 승리. 동료 보존과 왕국 약화':'왕국 공동 승리. 반란 저지와 자원 보존';
 return {mode,desiredBelief:intents[mode],objective,bounds:'게임 내 정체 주장과 거짓말 허용. 공개 결과나 규칙은 조작하지 않는다. 타 비밀채널 내용은 유출하지 않는다. 익명 발언자를 특정하지 않는다.'};
}
