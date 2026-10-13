import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RuleError } from './game.js';
const scrypt = promisify(scryptCallback);
export function profile(a) {
  const total=(a.wins||0)+(a.losses||0)+(a.draws||0);
  return { id:a.id,name:a.name,points:a.points||0,wins:a.wins||0,losses:a.losses||0,draws:a.draws||0,games:total,winRate:total?(a.wins||0)/total:0 };
}
export async function register(accounts,name,password) {
  if(typeof name!=='string'||!/^[\p{L}\p{N}_-]{1,16}$/u.test(name)||name.startsWith('게스트'))throw new RuleError('아이디는 1~16자의 문자·숫자·_·-로 입력하세요. 게스트 이름은 사용할 수 없습니다.');
  if(typeof password!=='string'||!/^[A-Za-z0-9]{4,64}$/.test(password))throw new RuleError('비밀번호는 영어·숫자로만 4~64자 입력하세요.');
  if(accounts.some(a=>a.name.toLowerCase()===name.toLowerCase()))throw new RuleError('이미 사용 중인 아이디입니다.');
  const a={id:randomUUID(),name,salt:randomBytes(16).toString('hex'),points:0,wins:0,losses:0,draws:0,sessions:[],results:[]};
  a.hash=(await scrypt(password,a.salt,64)).toString('hex');
  // 비동기 암호 처리 중 동일 아이디 가입도 차단합니다.
  if(accounts.some(a=>a.name.toLowerCase()===name.toLowerCase()))throw new RuleError('이미 사용 중인 아이디입니다.');
  accounts.push(a);return a;
}
export async function login(accounts,name,password) {
  const a=accounts.find(a=>a.name.toLowerCase()===String(name).toLowerCase());
  if(!a||typeof password!=='string'||password.length>64)throw new RuleError('아이디 또는 비밀번호가 다릅니다.');
  const hash=await scrypt(password,a.salt,64);
  if(!timingSafeEqual(hash,Buffer.from(a.hash,'hex')))throw new RuleError('아이디 또는 비밀번호가 다릅니다.');
  return a;
}
export function newAccountSession(a){const token=randomBytes(32).toString('hex');a.sessions.push({token,expires:Date.now()+30*86400000});a.sessions=a.sessions.slice(-10);return token;}
export function accountFromToken(accounts,token){return typeof token==='string'?accounts.find(a=>a.sessions.some(s=>s.token===token&&s.expires>Date.now())):null;}
export function changePoints(a,delta){a.points=Math.max(0,(a.points||0)+delta);}
export function settleAccount(a,key,role,outcome,penalty=0){
  if(a.results.includes(key))return false;
  const delta=outcome==='surrender'?-120:outcome==='draw'?30:outcome==='win'?(role==='king'?140:role==='neutral'?115:100):(role==='king'?-110:-80);
  changePoints(a,delta-penalty);a[outcome==='win'?'wins':outcome==='draw'?'draws':'losses']++;
  a.results.push(key);return true;
}
