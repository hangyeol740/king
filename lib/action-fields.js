export const ACTION_FIELDS={
 usePotion:['card'],rest:[],claimBattleLoot:['cards'],
 assassinate:['target'],assassinSkip:[],
 mediate:['revoltType'],execute:[],expedition:[],voteExpedition:['difficulty'],selectExpedition:['targets'],contribute:['cards','money'],joinExpedition:['join'],redistribute:['accept'],
 trade:['target'],battle:['target'],draw3:[],gather:[],beginCraft:[],hunt:['cards'],craft:['recipe','count'],craftDone:[],replace:[],refresh:['cards'],revealHand:['target'],steal:['target'],
  tax:[],wanted:['target'],aid:[],payTax:['cards'],revolt:['cards'],tradeAnswer:['accept'],tradeSubmit:['cards'],battleAnswer:['accept'],battleSubmit:['cards'],ambush:['target','roar'],ambushSkip:[],duelSkip:[],
 evangelize:['target'],religiousRevolt:[],reform:[],bishopDone:[],voteExecution:['target'],reclaimChurch:['target'],royalSupport:['target'],supportAnswer:['accept'],supportSubmit:['cards'],
 marketBuy:['stock','quantity','cards'],marketDone:[],displayGoods:['cards','price'],changePrice:['stock','price'],merchantBuy:['product','quantity'],merchantDone:[],investigateIdentity:[],
 gameVote:['vote','accept'],requestDraw:[],requestSurrender:[],personalSurrender:[],skipTurn:[]
};
export function validateActionFields(action){
 if(!action||!Object.hasOwn(ACTION_FIELDS,action.type))throw Error('invalid_action_type');
 const allowed=new Set(['type',...ACTION_FIELDS[action.type]]);
 if(Object.keys(action).some(k=>!allowed.has(k)))throw Error('unexpected_action_field');
 return action;
}
