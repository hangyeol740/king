import {handoverHistory} from './handover-memory.js';
export async function extractHandoverIntents(client,room,bot,scope){
 const history=handoverHistory(room,bot).find(h=>h.scope===scope)?.messages||[];
 const own=history.filter(m=>m.self);if(!own.length)return [];
 const properties={type:{type:'string'},targetName:{type:['string','null']},day:{type:['integer','null'],minimum:1},phase:{type:['string','null']},points:{type:['integer','null'],minimum:0},pointMode:{type:['string','null'],enum:[null,'exact','minimum']},evidenceIds:{type:'array',items:{type:'string',enum:own.map(m=>m.id)},minItems:1},uncertain:{type:'boolean'},conditionsText:{type:'string'}};
 const response=await client.ask('자리를 넘긴 사람이 이 채널에서 직접 말한 미래 의사/약속만 추출한다. 상대 발언을 본인의 약속으로 만들지 않는다. 조건·철회·정확/최소량을 보존하고 불명확하면 uncertain=true. 타인 익명 발신자는 추측하지 않는다. 당일 이미 실행한 행동은 새 미래 의사로 만들지 않는다.',{scope,day:room.game.day,phase:room.game.phase,history},{type:'object',properties:{intents:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},maxItems:20}},required:['intents'],additionalProperties:false});
 return response.intents.filter(i=>i.evidenceIds.every(id=>own.some(m=>m.id===id)));
}
