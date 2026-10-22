import test from 'node:test';import assert from 'node:assert/strict';
import {identifyRebelSpeaker,consultationAllows} from '../lib/ally-consultation.js';
test('반란군2명은 유일한 동료 추론·여럿은 자기소개 주장·충돌은 보류',()=>{
 const s={me:{id:'a'},players:[{id:'a',role:'rebel',name:'나'},{id:'b',role:'rebel',name:'동료'}]};
 assert.equal(identifyRebelSpeaker(s,[],{text:'좋아'}).id,'b');s.players.push({id:'c',role:'rebel',name:'다른동료'});
 assert.equal(identifyRebelSpeaker(s,[],{text:'좋아'}).id,null);assert.equal(identifyRebelSpeaker(s,[],{text:'나는 동료야'}).certainty,'self-identification-claim');
 assert.equal(identifyRebelSpeaker(s,[{text:'동료 사칭이야',self:false}],{text:'나는 동료야'}).id,null);
});
test('동료 거절은 긴급 근거 없으면 실행 불가',()=>{
 const s={me:{id:'a'},players:[{id:'a',role:'rebel',name:'나'},{id:'b',role:'rebel',name:'동료'}]},mind={inbox:{'rebel/':{messages:[{id:'m',self:false,text:'하지 마'}]}}};
 assert.equal(consultationAllows(mind,s,{target:'b'},{consultationIds:['m']}),false);assert.equal(consultationAllows(mind,s,{target:'b'},{consultationIds:['m'],urgent:true,urgencyReason:'이번 기회가 지나면 확정 패배'}),true);
});
