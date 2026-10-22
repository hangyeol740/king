import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card} from '../lib/game.js';
import {aiObservation} from '../lib/ai-observation.js';import {constructAction,validateConstructedAction} from '../lib/action-construction.js';import {createPolicy} from '../lib/ai-policy.js';
test('6난이도의 구성 경로가 합법 제출을 생성하고 쉬움은 전카드 제한을 유지',()=>{
 for(const difficulty of ['veryEasy','easy','normal','hard','frenzy','chaos']){
 const r=makeRoom('D','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const p=r.players[1];r.players.forEach((p,i)=>{p.role=['king','citizen','rebel'][i];p.job=null;});p.bot=true;p.difficulty=difficulty;p.hand=[card('officer'),card('infantry'),card('resource')];r.game.king=r.host;r.game.phase='mediationSupport';r.game.pending={done:[],supporters:[],total:0,revoltType:'rebel'};
 const built=constructAction(createPolicy(),aiObservation(r,p),{choose:()=>0});assert.equal(validateConstructedAction(r,p.id,built.action),true);if(['veryEasy','easy'].includes(difficulty))assert.equal(built.action.cards.length,2);
 }
});
test('매우쉬움 낮 뺏기는 직접 구성 종류에도 없으며 어려움의 직업 관찰은 PPO입력에 전달',()=>{
 const r=makeRoom('D','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const p=r.players[1];p.bot=true;p.difficulty='veryEasy';r.game.phase='day';r.game.round=3;r.game.order=r.players.map(p=>p.id);r.game.turn=1;
 const seen=[];constructAction(createPolicy(),aiObservation(r,p),{choose:(label,options)=>{if(label==='type')seen.push(...options.map(a=>a.type));return 0;}});assert.ok(!seen.includes('steal'));
 r.players[2].job='hunter';p.difficulty='hard';assert.equal(aiObservation(r,p).players.find(q=>q.id===r.players[2].id).job,'hunter');p.difficulty='normal';assert.equal(aiObservation(r,p).players.find(q=>q.id===r.players[2].id).job,null);
});
