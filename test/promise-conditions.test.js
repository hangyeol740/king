import test from 'node:test';import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act,card,view} from '../lib/game.js';
import {candidates} from '../lib/ai-policy.js';
import {prepareDecision,commitDecision,plannedAction,recordExecution} from '../lib/agent-mind.js';
function scenario(mode){const r=makeRoom('P','왕');joinRoom(r,'시민');joinRoom(r,'반란');act(r,r.host,{type:'start'});const p=r.players[1];r.players.forEach((p,i)=>{p.role=['king','citizen','rebel'][i];p.job=null;p.notes=[];});r.game.king=r.host;r.game.day=2;r.game.phase='mediationSupport';r.game.pending={done:[],supporters:[],total:0,revoltType:'rebel'};p.hand=[card('officer'),card('infantry')];const s=view(r,p.id),prepared=prepareDecision({bot:p,epoch:r.game.startedAt,snapshot:s,actions:candidates(s),history:[],random:()=>0});commitDecision(prepared,{choice:null,commitmentChoice:null,futureCommitment:'contribute',communication:'accept',text:'지원할게',goal:'왕국 방어',desiredBelief:'지원 의사',assessment:'상황 확인',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false,promiseConditions:{points:7,pointMode:mode,phase:'mediationSupport'}});return {r,p,s,mind:prepared.mind};}
test('정확7점은9점 제출을 이행으로 세지 않고 최소7점은 허용',()=>{
 for(const mode of ['exact','minimum']){const {r,p,s,mind}=scenario(mode);plannedAction(mind,s,candidates(s));recordExecution(mind,{type:'contribute',cards:p.hand.map(c=>c.id)});assert.equal(mind.promises[0].status,mode==='exact'?'pending':'fulfilled');}
});
test('지원 기회가 끝나면 다음 원정에 의사를 잘못 적용하지 않음',()=>{const {r,p,s,mind}=scenario('minimum');plannedAction(mind,s,candidates(s));r.game.phase='redistribute';r.game.pending={done:[]};const next=view(r,p.id);plannedAction(mind,next,candidates(next));assert.equal(mind.promises[0].status,'missed');});
