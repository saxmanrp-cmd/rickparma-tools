import { session, logout, csrfToken, validCsrf } from './auth.js';
import { loginPage, setupPage, renderPage } from './ui.js';
import { handlePasskey, validSetupToken } from './passkeys.js';
import { PASSKEY_CLIENT } from './passkey-client.js';
import { now, setting, setSetting, audit, importOfficial, saveContact, addSuppression, profile, profileMissing, normalizeEmail } from './store.js';
import { createDrafts, sendApproved, recordReply, withinHours } from './workflow.js';
import { mailReady, pollInbox } from './graph.js';
import { sendConversationReplies } from './conversations.js';

function html(body,status=200,headers={}){
  return new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'",...headers}});
}
function redirect(path,cookie){return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});}
async function privatePage(path,env,notice,request){
  const token=await csrfToken(request,env);
  const page=await renderPage(path,env,notice);
  return page.replace(/(<form method="post"[^>]*>)/g,`$1<input type="hidden" name="csrf" value="${token}">`);
}
const text=(form,key)=>String(form.get(key)||'').trim();
const validSource=value=>!value||/^https:\/\/[^\s/]+/i.test(value);
const validPhone=value=>!value||/^\+?1?\D*[2-9]\d{2}\D*[2-9]\d{2}\D*\d{4}$/.test(value);

async function saveResearch(db,form){
  const key=text(form,'key');
  if(!await db.prepare('SELECT 1 FROM businesses WHERE business_key=?').bind(key).first())throw Error('Unknown place');
  const fields=['phone','phone_source','parent_name','parent_source','website_url','website_source','parent_phone','parent_phone_source','parent_email','parent_email_source'];
  const data=Object.fromEntries(fields.map(name=>[name,text(form,name)]));
  for(const pair of [['phone','phone_source'],['parent_name','parent_source'],['website_url','website_source'],['parent_phone','parent_phone_source'],['parent_email','parent_email_source']]){
    if(data[pair[0]]&&!data[pair[1]])throw Error('Each contact detail needs a public source page');
    if(!validSource(data[pair[1]]))throw Error('Use an HTTPS public source page');
  }
  if(!validPhone(data.phone)||!validPhone(data.parent_phone))throw Error('Add a complete phone number');
  if(data.parent_email&&!normalizeEmail(data.parent_email))throw Error('Invalid parent-company email');
  if(data.website_url&&!validSource(data.website_url))throw Error('Use an HTTPS business website');
  await db.batch([
    db.prepare(`INSERT INTO contact_research(business_key,phone,phone_source,parent_name,parent_source,website_url,website_source,parent_phone,parent_phone_source,parent_email,parent_email_source,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(business_key) DO UPDATE SET phone=excluded.phone,phone_source=excluded.phone_source,parent_name=excluded.parent_name,parent_source=excluded.parent_source,website_url=excluded.website_url,website_source=excluded.website_source,parent_phone=excluded.parent_phone,parent_phone_source=excluded.parent_phone_source,parent_email=excluded.parent_email,parent_email_source=excluded.parent_email_source,updated_at=excluded.updated_at`).bind(key,...fields.map(name=>data[name]),now()),
    db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'contact_research_saved',key,JSON.stringify(data))
  ]);
}

