import { now } from './store.js';

const encoder=new TextEncoder();
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
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
export async function session(request,env){
  const token=cookieToken(request);
  if(!token||token.length>100)return false;
  const record=await env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').bind(await sha(token)).first();
  return !!record&&Date.parse(record.expires_at)>Date.now();
}

export async function newSession(env){
  const raw=crypto.getRandomValues(new Uint8Array(32));
  const token=btoa(String.fromCharCode(...raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await env.DB.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').bind(await sha(token),new Date(Date.now()+43200000).toISOString()).run();
  return `gazelle_session=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`;
}

export async function logout(request,env){
  const token=cookieToken(request);
  if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
}
