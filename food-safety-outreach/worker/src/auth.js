import { now } from './store.js';

const encoder=new TextEncoder();
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const decodeHex=text=>Uint8Array.from(text.match(/.{2}/g)||[],part=>parseInt(part,16));
async function sha(text){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));}
function cookieToken(request){return /(?:^|;\s*)gazelle_session=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1]||'';}
export async function csrfToken(request,env){
  const token=cookieToken(request);
  if(!token||!env.GAZELLE_SESSION_SECRET)return '';
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.GAZELLE_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(token))));
}
export async function validCsrf(request,env,value){
  const expected=await csrfToken(request,env),actual=String(value||'');
  if(expected.length!==64||actual.length!==64)return false;
  let mismatch=0;for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^actual.charCodeAt(i);
  return mismatch===0;
}
async function checkPassword(password,env){
  if(!env.GAZELLE_PASSWORD_SALT||!env.GAZELLE_PASSWORD_HASH)return false;
  const salt=decodeHex(env.GAZELLE_PASSWORD_SALT), expected=decodeHex(env.GAZELLE_PASSWORD_HASH);
  if(salt.length<16||expected.length!==32)return false;
  // Cloudflare caps a single PBKDF2 call at 100,000 rounds. Chain six
  // independently salted calls to retain the full 600,000-round work factor.
  let secret=encoder.encode(password),actual;
  for(let round=0;round<6;round++){
    const key=await crypto.subtle.importKey('raw',secret,'PBKDF2',false,['deriveBits']);
    const roundSalt=new Uint8Array(salt.length+1);roundSalt.set(salt);roundSalt[salt.length]=round;
    actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:roundSalt,iterations:100000},key,256));
    secret=actual;
  }
  let mismatch=0;for(let i=0;i<32;i++)mismatch|=actual[i]^expected[i];
  return mismatch===0;
}

export async function session(request,env){
  const token=cookieToken(request);
  if(!token||token.length>100)return false;
  const record=await env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').bind(await sha(token)).first();
  return !!record&&Date.parse(record.expires_at)>Date.now();
}

export async function login(request,env){
  const ip=await sha(`${env.GAZELLE_SESSION_SECRET||''}:${request.headers.get('CF-Connecting-IP')||'unknown'}`);
  const attempt=await env.DB.prepare('SELECT count,first_at FROM login_attempts WHERE ip_hash=?').bind(ip).first();
  if(attempt?.count>=10&&Date.now()-Date.parse(attempt.first_at)<300000)return {ok:false,status:429,message:'Too many tries. Wait five minutes.'};
  const form=await request.formData();
  const password=String(form.get('password')||'');
  if(password.length>1000||!await checkPassword(password,env)){
    const count=attempt&&Date.now()-Date.parse(attempt.first_at)<300000?attempt.count+1:1;
    const first=count===1?now():attempt.first_at;
    await env.DB.prepare('INSERT INTO login_attempts(ip_hash,count,first_at) VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET count=excluded.count,first_at=excluded.first_at').bind(ip,count,first).run();
    return {ok:false,status:401,message:'That passphrase did not work.'};
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(ip).run();
  const raw=crypto.getRandomValues(new Uint8Array(32));
  const token=btoa(String.fromCharCode(...raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await env.DB.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').bind(await sha(token),new Date(Date.now()+43200000).toISOString()).run();
  return {ok:true,cookie:`gazelle_session=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`};
}

export async function logout(request,env){
  const token=cookieToken(request);
  if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
}
