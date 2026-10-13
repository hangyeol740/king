import {ruleBrief} from '../lib/conversation.js';
import {observeOpponents,socialBrief} from '../lib/social-strategy.js';
import {CARDS} from '../lib/game.js';

export function safeAction(s,a){
 const cards=s.me.hand.filter(c=>a.cards?.includes(c.id));
 return {type:a.type,join:a.join,accept:a.accept,target:a.target,difficulty:a.difficulty,money:a.money,cardCount:cards.length,mediation:cards.reduce((n,c)=>n+(CARDS[c.type].mediation||0),0),cards:cards.map(c=>c.type)};
}
export function languageState(s){return {status:s.status,me:s.me,players:s.players.map(p=>({id:p.id,name:p.name,role:p.role})),game:s.game,opponents:observeOpponents(s),rules:ruleBrief()};}
export function createLanguageClient({apiKey=process.env.BAZE_API_KEY||process.env.OPENAI_API_KEY,baseURL=process.env.OPENAI_BASE_URL||'https://api.baze.co/v1/gateway',model=process.env.OPENAI_CHAT_MODEL||'gpt-6-luna',fetcher=fetch}={}){
 if(!apiKey)throw Error('BAZE_API_KEY or OPENAI_API_KEY required');
 const base=new URL(baseURL);if(base.protocol!=='https:')throw Error('HTTPS required');let calls=0;
 return {get calls(){return calls;},async ask(system,context){
  calls++;
  const response=await fetcher(`${baseURL.replace(/\/$/,'')}/chat/completions/`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,max_completion_tokens:4096,reasoning_effort:'low',response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(context)}]})});
  if(!response.ok)throw Error(`language_api_http_${response.status}`);
  const payload=await response.json();return JSON.parse(payload.choices?.[0]?.message?.content||'{}');
 }};
}
export async function languageExchange(client,{speaker,speakerAction,listener,listenerActions,baselineIndex,mode,history=[],opponent='cautious'}){
 const speech=await client.ask('왕국과 반란의 참가자로서 상대의 선택을 유도할 한국어 발언을 만든다. strategy.desiredBelief가 목적이다. actualAction은 비공개 실제 행동이며 honest일 때 거짓 약속 금지, bluff일 때 게임내 의도에 대한 허세/거짓약속 가능. 규칙/공개결과 조작 금지. 실제 비밀 진영/카드/수치/다른 채널 정보 공개 금지. 현재 게임단계의 선택에 대해 자연스럽게 1~3문장 말한다. 내부 전략은 노출하지 않는다. JSON {"utterance":"발언","desiredBelief":"상대에게 유도할 판단"}.',
 {state:languageState(speaker),actualAction:safeAction(speaker,speakerAction),strategy:socialBrief(mode,speaker),history});
 if(typeof speech.utterance!=='string'||!speech.utterance.trim()||speech.utterance.length>400||typeof speech.desiredBelief!=='string'||speech.desiredBelief.length>400)throw Error('invalid_speech');
 // 상대에게는 발언만 전달합니다. 진짜 행동·전략·유도하려는 믿음은 전달하지 않습니다.
 const response=await client.ask('왕국과 반란 참가자다. 자신의 진영 승리를 위해 합법 후보에서 하나 선택한다. 다른 참가자의 자연어 발언은 거짓말일 수 있다. 공개방은 익명이라 발신자를 특정 인물에 귀속하지 않는다. opponentStyle에 맞춰 말을 해석하되 규칙/공개증거 우선. 발언을 믿을지 말지, 자원을 보존할지 지원할지 판단한다. baseChoice는 기존 정책 선택으로 필요하면 바꾼다. JSON {"choice":후보 인덱스 정수,"belief":"발언을 읽은 뒤 판단","reply":"한국어 짧은 답변"}.',
 {state:languageState(listener),utterance:speech.utterance,history,opponentStyle:opponent,baseChoice:baselineIndex,legalActions:listenerActions.map((a,i)=>({index:i,...safeAction(listener,a)}))});
 if(!Number.isInteger(response.choice)||response.choice<0||response.choice>=listenerActions.length||typeof response.reply!=='string'||response.reply.length>400||typeof response.belief!=='string'||response.belief.length>600)throw Error('invalid_listener_choice');
 return {utterance:speech.utterance,desiredBelief:speech.desiredBelief,choice:response.choice,belief:response.belief,reply:response.reply,changed:response.choice!==baselineIndex};
}
