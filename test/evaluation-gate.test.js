import test from 'node:test';
import assert from 'node:assert/strict';
import {EVALUATED_ROLES,promotionGate,selectPassingCandidate} from '../ai/evaluation-gate.js';
const rows=(games,wins)=>Object.fromEntries(EVALUATED_ROLES.map(role=>[role,{games,wins}]));
test('500판 미만을 합격으로 간주하지 않고 역할별5%와3%p 하락 검사',()=>{assert.equal(promotionGate(rows(499,400),rows(500,200)).passed,false);assert.equal(promotionGate(rows(500,24),rows(500,25)).passed,false);assert.equal(promotionGate(rows(500,184),rows(500,200)).passed,false);assert.equal(promotionGate(rows(500,185),rows(500,200)).passed,true);});
test('평균1위 미달시 통과2위를 선택하고 아무도 없으면 교체 보류',()=>{const baseline=rows(500,200),bad=rows(500,350);bad.citizen={games:500,wins:20};assert.equal(selectPassingCandidate([{id:'bad',score:.9,roles:bad},{id:'good',score:.5,roles:baseline}],baseline).id,'good');assert.equal(selectPassingCandidate([{id:'bad',score:.9,roles:bad}],baseline),null);});
