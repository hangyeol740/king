import {interpretChat} from './chat-intents.js';
import {SOCIAL_MODES,socialContext,socialDistribution} from './social-strategy.js';
import {assets,recordAssetChanges,settleRewards} from '../ai/reward-ledger.js';

// 사람 대화에서의 전략 선택을 결과로 학습합니다. 공유 모델에는 원문/이름/방 코드를 저장하지 않습니다.
export function createLiveLearning(saved={}){
 const observations=new WeakMap();
 const model={version:1,algorithm:'live-human-dialogue-contextual-policy',values:saved.values||{},counts:saved.counts||{},games:saved.games||0,decisions:saved.decisions||0,humanActions:saved.humanActions||{}};
 const contextKey=(s,intent)=>`${socialContext(s)}/${intent}`;
 return {
  model,
  policy(s){const intent=s.me.dialogueIntent||'none',key=contextKey(s,intent);return {values:{[socialContext(s)]:model.values[key]||SOCIAL_MODES.map(()=>0)}};},
  hear(room,bot,input){
   bot.liveExperience ||= {epoch:room.game.startedAt,intent:'none',records:[]};
   if(bot.liveExperience.epoch!==room.game.startedAt)bot.liveExperience={epoch:room.game.startedAt,intent:'none',records:[]};
   bot.liveExperience.intent=interpretChat(input.text)?.intent||'other';
  },
   recordHumanAction(room,player,action,context=null){
   if(player.bot||player.takeover||room.status!=='playing')return;
   const phase=`${context?.phase||room.game.phase}/${context?.round??room.game.round}`;
   model.humanActions ||= {};const row=model.humanActions[phase] ||= {};
   row[action.type]=(row[action.type]||0)+1;
  },
  record(room,bot,s,prepared,plan){
   const experience=bot.liveExperience;if(!experience||experience.epoch!==room.game.startedAt||experience.settled)return;
   const key=contextKey(s,experience.intent),probabilities=socialDistribution({values:{[socialContext(s)]:model.values[key]||SOCIAL_MODES.map(()=>0)}},s);
    experience.records.push({key,mode:prepared.mode,probabilities,plan,action:plan.action,day:s.game.day,eventId:s.game.pending?.eventId||null,rewardItems:[],reward:0});experience.records=experience.records.slice(-100);model.decisions++;
  },
   observe(room,transition=null){
    if(!room.game)return;const previous=transition?.before||observations.get(room.game),current=assets(room);observations.set(room.game,current);if(!previous)return;
    const records=new Map(room.players.map(p=>[p.id,p.liveExperience?.records||[]]));
    if(transition)recordAssetChanges(previous,room,transition.actor,transition.action,records,transition.eventId);
  },
  settle(room){
    if(room.status!=='finished'||!room.game.winner)return;
   let learned=false;
   for(const bot of room.players){const e=bot.liveExperience;if(!e||e.epoch!==room.game.startedAt||e.settled)continue;e.settled=true;
    const records=e.records.filter(r=>r.plan.status==='executed');if(!records.length)continue;
     settleRewards(records,{won:room.game.winner.side!=='draw'&&room.game.winner.players.includes(bot.id),draw:room.game.winner.side==='draw'});
     for(const r of records){const row=model.values[r.key] ||= SOCIAL_MODES.map(()=>0);for(let i=0;i<row.length;i++)row[i]=Math.max(-2,Math.min(2,row[i]+.04*r.reward*(Number(SOCIAL_MODES[i]===r.mode)-r.probabilities[i])/records.length));model.counts[r.key]=(model.counts[r.key]||0)+1;}learned=true;
   }
   if(learned)model.games++;
  },
  snapshot(){return JSON.parse(JSON.stringify(model));},
  diagnostics(){return {algorithm:model.algorithm,games:model.games,decisions:model.decisions,contexts:Object.keys(model.values).length};}
 };
}
