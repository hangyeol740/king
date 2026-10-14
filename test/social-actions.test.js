import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,joinRoom,act} from '../lib/game.js';
import {socialActions,executeSocialAction} from '../lib/ai-social-actions.js';
import {chatAct,chatView} from '../lib/chat.js';
import {createCognitiveAgent} from '../lib/cognitive-agent.js';
test('AI 비밀방 개설·초대·코드 참가와 중복 요청 제한',()=>{
 const r=makeRoom('SOCIAL','a');joinRoom(r,'b');joinRoom(r,'c');r.players.forEach(p=>p.online=true);act(r,r.host,{type:'start'});
 const [a,b]=r.players,input={channel:'public'};
 executeSocialAction(r,a,input,socialActions(r,a,input).find(x=>x.type==='secretCreate'));
 executeSocialAction(r,a,input,socialActions(r,a,input).find(x=>x.type==='secretInvite'));
 const text=r.chat.public.at(-1).text;
 const join=socialActions(r,b,{channel:'public',text}).find(x=>x.type==='secretJoin');assert.ok(join);executeSocialAction(r,b,input,join);
 assert.equal(chatView(r,b).secret[0].joined,true);
 executeSocialAction(r,a,input,{type:'pairRequest'});assert.ok(!socialActions(r,a,input).some(x=>x.type==='pairRequest'));
});
test('독립 AI 판단에서 비밀방 개설 후보를 선택하면 실제 방이 생성됨',async()=>{
 const r=makeRoom('SOCIAL','a');joinRoom(r,'b');joinRoom(r,'c');act(r,r.host,{type:'start'});const bot=r.players[1];bot.bot=true;
 const agent=createCognitiveAgent({client:{enabled:true,diagnostics:()=>({}),ask:async(_s,c)=>({choice:c.legalActions[0]?.index??null,commitmentChoice:null,socialChoice:c.socialActions.find(a=>a.type==='secretCreate').index,communication:'silent',text:'',goal:'별도 협상',desiredBelief:'협상 여지',assessment:'근거 부족',evidenceIds:[],planStatus:'new',revisionReason:'',waitForReply:false})},changed:async()=>{},failed:e=>assert.fail(e)});
 await agent.deliberate(r,bot,{channel:'public'},false);
 assert.equal(chatView(r,bot).secret.filter(s=>s.owned).length,1);
 assert.equal(chatView(r,r.players[0]).secret[0].joined,false);
});
test('공격력 숫자는 초대가 아니며 단독 3자리 코드는 참가 후보로 인식',()=>{
 const r=makeRoom('SOCIAL','a');joinRoom(r,'b');act(r,r.host,{type:'start'});const [a,b]=r.players;
 chatAct(r,a,{type:'secretCreate',name:'room'});const password=chatView(r,a).secret[0].password;
 assert.ok(!socialActions(r,b,{channel:'public',text:`공격력 ${password}`}).some(x=>x.type==='secretJoin'));
 assert.ok(socialActions(r,b,{channel:'public',text:password}).some(x=>x.type==='secretJoin'));
});
