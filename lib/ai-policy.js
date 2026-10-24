import { CARDS, RECIPES, MERCHANT_BUYS, canCraft, expeditionPower, isReligionCard, mediationPower } from './game.js';
import {constructAction} from './action-construction.js';

export const POLICY_VERSION = 11;
export const RULESET = 'v11-personal-observations-team-results';
export const CARD_TYPES = Object.keys(CARDS);
export const PHASES = ['morning', 'mediationSupport', 'mediationKing', 'expeditionVote', 'expeditionSelect', 'expeditionJoin', 'expeditionCards', 'redistribute', 'day', 'evening', 'tax', 'night', 'bishopNight', 'executionVote', 'market', 'merchantEvening', 'ambush'];
export const ACTION_TYPES = ['mediate', 'execute', 'expedition', 'voteExpedition', 'selectExpedition', 'contribute', 'joinExpedition', 'redistribute', 'trade', 'gather', 'draw3', 'beginCraft', 'hunt', 'craft', 'craftDone', 'replace', 'refresh', 'revealHand', 'steal', 'tax', 'wanted', 'aid', 'payTax', 'revolt', 'tradeAnswer', 'tradeSubmit', 'evangelize', 'religiousRevolt', 'reform', 'bishopDone', 'voteExecution', 'reclaimChurch', 'royalSupport', 'supportAnswer', 'supportSubmit', 'marketBuy', 'marketDone', 'displayGoods', 'changePrice', 'merchantBuy', 'merchantDone'];
const ROLES = ['king', 'citizen', 'rebel', 'neutral'];
ACTION_TYPES.push('battle','battleAnswer','battleSubmit','ambush','ambushSkip','investigateIdentity');
ACTION_TYPES.push('gameVote','requestDraw','requestSurrender','personalSurrender');
export const OBS_SIZE = ROLES.length + PHASES.length + CARD_TYPES.length + 42;
export const ACTION_SIZE = ACTION_TYPES.length + RECIPES.length + CARD_TYPES.length + 25 + CARD_TYPES.length + 14;
export const CONSTRUCTION_STAGES=['type','target-and-parameters','expedition-target','count','quantity','money','price','cards'];
export const CONSTRUCTION_INPUT_SIZE=OBS_SIZE+ACTION_SIZE+CARD_TYPES.length+CONSTRUCTION_STAGES.length;
const clamp = (n, scale = 1) => Math.max(-2, Math.min(2, n / scale));
const counts = hand => CARD_TYPES.map(t => hand.filter(c => c.type === t).length);
const total = (hand, key) => hand.reduce((s, c) => s + (CARDS[c.type][key] || 0), 0);
const recipeMaximum = (recipe, hand) => Math.min(...(recipe.ingredients || [recipe]).map(m => Math.floor(hand.filter(c => c.type === m.input).length / m.count)));