async function action(path,form,env){
  const db=env.DB;
  if(path==='/refresh'){
    const result=await importOfficial(db);
    const drafts=await createDrafts(db);
    return `List updated. ${result.qualified} places qualify; ${drafts} new letters are ready.`;
  }
  if(path==='/check-mail'){
    if(!await mailReady(env))throw Error('The Microsoft mailbox is not connected yet.');
    const count=await pollInbox(env,message=>recordReply(db,message));
    return count?`${count} new replies found.`:'Mailbox checked. No new replies.';
  }
  if(path==='/contact'){await saveContact(db,text(form,'key'),text(form,'email'),text(form,'source'));return 'Email saved with its public source.';}
  if(path==='/research'){await saveResearch(db,form);return 'Phone and company details saved.';}
  if(path==='/suppress'){
    await addSuppression(db,text(form,'kind'),text(form,'value'),text(form,'reason')||'operator request');
    return 'Added to the permanent never-contact list.';
  }
  if(path==='/profile'){
    const fields=['business_name','services','offer','style','sender_name','title','sender_email','postal_address','contact_details','instagram'];
    if(!normalizeEmail(text(form,'sender_email')))throw Error('Add a valid sender email');
    const batch=fields.map(name=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(`profile_${name}`,text(form,name)));
    batch.push(db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'profile_updated',null,JSON.stringify({fields:fields.filter(name=>text(form,name))})));
    await db.batch(batch);return 'Business details saved.';
  }
  if(path==='/limits'){
    const daily=Number(text(form,'daily_limit')),follow=Number(text(form,'followup_days')),start=text(form,'hour_start'),end=text(form,'hour_end');
    if(!Number.isInteger(daily)||daily<1||daily>100||!Number.isInteger(follow)||follow<7||follow>30||!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end)||start>=end)throw Error('Use 1–100 emails a day, 7–30 follow-up days, and valid increasing hours.');
    await db.batch([['daily_limit',daily],['followup_days',follow],['hour_start',start],['hour_end',end],['mention_grade',text(form,'mention_grade')==='1'?'1':'0']].map(([key,value])=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,String(value))));
    await audit(db,'limits_changed',{daily,follow,start,end});return 'Sending limits saved.';
  }
  if(path==='/conversation-config'){
    const focus=text(form,'focus'),callOffer=text(form,'call_offer'),mode=text(form,'conversation_mode');
    if(!['off','review','auto'].includes(mode)||focus.length>300||callOffer.length>300)throw Error('Use a short service focus and call offer.');
    if(mode==='auto'&&(!focus||!callOffer||profileMissing(await profile(db)).length))throw Error('Add the focus, call offer, and complete business details before automatic replies.');
    const updates=[...([['conversation_focus',focus],['conversation_call_offer',callOffer],['conversation_mode',mode]].map(([key,value])=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value)))];
    if(mode!=='auto'||focus!==await setting(db,'conversation_focus')||callOffer!==await setting(db,'conversation_call_offer'))
      updates.push(db.prepare("UPDATE conversation_messages SET status='draft',approved_at=NULL WHERE status='auto_approved'"));
    await db.batch(updates);
    await audit(db,'conversation_settings_changed',{mode,focus_set:!!focus,call_offer_set:!!callOffer});
    return mode==='auto'?'Automatic replies are ready, but cannot send unless Live mode is on and emails are unpaused.':'Reply setting saved. No automatic replies will send.';
  }
  if(path==='/pause'){
    const value=text(form,'value');if(!['0','1'].includes(value))throw Error('Invalid sending control');
    await setSetting(db,'paused',value);await audit(db,'pause_changed',{paused:value});return value==='1'?'Emails paused.':'Emails may go out only in Live mode during your chosen hours.';
  }
  if(path==='/mode'){
    const value=text(form,'value');if(!['test','approval','live'].includes(value))throw Error('Invalid mode');
    if(value==='live'&&(text(form,'activation_phrase')!=='ACTIVATE LIVE OUTREACH'||profileMissing(await profile(db)).length||!await mailReady(env)))throw Error('Live mode needs the exact phrase, complete business details, and connected mailbox.');
    await setSetting(db,'mode',value);await audit(db,'mode_changed',{mode:value});return `Mode changed to ${value}.`;
  }
  if(path==='/edit'){
    const id=Number(text(form,'id')),subject=text(form,'subject'),body=text(form,'body');
    if(!Number.isInteger(id)||!subject||!body||subject.length>200||body.length>10000)throw Error('Letter needs a subject and a short body');
    const changed=await db.prepare("UPDATE messages SET subject=?,body=?,approved_at=NULL WHERE id=? AND status='draft'").bind(subject,body,id).run();
    if(!changed.meta.changes)throw Error('Only a draft can be changed');
    await audit(db,'draft_edited',{message_id:id});return 'Letter saved.';
  }
  if(path==='/approve'){
    const id=Number(text(form,'id'));
    const message=await db.prepare("SELECT business_key FROM messages WHERE id=? AND status='draft'").bind(id).first();
    if(!message)throw Error('Only a draft can be approved');
    await db.prepare("UPDATE messages SET status='approved',approved_at=? WHERE id=? AND status='draft'").bind(now(),id).run();
    await audit(db,'draft_approved',{message_id:id},message.business_key);return 'Letter approved. No email was sent.';
  }
  if(path==='/approve-reply'){
    const id=text(form,'external_id');
    const row=await db.prepare("SELECT business_key FROM conversation_messages WHERE inbound_external_id=? AND status='draft'").bind(id).first();
    if(!row)throw Error('Only a reply draft can be approved');
    await db.prepare("UPDATE conversation_messages SET status='approved',approved_at=? WHERE inbound_external_id=? AND status='draft'").bind(now(),id).run();
    await audit(db,'conversation_reply_approved',{inbound:id},row.business_key);
    return 'Reply approved. It can send in Review or Automatic mode only when Live is on and emails are unpaused.';
  }
  if(path==='/edit-reply'){
    const id=text(form,'external_id'),body=text(form,'body');
    if(!body||body.length>5000)throw Error('Use a short reply with a signature and opt-out.');
    const changed=await db.prepare("UPDATE conversation_messages SET body=? WHERE inbound_external_id=? AND status='draft'").bind(body,id).run();
    if(!changed.meta.changes)throw Error('Only a reply draft can be edited');
    await audit(db,'conversation_reply_edited',{inbound:id});
    return 'Reply wording saved.';
  }
  if(path==='/stop-conversation'){
    const key=text(form,'business_key');
    if(!await db.prepare('SELECT 1 FROM businesses WHERE business_key=?').bind(key).first())throw Error('Unknown place');
    await db.batch([db.prepare("INSERT INTO conversation_states(business_key,status,reason,updated_at) VALUES(?,'human','Stopped in panel',?) ON CONFLICT(business_key) DO UPDATE SET status='human',reason=excluded.reason,updated_at=excluded.updated_at").bind(key,now()),
      db.prepare("UPDATE conversation_messages SET status='stale',error='Conversation stopped in panel' WHERE business_key=? AND status IN ('draft','approved','auto_approved')").bind(key),
      db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'conversation_stopped',key,'{}')]);
    return 'Gazelle will handle this conversation. Automatic replies are stopped.';
  }
  if(path==='/handoff'){
    const id=Number(text(form,'id'));
    const row=await db.prepare('SELECT business_key FROM replies WHERE id=?').bind(id).first();
    if(!row)throw Error('Unknown reply');
    const batch=[db.prepare('UPDATE replies SET needs_handoff=0 WHERE id=?').bind(id)];
    if(row.business_key)batch.push(db.prepare("INSERT INTO conversation_states(business_key,status,reason,updated_at) VALUES(?,'human','Gazelle handled reply',?) ON CONFLICT(business_key) DO UPDATE SET status='human',reason=excluded.reason,updated_at=excluded.updated_at").bind(row.business_key,now()));
    await db.batch(batch);
    await audit(db,'handoff_reviewed',{reply_id:id});return 'Reply marked handled.';
  }
  throw Error('Unknown action');
}

