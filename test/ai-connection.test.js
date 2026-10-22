import test from 'node:test';import assert from 'node:assert/strict';
import {aiConnection} from '../lib/ai-connection.js';
import {createAgentClient} from '../lib/agent-client.js';
test('공통 AI 설정의 기본 제한60초·명시 공급자·키 비공개',()=>{
 const c=aiConnection({apiKey:'hidden-test-key',baseURL:'https://api.baze.co/v1/gateway',model:'example'});assert.equal(c.timeout,60000);
 const client=createAgentClient({apiKey:'hidden-test-key',baseURL:c.baseURL,model:c.model});assert.equal(client.diagnostics().provider,'baze');assert.ok(!JSON.stringify(client.diagnostics()).includes('hidden-test-key'));
 assert.throws(()=>aiConnection({baseURL:'http://unsafe.test'}));
});
