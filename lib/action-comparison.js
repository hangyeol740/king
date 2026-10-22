import {CARDS,RECIPES} from './game.js';
export function actionComparison(snapshot,action){
 if(!action)return null;
 const cards=snapshot.me.hand.filter(c=>action.cards?.includes(c.id));
 const consumed=cards.filter(c=>!CARDS[c.type].permanent).map(c=>({id:c.id,type:c.type}));
 const base={action,consumed,retainedPermanent:cards.filter(c=>CARDS[c.type].permanent).map(c=>c.id),certainGain:[],uncertainGain:[],alternatives:[]};
 if(action.type==='hunt'){
  const submitted=cards.reduce((sum,c)=>sum+(CARDS[c.type].attack||0),0),required=snapshot.me.huntGoal||(snapshot.me.job==='hunter'?8:10);
  base.hunt={submitted,required,success:submitted>=required};
  if(submitted>=required)base.uncertainGain.push({kind:'random-cards',count:8});
  base.alternatives=[{type:'gather',guaranteedResourceRange:[5,12]},{type:'beginCraft',effect:'제작 모드에서 제작법/수량 선택 가능'}];
  base.reconsider=submitted<required;
 }
 if(action.type==='craft'){
  const recipe=RECIPES[action.recipe];if(recipe){base.materials=(recipe.ingredients||[recipe]).map(m=>({type:m.input,count:m.count*action.count}));base.certainGain.push({type:recipe.output,count:(recipe.amount||1)*action.count});}
 }
 return base;
}
