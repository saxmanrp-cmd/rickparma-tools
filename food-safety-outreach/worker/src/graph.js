import { now, setting, setSetting, normalizeEmail, audit } from './store.js';

const GRAPH='https://graph.microsoft.com/v1.0/';
const SCOPES='offline_access User.Read Mail.Read Mail.Send';
const encoder=new TextEncoder();
let accessCache=null;

function bytesFromBase64(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
function base64FromBytes(bytes){return btoa(String.fromCharCode(...bytes));}
async function key(env){
  const raw=bytesFromBase64(env.GAZELLE_TOKEN_KEY||'');
  if(raw.length!==32)throw Error('Gazelle token encryption key is missing');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
async function encrypt(env,value){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),encoder.encode(value));
  return JSON.stringify({iv:base64FromBytes(iv),data:base64FromBytes(new Uint8Array(encrypted))});
}
async function decrypt(env,value){
  const packed=JSON.parse(value);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytesFromBase64(packed.iv)},await key(env),bytesFromBase64(packed.data));
  return new TextDecoder().decode(raw);
}

export async function mailReady(env){
  if(!env.GAZELLE_MS_CLIENT_ID||!env.GAZELLE_MS_TENANT||!env.GAZELLE_TOKEN_KEY)return false;
  if(env.GAZELLE_INITIAL_REFRESH_TOKEN)return true;
  return !!await env.DB.prepare("SELECT 1 FROM private_tokens WHERE name='refresh_token'").first();
}

async function accessToken(env){
  if(accessCache&&Date.now()<accessCache.until-120000)return accessCache.value;
  const saved=await env.DB.prepare("SELECT ciphertext FROM private_tokens WHERE name='refresh_token'").first();
  const refresh=saved?await decrypt(env,saved.ciphertext):env.GAZELLE_INITIAL_REFRESH_TOKEN;
  if(!refresh)throw Error('Microsoft mailbox needs a one-time connection');
  const tenant=env.GAZELLE_MS_TENANT;
  if(!/^[A-Za-z0-9_-]+$/.test(tenant||''))throw Error('Invalid Microsoft tenant');
  const body=new URLSearchParams({client_id:env.GAZELLE_MS_CLIENT_ID,grant_type:'refresh_token',refresh_token:refresh,scope:SCOPES});
  const response=await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const result=await response.json();
  if(!response.ok||!result.access_token)throw Error('Microsoft mailbox sign-in expired; Richard must reconnect it');
  const expected=normalizeEmail(await setting(env.DB,'profile_sender_email'));
  const account=await fetch(GRAPH+'me?$select=mail,userPrincipalName',{headers:{Authorization:`Bearer ${result.access_token}`}});
  if(!account.ok)throw Error('Microsoft account check failed');
  const person=await account.json();
  if(!expected||normalizeEmail(person.mail||person.userPrincipalName)!==expected)throw Error('Microsoft account does not match Gazelle sender');
  const current=result.refresh_token||refresh;
  await env.DB.prepare("INSERT INTO private_tokens(name,ciphertext,updated_at) VALUES('refresh_token',?,?) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at").bind(await encrypt(env,current),now()).run();
  accessCache={value:result.access_token,until:Date.now()+Number(result.expires_in||3600)*1000};
  return accessCache.value;
}

export async function graph(env,path,options={}){
  const url=path.startsWith('https://')?path:GRAPH+path.replace(/^\//,'');
  if(!url.startsWith(GRAPH))throw Error('Unexpected Microsoft Graph URL');
  const token=await accessToken(env);
  const response=await fetch(url,{...options,headers:{Accept:'application/json',Authorization:`Bearer ${token}`,Prefer:'IdType="ImmutableId"',...options.headers}});
  if(!response.ok)throw Error(`Microsoft mail request failed (${response.status})`);
  if(response.status===202||response.status===204)return null;
  return response.json();
}

export async function sendMail(env,message){
  await graph(env,'me/sendMail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    message:{subject:message.subject,body:{contentType:'Text',content:message.body},
      from:{emailAddress:{address:message.sender,name:message.senderName}},
      toRecipients:[{emailAddress:{address:message.recipient}}]},saveToSentItems:true})});
}

export async function replyMail(env,messageId,body){
  if(!messageId||!body)throw Error('Reply needs an existing message and body');
  await graph(env,`me/messages/${encodeURIComponent(messageId)}/reply`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:body})
  });
}

export async function sentInConversationAfter(env,conversationId,receivedAt){
  if(!conversationId||!receivedAt)throw Error('Conversation check needs an ID and time');
  const query=new URLSearchParams({
    '$filter':`sentDateTime ge ${receivedAt}`,
    '$select':'id,conversationId,sentDateTime',
    '$orderby':'sentDateTime desc',
    '$top':'100'
  });
  let url=`me/mailFolders/SentItems/messages?${query}`;
  for(let page=0;page<5;page++){
    const data=await graph(env,url);
    if((data.value||[]).some(item=>item.conversationId===conversationId&&Date.parse(item.sentDateTime)>Date.parse(receivedAt)))return true;
    if(!data['@odata.nextLink'])return false;
    url=data['@odata.nextLink'];
  }
  throw Error('Could not finish checking Gazelle’s sent mail');
}

export async function pollInbox(env,recordReply){
  let count=0;
  for(const folder of ['Inbox','JunkEmail','DeletedItems']){
    const cursorKey=`graph_${folder.toLowerCase()}_delta_url`;
    const baselineKey=`graph_${folder.toLowerCase()}_baseline_done`;
    const first=(await setting(env.DB,baselineKey))!=='1';
    let url=await setting(env.DB,cursorKey)||`${GRAPH}me/mailFolders/${folder}/messages/delta?%24select=id,receivedDateTime&%24top=50`;
    for(let page=0;page<100;page++){
      const data=await graph(env,url);
      if(!first){
        for(const item of data.value||[]){
          if(!item.id||item['@removed'])continue;
          const message=await graph(env,`me/messages/${encodeURIComponent(item.id)}?$select=id,from,replyTo,subject,bodyPreview,receivedDateTime,internetMessageId,conversationId`);
          if(await recordReply(message))count++;
        }
      }
      if(data['@odata.deltaLink']){
        await setSetting(env.DB,cursorKey,data['@odata.deltaLink']);
        await setSetting(env.DB,baselineKey,'1');
        break;
      }
      if(!data['@odata.nextLink'])throw Error('Microsoft mailbox did not return a cursor');
      url=data['@odata.nextLink'];
    }
  }
  if(count)await audit(env.DB,'mail_checked',{replies:count});
  return count;
}
