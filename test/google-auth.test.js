import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGoogleCredential,googleAccount} from '../lib/google-auth.js';
const valid={aud:'client',iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3600,sub:'google-user',email_verified:'true',name:'한글이름'};
test('Google 인증은 audience·발급자·만료·이메일 인증을 검증',async()=>{
 const fetcher=value=>async()=>({ok:true,json:async()=>value});
 assert.equal((await verifyGoogleCredential('token','client',fetcher(valid))).sub,valid.sub);
 for(const bad of [{aud:'other'},{iss:'evil'},{exp:1},{email_verified:'false'}])await assert.rejects(verifyGoogleCredential('token','client',fetcher({...valid,...bad})));
 await assert.rejects(verifyGoogleCredential('token',''));
});
test('Google sub로 계정 재사용, 기존 이름이나 이메일 계정과 자동 연결하지 않음',()=>{
 const accounts=[{id:'password',name:'한글이름'}];
 const a=googleAccount(accounts,valid);assert.notEqual(a.id,'password');assert.equal(a.name,'한글이름');
 assert.equal(googleAccount(accounts,valid),a);assert.equal(accounts.length,2);
});
