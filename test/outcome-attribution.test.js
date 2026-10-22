import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';import {assets,recordAssetChanges} from '../ai/reward-ledger.js';
test('마지막 제출자가 달라도 먼저 제출한 AI의 해당 전투 선택에 자산 결과 귀속',()=>{
 const r=makeRoom('CREDIT','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const [a,b]=r.players;r.game.order=r.players.map(p=>p.id);r.game.phase='day';r.game.round=1;r.game.turn=0;r.game.day=3;a.hand=[card('weapon')];b.hand=[card('resource')];
 act(r,a.id,{type:'battle',target:b.id});act(r,b.id,{type:'battleAnswer',accept:true});const eventId=r.game.pending.eventId;act(r,a.id,{type:'battleSubmit',cards:a.hand.map(c=>c.id)});
 const row={day:3,eventId,decisionId:'decision',action:{type:'battleSubmit'},rewardItems:[]},old={day:2,eventId:'old',action:{type:'battleSubmit'},rewardItems:[]},trajectories=new Map(r.players.map(p=>[p.id,p===a?[old,row]:[]]));
 const before=assets(r);act(r,b.id,{type:'battleSubmit',cards:[]});recordAssetChanges(before,r,b.id,{type:'battleSubmit',cards:[]},trajectories,eventId);
 assert.ok(row.rewardItems.some(x=>x.kind==='asset-gain'));assert.equal(old.rewardItems.length,0);assert.equal(r.game.resultEvents.at(-1).eventId,eventId);
});
