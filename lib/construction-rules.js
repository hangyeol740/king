import {CARDS,RECIPES,MERCHANT_BUYS,canCraft} from './game.js';

// Finite choices only: card bundles and quantities are constructed later.
export function constructionTemplates(s){
 const {me,game:g}=s,p=g?.pending,king=me.id===g?.king,others=s.players.filter(q=>q.id!==me.id&&!q.surrendered);
 if(s.status!=='playing'||me.surrendered)return [];
 if(g.vote?.eligible&&g.vote.myVote===null)return (g.vote.kind==='surrender'&&(me.bot||me.takeover)?[false]:[true,false]).map(accept=>({type:'gameVote',vote:g.vote.id,accept}));
  if(!me.canAct)return [];
  if(p?.kind==='battleLoot')return p.winner===me.id?[{type:'claimBattleLoot',cards:p.cards.slice(0,p.limit).map(c=>c.id)}]:[];
 const target=type=>others.map(q=>({type,target:q.id})),answers=type=>[true,false].map(accept=>({type,accept}));
 const craft=()=>[{type:'craftDone'},...RECIPES.flatMap((r,recipe)=>canCraft(r,me.role,me.job)&&(r.ingredients||[r]).every(m=>me.hand.filter(c=>c.type===m.input).length>=m.count)?[{type:'craft',recipe}]:[])];
 let actions=[];
 switch(g.phase){
 case 'morning':actions=[...(g.revolt>0?[{type:'mediate',revoltType:'rebel'}]:[]),...(g.religiousRevolt!=null?[{type:'mediate',revoltType:'religion'}]:[]),{type:'expedition'},...(g.canExecute!==false?[{type:'execute'}]:[])];break;
 case 'executionVote':actions=target('voteExecution').filter(a=>a.target!==g.king);break;
 case 'mediationSupport':case 'mediationKing':actions=[{type:'contribute'}];break;
 case 'expeditionVote':actions=['low','high'].map(difficulty=>({type:'voteExpedition',difficulty}));break;
 case 'expeditionSelect':actions=[{type:'selectExpedition'}];break;
 case 'expeditionJoin':actions=[true,false].map(join=>({type:'joinExpedition',join}));break;
 case 'expeditionCards':actions=me.job==='merchant'?[]:[{type:'contribute'}];break;
 case 'redistribute':actions=answers('redistribute');break;
 case 'market':actions=[{type:'marketDone'},...(g.shop||[]).filter(i=>i.quantity>0&&me.hand.filter(c=>!['church','evangelism'].includes(c.type)||me.job==='bishop').length>=i.price).map(i=>({type:'marketBuy',stock:i.id}))];break;
 case 'merchantEvening':
  if(p?.kind==='craft'){actions=craft();break;}
  actions=[{type:'merchantDone'},...(!p?.craftUsed?[{type:'beginCraft'}]:[]),...Object.entries(MERCHANT_BUYS).filter(([,v])=>(me.money||0)>=v.cost).map(([product])=>({type:'merchantBuy',product})),...(g.shop||[]).map(i=>({type:'changePrice',stock:i.id}))];
  if(me.hand.some(c=>{const stock=g.shop?.find(i=>i.type===c.type);return stock?stock.quantity<30:(g.shop?.length||0)<5;}))actions.push({type:'displayGoods'});break;
  case 'eveningDuel':actions=p?.kind==='battle'?(p.accepted?[{type:'battleSubmit'}]:[{type:'battleAnswer',accept:true},...(me.hand.some(c=>c.type==='sword')?[{type:'battleAnswer',accept:false}]:[])]):[{type:'duelSkip'},...(me.hand.filter(c=>c.type==='sword').length>=2?target('battle'):[])];break;
  case 'ambush':actions=p?.kind==='battle'?[{type:'battleSubmit'}]:[{type:'ambushSkip'},...target('ambush').filter(a=>!(p.attacked||[]).includes(a.target)).flatMap(a=>me.job==='werewolf'?[...(me.hand.filter(c=>c.type==='sword').length>=(p.extra||0)?[a]:[]),...(p.extra&&me.hand.some(c=>c.type==='roar')?[{...a,roar:true}]:[])]:me.hand.filter(c=>c.type==='sword').length>=2?[a]:[])];break;
 case 'day':
  if(p?.kind==='battle'){actions=p.accepted?[{type:'battleSubmit'}]:answers('battleAnswer');break;}
  if(p?.kind==='trade'){actions=p.accepted?[{type:'tradeSubmit'}]:answers('tradeAnswer');break;}
  if(p?.kind==='royalSupport'){actions=p.accepted?[{type:'supportSubmit'}]:[{type:'supportAnswer',accept:false},...(me.hand.length>=3?[{type:'supportAnswer',accept:true}]:[])];break;}
  if(p?.kind==='craft'){actions=craft();break;}
  if(g.round===1)actions=[{type:'draw3'},...(me.job==='merchant'?[]:target('trade').filter(a=>!s.players.find(q=>q.id===a.target).executed))];
  else if(g.round===2)actions=[{type:'gather'},{type:'beginCraft'},{type:'hunt'}];
  else actions=[{type:'replace'},{type:'refresh'},...(s.chat?.pair?[{type:'investigateIdentity'}]:[]),...(king?target('royalSupport').filter(a=>!s.players.find(q=>q.id===a.target).executed):[...target('revealHand'),...target('steal')])];break;
 case 'evening':actions=[{type:'tax'},{type:'aid'},...target('wanted').filter(a=>!s.players.find(q=>q.id===a.target).executed)];break;
 case 'tax':actions=[{type:'payTax'}];break;
  case 'night':actions=[{type:'revolt'}];break;
  case 'assassinNight':actions=me.job==='assassin'?[{type:'assassinSkip'},...target('assassinate').filter(a=>a.target!==g.king&&!s.players.find(q=>q.id===a.target)?.surrendered)]:[];break;
 case 'bishopNight':{
  const churches=me.hand.filter(c=>c.type==='church').length,evangelism=me.hand.filter(c=>c.type==='evangelism').length;
  actions=[{type:'bishopDone'},...(churches>=3?target('evangelize'):[]),...(churches>=6&&!g.religiousScheduled?[{type:'religiousRevolt'}]:[]),...(evangelism>=3?[{type:'reform'}]:[]),...(evangelism>=1?target('reclaimChurch'):[])];break;
 }
 }
 if(!g.vote){if(!me.bot&&!me.takeover&&g.day>=3&&!me.drawRequested)actions.push({type:'requestDraw'});if(!me.bot&&!me.takeover&&g.day>=2&&(!me.lastSurrenderDay||g.day-me.lastSurrenderDay>=3))actions.push({type:'requestSurrender'});}
 const d=me.difficulty||'normal';if(!me.bot&&!me.takeover)return actions;
 if(d==='veryEasy')actions=actions.filter(a=>a.type!=='steal');
 if(['normal','frenzy','chaos'].includes(d)&&g.day===1)actions=actions.filter(a=>a.type!=='execute');
 if(d==='veryEasy'&&me.skipAction&&g.phase==='day'&&!p)return [{type:'skipTurn'}];
 if(['easy','veryEasy'].includes(d)){
  if(g.phase==='day'&&g.round===2&&!p)return [{type:'beginCraft'}];
  if(p?.kind==='craft'){const first=actions.find(a=>a.type==='craft');if(first)return [first];}
  if(['expeditionCards','mediationSupport','mediationKing','night'].includes(g.phase))actions=actions.filter(a=>['contribute','revolt'].includes(a.type));
 }
  return actions.filter(a=>!(me.job==='werewolf'&&a.type==='battle')&&!(a.type==='ambush'&&me.job!=='werewolf'&&s.players.some(q=>q.id===a.target&&q.role==='rebel')));
}
