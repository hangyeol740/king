import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';import {aiObservation} from '../lib/ai-observation.js';
test('판단 스냅샷은 서버 손패·로그·메모의 후속 변경과 분리',()=>{
 const room=makeRoom('SNAP','a');joinRoom(room,'b');joinRoom(room,'c');act(room,room.host,{type:'start'});const p=room.players[0],s=aiObservation(room,p);const before=structuredClone(s);
 p.hand.push(card('resource'));room.game.logs.push({id:'new',text:'후속 사건'});p.notes[0].text='바뀐 메모';
 assert.deepEqual(s,before);s.me.hand[0].type='bomb';assert.notEqual(p.hand[0].type,'bomb');
});
