import test from 'node:test';import assert from 'node:assert/strict';
import {statisticalGate,interval} from '../ai/statistical-gate.js';
test('조합 표본 누락·불확실성은 합격이 아니며 최대 표본에서 보류',()=>{
 assert.equal(statisticalGate({}, {},['hunter/aggressive']).state,'more');
 const rows={'hunter/aggressive':{games:5000,wins:2500}};
 assert.equal(statisticalGate(rows,rows,Object.keys(rows)).state,'hold');
});
test('명백한 역할·상대 성능 하락은 탈락하며 조합 수 증가로 구간이 넓어짐',()=>{
 const k='king/random';assert.equal(statisticalGate({[k]:{games:5000,wins:100}}, {[k]:{games:5000,wins:4000}},[k]).state,'fail');
 assert.ok(interval({games:500,wins:250},{cells:80})[0]<interval({games:500,wins:250},{cells:1})[0]);
});
