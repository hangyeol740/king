import test from 'node:test';
import assert from 'node:assert/strict';
import {createHumanSpeech,parseHumanEvents,humanDialogueRecords} from '../lib/human-speech.js';
import {createOnlineExperience} from '../lib/online-experience.js';
import {createOpenAIChat} from '../lib/openai-chat.js';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('모든 채널의 사람 원문은 보존, AI·대체AI·출처 미확인 채팅과 과거 AI 문장은 학습 제외',()=>{
 const events=['public','pair','rebel','secret','spectator'].map((channel,i)=>({id:String(i),source:'human',kind:'chat',channel,text:'ㅅㅂ 짛ㅏㄴ 병신  ',history:[{self:false,text:'AI가 만든 말'}]}));
 for(const marker of [{bot:true},{takeover:true},{fromBot:true},{source:'ai'},{source:'bot'},{speaker:'ai'},{speaker:'bot'}])events.push({...events[0],id:JSON.stringify(marker),...marker});
 events.push({kind:'chat',text:'출처 미확인'});
 const records=humanDialogueRecords(events);assert.equal(records.length,5);assert.ok(records.every(r=>r.messages.at(-1).content==='ㅅㅂ 짛ㅏㄴ 병신  '));assert.ok(!JSON.stringify(records).includes('AI가 만든 말'));
 const model=createHumanSpeech();events.forEach(e=>model.learn(e));events.forEach(e=>model.learn(e));assert.equal(model.profile().samples,5);assert.equal(model.profile().markerRates['ㅅㅂ'],1);assert.equal(model.profile().markerRates['병신'],1);
 assert.deepEqual(Object.keys(model.profile().channels).sort(),['pair','public','rebel','secret','spectator']);
});
test('Supabase CSV의 따옴표·개행과 JSONL/배열 입력을 손실 없이 읽음',()=>{
 const e={kind:'chat',source:'human',text:'ㅅㅂ "왜"\n오타  ',channel:'pair'};
 const csv='data,updated_at\r\n"'+JSON.stringify(e).replaceAll('"','""')+'",2026-10-16\r\n';
 assert.deepEqual(parseHumanEvents(csv),[e]);assert.deepEqual(parseHumanEvents(JSON.stringify({data:e})),[e]);assert.deepEqual(parseHumanEvents(JSON.stringify([e])),[e]);assert.throws(()=>parseHumanEvents('data\n"oops'),/Unclosed/);
});
test('학습 모델+기존 기록 복구 시 중복 학습하지 않고 새 사람 채팅만 누적',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'human-speech-'));
 try{
  const event={id:'one',kind:'chat',source:'human',channel:'pair',text:'비밀이름ㅅㅂ'};
  const speech=createHumanSpeech();speech.learn(event);
  const recorder=createOnlineExperience({directory,speechModel:speech.snapshot()});recorder.commit(event);await recorder.flush();await recorder.restore();assert.equal(recorder.style().samples,1);
  assert.ok(!JSON.stringify(recorder.style()).includes('비밀이름'));assert.equal(recorder.style().markerRates['ㅅㅂ'],1);
  const restored=createOnlineExperience({directory,speechModel:recorder.speechSnapshot()});await restored.restore();assert.equal(restored.style().samples,1);
  restored.commit({...event,id:'two',text:'ㅎㅇ'});await restored.flush();assert.equal(restored.style().samples,2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('대화 API에 학습된 말투를 전달하고 응답의 비속어를 그대로 유지',async()=>{
 const r=makeRoom('STYLE','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players[1];bot.bot=true;
 let request;const speech=createHumanSpeech();speech.learn({id:'x',kind:'chat',source:'human',channel:'pair',text:'숨긴이름 병신'});
 const api=createOpenAIChat({apiKey:'test',speechStyle:()=>speech.profile(),fetcher:async(url,init)=>{request=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'ㅅㅂ 그건 싫어',intent:'none'})}}]})};}});
 await api.respond(r,r.players[0],{type:'chatSend',channel:'public',text:'할래?'});
 assert.equal(JSON.parse(request.messages[1].content).observedHumanStyle.samples,1);assert.ok(!JSON.stringify(request).includes('숨긴이름'));assert.match(request.messages[0].content,/욕설·비속어/);assert.equal(r.chat.public.at(-1).text,'ㅅㅂ 그건 싫어');
});
