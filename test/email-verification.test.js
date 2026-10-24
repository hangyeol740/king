import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailVerification} from '../lib/email-verification.js';
test('Resend 발송·6자리 번호·1회 사용·재발송 제한',async()=>{
 let sent,now=1000;
 const service=createEmailVerification({apiKey:'test',from:'test@example.com',clock:()=>now,fetcher:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent=JSON.parse(options.body);return {ok:true};}});
 await service.send('USER@example.com');assert.deepEqual(sent.to,['user@example.com']);
 const code=sent.text.match(/\d{6}/)[0];
 await assert.rejects(service.send('user@example.com'),/1분/);
 assert.throws(()=>service.consume('user@example.com','bad'),/올바르지/);
 assert.equal(service.consume('user@example.com',code),'user@example.com');
 assert.throws(()=>service.consume('user@example.com',code),/만료/);
 now+=61000;await service.send('user@example.com');now+=600001;assert.throws(()=>service.consume('user@example.com',sent.text.match(/\d{6}/)[0]),/만료/);
});
test('발송 미설정·실패는 가입 인증을 허용하지 않음',async()=>{
 const service=createEmailVerification({apiKey:'',from:''});await assert.rejects(service.send('a@b.com'),/설정/);
 const failed=createEmailVerification({apiKey:'test',from:'test@example.com',fetcher:async()=>({ok:false})});
 await assert.rejects(failed.send('a@b.com'),/실패/);assert.throws(()=>failed.consume('a@b.com','123456'));
});