// 브라우저와 동일한 개인용 상태만 입력받으며 원본 방 상태는 받지 않습니다.
export const PERSONALITIES = {
  balanced: [0,0,0,0,0],
  bold: [.8,-.2,-.1,.1,.5],
  cooperative: [-.3,.9,.3,-.1,0],
  trader: [.1,.2,.9,.3,-.1],
  builder: [-.4,0,-.2,.9,.2],
  investigator: [.3,-.1,0,.1,.9]
};
export function createDecisionContext(random = Math.random) {
  const names=Object.keys(PERSONALITIES),name=names[Math.floor(random()*names.length)];
  return { name, traits: PERSONALITIES[name].map(v=>Math.max(-1,Math.min(1,v+(random()-.5)*.2))), stage:null, visited:new Set(), decisions:0, repeatedActions:new Map() };
}
export function observe(snapshot, traits = PERSONALITIES.balanced) {
  const { game: g, me, players } = snapshot;
  const hand = me.hand;
  const knownRebels = players.filter(p => p.role === 'rebel').length;
  const logs = g.logs;
  const supports = g.pending?.helperCount ?? g.lastRevolt?.helperCount ?? 0;
  const failedExpeditions = logs.filter(l => l.text.includes('원정 실패')).length;
  const ownInspections = me.notes.filter(n => n.details?.kind === 'hand').length;
  const ownTrades = me.notes.filter(n => n.text.startsWith('거래 완료:')).length;
  return [
    ...ROLES.map(r => Number(me.role === r)),
    ...PHASES.map(p => Number(g.phase === p)),
    ...counts(hand).map(n => clamp(n, 12)),
    clamp(g.day, 7), clamp(g.maxDays - g.day, 7), clamp(g.successes, 3), clamp(g.revolt || 0, 50),
    clamp(players.length, 8), clamp(g.round, 3), clamp(hand.length, 30), clamp(knownRebels, 3),
    clamp(total(hand, 'attack'), 50), clamp(total(hand, 'mediation'), 50), clamp(total(hand, 'revolt'), 50),
    clamp(supports, 10), clamp(failedExpeditions, 5), clamp(ownInspections, 5), clamp(ownTrades, 5),
    g.lastRevolt ? (g.lastRevolt.blocked ? 1 : -1) : 0,
    clamp(g.revoltGoal, 3), Number(g.pending?.difficulty === 'high'), clamp(g.lastRevolt?.bombs || 0, 3),
    Number(me.job === 'bishop'), clamp(me.churchInfluence || 0, 50), clamp(g.religiousRevolt || 0, 50),
    clamp(g.religiousSuccesses || 0, 3), Number(g.pending?.revoltType === 'religion'), Number(!!g.religiousScheduled), clamp(g.religiousGoal, 3),
    Number(!!me.executed), Number(g.canExecute !== false), Number(g.pending?.kind === 'royalSupport'),
    Number(me.job === 'merchant'), clamp(me.money || 0,100), clamp(g.shop?.length || 0,5), clamp((g.shop || []).reduce((s,i)=>s+i.quantity,0),150), Number(!!g.pending?.craftUsed),
    Number(g.pending?.kind==='battle'),Number(!!g.pending?.accepted),Number(g.pending?.to===me.id),...traits
  ];
}
export function actionFeatures(snapshot, action) {
  const cards = snapshot.me.hand.filter(c => action.cards?.includes(c.id));
  const target = snapshot.players.find(p => p.id === action.target);
  // 직접 본 과거 검사와 공개 지원의 역사적 특징입니다. 현재 손패로 단정하지 않습니다.
  const knownHand = target ? snapshot.me.notes.filter(n => n.details?.target === target.id).at(-1)?.details?.cardTypes || [] : [];
  const inspected = target ? snapshot.me.notes.filter(n => n.text.includes(target.name) && n.text.includes('지명수배 검사:')).at(-1)?.text || '' : '';
  const suspected = knownHand.includes('rebellion') || /반란 있음/.test(inspected);
  const targets = (action.targets || []).map(id => snapshot.players.find(p => p.id === id));
  return [
    ...ACTION_TYPES.map(t => Number(t === action.type)),
    ...RECIPES.map((_, i) => Number(action.type === 'craft' && action.recipe === i)),
    ...counts(cards).map(n => clamp(n, 12)),
    clamp(cards.length,25), clamp(cards.reduce((s,c)=>s+(expeditionPower(c.type,snapshot.me.role)||0),0), 50),
    clamp(total(cards, 'mediation'), 50), clamp(total(cards, 'revolt'), 50),
    clamp(cards.filter(c => CARDS[c.type].permanent).length, 8), clamp(action.count||0,10),
    action.accept === undefined ? 0 : action.accept ? 1 : -1,
    action.join === undefined ? 0 : action.join ? 1 : -1,
    Number(target?.role === 'rebel'), Number(target?.role === 'king'),
    Number(suspected), Number(!!target && snapshot.game.logs.some(l => l.text === `${target.name}님이 중재에 지원했습니다.`)),
    Number(action.difficulty === 'high'), clamp(targets.length,3), clamp(targets.filter(p=>p?.role==='rebel').length,3),
    clamp(targets.filter(p=>['king','citizen'].includes(p?.role)).length,3), clamp(knownHand.length,30), Number(action.revoltType === 'religion'),
    clamp(action.money||0,100),clamp(action.quantity||0,30), clamp(action.price || 0,5),
    ...Object.keys(MERCHANT_BUYS).map(product=>Number(action.product===product)),
    ...CARD_TYPES.map(type=>Number(snapshot.game.shop?.find(i=>i.id===action.stock)?.type===type)),
    ...['bishop','merchant','hunter','blacksmith'].map(job=>Number(target?.job===job)),
    Number(snapshot.me.role==='rebel'&&target?.role==='rebel'),Number(snapshot.me.role==='citizen'&&target?.role==='king'),
    clamp(target?snapshot.players.findIndex(p=>p.id===target.id)+1:0,10),Number(!!target?.online),Number(!!target?.surrendered),Number(!!target?.executed),
    clamp(target?snapshot.game.logs.filter(l=>l.text===`${target.name}님이 중재에 지원했습니다.`).length:0,10),
    clamp(knownHand.reduce((sum,t)=>sum+(CARDS[t]?.attack||0),0),50),Number(snapshot.me.job==='hunter'),Number(snapshot.me.job==='blacksmith')
  ];
}
function subsets(hand, allowed, stat, targets = []) {
  const cards = hand.filter(c => allowed(c.type));
  const bundles = [[], cards, cards.filter((_, i) => i % 2 === 0)];
  // 소량 제출 후보를 추가해 전체/종류 단위 선택에 고착되지 않게 합니다.
  for(const limit of [1,2,3,5])for(const sorted of [cards,[...cards].sort((a,b)=>(CARDS[a.type].permanent?5:0)-(CARDS[b.type].permanent?5:0))])bundles.push(sorted.slice(0,limit));
  for (const type of CARD_TYPES) {
    const group = cards.filter(c => c.type === type);
    if (group.length) { bundles.push(group, group.slice(0, Math.ceil(group.length / 2))); }
  }
  if (stat) {
    for (const target of targets) {
      // 제출 후보 생성만 담당합니다. 최종 선택은 학습된 확률 정책이 결정합니다.
      const sorted = [...cards].sort((a, b) => Number(!!CARDS[b.type].permanent) - Number(!!CARDS[a.type].permanent) || stat(b.type) - stat(a.type));
      const result = []; let score = 0;
      for (const c of sorted) { if (score >= target) break; result.push(c); score += stat(c.type); }
      if (score >= target) bundles.push(result);
      // 영구 카드 보존과 저점 카드 중심의 대안 제출 묶음입니다.
      for(const direction of [1,-1]){
        const sorted=[...cards].sort((a,b)=>Number(!!CARDS[b.type].permanent)-Number(!!CARDS[a.type].permanent)||direction*(stat(a.type)-stat(b.type)));
        const result=[];let score=0;
        for(const c of sorted){if(score>=target)break;result.push(c);score+=stat(c.type);}
        if(score>=target)bundles.push(result);
      }
    }
  }
  const unique = new Map();
  for (const bundle of bundles) { const ids = bundle.map(c => c.id).sort(); unique.set(ids.join(','), ids); }
  return [...unique.values()];
}
export function candidates(s) {
  if(s.game?.pending?.kind==='battleLoot')return s.game.pending.winner===s.me.id?[{type:'claimBattleLoot',cards:s.game.pending.cards.slice(0,s.game.pending.limit).map(c=>c.id)}]:[];
  if(s.game?.phase==='day'&&s.game.current===s.me.id&&s.me.health<=3&&s.me.health<s.me.maxHealth&&!s.me.executed){const potion=s.me.hand.find(c=>CARDS[c.type]?.heal);if(potion)return [{type:'usePotion',card:potion.id}];}
    const actions=rawCandidates(s).filter(a=>!(a.type==='ambush'&&s.me.job!=='werewolf'&&s.players.some(q=>q.id===a.target&&q.role==='rebel'))),d=s.me.difficulty||'normal';
  if(s.status!=='playing'||!s.game)return actions;
   if(s.game.vote?.eligible&&s.game.vote.myVote===null)return actions;
   if(s.me.skipAction&&s.me.difficulty==='veryEasy'&&s.game.phase==='day'&&!s.game.pending&&s.game.current===s.me.id)return [{type:'skipTurn'}];
   if(s.status==='playing'&&s.me.canAct&&!s.me.surrendered&&!s.game.vote&&!s.me.voteRequestedToday){
    if(!s.me.bot&&!s.me.takeover&&s.game.day>=3&&!s.me.drawRequested)actions.push({type:'requestDraw'});
    if(!s.me.bot&&!s.me.takeover&&s.game.day>=2&&(!s.me.lastSurrenderDay||s.game.day-s.me.lastSurrenderDay>=3))actions.push({type:'requestSurrender'});
 }
 if(!s.me.bot&&!s.me.takeover)return actions;
 let allowed=actions;
 if(['normal','frenzy','chaos'].includes(d)&&s.game.day===1)allowed=allowed.filter(a=>a.type!=='execute');
 if(d==='veryEasy')allowed=allowed.filter(a=>a.type!=='steal');
 if(['veryEasy','easy'].includes(d)){
  if(s.game.phase==='day'&&s.game.round===2&&!s.game.pending)return allowed.filter(a=>a.type==='beginCraft');
  if(s.game.pending?.kind==='craft'){const craft=allowed.filter(a=>a.type==='craft');if(craft.length){const recipe=Math.min(...craft.map(a=>a.recipe));return craft.filter(a=>a.recipe===recipe).sort((a,b)=>b.count-a.count).slice(0,1);}}
  if(['expeditionCards','mediationSupport','mediationKing','night'].includes(s.game.phase)){
   const submissions=allowed.filter(a=>Array.isArray(a.cards));if(submissions.length)return submissions.sort((a,b)=>b.cards.length-a.cards.length||(b.money||0)-(a.money||0)).slice(0,1);
  }
 }
 return allowed;
}
function rawCandidates(s) {
  if (s.status !== 'playing') return [];
  if(s.me.surrendered)return [];
  const { game: g, me, players } = s, p = g.pending, king = g.king === me.id;
  if(g.vote?.eligible&&g.vote.myVote===null)return (g.vote.kind==='surrender'&&(me.bot||me.takeover)?[false]:[true,false]).map(accept=>({type:'gameVote',vote:g.vote.id,accept}));
   const others = players.filter(p => p.id !== me.id&&!p.surrendered);
    if (me.executed && !['ambush','eveningDuel','evening', 'tax', 'merchantEvening', 'night', 'bishopNight'].includes(g.phase)) return [];
  const cardActions = (type, allowed, stat, targets) => subsets(me.hand, allowed, stat, targets).map(cards => ({ type, cards }));
  const crafts = () => [{ type:'craftDone' }, ...RECIPES.flatMap((r,recipe)=>{
    if(!canCraft(r,me.role,me.job))return [];
    const max=Math.min(1000,recipeMaximum(r,me.hand));
    return max>0?[...new Set([1,max])].map(count=>({type:'craft',recipe,count})):[];
  })];
  switch (g.phase) {
    case 'morning': return king ? [
      ...(g.revolt > 0 ? [{ type: 'mediate', revoltType: 'rebel' }] : []),
      ...(g.religiousRevolt !== null ? [{ type: 'mediate', revoltType: 'religion' }] : []), { type: 'expedition' },
        ...(g.canExecute !== false ? [{ type: 'execute' }] : [])
    ] : [];
     case 'executionVote': return p.myDone ? [] : others.filter(p => p.id !== g.king).map(p => ({ type: 'voteExecution', target: p.id }));
    case 'mediationSupport':
    case 'mediationKing':
      if(me.mediationBlocked)return [];
      if ((me.role==='rebel' && p.revoltType !== 'religion') || p.myDone || (g.phase === 'mediationSupport' ? king : !king)) return [];
      if(me.job==='merchant'){
        const max=Math.floor((me.money||0)/2)*2;
        return [...new Set([0,Math.min(2,max),Math.floor(max/4)*2,max])].map(money=>({type:'contribute',cards:[],money}));
      }
      return cardActions('contribute', t => mediationPower(t,me.role,p.revoltType)>0, t => mediationPower(t,me.role,p.revoltType), [Math.ceil((p.revoltType === 'religion' ? g.religiousRevolt : g.revolt) / 2), p.revoltType === 'religion' ? g.religiousRevolt : g.revolt]);
    case 'expeditionVote': return p.myDone ? [] : [{type:'voteExpedition',difficulty:'low'},{type:'voteExpedition',difficulty:'high'}];
    case 'expeditionSelect': {
      if(!king)return [];
      const result=[];
      function choose(start,chosen){if(result.length>=128)return;if(chosen.length===p.required){result.push({type:'selectExpedition',targets:chosen});return;}for(let i=start;i<others.length;i++)choose(i+1,[...chosen,others[i].id]);}
      choose(0,[]);return result;
    }
    case 'expeditionJoin': return p.myDone ? [] : [{ type: 'joinExpedition', join: true }, { type: 'joinExpedition', join: false }];
    case 'expeditionCards':
      if (me.job==='merchant' || p.myDone || !p.isParticipant) return [];
      return cardActions('contribute', t => expeditionPower(t,me.role)!==null, t => expeditionPower(t,me.role), p.difficulty==='high'?[20,40]:[15,25]);
    case 'redistribute': return p.myDone ? [] : [{ type: 'redistribute', accept: true }, { type: 'redistribute', accept: false }];
    case 'market': {
      if(me.job==='merchant'||p.myDone)return [];
      const eligible=me.hand.filter(c=>!isReligionCard(c.type)||me.job==='bishop');
      const bundles=subsets(eligible,()=>true), unique=new Map();
      for(const item of g.shop||[]){
        const max=Math.min(item.quantity,Math.floor(eligible.length/item.price));
        if(!max)continue;
        for(const quantity of new Set([1,max]))for(const ids of bundles){
          if(ids.length<item.price*quantity)continue;
          const cards=ids.slice(0,item.price*quantity),a={type:'marketBuy',stock:item.id,quantity,cards};
          unique.set(`${item.id}/${quantity}/${cards.join(',')}`,a);
        }
      }
      return [{type:'marketDone'},...[...unique.values()].slice(0,128)];
    }
    case 'merchantEvening': {
      if(me.job!=='merchant')return [];
      if(p.kind==='craft')return crafts();
      const actions=[{type:'merchantDone'},...(!p.craftUsed?[{type:'beginCraft'}]:[])];
      for(const [product,option] of Object.entries(MERCHANT_BUYS)){
        const max=Math.floor((me.money||0)/option.cost);
        if(max)for(const quantity of new Set([1,max]))actions.push({type:'merchantBuy',product,quantity});
      }
      for(const type of CARD_TYPES){
        const item=g.shop.find(i=>i.type===type),cards=me.hand.filter(c=>c.type===type);
        const max=Math.min(cards.length,30-(item?.quantity||0));
        if(!max||!item&&g.shop.length>=5)continue;
        for(const count of new Set([1,max]))for(const price of item?[item.price]:[1,3,5])actions.push({type:'displayGoods',cards:cards.slice(0,count).map(c=>c.id),price});
      }
      for(const item of g.shop)for(const price of [1,3,5])if(price!==item.price)actions.push({type:'changePrice',stock:item.id,price});
      return actions;
    }
    case 'eveningDuel':{
      if(p?.kind==='battle'){
        if(!p.accepted)return p.to===me.id?[{type:'battleAnswer',accept:true},...(me.hand.some(c=>c.type==='sword')?[{type:'battleAnswer',accept:false}]:[])]:[];
        return p.myDone?[]:cardActions('battleSubmit',t=>!isReligionCard(t)&&!!CARDS[t].attack,t=>CARDS[t].attack);
      }
      return p?.current===me.id?[{type:'duelSkip'},...(me.job!=='werewolf'&&me.hand.filter(c=>c.type==='sword').length>=2?others.filter(q=>!q.surrendered).map(q=>({type:'battle',target:q.id})):[])]:[];
    }
    case 'ambush':{
      if(p?.kind==='battle')return p.myDone?[]:cardActions('battleSubmit',t=>!isReligionCard(t)&&!!CARDS[t].attack,t=>CARDS[t].attack);
      return p?.current===me.id?[{type:'ambushSkip'},...others.filter(q=>!(p.attacked||[]).includes(q.id)).flatMap(q=>me.job==='werewolf'?[...(me.hand.filter(c=>c.type==='sword').length>=(p.extra||0)?[{type:'ambush',target:q.id}]:[]),...(p.extra&&me.hand.some(c=>c.type==='roar')?[{type:'ambush',target:q.id,roar:true}]:[])]:me.hand.filter(c=>c.type==='sword').length>=2?[{type:'ambush',target:q.id}]:[])]:[];
    }
    case 'day': {
      if(p?.kind==='battle'){
        if(!p.accepted)return p.to===me.id?[{type:'battleAnswer',accept:true},{type:'battleAnswer',accept:false}]:[];
        return p.myDone?[]:cardActions('battleSubmit',t=>!isReligionCard(t)&&!!CARDS[t].attack,t=>CARDS[t].attack);
      }
      if (p?.kind === 'royalSupport') {
        if (p.to !== me.id) return [];
        if (!p.accepted) return [{ type: 'supportAnswer', accept: false }, ...(me.hand.length >= 3 ? [{ type: 'supportAnswer', accept: true }] : [])];
        const groups = subsets(me.hand, () => true).flatMap(ids => [ids.slice(0,3), ids.slice(0,4), ids.slice(0,5)]).filter(ids => ids.length >= 3 && ids.length <= 5);
        return [...new Map(groups.map(ids => [ids.join(','), { type: 'supportSubmit', cards: ids }])).values()];
      }
      if (p?.kind === 'trade') {
        if (!p.accepted) return p.to === me.id ? [{ type: 'tradeAnswer', accept: true }, { type: 'tradeAnswer', accept: false }] : [];
        return p.myDone ? [] : cardActions('tradeSubmit', () => true);
      }
      if (g.current !== me.id) return [];
      if (p?.kind === 'craft') return crafts();
      if (g.round === 1) return [{ type: 'draw3' }, ...(me.job==='merchant'?[]:others.filter(p => !p.executed).map(p => ({ type: 'trade', target: p.id })))];
      if (g.round === 2) return [{ type: 'gather' },{ type: 'beginCraft' }, ...cardActions('hunt', t => !!CARDS[t].attack, t => CARDS[t].attack, [me.huntGoal||10])];
      const bundles=new Map();
        for(const cards of subsets(me.hand,t=>!isReligionCard(t))){const ids=cards.slice(0,5);bundles.set(ids.join(','),ids);}
      return [{ type: 'replace' },...(s.chat?.pair?[{type:'investigateIdentity'}]:[]), ...[...bundles.values()].map(cards=>({type:'refresh',cards})),
        ...(king ? others.filter(p => !p.executed).map(p => ({ type: 'royalSupport', target: p.id })) : others.flatMap(p=>[{type:'revealHand',target:p.id},{type:'steal',target:p.id}]))];
    }
    case 'evening': return king ? [{ type: 'tax' }, { type: 'aid' }, ...others.filter(p => !p.executed).map(p => ({ type: 'wanted', target: p.id }))] : [];
    case 'tax': {
      if (p.myDone) return [];
      if (me.hand.length <= 3) return [{ type: 'payTax', cards: me.hand.map(c => c.id) }];
      const groups = CARD_TYPES.map(t => me.hand.filter(c => c.type === t)).filter(g => g.length);
      const result = [];
      for (let i = 0; i < groups.length; i++) for (let j = i; j < groups.length; j++) for(let k=j;k<groups.length;k++) {
        if(result.length>=128)continue;
        const used={}, cards=[];
        for(const group of [i,j,k]){const index=used[group]||0;if(!groups[group][index])break;cards.push(groups[group][index].id);used[group]=index+1;}
        if(cards.length===3)result.push({type:'payTax',cards});
      }
      return result;
    }
    case 'assassinNight':return me.job==='assassin'?[{type:'assassinSkip'},...others.filter(q=>q.id!==g.king&&!q.surrendered).map(q=>({type:'assassinate',target:q.id}))]:[];
    case 'night': return me.role === 'rebel' && !p.myDone ? cardActions('revolt', t => !!CARDS[t].revolt||me.job==='assassin'&&t==='sword', t => CARDS[t].revolt||(t==='sword'?3.5:0)).map(a=>{let bombs=0;return {...a,cards:a.cards.filter(id=>!CARDS[me.hand.find(c=>c.id===id)?.type]?.bomb||++bombs<=Math.max(0,4-(g.bombs||0)))};}) : [];
    case 'bishopNight': {
      if (me.job !== 'bishop') return [];
      const churches = me.hand.filter(c => c.type === 'church').length;
      const evangelisms = me.hand.filter(c => c.type === 'evangelism').length;
      return [{ type: 'bishopDone' }, ...(churches >= 3 ? others.map(p => ({ type: 'evangelize', target: p.id })) : []),
         ...(churches >= 6 && !g.religiousScheduled ? [{ type: 'religiousRevolt' }] : []), ...(evangelisms >= 3 ? [{ type: 'reform' }] : []),
         ...(evangelisms >= 1 ? others.map(p => ({ type: 'reclaimChurch', target: p.id })) : [])];
    }
    default: return [];
  }
}
export function seededRandom(seed = 42) {
  let value = seed >>> 0;
  const random=() => { value=(value+0x6D2B79F5)>>>0; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  random.state=()=>value;random.restore=state=>{if(!Number.isInteger(state)||state<0||state>0xffffffff)throw Error('잘못된 정책 난수 상태');value=state;};return random;
}
function network(input, hidden, output, random) {
  const weights = n => Array.from({ length: n }, () => (random() * 2 - 1) * Math.sqrt(2 / input));
  return { input, hidden, output, w1: weights(input * hidden), b1: Array(hidden).fill(0), w2: weights(hidden * output), b2: Array(output).fill(0) };
}
export function createPolicy(seed = 42, hidden = 32) {
  const random = seededRandom(seed);
  return { version: POLICY_VERSION, ruleset: RULESET, observationSize: OBS_SIZE, actionSize: ACTION_SIZE,
    actor: network(OBS_SIZE, hidden, ACTION_SIZE, random), critic: network(OBS_SIZE, hidden, 1, random),
    metadata: { algorithm: 'PPO-self-play', episodes: 0, decisions: 0, seed } };
}
export function forward(net, input) {
  const hidden = new Float64Array(net.hidden), output = new Float64Array(net.output);
  for (let h = 0; h < net.hidden; h++) {
    let sum = net.b1[h]; const offset = h * net.input;
    for (let i = 0; i < net.input; i++) sum += net.w1[offset + i] * input[i];
    hidden[h] = Math.tanh(sum);
  }
  for (let o = 0; o < net.output; o++) {
    let sum = net.b2[o]; const offset = o * net.hidden;
    for (let h = 0; h < net.hidden; h++) sum += net.w2[offset + h] * hidden[h];
    output[o] = sum;
  }
  return { hidden, output };
}
export function distribution(policy, observation, features, temperature = 1) {
  if(!(temperature>0&&Number.isFinite(temperature)))throw new Error('AI temperature must be positive');
  if(!features.length)throw Error('AI distribution has no choices');
  const pass = forward(policy.actor, observation);
  const groups=features.map(f=>{
    const type=f.slice(0,ACTION_TYPES.length).findIndex(x=>x===1);
    return type<0?'unknown':String(type);
  });
  const sizes=new Map();groups.forEach(g=>sizes.set(g,(sizes.get(g)||0)+1));
  const traits=observation.slice(OBS_SIZE-5,OBS_SIZE),[risk,cooperation,trade,growth,information]=traits;
  const taste={trade:.25*trade,tradeAnswer:.2*trade,marketBuy:.2*trade,royalSupport:.15*cooperation,
    supportAnswer:.2*cooperation,gather:.2*growth,beginCraft:.25*growth,craft:.15*growth,
    revealHand:.3*information,steal:.2*risk,expedition:.15*cooperation,execute:.15*risk,replace:-.1*growth};
  const logits = features.map((f,a) => (f.reduce((s, x, i) => s + x * pass.output[i], 0)+(taste[ACTION_TYPES[Number(groups[a])]]||0)) / temperature-Math.log(sizes.get(groups[a])));
  const max = Math.max(...logits), weights = logits.map(l => Math.exp(l - max)), sum = weights.reduce((s, w) => s + w, 0);
  return { pass, probabilities: weights.map(w => w / sum) };
}
export function enableActionConstruction(policy){
  if(policy.constructionActor)return policy;
   const old=policy.actor,input=CONSTRUCTION_INPUT_SIZE;
  const net={...structuredClone(old),input,w1:Array(input*old.hidden).fill(0)};
  for(let h=0;h<old.hidden;h++)for(let i=0;i<old.input;i++)net.w1[h*input+i]=old.w1[h*old.input+i];
  policy.constructionActor=net;policy.metadata.actionConstruction=2;return policy;
}
export function sample(probabilities, random = Math.random) {
  let roll = random();
  for (let i = 0; i < probabilities.length - 1; i++) { roll -= probabilities[i]; if (roll <= 0) return i; }
  return probabilities.length - 1;
}
function inventoryKey(hand) { return CARD_TYPES.map(t=>hand.filter(c=>c.type===t).length).join(','); }
export function decisionInputs(snapshot, context = null) {
  let actions = candidates(snapshot);
  // 학습/대체 정책은 동료 피해의 구조화된 예외 근거를 제출할 수 없으므로 제외합니다.
  actions=actions.filter(a=>!(['battle','ambush','steal','voteExecution'].includes(a.type)&&snapshot.me.role==='rebel'&&snapshot.players.some(p=>p.id===a.target&&p.role==='rebel')));
  if(context){
    const g=snapshot.game,stage=`${g.day}/${g.phase}/${g.round}/${g.current}`;
    if(stage!==context.stage){context.stage=stage;context.visited=new Set();context.decisions=0;context.repeatedActions=new Map();}
    context.visited.add(inventoryKey(snapshot.me.hand));
    actions=actions.filter(a=>{
      if(a.type==='craft'){
        const r=RECIPES[a.recipe],types=snapshot.me.hand.map(c=>({...c}));
        for(const ingredient of r.ingredients||[r])for(let i=0;i<ingredient.count*a.count;i++){const index=types.findIndex(c=>c.type===ingredient.input);if(index>=0)types.splice(index,1);}
        for(let i=0;i<(r.amount||1)*a.count;i++)types.push({type:r.output});
        if(context.visited.has(inventoryKey(types)))return false;
      }
      if(a.type==='changePrice'&&(context.repeatedActions.get(`${a.stock}/${a.price}`)||0)>0)return false;
      return true;
    });
    if(context.decisions>=40){const finish=actions.filter(a=>['craftDone','merchantDone','bishopDone','marketDone'].includes(a.type));if(finish.length)actions=finish;}
  }
   return {actions,obs:observe(snapshot,context?.traits),features:actions.map(a=>actionFeatures(snapshot,a))};
}
export function recordDecision(context, action) {
  if(!context)return;
  context.decisions++;
  if(action.type==='changePrice'){const key=`${action.stock}/${action.price}`;context.repeatedActions.set(key,(context.repeatedActions.get(key)||0)+1);}
}
export function decide(policy, snapshot, random = Math.random, context = null, chatIntent = null, record = true) {
  if(policy.metadata?.actionConstruction){const result=constructAction(policy,snapshot,{random,traits:context?.traits,context});if(result&&record)recordDecision(context,result.action);return result?.action||null;}
  const {actions,obs,features} = decisionInputs(snapshot,context);
  if (!actions.length) return null;
  const g=snapshot.game;
  const decisive=g.phase==='morning'&&(g.successes>=g.revoltGoal-1||g.religiousSuccesses>=g.religiousGoal-1);
  const temperature=decisive ? .85 : 1.05;
  const { probabilities } = distribution(policy, obs, features,temperature);
  const action=actions[sample(probabilities, random)];if(record)recordDecision(context,action);return action;
}
export function validatePolicy(policy) {
  if(policy?.metadata?.actionConstruction!=null&&![1,2].includes(policy.metadata.actionConstruction))throw Error('지원하지 않는 행동 구성 버전');
  if (policy?.version !== POLICY_VERSION || policy.ruleset !== RULESET || policy.observationSize !== OBS_SIZE || policy.actionSize !== ACTION_SIZE) throw new Error('AI 모델 형식 또는 게임 규칙 버전이 맞지 않습니다. 다시 학습하세요.');
  for (const [key, output] of [['actor', ACTION_SIZE], ['critic', 1]]) {
    const net = policy[key];
    if (!net || net.input !== OBS_SIZE || net.output !== output || !Number.isInteger(net.hidden) || net.hidden < 1 || net.hidden > 128) throw new Error('AI 신경망 크기가 올바르지 않습니다.');
    for (const [name, size] of [['w1', net.input * net.hidden], ['b1', net.hidden], ['w2', net.hidden * net.output], ['b2', net.output]]) {
      if (!Array.isArray(net[name]) || net[name].length !== size || !net[name].every(Number.isFinite)) throw new Error(`AI 모델 가중치 오류: ${key}.${name}`);
    }
  }
  if (!(policy.metadata?.episodes > 0)) throw new Error('학습이 완료된 모델이 아닙니다.');
   if(policy.metadata.actionConstruction===2){const n=policy.constructionActor;if(!n||n.input!==CONSTRUCTION_INPUT_SIZE||n.output!==ACTION_SIZE||n.hidden!==policy.actor.hidden)throw Error('구성 신경망 크기 오류');for(const [k,size] of [['w1',n.input*n.hidden],['b1',n.hidden],['w2',n.hidden*n.output],['b2',n.output]])if(!Array.isArray(n[k])||n[k].length!==size||!n[k].every(Number.isFinite))throw Error('구성 신경망 가중치 오류');}
  return policy;
}
