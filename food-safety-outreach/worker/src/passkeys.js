import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { now, audit } from './store.js';
import { newSession } from './auth.js';

const PROD_ORIGIN='https://gazelle-food-safety-outreach.saxmanrp.workers.dev';
const localOrigins=new Set(['http://127.0.0.1:8787','http://localhost:8787']);
const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64=value=>Uint8Array.from(atob(String(value).replaceAll('-','+').replaceAll('_','/')+'==='.slice((String(value).length+3)%4)),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
async function hash(value){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
function origin(request){
  const value=new URL(request.url).origin;
  if(value!==PROD_ORIGIN&&!localOrigins.has(value))throw Error('Unexpected panel address');
  return value;
}
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const error=(message,status=400)=>reply({error:message},status);
function challengeCookie(request){return /(?:^|;\s*)gazelle_webauthn=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1]||'';}
function cookie(value){return `gazelle_webauthn=${value}; Secure; HttpOnly; SameSite=Strict; Path=/webauthn/; Max-Age=300`;}

export async function validSetupToken(db,token){
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(String(token||'')))return null;
  const tokenHash=await hash(token);
  const row=await db.prepare('SELECT token_hash FROM enrollment_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(tokenHash,now()).first();
  return row?tokenHash:null;
}

async function saveChallenge(db,purpose,setupHash,challenge){
  const id=random();
  await db.prepare('INSERT INTO webauthn_challenges(id_hash,challenge,purpose,setup_hash,expires_at) VALUES(?,?,?,?,?)')
    .bind(await hash(id),challenge,purpose,setupHash,new Date(Date.now()+300000).toISOString()).run();
  return cookie(id);
}
async function consumeChallenge(request,db,purpose){
  const id=challengeCookie(request);
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(id))return null;
  const idHash=await hash(id);
  const row=await db.prepare('SELECT challenge,setup_hash FROM webauthn_challenges WHERE id_hash=? AND purpose=? AND expires_at>?').bind(idHash,purpose,now()).first();
  if(!row)return null;
  const claimed=await db.prepare('DELETE FROM webauthn_challenges WHERE id_hash=? AND purpose=?').bind(idHash,purpose).run();
  return claimed.meta.changes?row:null;
}

async function registerOptions(request,env,body){
  const setupHash=await validSetupToken(env.DB,body.token);
  if(!setupHash)return error('This setup link has expired or was already used.',403);
  const registered=(await env.DB.prepare('SELECT id,transports FROM passkeys').all()).results;
  const userID=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('gazelle-jacobs-food-safety'))).slice(0,16);
  const options=await generateRegistrationOptions({
    rpName:'Food Safety with Gazelle',rpID:new URL(origin(request)).hostname,
    userID,userName:'support@foodsafetywithgazelle.com',userDisplayName:'Gazelle Jacobs',
    timeout:60000,attestationType:'none',supportedAlgorithmIDs:[-7,-257],
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
    excludeCredentials:registered.map(row=>({id:row.id,transports:JSON.parse(row.transports||'[]')}))
  });
  return reply(options,200,{'Set-Cookie':await saveChallenge(env.DB,'register',setupHash,options.challenge)});
}

async function registerVerify(request,env,body){
  const challenge=await consumeChallenge(request,env.DB,'register');
  const setupHash=await validSetupToken(env.DB,body.token);
  if(!challenge||!setupHash||challenge.setup_hash!==setupHash)return error('Setup expired. Open the setup link and try again.',403);
  let verified;
  try{
    verified=await verifyRegistrationResponse({response:body.credential,expectedChallenge:challenge.challenge,
      expectedOrigin:origin(request),expectedRPID:new URL(request.url).hostname,
      requireUserPresence:true,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
  }catch{return error('The passkey could not be verified. Please try again.');}
  if(!verified.verified||!verified.registrationInfo?.credential)return error('The passkey could not be verified. Please try again.');
  const claimed=await env.DB.prepare('UPDATE enrollment_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(now(),setupHash,now()).run();
  if(!claimed.meta.changes)return error('This setup link was already used.',403);
  const key=verified.registrationInfo.credential;
  await env.DB.prepare('INSERT INTO passkeys(id,public_key,counter,transports,created_at) VALUES(?,?,?,?,?)')
    .bind(key.id,b64(key.publicKey),key.counter,JSON.stringify(body.credential.response?.transports||[]),now()).run();
  await audit(env.DB,'passkey_enrolled',{credential_id_prefix:key.id.slice(0,8)});
  return reply({ok:true},200,{'Set-Cookie':await newSession(env)});
}

async function loginOptions(request,env){
  const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys').first()).n;
  if(!count)return error('Face ID setup has not been completed. Ask Richard for the one-time setup link.',409);
  const options=await generateAuthenticationOptions({rpID:new URL(origin(request)).hostname,timeout:60000,userVerification:'required'});
  return reply(options,200,{'Set-Cookie':await saveChallenge(env.DB,'authenticate',null,options.challenge)});
}

async function loginVerify(request,env,body){
  const challenge=await consumeChallenge(request,env.DB,'authenticate');
  if(!challenge)return error('Sign-in expired. Please try again.',403);
  const id=String(body.credential?.id||'');
  if(!/^[A-Za-z0-9_-]{10,2000}$/.test(id))return error('Passkey not recognized.',403);
  const saved=await env.DB.prepare('SELECT id,public_key,counter,transports FROM passkeys WHERE id=?').bind(id).first();
  if(!saved)return error('Passkey not recognized.',403);
  let verified;
  try{
    verified=await verifyAuthenticationResponse({response:body.credential,expectedChallenge:challenge.challenge,
      expectedOrigin:origin(request),expectedRPID:new URL(request.url).hostname,
      credential:{id:saved.id,publicKey:unb64(saved.public_key),counter:saved.counter,transports:JSON.parse(saved.transports||'[]')},
      requireUserVerification:true});
  }catch{return error('Face ID sign-in did not work. Please try again.',403);}
  if(!verified.verified)return error('Face ID sign-in did not work. Please try again.',403);
  const changed=await env.DB.prepare('UPDATE passkeys SET counter=?,last_used_at=? WHERE id=? AND counter=?')
    .bind(verified.authenticationInfo.newCounter,now(),id,saved.counter).run();
  if(!changed.meta.changes)return error('Sign-in changed during verification. Please try again.',409);
  await audit(env.DB,'passkey_login',{credential_id_prefix:id.slice(0,8)});
  return reply({ok:true},200,{'Set-Cookie':await newSession(env)});
}

export async function handlePasskey(request,env){
  try{
    origin(request);
    if(request.method!=='POST')return error('Method not allowed',405);
    if(Number(request.headers.get('Content-Length')||0)>131072)return error('Request too large',413);
    const path=new URL(request.url).pathname;
    const body=path.endsWith('/options')&&path.includes('/login/')?{}:await request.json();
    if(path==='/webauthn/register/options')return registerOptions(request,env,body);
    if(path==='/webauthn/register/verify')return registerVerify(request,env,body);
    if(path==='/webauthn/login/options')return loginOptions(request,env);
    if(path==='/webauthn/login/verify')return loginVerify(request,env,body);
    return error('Not found',404);
  }catch{return error('Passkey request could not be completed.',400);}
}
