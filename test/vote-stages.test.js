import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,voteGame} from '../lib/game.js';
function setup(){const r=makeRoom('VOTES','A');for(let i=0;i<4;i++)joinRoom(r,`P${i}`);act(r,r.host,{type:'start'});r.players.forEach((p,i)=>{p.role=['king','citizen','rebel','rebel','neutral'][i];p.job=null;});r.game.king=r.players[0].id;return r;}
test('무승부는 3일차·내부 과반수·다른 세력 과반수·1회 제한',()=>{
 const r=setup(),[a,b,c,d,e]=r.players;
 assert.throws(()=>voteGame(r,a.id,{type:'requestDraw'}),/3일/);
 r.game.day=3;voteGame(r,b.id,{type:'requestDraw'});assert.equal(r.game.vote.stage,'internal');
 const id=r.game.vote.id;voteGame(r,a.id,{type:'gameVote',vote:id,accept:true});assert.equal(r.game.vote.stage,'external');
 assert.deepEqual(r.game.vote.eligible,[c.id,d.id,e.id]);
 voteGame(r,c.id,{type:'gameVote',vote:id,accept:true});assert.equal(r.status,'playing');
 voteGame(r,d.id,{type:'gameVote',vote:id,accept:true});assert.equal(r.game.winner.side,'draw');
});
test('혼자 무승부 요청은 내부투표 생략·부결되어도 재요청 불가',()=>{
 const r=setup(),p=r.players[4];r.game.day=3;voteGame(r,p.id,{type:'requestDraw'});
 assert.equal(r.game.vote.stage,'external');const id=r.game.vote.id;
 for(const q of r.players.slice(0,2))voteGame(r,q.id,{type:'gameVote',vote:id,accept:false});
 assert.equal(r.game.vote,null);assert.throws(()=>voteGame(r,p.id,{type:'requestDraw'}),/한 번/);
});
test('기권 2일차 시작·3일 간격, 중립 기권은 게임 계속',()=>{
 const r=setup(),[a,b,,,n]=r.players;
 assert.throws(()=>voteGame(r,a.id,{type:'requestSurrender'}),/2일/);
 r.game.day=2;voteGame(r,a.id,{type:'requestSurrender'});voteGame(r,b.id,{type:'gameVote',vote:r.game.vote.id,accept:false});
 assert.throws(()=>voteGame(r,a.id,{type:'requestSurrender'}),/3일/);
 voteGame(r,n.id,{type:'requestSurrender'});assert.equal(n.surrendered,true);assert.equal(r.status,'playing');
 r.game.day=5;voteGame(r,a.id,{type:'requestSurrender'});voteGame(r,b.id,{type:'gameVote',vote:r.game.vote.id,accept:true});
 assert.equal(r.game.winner.side,'rebel');
});
