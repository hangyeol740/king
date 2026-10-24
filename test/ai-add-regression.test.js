import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compatiblePolicy} from '../ai/transfer.js';
import {makeRoom,act,view} from '../lib/game.js';
import {OBS_SIZE,ACTION_SIZE,validatePolicy} from '../lib/ai-policy.js';

test('배포 기본1020판 모델을 현재 카드 규칙으로 로드하고 AI 자리를 추가',async()=>{
 const saved=JSON.parse(await readFile(new URL('../models/strategy-v10-robust2.json',import.meta.url),'utf8'));
 const policy=compatiblePolicy(saved);
 assert.equal(validatePolicy(policy),policy);
 assert.equal(policy.observationSize,OBS_SIZE);assert.equal(policy.actionSize,ACTION_SIZE);
 assert.equal(policy.metadata.episodes,1020);
 const room=makeRoom('ADDAI','사람');act(room,room.host,{type:'addBot'});
 assert.equal(view(room,room.host).players.filter(p=>p.bot).length,1);
 act(room,room.host,{type:'addBot'});
 assert.equal(view(room,room.host).players.filter(p=>p.bot).length,2);
});
