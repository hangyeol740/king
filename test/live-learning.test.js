import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveLearning} from '../lib/live-learning.js';
test('사람 대화 의도·실행 결과를 전략 학습에 반영하고 원문은 공유 저장하지 않음',()=>{
 const learning=createLiveLearning(),bot={id:'bot'},room={status:'playing',players:[bot],game:{startedAt:1,day:1}};
 const snapshot={me:{role:'rebel'},game:{phase:'morning'}};
 learning.hear(room,bot,{text:'내 이름은 홍길동, 중재 도와줘'});
 const plan={status:'executed'};learning.record(room,bot,snapshot,{mode:'bluff'},plan);
 room.status='finished';room.game.winner={side:'rebel',players:['bot']};learning.settle(room);
 const saved=learning.snapshot();assert.equal(saved.games,1);assert.ok(saved.values['rebel/crisis/mediation'][2]>0);
 assert.ok(!JSON.stringify(saved).includes('홍길동'));assert.ok(!JSON.stringify(saved).includes('bot'));
 learning.settle(room);assert.equal(learning.snapshot().games,1);
 assert.deepEqual(createLiveLearning(saved).snapshot(),saved);
});
test('실행되지 않은 계획·무승부에는 승리 보상으로 학습하지 않음',()=>{
 const learning=createLiveLearning(),bot={id:'b'},room={status:'playing',players:[bot],game:{startedAt:1,day:1}};
 learning.hear(room,bot,{text:'원정 가자'});learning.record(room,bot,{me:{role:'citizen'},game:{phase:'day'}},{mode:'honest'},{status:'superseded'});
 room.status='finished';room.game.winner={side:'royal',players:['b']};learning.settle(room);assert.equal(learning.snapshot().games,0);
});