async function hourly(env){
  const db=env.DB;
  const latest=await db.prepare('SELECT id,checked_at FROM source_runs ORDER BY id DESC LIMIT 1').first();
  const live=await setting(db,'mode')==='live'&&await setting(db,'paused')!=='1';
  const approved=(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status='approved'").first()).n;
  const needsFresh=live&&approved>0&&await withinHours(db);
  let runId=null;
  try{
    if(!latest||Date.now()-Date.parse(latest.checked_at)>86400000||needsFresh){
      const result=await importOfficial(db);runId=result.run_id;
      await createDrafts(db);
    }
  }catch(error){await audit(db,'source_import_failed',{error:String(error).slice(0,300)});}
  try{if(await mailReady(env))await pollInbox(env,message=>recordReply(db,message));}
  catch(error){await audit(db,'mail_check_failed',{error:String(error).slice(0,300)});}
  const queued=(await db.prepare("SELECT COUNT(*) AS n FROM conversation_messages WHERE status IN ('approved','auto_approved')").first()).n;
  if(live&&queued>0&&await withinHours(db)&&!runId){
    try{const result=await importOfficial(db);runId=result.run_id;await createDrafts(db);}
    catch(error){await audit(db,'source_import_failed',{error:String(error).slice(0,300)});}
  }
  if(runId&&live){
    try{if(approved>0)await sendApproved(env,runId);}catch(error){await audit(db,'send_cycle_failed',{error:String(error).slice(0,300)});}
    try{if(queued>0)await sendConversationReplies(env,runId,withinHours);}catch(error){await audit(db,'conversation_send_cycle_failed',{error:String(error).slice(0,300)});}
  }
  await db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()).run();
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/health')return new Response('ok',{headers:{'Cache-Control':'no-store'}});
    if(path==='/passkey-client.js')return new Response(PASSKEY_CLIENT,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(path.startsWith('/webauthn/'))return handlePasskey(request,env);
    if(path==='/setup'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return await validSetupToken(env.DB,url.searchParams.get('token'))?html(setupPage()):html(loginPage('That setup link is no longer valid. Ask Richard for a new one.'),403);
    }
    if(path==='/login'){
      if(request.method==='GET')return await session(request,env)?redirect('/'):html(loginPage());
      return new Response('Use a passkey to open Gazelle.',{status:405,headers:{'Cache-Control':'no-store'}});
    }
    if(path==='/logout'){
      await logout(request,env);
      return redirect('/login','gazelle_session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    }
    if(!await session(request,env))return html(loginPage());
    if(request.method==='GET')return html(await privatePage(path,env,url.searchParams.get('notice')||'',request));
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    if(Number(request.headers.get('Content-Length')||0)>100000)return html(await privatePage('/settings',env,'Form too large',request),400);
    const form=request.headers.get('Content-Type')?await request.formData():new FormData();
    if((request.headers.get('Origin')&&!['null',url.origin].includes(request.headers.get('Origin')))||!await validCsrf(request,env,form.get('csrf')))
      return html(await privatePage('/settings',env,'Invalid form token',request),403);
    const returnPage=path==='/refresh'?'/':path==='/contact'||path==='/research'?'/places':path==='/edit'||path==='/approve'?'/letters':path==='/handoff'||path==='/check-mail'||path==='/approve-reply'||path==='/edit-reply'||path==='/stop-conversation'?'/replies':'/settings';
    try{return redirect(`${returnPage}?notice=${encodeURIComponent(await action(path,form,env))}`);}
    catch(error){return html(await privatePage(returnPage,env,String(error),request),400);}
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(hourly(env));}
};
