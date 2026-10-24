import {randomUUID} from 'node:crypto';

// All instances serialize game mutations against the same Redis snapshot.
// The ownership check and write are atomic: an expired owner cannot overwrite a new one.
const SAVE="if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[2],ARGV[2]); return 1 else return 0 end";
const RELEASE="if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";
const RENEW="if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end";
export function createSharedRuntime({url,token,prefix='kingdom:production',fetcher=fetch,restore,snapshot,leaseMs=30000,waitMs=12000}={}) {
  if(!url||!token)throw Error('Vercel 배포에는 UPSTASH_REDIS_REST_URL과 UPSTASH_REDIS_REST_TOKEN이 필요합니다.');
  const endpoint=new URL(url);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error('Redis REST URL은 HTTPS 주소여야 합니다.');
  const lock=`${prefix}:lock`,state=`${prefix}:state`;
  let queue=Promise.resolve(),owner=null;
  async function command(args) {
    const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error(`공유 게임 저장소 연결 실패 (${response.status})`);
    const payload=await response.json();if(payload.error)throw Error('공유 게임 저장소 명령 실패');return payload.result;
  }
  const serial=work=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
  async function load(){const saved=await command(['GET',state]);if(saved)restore(JSON.parse(saved));}
  return {
    run(work){return serial(async()=>{
      const id=randomUUID(),deadline=Date.now()+waitMs;
      while(await command(['SET',lock,id,'NX','PX',leaseMs])!=='OK'){
        if(Date.now()>=deadline)throw Error('다른 게임 요청을 처리 중입니다. 잠시 후 다시 시도하세요.');
        await new Promise(resolve=>setTimeout(resolve,50+Math.random()*100));
      }
      owner=id;let renewing=Promise.resolve();
      const timer=setInterval(()=>{renewing=renewing.then(()=>command(['EVAL',RENEW,1,lock,id,leaseMs])).catch(()=>0);},Math.floor(leaseMs/3));timer.unref?.();
      try{await load();return await work();}
      finally{clearInterval(timer);await renewing;owner=null;await command(['EVAL',RELEASE,1,lock,id]);}
    });},
    read(work){return serial(async()=>{await load();return work();});},
    async save(){
      if(!owner)throw Error('공유 게임 상태는 잠금 안에서만 저장할 수 있습니다.');
      const saved=await command(['EVAL',SAVE,2,lock,state,owner,JSON.stringify(snapshot())]);
      if(saved!==1)throw Error('게임 저장 잠금이 만료되었습니다. 재연결 후 다시 시도하세요.');
    }
  };
}
