import {randomUUID} from 'node:crypto';
import {RuleError} from './game.js';

export async function verifyGoogleCredential(credential,clientId,fetcher=fetch){
  if(!clientId)throw new RuleError('서버에 Google 클라이언트 ID가 설정되지 않았습니다.');
  if(typeof credential!=='string'||credential.length>12000)throw new RuleError('Google 인증 정보가 올바르지 않습니다.');
  const response=await fetcher('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new RuleError('Google 인증에 실패했습니다. 다시 로그인하세요.');
  const identity=await response.json();
  if(identity.aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(identity.iss)||Number(identity.exp)<=Date.now()/1000||!identity.sub||!['true',true].includes(identity.email_verified))throw new RuleError('Google 인증 정보가 유효하지 않습니다.');
  return identity;
}
export function googleAccount(accounts,identity){
  // Never link an existing password account solely by email/name.
  let account=accounts.find(a=>a.googleSub===identity.sub);
  if(account)return account;
  const id=randomUUID();
  account={id,googleSub:identity.sub,loginId:'google_'+id,name:String(identity.name||'구글사용자').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,16)||'구글사용자',points:0,wins:0,losses:0,draws:0,sessions:[],results:[]};
  accounts.push(account);return account;
}
