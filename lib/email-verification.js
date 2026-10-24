import {randomInt,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {RuleError} from './game.js';

export function createEmailVerification({apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM,fetcher=fetch,clock=Date.now}={}){
 const challenges=new Map();
 const normalize=email=>{if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new RuleError('올바른 이메일 주소를 입력하세요.');return email.trim().toLowerCase();};
 const digest=(salt,code)=>createHash('sha256').update(salt+code).digest();
 return {
  async send(email){
   email=normalize(email);
   if(!apiKey||!from)throw new RuleError('이메일 인증 발송 설정이 준비되지 않았습니다.');
   const old=challenges.get(email);
   if(old&&clock()-old.sent<60000)throw new RuleError('인증번호는 1분 후 다시 요청하세요.');
   for(const [key,value] of challenges)if(value.expires<clock())challenges.delete(key);
   if(challenges.size>=10000)throw new RuleError('잠시 후 다시 시도하세요.');
   const code=String(randomInt(1000000)).padStart(6,'0'),salt=randomBytes(16).toString('hex');
   const entry={sent:clock(),expires:clock()+10*60000,attempts:0,salt,hash:digest(salt,code)};
   challenges.set(email,entry);
   try{
    const r=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],subject:'Coup 이메일 인증번호',text:`인증번호: ${code}\n10분 이내에 입력해 주세요.`}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('send_failed');
   }catch{if(challenges.get(email)===entry)challenges.delete(email);throw new RuleError('인증번호 발송에 실패했습니다. 잠시 후 다시 시도하세요.');}
  },
  consume(email,code){
   email=normalize(email);const entry=challenges.get(email);
   if(!entry||entry.expires<clock()||entry.attempts>=5)throw new RuleError('인증번호가 만료되었습니다. 다시 요청하세요.');
   entry.attempts++;
   if(typeof code!=='string'||!/^\d{6}$/.test(code)||!timingSafeEqual(entry.hash,digest(entry.salt,code)))throw new RuleError('인증번호가 올바르지 않습니다.');
   challenges.delete(email);return email;
  }
 };
}
