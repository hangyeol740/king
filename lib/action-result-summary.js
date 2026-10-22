import {CARDS,expeditionPower,RECIPES} from './game.js';
export function actionResultSummary(action,state,construction){
 if(!action)return null;
 const cards=(construction?.cards||[]).filter(c=>action.cards?.includes(c.id));
 return {type:action.type,target:action.target||null,cardTypes:cards.map(c=>c.type),cardCount:cards.length,
  mediation:action.type==='contribute'&&state?.game?.phase!=='expeditionCards'?cards.reduce((sum,c)=>sum+(CARDS[c.type]?.mediation||0),0)+(action.money||0)/2:null,
  expedition:action.type==='contribute'&&state?.game?.phase==='expeditionCards'?cards.reduce((sum,c)=>sum+(expeditionPower(c.type,state?.me?.role)||0),0):null,
   attack:['hunt','battleSubmit'].includes(action.type)?cards.reduce((sum,c)=>sum+(CARDS[c.type]?.attack||0),0):null,
  hunt:action.type==='hunt'?{required:state?.me?.job==='hunter'?8:10,submitted:cards.reduce((sum,c)=>sum+(CARDS[c.type]?.attack||0),0),success:cards.reduce((sum,c)=>sum+(CARDS[c.type]?.attack||0),0)>=(state?.me?.job==='hunter'?8:10)}:null,
  crafting:action.type==='craft'?{recipe:action.recipe,count:action.count,output:RECIPES[action.recipe]?.output}:null,
  accept:action.accept??null,join:action.join??null};
}
