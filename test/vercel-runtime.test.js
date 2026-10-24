import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {createSharedRuntime} from '../lib/shared-runtime.js';
import {candidates} from '../lib/ai-policy.js';
import {baseline} from '../ai/environment.js';

function redisMock(){
 const data=new Map();
 return {data,fetcher:async(_url,init)=>{
   const [op,...args]=JSON.parse(init.body);let result;
   if(op==='GET')result=data.get(args[0])??null;
   else if(op==='SET'){if(args.includes('NX')&&data.has(args[0]))result=null;else{data.set(args[0],args[1]);result='OK';}}
   else if(op==='EVAL'){
     const [script,count,...rest]=args,keys=rest.slice(0,count),values=rest.slice(count);
     if(data.get(keys[0])!==values[0])result=0;
     else if(script.includes("redis.call('set'")){data.set(keys[1],values[1]);result=1;}
     else if(script.includes("redis.call('del'")){data.delete(keys[0]);result=1;}else result=1;
   }else throw Error(`Unexpected Redis operation ${op}`);
   return {ok:true,json:async()=>({result})};
 }};
}
test('다른 인스턴스의 동시 변경은 순차 저장되고 잠금 만료 소유자는 덮어쓰지 못함',async()=>{
 const mock=redisMock();let a={count:0},b={count:0};
 const options={url:'https://redis.example',token:'test',fetcher:mock.fetcher,prefix:'test'};
 const first=createSharedRuntime({...options,restore:s=>a=s,snapshot:()=>a});
 const second=createSharedRuntime({...options,restore:s=>b=s,snapshot:()=>b});
 await Promise.all([first.run(async()=>{a.count++;await first.save();}),second.run(async()=>{b.count++;await second.save();})]);
 assert.equal(JSON.parse(mock.data.get('test:state')).count,2);
 await assert.rejects(first.run(async()=>{a.count=99;mock.data.set('test:lock','new-owner');await first.save();}),/잠금이 만료/);
 assert.equal(JSON.parse(mock.data.get('test:state')).count,2);assert.equal(mock.data.get('test:lock'),'new-owner');
});

test('Vercel 모드의 별도 두 서버에서 같은 방 참가·채팅 동기화·재접속 복구', {timeout:20000},async()=>{
 const keys=['VERCEL','VERCEL_ENV','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 const mock=redisMock(),modules=[],clients=[];
 Object.assign(process.env,{VERCEL:'1',VERCEL_ENV:'test',UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'test'});
 globalThis.fetch=(url,init)=>String(url).startsWith('https://redis.example')?mock.fetcher(url,init):originalFetch(url,init);
 async function start(id){const mod=await import(`../server.js?vercel-test=${id}`);modules.push(mod);assert.equal(mod.default.listening,false);mod.default.listen(0,'127.0.0.1');await once(mod.default,'listening');return `http://127.0.0.1:${mod.default.address().port}`;}
 async function connect(url){const client=io(url,{transports:['websocket'],reconnection:false});clients.push(client);client.on('state',s=>client.state=s);await once(client,'connect');return client;}
 const send=(c,a)=>c.timeout(8000).emitWithAck('command',a);
 async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,50));}assert.fail('인스턴스 상태 동기화 시간 초과');}
 try{
    const first=await start('a'),second=await start('b'),a=await connect(first),b=await connect(second);
    const transport=await fetch(first+'/api/transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:{type:'create',name:'HTTP테스트'}})});const httpResult=await transport.json();assert.equal(httpResult.reply.ok,true);
    await fetch(first+'/api/transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:httpResult.client,command:{type:'leave'}})});
   const made=await send(a,{type:'create',name:'버셀방장'});assert.equal(made.ok,true);
   assert.equal((await send(b,{type:'join',code:made.session.code,name:'다른인스턴스'})).ok,true);
   await until(()=>a.state?.players.length===2);
   assert.equal((await send(b,{type:'chatSend',channel:'public',text:'다른 서버에서도 같은 방'})).ok,true);
   await until(()=>a.state?.chat.public.length===1);
   a.disconnect();await new Promise(r=>setTimeout(r,150));
   const restored=await connect(second);assert.equal((await send(restored,{type:'resume',...made.session})).ok,true);
   assert.equal(restored.state.me.id,a.state.me.id);assert.equal(restored.state.chat.public[0].text,'다른 서버에서도 같은 방');
   const reloaded=await start('cold'),c=await connect(reloaded);
   const replaced=once(restored,'replaced');assert.equal((await send(c,{type:'resume',...made.session})).ok,true);await replaced;
   assert.equal(c.state.players.length,2);
   assert.equal((await send(c,{type:'addBot'})).ok,true);
   assert.equal((await send(c,{type:'start'})).ok,true);
   let botActed=false;
   for(let i=0;i<100;i++){
     for(const human of [b,c]){
       const choices=human.state?.status==='playing'?candidates(human.state).filter(a=>!['requestDraw','requestSurrender'].includes(a.type)):[];
       if(choices.length)await send(human,baseline(human.state,choices));
     }
     const saved=JSON.parse(mock.data.get('kingdom:test:state'));
     if(saved.rooms[0].players.some(p=>p.bot&&p.actionAudit?.some(a=>a.kind==='executed'))){botActed=true;break;}
     await new Promise(r=>setTimeout(r,50));
   }
   assert.equal(botActed,true,'공유 잠금 안에서도 PPO 봇이 실제 행동을 실행해야 함');
 }finally{
   clients.forEach(c=>c.disconnect());await new Promise(r=>setTimeout(r,150));
   for(const mod of modules)await mod.closeRuntime();
   globalThis.fetch=originalFetch;
   for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
