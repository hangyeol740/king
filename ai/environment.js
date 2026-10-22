import { act, makeRoom, joinRoom, view, CARDS, RECIPES, expeditionPower } from '../lib/game.js';
import { candidates, decisionInputs, createDecisionContext, recordDecision, distribution, sample, forward } from '../lib/ai-policy.js';
import {aiObservation} from '../lib/ai-observation.js';
import {constructAction} from '../lib/action-construction.js';
import {assets,recordAssetChanges,settleRewards} from './reward-ledger.js';

export function readyPlayers(room) {
  if (room.status !== 'playing') return [];
  return room.players.filter(p => candidates(aiObservation(room,p)).length > 0);
}
export function newGame(count = 3, random = Math.random) {
  const room = makeRoom('TRAIN', '학습 1');
  for (let i = 1; i < count; i++) joinRoom(room, `학습 ${i + 1}`);
  if (count >= 4) {
    const choices=[[],['bishop'],['merchant'],['bishop','merchant']];
    act(room,room.host,{type:'neutralJobs',jobs:choices[Math.floor(random()*choices.length)]});
    const roles={king:1,citizen:1,rebel:1,neutral:1};
    for(let i=4;i<count;i++){const extra=['citizen','rebel','neutral'][Math.floor(random()*3)];roles[extra]++;}
    act(room,room.host,{type:'config',roles});
  }
  if(room.config.citizen>0){const options=[[],['hunter'],['blacksmith'],['hunter','blacksmith']].filter(jobs=>jobs.length<=room.config.citizen),jobs=options[Math.floor(random()*options.length)];act(room,room.host,{type:'citizenJobs',jobs});}
  act(room, room.host, { type: 'start' });
  room.game.simulation=true;
  return room;
}
// 학습 및 평가의 상대. 이 전략은 배포용 학습 모델과 구분합니다.
export const OPPONENT_STYLES = ['balanced','cooperative','aggressive','builder','trader'];
export const TRAINING_OPPONENTS = ['random', ...OPPONENT_STYLES, 'previous'];
export function baseline(snapshot, actions, random = Math.random, style = 'balanced') {
  const { me, game: g } = snapshot;
  const royal = ['king', 'citizen'].includes(me.role);
  const score = (action, key) => me.hand.filter(c => action.cards?.includes(c.id)).reduce((s, c) => s + (CARDS[c.type][key] || 0), 0);
  const pick=type=>{const list=actions.filter(a=>a.type===type);return list[Math.floor(random()*list.length)];};
  if(g.vote?.eligible&&g.vote.myVote===null)return actions.find(a=>a.type==='gameVote'&&a.accept===(style==='cooperative'))||actions[0];
  if(g.pending?.kind==='battle')return actions.find(a=>a.type==='battleAnswer'&&a.accept===(style==='aggressive'))||[...actions].sort((a,b)=>score(b,'attack')-score(a,'attack'))[0];
  if(g.phase==='ambush')return style==='aggressive'?(pick('ambush')||actions[0]):pick('ambushSkip');
  if(g.phase==='day'&&!g.pending?.kind){
    if(g.round===1&&style==='trader'&&random()<.65){const a=pick('trade');if(a)return a;}
    if(g.round===1&&style==='aggressive'&&random()<.4)return pick('battle')||actions[0];
    if(g.round===2&&style==='builder')return pick('gather')||actions[0];
    if(g.round===3&&style==='aggressive')return pick('steal')||pick('royalSupport')||actions[0];
    if(g.round===3&&style==='trader')return pick('revealHand')||pick('refresh')||actions[0];
  }
  if(g.pending?.kind==='trade'&&style==='trader'){
    return actions.find(a=>a.type==='tradeAnswer'&&a.accept)||actions.filter(a=>a.type==='tradeSubmit'&&a.cards.length>0&&a.cards.length<=3)[0]||actions[0];
  }
  if (g.phase === 'morning') return actions.find(a => a.type === 'mediate') || actions.find(a => a.type === 'expedition');
  if (g.phase.startsWith('mediation')) {
    const sorted = [...actions].sort((a, b) => score(b, 'mediation') - score(a, 'mediation'));
    return royal ? sorted[0] : sorted.at(-1);
  }
  if (g.phase === 'night') return [...actions].sort((a, b) => score(b, 'revolt') - score(a, 'revolt'))[0];
  if (g.phase === 'bishopNight') return actions.find(a => a.type === 'religiousRevolt' && me.churchInfluence >= 10) || actions.find(a => a.type === 'reform') || actions.find(a => a.type === 'evangelize') || actions[0];
  if(g.phase==='market')return style==='trader'&&random()<.6?(pick('marketBuy')||actions[0]):actions.find(a=>a.type==='marketDone');
  if(g.phase==='merchantEvening'){
    if(g.pending.kind==='craft')return actions.find(a=>a.type==='craftDone');
    return actions.find(a=>a.type==='displayGoods'&&a.price===(style==='trader'?1:style==='aggressive'?5:3))||actions.find(a=>a.type==='merchantDone');
  }
  if (g.phase === 'expeditionVote') return actions[0];
  if (g.phase === 'expeditionSelect') return actions[0];
  if (g.phase === 'expeditionJoin') return actions[0];
  if (g.phase === 'expeditionCards') {
    const value=a=>me.hand.filter(c=>a.cards?.includes(c.id)).reduce((s,c)=>s+expeditionPower(c.type,me.role),0);
    return [...actions].sort((a,b)=>me.role==='rebel'?value(a)-value(b):value(b)-value(a))[0];
  }
  if (g.phase === 'redistribute') return actions.find(a => a.accept === (me.hand.length < 12));
  if (g.phase === 'day') {
    if (g.pending?.kind === 'royalSupport') return actions.find(a => a.type === 'supportAnswer' && !a.accept) || actions[0];
    if (g.pending?.kind === 'trade') return actions.find(a => a.accept === false || a.cards?.length === 0) || actions[0];
    if (g.pending?.kind === 'craft') {
      if(me.job==='merchant')return actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output==='shiningSword')||actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output==='reinforcedSword')||actions.find(a=>a.type==='craftDone');
       const priorities=['ironSword',...(me.job==='bishop'?['evangelism','church']:[]),'warWeapon','flameSword','northSword','highMagic',...(me.role==='rebel'?['bomb','agitation','rebellion','infantry']:['officer','infantry','rebellion']),'eternalMagic','eternalSword','weapon','magic','sword'];
      for(const output of priorities){const choice=actions.find(a=>a.type==='craft'&&RECIPES[a.recipe].output===output);if(choice)return choice;}
      return actions[0];
    }
    if (g.round === 1) return actions.find(a => a.type === 'draw3');
    if (g.round === 2) return actions.filter(a => a.type === 'hunt' && score(a, 'attack') >= me.huntGoal).sort((a, b) => a.cards.length - b.cards.length)[0] || actions[0];
    return actions.find(a => a.type === 'refresh' && a.cards.length===0);
  }
  if (g.phase === 'evening') return actions.find(a => a.type === 'aid');
  return actions[Math.floor(random() * actions.length)];
}
export function rollout(policy, { count = 3, random = Math.random, opponents = [], collect = true, maxSteps = 1800, opponentOffset = 0,learnerRole=null } = {}) {
 let room,learner;
 for(let attempt=0;attempt<1000;attempt++){room=newGame(count,random);learner=learnerRole?room.players.find(p=>(p.job||p.role)===learnerRole):room.players[Math.floor(random()*room.players.length)];if(learner)break;}
 if(!learner)throw Error(`학습 역할 생성 실패:${learnerRole}/${count}`);
 const trajectories = new Map(room.players.map(p => [p.id, []])),mixedTraining=opponents.length>0;
 const choices = new Map(room.players.map((p,index) => [p.id,!mixedTraining?{kind:'learner'}:p===learner?{kind:'learner'}:opponents[(opponentOffset+index)%opponents.length]]));
  const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)]));
  const styles=new Map(room.players.map(p=>[p.id,OPPONENT_STYLES[Math.floor(random()*OPPONENT_STYLES.length)]]));
  const metrics={actions:{},byRole:{},byPersonality:{},phaseActions:{},candidateEntropy:0,decisions:0};
  let steps = 0;
  while (room.status === 'playing') {
    if (++steps > maxSteps) throw new Error(`학습 게임 단계 제한 초과: ${room.game.phase}`);
    const ready = readyPlayers(room);
    if (!ready.length) throw new Error(`행동 가능한 참가자 없음: ${room.game.phase}`);
    const p = ready[Math.floor(random()*ready.length)], snapshot = aiObservation(room,p),context=contexts.get(p.id), {actions,obs,features}=decisionInputs(snapshot,context), controller = choices.get(p.id);
    let index,constructed=null;
    if (controller.kind==='random') index=Math.floor(random()*actions.length);
    else if (controller.kind==='baseline') index = actions.indexOf(baseline(snapshot, actions, random,controller.style));
    else if (controller.kind==='policy'&&controller.policy.metadata?.actionConstruction){constructed=constructAction(controller.policy,snapshot,{random,traits:context.traits,context});index=actions.push(constructed.action)-1;}
    else if (controller.kind==='policy') { const probabilities=distribution(controller.policy,obs,features).probabilities;index=sample(probabilities,random); }
    else if(policy.metadata?.actionConstruction){constructed=constructAction(policy,snapshot,{random,traits:context.traits,context});index=actions.push(constructed.action)-1;if(collect)trajectories.get(p.id).push(...constructed.steps);metrics.decisions++;}
    else {
      const { probabilities } = distribution(policy, obs, features);
      metrics.candidateEntropy-=probabilities.reduce((s,p)=>s+p*Math.log(Math.max(p,1e-12)),0);metrics.decisions++;
      index = sample(probabilities, random);
        if (collect) trajectories.get(p.id).push({ obs, features, chosen: index,action:structuredClone(actions[index]),phase:room.game.phase,day:room.game.day,oldLogProbability: Math.log(Math.max(1e-12, probabilities[index])), value: forward(policy.critic, obs).output[0], reward: 0 });
    }
    const type=actions[index].type,role=p.job||p.role;
     const pendingId=room.game.pending?.eventId;
     if(collect&&choices.get(p.id).kind==='learner'&&pendingId){const rows=trajectories.get(p.id)||[],last=rows.at(-1);for(const row of rows)if(row===last||last?.decisionId&&row.decisionId===last.decisionId)row.eventId=pendingId;}
    metrics.actions[type]=(metrics.actions[type]||0)+1;
    for(const [bucket,key] of [[metrics.byRole,role],[metrics.byPersonality,context.name],[metrics.phaseActions,`${room.game.phase}/${room.game.round}`]]){bucket[key]||={};bucket[key][type]=(bucket[key][type]||0)+1;}
    recordDecision(context,actions[index]);
    const beforeAssets=collect?assets(room):null;act(room, p.id, actions[index]);
    const afterId=room.game.pending?.eventId;
     if(collect&&choices.get(p.id).kind==='learner'&&afterId&&afterId!==pendingId){const rows=trajectories.get(p.id)||[],last=rows.at(-1);for(const row of rows)if(row===last||last?.decisionId&&row.decisionId===last.decisionId)row.eventId=afterId;}
    if(collect)recordAssetChanges(beforeAssets,room,p.id,actions[index],trajectories,pendingId||afterId);
     if(collect){
      const processed=metrics.processedResults ||= new Set();
      for(const event of room.game.resultEvents||[]){if(processed.has(event.id))continue;processed.add(event.id);
       for(const q of room.players){const rows=trajectories.get(q.id);if(!rows.length)continue;let value=0;
         if(event.kind==='mediation'){
          if(event.revoltType==='rebel')value=['king','citizen'].includes(q.role)?(event.blocked?.04:-.04):q.role==='rebel'?(event.blocked?-.04:.04):0;
          else value=q.job==='bishop'?(event.blocked?-.04:.04):['king','citizen'].includes(q.role)?(event.blocked?.04:-.04):0;
         }
         const relevant=[...rows].reverse().find(row=>(!event.eventId||row.eventId===event.eventId)&&(event.kind==='battle'?row.action?.type==='battleSubmit':event.kind==='expedition'?row.action?.type==='contribute'&&row.phase==='expeditionCards':row.phase?.startsWith('mediation')||row.phase==='morning'));
         if(relevant&&event.kind==='mediation'){relevant.rewardItems ||= [];relevant.rewardItems.push({kind:'team-result',amount:value});}
       }
      }
    }
  }
  for (const p of room.players) {
    const records = trajectories.get(p.id);
       if(records.length){const draw=room.game.winner.side==='draw',won=!draw&&room.game.winner.players.includes(p.id);settleRewards(records,{won,draw});}
  }
  return { room, trajectories, steps, metrics };
}
export function evaluate(policy, { games = 60, counts = [3, 4, 5], random = Math.random, opponent = 'baseline' } = {}) {
  const results = { games, opponent:typeof opponent==='object'?'previous-model':opponent, wins: 0, byRole: {}, byPersonality:{}, actions:{}, phaseActions:{}, candidateEntropy:0,policyDecisions:0, averageDecisions: 0 };
  for (let game = 0; game < games; game++) {
    const room = newGame(counts[game % counts.length],random), learner = room.players[Math.floor(random() * room.players.length)];
    const contexts=new Map(room.players.map(p=>[p.id,createDecisionContext(random)]));
    const styles=new Map(room.players.map(p=>[p.id,OPPONENT_STYLES[Math.floor(random()*OPPONENT_STYLES.length)]]));
    let steps = 0;
    while (room.status === 'playing') {
      if (++steps > 1800) throw new Error('평가 게임 단계 제한 초과');
      const ready=readyPlayers(room),p=ready[Math.floor(random()*ready.length)], s = aiObservation(room,p),context=contexts.get(p.id),{actions,obs,features}=decisionInputs(s,context);
       let index;
       const activePolicy=p.id===learner.id?policy:opponent&&typeof opponent==='object'?opponent:null;
       if(activePolicy?.metadata?.actionConstruction){const built=constructAction(activePolicy,s,{random,traits:context.traits,context});index=actions.push(built.action)-1;}
       else if (p.id === learner.id) {
        const probabilities = distribution(policy, obs, features).probabilities;
        index = sample(probabilities, random);
        results.candidateEntropy-=probabilities.reduce((sum,p)=>sum+p*Math.log(Math.max(p,1e-12)),0);results.policyDecisions++;
        const type=actions[index].type,key=`${room.game.phase}/${room.game.round}`;
        results.actions[type]=(results.actions[type]||0)+1;results.phaseActions[key]||={};results.phaseActions[key][type]=(results.phaseActions[key][type]||0)+1;
      } else if (opponent === 'random') index = Math.floor(random() * actions.length);
      else if(opponent && typeof opponent==='object')index=sample(distribution(opponent,obs,features).probabilities,random);
       else index = actions.indexOf(baseline(s, actions, random,opponent==='mixed'?styles.get(p.id):OPPONENT_STYLES.includes(opponent)?opponent:'balanced'));
      recordDecision(context,actions[index]);
      act(room, p.id, actions[index]);
    }
     const won = room.game.winner.side!=='draw'&&room.game.winner.players.includes(learner.id);
    results.wins += Number(won); results.averageDecisions += steps;
    const row = results.byRole[learner.job || learner.role] ||= { games: 0, wins: 0 };
    row.games++; row.wins += Number(won);
    const personality=results.byPersonality[contexts.get(learner.id).name]||={games:0,wins:0};personality.games++;personality.wins+=Number(won);
  }
  results.winRate = results.wins / games; results.averageDecisions /= games;
  results.roleFloor=Math.min(...Object.values(results.byRole).filter(row=>row.games>=3).map(row=>row.wins/row.games),1);
  results.averageCandidateEntropy=results.candidateEntropy/Math.max(1,results.policyDecisions);
  results.distinctActionTypes=Object.keys(results.actions).length;
  results.phaseDiversity=Object.fromEntries(Object.entries(results.phaseActions).map(([phase,actions])=>{const n=Object.values(actions).reduce((s,n)=>s+n,0),probs=Object.values(actions).map(x=>x/n);return [phase,{decisions:n,types:probs.length,entropy:-probs.reduce((s,p)=>s+p*Math.log(p),0),topShare:Math.max(...probs)}];}));
  return results;
}
