import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,commitDecision,plannedAction} from '../lib/agent-mind.js';
test('아직 원정 단계가 아니어도 참가 약속을 기록하고 해당 단계에서 우선 이행',()=>{
 const room=makeRoom('PROMISE','a');joinRoom(room,'bot');joinRoom(room,'c');act(room,room.host,{type:'start'});const bot=room.players.find(p=>p.role!=='king');bot.bot=true;
 const s=view(room,bot.id),prepared=prepareDecision({bot,epoch:room.game.startedAt,snapshot:s,actions:candidates(s),history:[],input:{channel:'public',strategic:true},random:()=>.1});
 const choice=prepared.actions[0];const plan=commitDecision(prepared,{choice:null,commitmentChoice:null,futureCommitment:'joinExpedition',socialChoice:null,communication:'accept',text:'원정에는 참가하겠습니다.',goal:'자기 진영 목표',desiredBelief:'참가 의사',assessment:'공개 정보 확인',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false},1);
 room.game.phase='expeditionJoin';room.game.pending={done:[room.game.king],participants:[room.game.king]};
 const next=view(room,bot.id),action=plannedAction(prepared.mind,next,candidates(next),2);assert.equal(action,null);assert.deepEqual(prepared.mind.promises[0].preferred,{type:'joinExpedition',join:true});assert.equal(prepared.mind.promises[0].status,'pending');
});
test('미래 약속은 시간으로 만료되지 않고 행동 기회가 지나면 만료',()=>{
 const room=makeRoom('PROMISE','a');joinRoom(room,'bot');joinRoom(room,'c');act(room,room.host,{type:'start'});const bot=room.players.find(p=>p.role!=='king');bot.bot=true;
 const s=view(room,bot.id),prepared=prepareDecision({bot,epoch:room.game.startedAt,snapshot:s,actions:candidates(s),history:[],input:{channel:'public',strategic:true},random:()=>.1});
 const plan=commitDecision(prepared,{choice:null,commitmentChoice:null,futureCommitment:'joinExpedition',socialChoice:null,communication:'accept',text:'원정에 참가하겠습니다.',goal:'자기 진영 목표',desiredBelief:'참가 의사',assessment:'공개 정보 확인',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false},1);
  room.game.phase='day';room.game.round=1;const delayed=view(room,bot.id);assert.equal(plannedAction(prepared.mind,delayed,candidates(delayed),999999),null);assert.equal(plan.status,'expired');assert.equal(prepared.mind.promises[0].status,'pending');
 room.game.phase='night';room.game.pending={done:[]};const missed=view(room,bot.id);plannedAction(prepared.mind,missed,candidates(missed),1000000);assert.equal(prepared.mind.promises[0].status,'pending');
});
