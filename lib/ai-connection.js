export function aiConnection(options={}){
 const apiKey=options.apiKey!==undefined?options.apiKey:process.env.OPENAI_API_KEY||process.env.BAZE_API_KEY;
 const baze=options.apiKey===undefined&&!process.env.OPENAI_API_KEY&&!!process.env.BAZE_API_KEY;
  const baseURL=options.baseURL||process.env.OPENAI_BASE_URL||(baze?'https://api.baze.co/v1/gateway':'https://api.openai.com/v1');
  const base=new URL(baseURL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error('Invalid AI base URL');
  const timeout=options.timeout??60000;if(!Number.isFinite(timeout)||timeout<=0)throw Error('Invalid AI timeout');
  return {apiKey,baseURL,model:options.model||process.env.OPENAI_CHAT_MODEL||'gpt-6-luna',base,timeout};
}
