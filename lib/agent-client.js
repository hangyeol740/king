// Shared by the live agent and its training environment. Never log request bodies/keys.
export function createAgentClient({apiKey=process.env.OPENAI_API_KEY||process.env.BAZE_API_KEY,baseURL=process.env.OPENAI_BASE_URL||(process.env.BAZE_API_KEY?'https://api.baze.co/v1/gateway':'https://api.openai.com/v1'),model=process.env.OPENAI_CHAT_MODEL||'gpt-6-luna',fetcher=fetch,timeout=25000}={}){
 const base=new URL(baseURL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error('Invalid AI base URL');
 const stats={attempts:0,successes:0,failures:0,lastError:null};
 return {enabled:!!apiKey,diagnostics:()=>({configured:!!apiKey,provider:base.hostname==='api.baze.co'?'baze':base.hostname==='api.openai.com'?'openai':'compatible',model,...stats}),async ask(system,context,schema=null){
  if(!apiKey)throw Error('api_key_missing');stats.attempts++;
  try{
   const response=await fetcher(`${baseURL.replace(/\/+$/,'')}/chat/completions${base.hostname==='api.baze.co'?'/':''}`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(timeout),body:JSON.stringify({model,...(/^gpt-(5|6)/.test(model)?{max_completion_tokens:4096,reasoning_effort:'low'}:{max_tokens:1000,temperature:.7}),response_format:schema?{type:'json_schema',json_schema:{name:'game_agent_decision',strict:true,schema}}:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(context)}]})});
   if(!response.ok)throw Error(`http_${response.status}`);
   const payload=await response.json(),out=JSON.parse(payload.choices?.[0]?.message?.content||'null');
   if(!out||typeof out!=='object'||Array.isArray(out))throw Error('invalid_response');stats.successes++;stats.lastError=null;return out;
  }catch(error){stats.failures++;stats.lastError=/^http_\d+$/.test(error.message)?error.message:['TimeoutError','AbortError'].includes(error.name)?'timeout':error instanceof SyntaxError?'invalid_response':'api_error';throw Error(stats.lastError);}
 }};
}
