import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,commitDecision} from '../lib/agent-mind.js';

test('전략 대화의 수락 발언은 같은 합법 행동 계획으로 묶임',()=>{
 const room=makeRoom('ALIGN','human');joinRoom(room,'bot');joinRoom(room,'other');act(room,room.host,{type:'start'});
 const bot=room.players[1];bot.bot=true;const snapshot=view(room,bot.id),actions=candidates(snapshot);
 const prepared=prepareDecision({bot,epoch:room.game.startedAt,snapshot,actions,history:[],input:{channel:'public',text:'원정 같이 갈래?',strategic:true},random:()=>.1});
 const choice=actions.findIndex(a=>a.type==='expedition');
 if(choice>=0){const plan=commitDecision(prepared,{choice,commitmentChoice:choice,socialChoice:null,communication:'accept',text:'이번 원정에는 참여하겠습니다.',goal:'자기 진영 목표',desiredBelief:'참여 의사',assessment:'공개 정보만 확인',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false});assert.deepEqual(plan.action,plan.commitment);}
});
test('행동 약속과 다른 계획은 bluff가 아니면 거부',()=>{
 const room=makeRoom('ALIGN','human');joinRoom(room,'bot');joinRoom(room,'other');act(room,room.host,{type:'start'});
 const bot=room.players[1];bot.bot=true;const snapshot=view(room,bot.id),actions=candidates(snapshot);
 const prepared=prepareDecision({bot,epoch:room.game.startedAt,snapshot,actions,history:[],input:{channel:'public',strategic:true},random:()=>.1});
 if(actions.length>1)assert.throws(()=>commitDecision(prepared,{choice:0,commitmentChoice:1,socialChoice:null,communication:'accept',text:'지원할게요.',goal:'자기 진영 목표',desiredBelief:'지원',assessment:'근거 부족',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false}),/broken_promise/);
});
