import test from 'node:test';import assert from 'node:assert/strict';import {validateSchema} from '../lib/decision-schema.js';
test('strict를 무시하는 공급자도 로컬 필드·타입·범위·추가속성 검사를 통과해야 함',()=>{
 const schema={type:'object',properties:{choice:{type:['integer','null'],enum:[null,0,1]},values:{type:'array',maxItems:2,items:{type:'integer',minimum:0}}},required:['choice','values'],additionalProperties:false};
 assert.deepEqual(validateSchema({choice:null,values:[0,1]},schema),{choice:null,values:[0,1]});
 for(const v of [{choice:3,values:[]},{choice:0},{choice:0,values:[-1]},{choice:0,values:[1,2,3]},{choice:0,values:[],extra:true}])assert.throws(()=>validateSchema(v,schema),/schema:/);
});
