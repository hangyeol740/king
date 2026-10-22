import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {chatAct} from '../lib/chat.js';
import {createOnlineExperience} from '../lib/online-experience.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
test('온라인 사람의 선택·채팅·결과를 저장하고 자격증명과 비밀 손패는 채팅 샘플에서 제외',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'king-experience-')),archived=[];
 try{const recorder=createOnlineExperience({directory,archive:async e=>archived.push(e)}),r=makeRoom('SECRET','name');joinRoom(r,'other');joinRoom(r,'third');act(r,r.host,{type:'start'});const p=r.players.find(p=>p.role==='king');
  let i=0;r.trainingId='training-fixture';while(createHash('sha256').update(`${r.trainingId}/${r.game.startedAt}`).digest()[0]%5===0)r.trainingId=`training-fixture-${++i}`;
  const event=recorder.capture(r,p,{type:'expedition'});act(r,p.id,{type:'expedition'});recorder.commit(event);
 const chat=recorder.capture(r,p,{type:'chatSend',channel:'public',text:'원정 갈래? ㅋㅋ'});chatAct(r,p,{type:'chatSend',channel:'public',text:chat.text});recorder.commit(chat);
 r.status='finished';r.game.winner={side:'royal',players:[p.id]};recorder.outcome(r);recorder.outcome(r);await recorder.flush();
 const records=(await readFile(path.join(directory,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(records.length,3);assert.equal(records[0].chosen>=0,true);assert.equal(archived.length,3);
 assert.ok(!JSON.stringify(records).includes(p.token));assert.ok(!JSON.stringify(records).includes('SECRET'));assert.equal(records[1].observation,undefined);assert.equal(records[1].history.some(m=>m.text.includes(p.name)),false);
 const restored=createOnlineExperience({directory});await restored.restore();assert.equal(restored.style().samples,1);
  const output=path.join(directory,'candidate.json');const result=await promisify(execFile)(process.execPath,['ai/train-online.js','--input',path.join(directory,'events.jsonl'),'--output',output]);assert.equal(JSON.parse(result.stdout).status,'deferred');await assert.rejects(readFile(output,'utf8'),{code:'ENOENT'});
 const dialogue=path.join(directory,'dialogue.jsonl');await promisify(execFile)(process.execPath,['ai/export-dialogue.js',path.join(directory,'events.jsonl'),dialogue]);const example=JSON.parse((await readFile(dialogue,'utf8')).trim());assert.equal(example.messages.at(-1).content,chat.text);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('AI와 오프라인 게임은 사람 학습 기록에서 제외',()=>{
 const recorder=createOnlineExperience({directory:'/tmp/opencode/unused'}),r=makeRoom('X','a'),p=r.players[0];p.bot=true;assert.equal(recorder.capture(r,p,{type:'chatSend',channel:'public',text:'x'}),null);p.bot=false;r.mode='offline';assert.equal(recorder.capture(r,p,{type:'chatSend',channel:'public',text:'x'}),null);
});
