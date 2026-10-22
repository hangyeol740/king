// Supabase는 서버에서만 접근합니다. service-role 키를 클라이언트에 보내지 않습니다.
export function createSupabaseStore({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,fetcher=fetch}={}){
 if(!url&&!key)return null;
 if(!url||!key)throw Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 함께 설정하세요.');
 const endpoint=`${url.replace(/\/$/,'')}/rest/v1/kingdom_state`;
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 return {
  async load(){const r=await fetcher(`${endpoint}?id=eq.main&select=data`,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Supabase load ${r.status}`);const rows=await r.json();return rows[0]?.data||null;},
   async save(data){const r=await fetcher(endpoint,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates'},signal:AbortSignal.timeout(15000),body:JSON.stringify({id:'main',data,updated_at:new Date().toISOString()})});if(!r.ok)throw Error(`Supabase save ${r.status}`);}
    ,async archiveExperience(event){const r=await fetcher(endpoint,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates'},signal:AbortSignal.timeout(15000),body:JSON.stringify({id:`experience-v${event.version}:${event.id}`,data:event,updated_at:new Date().toISOString()})});if(!r.ok)throw Error(`Supabase archive ${r.status}`);}
    ,async loadExperiences(offset=0,limit=500){const r=await fetcher(`${endpoint}?id=like.experience-v2:*&select=data&order=id.asc&offset=${offset}&limit=${limit}`,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Supabase experience load ${r.status}`);return (await r.json()).map(row=>row.data);}
 };
}
