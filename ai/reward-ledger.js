import {CARDS} from '../lib/game.js';
const value=card=>1+(CARDS[card.type]?.attack||0)/10+(CARDS[card.type]?.revolt||0)/10+(CARDS[card.type]?.mediation||0)/10;
export function assets(room){return Object.fromEntries(room.players.map(p=>[p.id,{role:p.role,job:p.job,hand:p.hand.map(c=>({...c})),money:p.money||0}]));}
export function recordAssetChanges(before,room,actor,action,trajectories,eventId=null){
  const changes=Object.fromEntries(room.players.map(p=>{const old=before[p.id],ids=new Map(p.hand.map(c=>[c.id,c.type])),oldIds=new Map(old.hand.map(c=>[c.id,c.type]));return [p.id,{gain:p.hand.filter(c=>oldIds.get(c.id)!==c.type).reduce((s,c)=>s+value(c),0),loss:old.hand.filter(c=>ids.get(c.id)!==c.type).reduce((s,c)=>s+value(c),0)}];}));
 for(const p of room.players){
  const rows=trajectories.get(p.id)||[];if(!rows.length)continue;
  const old=before[p.id],ids=new Set(p.hand.map(c=>c.id)),oldIds=new Set(old.hand.map(c=>c.id));
   const oldTypes=new Map(old.hand.map(c=>[c.id,c.type])),newTypes=new Map(p.hand.map(c=>[c.id,c.type]));
   const gained=p.hand.filter(c=>!oldIds.has(c.id)||oldTypes.get(c.id)!==c.type).reduce((s,c)=>s+value(c),0)+Math.max(0,(p.money||0)-old.money)/2;
   const lost=old.hand.filter(c=>!ids.has(c.id)||newTypes.get(c.id)!==c.type).reduce((s,c)=>s+value(c),0)+Math.max(0,old.money-(p.money||0))/2;
   if(!gained&&!lost)continue;
  // Attribute delayed results to the last relevant choice, not the last submitter.
  const types=action.type==='battleSubmit'?['battleSubmit','battle','ambush','battleAnswer']:action.type==='contribute'?['contribute','mediate','expedition','voteExpedition','selectExpedition','joinExpedition']:[action.type];
   const relevant=rows.filter(r=>types.includes(r.action?.type)&&r.day===room.game.day&&(!eventId||r.eventId===eventId));if(!relevant.length&&actor===p.id)relevant.push(rows.at(-1));
   if(!relevant.length)continue;
   // A constructed action has several conditional steps. Credit the whole
   // decision group once; never multiply reward by its number of steps.
   const grouped=new Map();for(const row of relevant){const key=row.decisionId||`${row.phase}/${row.action?.type}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}const targets=[...grouped.values()].flat();
   for(const row of targets){row.rewardItems ||= [];if(gained)row.rewardItems.push({kind:'asset-gain',amount:Math.min(.1,gained/100)/targets.length});if(lost)row.rewardItems.push({kind:'asset-cost',amount:-Math.min(.1,lost/100)/targets.length});}
  }
 if(['battleSubmit','contribute','steal'].includes(action.type))for(const p of room.players){
  if(!['king','citizen','rebel'].includes(p.role))continue;
  const rows=trajectories.get(p.id)||[],relevant=[...rows].reverse().find(r=>r.day===room.game.day&&(!eventId||r.eventId===eventId)&&['battleSubmit','battle','ambush','contribute','mediate','expedition','voteExpedition','selectExpedition','joinExpedition','steal'].includes(r.action?.type));if(!relevant)continue;
  let gain=0,cost=0;
  for(const other of room.players){if(other===p||!['king','citizen','rebel'].includes(other.role))continue;const allied=p.role==='rebel'?other.role==='rebel':['king','citizen'].includes(other.role);const d=changes[other.id];gain+=allied?d.gain:d.loss;cost+=allied?d.loss:d.gain;}
  relevant.rewardItems ||= [];if(gain)relevant.rewardItems.push({kind:'team-asset-gain',amount:Math.min(.05,gain/200)});if(cost)relevant.rewardItems.push({kind:'team-asset-cost',amount:-Math.min(.05,cost/200)});
 }
}
export function settleRewards(rows,{won,draw}){
 const positive=rows.flatMap(r=>r.rewardItems||[]).filter(i=>i.amount>0).reduce((sum,i)=>sum+i.amount,0),scale=positive>.3?.3/positive:1;
 for(const row of rows){const items=row.rewardItems||[];row.reward=items.filter(item=>won||draw||item.amount<=0).reduce((sum,item)=>sum+(item.amount>0?item.amount*scale:item.amount),0);}
 if(rows.length)rows.at(-1).reward+=draw?0:won?1:-1;
}
