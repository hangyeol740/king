import test from 'node:test';
import assert from 'node:assert/strict';
import {register,login,renameAccount,profile} from '../lib/accounts.js';
test('아이디와 닉네임을 분리하고 닉네임 변경 뒤에도 원래 아이디로 로그인',async()=>{
 const accounts=[],a=await register(accounts,'login123','abc12345','게임별명');
 assert.equal(profile(a).loginId,'login123');assert.equal(profile(a).name,'게임별명');
 renameAccount(a,'새별명');assert.equal(await login(accounts,'login123','abc12345'),a);await assert.rejects(login(accounts,'새별명','abc12345'));
 const saved=JSON.parse(JSON.stringify(accounts));assert.equal((await login(saved,'login123','abc12345')).name,'새별명');
 await register(accounts,'other123','abc12345','새별명');assert.equal(accounts.length,2);
});
