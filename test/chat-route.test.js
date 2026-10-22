import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('게임 채팅은 단일 결정 경로로 전달하며 계획 발언을 강제로 지우지 않음',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');const agent=await readFile(new URL('../lib/cognitive-agent.js',import.meta.url),'utf8');
 assert.match(server,/if\(room.status==='playing'\)void agent.respond/);assert.ok(!server.includes('planningOnly:true'));assert.ok(!agent.includes('if(input.planningOnly)out='));
});
