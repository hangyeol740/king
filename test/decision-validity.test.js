import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';import {aiObservation} from '../lib/ai-observation.js';import {decisionPrerequisites,unreadMessages} from '../lib/decision-validity.js';
test('접속 로그와 AI표시만 바뀌면 유효 결정 유지·손패/전투가 바뀌면 재검토',()=>{
 const r=makeRoom('VALID','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const p=r.players[0],before=decisionPrerequisites(aiObservation(r,p));
 r.players[1].online=true;r.players[1].aiStatus={state:'thinking'};r.game.logs.push({id:'joined',text:'접속했습니다.'});assert.equal(decisionPrerequisites(aiObservation(r,p)),before);
 p.hand.push(card('resource'));assert.notEqual(decisionPrerequisites(aiObservation(r,p)),before);
});
test('게임 상태가 같아도 새로운 채팅 전제는 별도로 검토',()=>{assert.deepEqual(unreadMessages([{id:'a'}],[{id:'a'},{id:'b',text:'조건 바꿀게',self:false},{id:'c',self:true}]),[{id:'b',text:'조건 바꿀게',self:false}]);});
