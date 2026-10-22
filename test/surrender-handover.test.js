import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,victoryGroup,checkHumanDeparture} from '../lib/game.js';

function game(roles){const r=makeRoom('EXIT','p0');for(let i=1;i<roles.length;i++)joinRoom(r,`p${i}`);act(r,r.host,{type:'start'});r.players.forEach((p,i)=>{p.role=roles[i];p.job=null;p.online=true;p.notes=[];});r.game.king=r.players.find(p=>p.role==='king').id;r.game.initialHumanGroups=[...new Set(r.players.map(victoryGroup))];r.game.day=3;return r;}
test('진영 기권은 AI 과반수만으로 사람을 기권시키지 못함',()=>{
 const r=game(['king','citizen','citizen','rebel','neutral']),[king,a,b]=r.players;a.bot=true;b.bot=true;
 act(r,a.id,{type:'requestSurrender'});act(r,b.id,{type:'gameVote',vote:r.game.vote.id,accept:true});
 assert.equal(r.status,'playing');assert.equal(king.personalSurrender,undefined);
 act(r,king.id,{type:'gameVote',vote:r.game.vote.id,accept:false});assert.equal(r.game.vote,null);assert.equal(king.personalSurrender,undefined);
});
test('가결된 진영 기권의 반대자는 일반 패배·찬성자는 기권패이며 AI가 자산 승계',()=>{
 const r=game(['king','citizen','citizen','rebel','neutral']),[king,a,b]=r.players;const cards=b.hand.map(c=>c.id);
 act(r,king.id,{type:'requestSurrender'});const vote=r.game.vote.id;act(r,b.id,{type:'gameVote',vote,accept:false});act(r,a.id,{type:'gameVote',vote,accept:true});
 assert.equal(r.status,'playing');assert.equal(king.humanExitOutcome,'surrender');assert.equal(a.humanExitOutcome,'surrender');assert.equal(b.humanExitOutcome,'loss');assert.ok([king,a,b].every(p=>p.bot&&p.personalSurrender));assert.deepEqual(b.hand.map(c=>c.id),cards);
});
test('마지막 사람 진영 자동 승리는 대체AI도 포함하며 단순 오프라인은 기권이 아님',()=>{
 const r=game(['king','citizen','rebel']);r.players[2].online=false;checkHumanDeparture(r);assert.equal(r.status,'playing');
 act(r,r.players[0].id,{type:'personalSurrender'});assert.equal(r.status,'playing');act(r,r.players[2].id,{type:'personalSurrender'});
 assert.equal(r.game.winner.side,'royal');assert.ok(r.game.winner.players.includes(r.players[0].id));assert.deepEqual(r.game.winner.humanWinners,[r.players[1].id]);
});
test('처음부터 사람 한 진영이면 자동 승리하지 않고 마지막 개인 기권은 승자 없이 종료',()=>{
 const r=game(['king','citizen','rebel']);r.players[1].bot=true;r.players[2].bot=true;r.game.initialHumanGroups=['royal'];checkHumanDeparture(r);assert.equal(r.status,'playing');
 act(r,r.players[0].id,{type:'personalSurrender'});assert.equal(r.game.winner.side,'abandoned');assert.deepEqual(r.game.winner.players,[]);
});
test('학습 시뮬레이션은 사람0명 종료의 예외',()=>{const r=game(['king','citizen','rebel']);r.game.simulation=true;r.players.forEach(p=>p.bot=true);checkHumanDeparture(r);assert.equal(r.status,'playing');});
test('가결 전에 미투표한 사람을 찬성 기권자로 잘못 정산하지 않음',()=>{const r=game(['king','citizen','citizen','rebel','neutral']),[king,a,b]=r.players;act(r,king.id,{type:'requestSurrender'});act(r,a.id,{type:'gameVote',vote:r.game.vote.id,accept:true});assert.equal(b.humanExitOutcome,'loss');});
test('마지막 사람 진영 기권은 부결·두 명 중립의 승리는 독립',()=>{
 const r=game(['king','citizen','rebel']);r.players[2].bot=true;r.game.initialHumanGroups=['royal'];act(r,r.players[0].id,{type:'requestSurrender'});act(r,r.players[1].id,{type:'gameVote',vote:r.game.vote.id,accept:true});assert.equal(r.status,'playing');assert.equal(r.game.vote,null);assert.ok(!r.players[0].personalSurrender);
 const n=game(['king','citizen','rebel','neutral','neutral']);assert.notEqual(victoryGroup(n.players[3]),victoryGroup(n.players[4]));
});
