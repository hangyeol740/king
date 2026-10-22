import {actionResultSummary} from './action-result-summary.js';
import {CARDS,RECIPES,canCraft} from './game.js';
export function numericStatementMismatch(text,context){
 const counts=context.state?.me?.handCounts||{},job=context.state?.me?.job,role=context.state?.me?.role;
  const resource=text.match(/자원\s*(\d+)\s*(?:개|장)\s*(중|전부|모두|면)/);
 if(resource&&Number(resource[1])!==(counts.resource||0))return true;
 const spending=text.match(/자원\s*(\d+)\s*(?:개|장)(?:로|으로|를|을)/);if(spending&&Number(spending[1])>(counts.resource||0))return true;
 for(const [type,def] of Object.entries(CARDS)){
  const escaped=def.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(`자원\\s*(\\d+)\\s*(?:개|장)(?:로|으로|를|을|\\s|전부|모두|써서)*\\s*${escaped}\\s*(\\d+)\\s*(?:개|장)(?:을|를|\\s)*(?:만들|제작)`);
   const match=text.match(pattern);if(!match)continue;
  const recipes=RECIPES.filter(r=>r.output===type&&r.input==='resource'&&canCraft(r,role,job));
   if(!recipes.some(r=>Number(match[1])*(r.amount||1)===Number(match[2])*r.count))return true;
   const remainder=text.match(/(?:나머지\s*)?자원\s*(\d+)\s*(?:개|장)(?:가|이|는|을|를|\s)*(?:남|보존)/);
   if(remainder&&Number(remainder[1])!==(counts.resource||0)-Number(match[1]))return true;
 }
 return false;
}
function exactContributionClaim(out,action,context){
 if(out.strategyMode==='bluff'||action?.type!=='contribute')return null;
 const match=out.text.match(/(?:딱|정확히)?\s*(\d+)\s*점(?:을|만|으로|\s)*(?:낼게|내겠|지원할|지원하겠|보탤|보태겠)/);
 if(!match)return null;
 const result=actionResultSummary(action,context.state,context.actionConstruction),power=context.state?.game?.phase==='expeditionCards'?result.expedition:result.mediation;
 return /최소|이상/.test(out.text)?power>=Number(match[1]):power===Number(match[1]);
}
export function expressionMismatch(out,action){
 if(!out.text||out.communication==='silent'||out.strategyMode==='bluff')return false;
  const explicit=out.text.match(/(?:딱\s*)?(\d+)\s*점(?:을|만|\s)*(?:지원|보태|낼|내겠)/);
 if(explicit&&out.promiseConditions?.points!==Number(explicit[1])&&action?.type!=='contribute')return true;
 if(action?.type==='joinExpedition'&&action.join===false&&/참가할게|참여할게|같이\s*갈게/.test(out.text))return true;
 if(['tradeAnswer','supportAnswer','battleAnswer'].includes(action?.type)&&action.accept===false&&/수락할게|받을게|좋아.*하자/.test(out.text))return true;
 return false;
}
export async function rewriteExpression(client,out,action,context){
  const intentRecipe=out.promiseConditions?.recipe!=null?RECIPES[out.promiseConditions.recipe]:null;
  const count=out.promiseConditions?.count||1;
  const intentCalculation=intentRecipe?{materials:(intentRecipe.ingredients||[intentRecipe]).map(m=>({type:m.input,count:m.count*count,remaining:(context.state?.me?.handCounts?.[m.input]||0)-m.count*count})),output:intentRecipe.output,produced:(intentRecipe.amount||1)*count}:null;
  const result=await client.ask('게임 참가자의 확정된 결정에 맞춰 대사만 작성한다. 행동·조건·전략을 바꾸지 않는다. 수치는 서버 calculatedResult/intentCalculation가 정답이다. 전제에 없던 잔여카드를 만들지 않는다. 중재력과 원정력은 다른 상황의 값이며 더하지 않는다. 실패 사냥을 선택했다면 성공한다고 말하지 않는다. 허세는 의도대로 유지한다. 다른 채널 내용을 만들지 않는다. beginCraft는 제작 시작이며 다음 제작 의사는 intentCalculation에 따른다. JSON text 한 필드만 반환.',{persona:context.persona,currentMessage:context.currentMessage,state:context.state,rules:context.rules,decision:{action,calculatedResult:actionResultSummary(action,context.state,context.actionConstruction),intentCalculation,communication:out.communication,futureCommitment:out.futureCommitment,conditions:out.promiseConditions,strategy:out.strategyMode},previousMismatch:context.expressionReview,original:out.text},{type:'object',properties:{text:{type:'string',maxLength:300}},required:['text'],additionalProperties:false});
 if(typeof result.text!=='string'||!result.text.trim()||result.text.length>300)throw Error('invalid_speech');
 return {...out,text:result.text};
}
export async function semanticExpressionCheck(client,out,action,context){
  if(out.communication==='silent')return true;
   if(out.strategyMode!=='bluff'&&numericStatementMismatch(out.text,context)){context.expressionReview={consistent:false,reason:'보유 자원 수량 또는 제작 산술 불일치'};return false;}
   const exact=exactContributionClaim(out,action,context);
   if(exact===false){context.expressionReview={consistent:false,reason:'서버 계산과 지원점수 발언 불일치'};return false;}
   // Do not ask another model to reinterpret an exact numeric equality already
   // proven by the rules engine. Other claims still get semantic review.
   if(exact===true&&out.communication!=='question'&&!out.futureCommitment&&/^(?:응[, ]*|네[, ]*)?(?:(?:장교|보병)(?:\s*한\s*장)?(?:로|를|\s*내서)?\s*)?(?:딱|정확히)?\s*\d+\s*점(?:을|만)?\s*(?:낼게|내겠어|지원할게|지원하겠어|보탤게)[.!\s]*$/.test(out.text.trim())){context.expressionReview={consistent:true,reason:'서버 계산과 단일 지원문장 일치'};return true;}
   const aiConditions=out.promiseConditions?Object.fromEntries(Object.entries(out.promiseConditions).filter(([key])=>key!=='reason')):null;
   // beginCraft is the start of the same future craft, not a competing action.
   // Prove a single numeric recipe statement directly when possible rather
   // than letting a reviewer mistake future tense for an already-run action.
   if(action?.type==='beginCraft'&&out.futureCommitment==='craft'&&aiConditions?.recipe!=null&&aiConditions.count&&out.strategyMode!=='bluff'){
    const r=RECIPES[aiConditions.recipe],name=r&&CARDS[r.output]?.name;
    const simple=name&&new RegExp(`^자원\\s*(\\d+)\\s*(?:개|장)(?:로|으로)\\s*${name}\\s*(\\d+)\\s*(?:개|장)(?:을|를)?\\s*(?:제작할게|만들게)[.!\\s]*$`).exec(out.text.trim());
    if(simple&&r.input==='resource'&&Number(simple[1])===r.count*aiConditions.count&&Number(simple[2])===(r.amount||1)*aiConditions.count&&canCraft(r,context.state.me.role,context.state.me.job)){context.expressionReview={consistent:true,reason:'제작시작과 단일 미래제작 의사·재료 산술 일치'};return true;}
   }
   const result=await client.ask('AI 자신의 발언과 AI 자신의 확정 결정 사이의 모순만 검사한다. incomingOpponentMessage는 타인의 요구이며 AI약속이 아니다. 반대·거절은 정상이다. calculatedActionResult는 서버 규칙 계산으로 신뢰하고 임의로 재계산하지 않는다. 중재력과 공격력/원정력은 서로 다른 수치로 합산하지 않는다. officer의 중재력은7, 원정력은3, 전투공격력은0이다. 사냥은 성공을 보장하지 않는 시도이며0점 실패시도도 합법이다. 성공한다고 말했는데 계산은실패면 모순이다. beginCraft는 제작시작이며 미래제작 의사를 말할 수 있다. recipe수량과 대사내부 산술은 대조한다. bluff 허용. 발언이 행동을 모두 설명할 의무는없다. 누출검사는 하지않는다.',{aiStatement:out.text,aiAction:action,calculatedActionResult:actionResultSummary(action,context.state,context.actionConstruction),aiFutureIntent:out.futureCommitment,aiCommunication:out.communication,aiConditions,aiStrategy:out.strategyMode,incomingOpponentMessage:context.currentMessage,state:context.state,rules:context.rules,recipes:context.actionConstruction?.recipes},{type:'object',properties:{consistent:{type:'boolean'},reason:{type:'string'}},required:['consistent','reason'],additionalProperties:false});
  context.expressionReview={consistent:result.consistent,reason:result.reason};
 return result.consistent===true;
}
