import { now, setting, profile, profileMissing, suppressed, audit } from './store.js';
import { replyMail, sentInConversationAfter } from './graph.js';
import { SOURCE_URL } from './snhd.js';

const clean=value=>String(value||'').trim();
const firstPart=value=>clean(value).split(/-----original message-----|from:.*sent:/i)[0].slice(0,1000);
const phone=/\b(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?[2-9]\d{2}[ .-]?\d{4}\b/;

export function decideConversation(preview,classification,priorIntent='',sentCount=0,maxReplies=3){
  const text=firstPart(preview).toLowerCase();
  if(['opt_out','bounce','complaint','not_interested'].includes(classification))return {kind:'handoff',reason:classification};
  if(/\b(inspection grade|violation|citation|health department|legal|lawsuit|foodborne|outbreak|sick|illness|haccp plan|certification requirements)\b/.test(text))
    return {kind:'handoff',reason:'specific advice needs Gazelle'};
  if(phone.test(text))return {kind:'handoff',reason:'phone number provided'};
  if(/\b(no thanks|not interested|please stop|leave us alone)\b/.test(text))return {kind:'handoff',reason:'declined'};
  if(sentCount>=maxReplies)return {kind:'handoff',reason:'automatic reply limit reached'};
  if(/\b(price|pricing|rates?|cost|quote|estimate|fee)\b/.test(text))
    return {kind:'reply',intent:'pricing'};
  if(/\b(what services|what do you do|how can you help|tell me about|food safety inspection|retail compliance|vendor food safety|food handler|haccp|department prep|training)\b/.test(text))
    return {kind:'reply',intent:['services','interest'].includes(priorIntent)?'call_invitation':'services'};
  if(/\b(call me|phone call|talk on the phone|schedule a call|let.s talk)\b/.test(text))
    return {kind:'reply',intent:'call_details'};
  if(/\b(interested|more information|sounds good|yes please|that would help|tell me more)\b/.test(text))
    return {kind:'reply',intent:priorIntent?'call_invitation':'interest'};
  if(priorIntent&&/^(yes|sure|okay|ok|please|sounds good)[.!\s]*$/.test(text))
    return {kind:'reply',intent:'call_details'};
  return {kind:'handoff',reason:'question or intent is unclear'};
}

export function renderConversationReply(intent,p,focus,callOffer){
  let message;
  if(intent==='services')message=`Thanks for asking. I help food businesses with ${focus}. ${callOffer} Which area would be most useful for your team?`;
  else if(intent==='interest')message=`Thanks for getting back to me. ${callOffer} What kind of food safety support would be most useful to you?`;
  else if(intent==='pricing')message='Thanks for asking. Pricing depends on the work involved. I can discuss the scope and pricing with you by phone. What number and time work best for a short call?';
  else if(intent==='call_invitation')message='Thanks for sharing that. A short call would help me understand what you need. What number and time work best for me to call?';
  else if(intent==='call_details')message='I would be glad to speak with you. What phone number and time work best for a short call?';
  else throw Error('Unknown conversation reply');
  const instagram=p.instagram?`\nInstagram: ${p.instagram}`:'';
  return `Advertisement from ${p.business_name}\n\n${message}\n\n${p.sender_name}\n${p.title}\n${p.business_name}\n${p.contact_details}${instagram}\n\n${p.postal_address}\nTo opt out, reply with 'unsubscribe' and we will not contact you again.`;
}

export async function planIncoming(db,message,businessKey,from,classification,preview){
  if(!businessKey||!from||!message.id||!message.conversationId)return {kind:'handoff',reason:'unmatched or incomplete message'};
  if(/^(no-?reply|donotreply|mailer-daemon)@/i.test(from)||/automatic reply|out of office|vacation|delivery status/i.test(message.subject||''))
    return {kind:'handoff',reason:'automated or delivery message'};
  const replyTo=(message.replyTo||[]).map(x=>String(x.emailAddress?.address||'').toLowerCase()).filter(Boolean);
  if(replyTo.length&&replyTo.some(x=>x!==from))return {kind:'handoff',reason:'different reply address'};
  const outreach=await db.prepare("SELECT 1 FROM messages WHERE business_key=? AND recipient=? AND status='sent' LIMIT 1").bind(businessKey,from).first();
  if(!outreach)return {kind:'handoff',reason:'not a sent outreach conversation'};
  const state=await db.prepare('SELECT status FROM conversation_states WHERE business_key=?').bind(businessKey).first();
  if(state?.status==='human')return {kind:'handoff',reason:'Gazelle owns this conversation'};
  const pending=await db.prepare("SELECT 1 FROM conversation_messages WHERE business_key=? AND status IN ('draft','approved','auto_approved','sending','uncertain') LIMIT 1").bind(businessKey).first();
  if(pending)return {kind:'handoff',reason:'another reply is pending'};
  const previous=(await db.prepare("SELECT intent FROM conversation_messages WHERE business_key=? AND status='sent' ORDER BY sent_at DESC LIMIT 1").bind(businessKey).first())?.intent||'';
  const count=(await db.prepare("SELECT COUNT(*) AS n FROM conversation_messages WHERE business_key=? AND status IN ('sending','sent','uncertain')").bind(businessKey).first()).n;
  const max=Math.min(3,Math.max(1,Number(await setting(db,'conversation_max_replies','3'))||3));
  const decision=decideConversation(preview,classification,previous,count,max);
  if(decision.kind!=='reply')return decision;
  const focus=clean(await setting(db,'conversation_focus'));
  const callOffer=clean(await setting(db,'conversation_call_offer'));
  const p=await profile(db);
  if(!focus||!callOffer||profileMissing(p).length)return {kind:'handoff',reason:'campaign wording or business details missing'};
  const body=renderConversationReply(decision.intent,p,focus,callOffer);
  const auto=await setting(db,'conversation_mode')==='auto'&&await setting(db,'mode')==='live'&&await setting(db,'paused')==='0';
  return {kind:'reply',intent:decision.intent,body,status:auto?'auto_approved':'draft'};
}

export async function sendConversationReplies(env,runId,withinHours){
  const db=env.DB;
  if(await setting(db,'mode')!=='live'||await setting(db,'paused')==='1'||!await withinHours(db))return 0;
  const conversationMode=await setting(db,'conversation_mode','off');
  if(conversationMode==='off')return 0;
  const run=await db.prepare('SELECT * FROM source_runs WHERE id=?').bind(runId).first();
  if(!run||run.url!==SOURCE_URL||Date.now()-Date.parse(run.checked_at)>3600000)throw Error('A fresh official check is required before replies');
  const p=await profile(db);
  if(profileMissing(p).length)return 0;
  const queue=(await db.prepare("SELECT * FROM conversation_messages WHERE status IN ('approved','auto_approved') ORDER BY created_at LIMIT 20").all()).results;
  let sent=0;
  for(const item of queue){
    if(item.status==='auto_approved'&&conversationMode!=='auto'){
      await db.prepare("UPDATE conversation_messages SET status='draft',approved_at=NULL WHERE inbound_external_id=? AND status='auto_approved'").bind(item.inbound_external_id).run();
      continue;
    }
    const limit=Number(await setting(db,'daily_limit','5'));
    const since=new Date(Date.now()-172800000).toISOString();
    const first=(await db.prepare("SELECT send_started_at FROM messages WHERE status IN ('sending','sent','uncertain') AND send_started_at>=?").bind(since).all()).results;
    const follow=(await db.prepare("SELECT send_started_at FROM conversation_messages WHERE status IN ('sending','sent','uncertain') AND send_started_at>=?").bind(since).all()).results;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const used=[...first,...follow].filter(x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.send_started_at))===today).length;
    if(used>=limit)break;
    const b=await db.prepare('SELECT * FROM businesses WHERE business_key=?').bind(item.business_key).first();
    const state=await db.prepare('SELECT status FROM conversation_states WHERE business_key=?').bind(item.business_key).first();
    const newer=await db.prepare('SELECT 1 FROM replies WHERE business_key=? AND received_at>? LIMIT 1').bind(item.business_key,item.received_at).first();
    const changed=!b||b.source_run_id!==runId||!b.eligible||b.contact_email!==item.recipient||state?.status==='human'||newer||await suppressed(db,item.business_key,item.recipient);
    if(changed){
      await db.batch([db.prepare("UPDATE conversation_messages SET status='stale',error='Record, contact, suppression, or conversation changed' WHERE inbound_external_id=?").bind(item.inbound_external_id),
        db.prepare('UPDATE replies SET needs_handoff=1 WHERE external_id=?').bind(item.inbound_external_id),
        db.prepare("INSERT INTO conversation_states(business_key,status,reason,updated_at) VALUES(?,'human','Reply held for review',?) ON CONFLICT(business_key) DO UPDATE SET status='human',reason=excluded.reason,updated_at=excluded.updated_at").bind(item.business_key,now()),
        db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'conversation_reply_skipped',item.business_key,JSON.stringify({inbound:item.inbound_external_id,reason:'stale or handoff'}))]);
      continue;
    }
    // A message Gazelle sent herself after this inbound reply takes ownership of the thread.
    if(await sentInConversationAfter(env,item.conversation_id,item.received_at)){
      await db.batch([db.prepare("UPDATE conversation_messages SET status='stale',error='Gazelle already replied' WHERE inbound_external_id=?").bind(item.inbound_external_id),
        db.prepare('UPDATE replies SET needs_handoff=0 WHERE external_id=?').bind(item.inbound_external_id),
        db.prepare("INSERT INTO conversation_states(business_key,status,reason,updated_at) VALUES(?,'human','Gazelle replied personally',?) ON CONFLICT(business_key) DO UPDATE SET status='human',reason=excluded.reason,updated_at=excluded.updated_at").bind(item.business_key,now()),
        db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'conversation_reply_skipped',item.business_key,JSON.stringify({inbound:item.inbound_external_id,reason:'Gazelle replied personally'}))]);
      continue;
    }
    const claimed=await db.prepare("UPDATE conversation_messages SET status='sending',send_started_at=? WHERE inbound_external_id=? AND status IN ('approved','auto_approved')").bind(now(),item.inbound_external_id).run();
    if(!claimed.meta.changes)continue;
    await audit(db,'conversation_reply_attempt',{inbound:item.inbound_external_id,recipient:item.recipient,intent:item.intent},item.business_key);
    try{
      await replyMail(env,item.graph_message_id,item.body);
      await db.batch([db.prepare("UPDATE conversation_messages SET status='sent',sent_at=? WHERE inbound_external_id=?").bind(now(),item.inbound_external_id),
        db.prepare('UPDATE replies SET needs_handoff=0 WHERE external_id=?').bind(item.inbound_external_id),
        db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'conversation_reply_sent',item.business_key,JSON.stringify({inbound:item.inbound_external_id,intent:item.intent}))]);
      sent++;
    }catch(error){
      await db.batch([db.prepare("UPDATE conversation_messages SET status='uncertain',error=? WHERE inbound_external_id=?").bind(String(error).slice(0,300),item.inbound_external_id),
        db.prepare('UPDATE replies SET needs_handoff=1 WHERE external_id=?').bind(item.inbound_external_id),
        db.prepare("INSERT INTO conversation_states(business_key,status,reason,updated_at) VALUES(?,'human','Sending outcome uncertain',?) ON CONFLICT(business_key) DO UPDATE SET status='human',reason=excluded.reason,updated_at=excluded.updated_at").bind(item.business_key,now()),
        db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'conversation_reply_uncertain',item.business_key,JSON.stringify({inbound:item.inbound_external_id,error:String(error).slice(0,300)}))]);
      break;
    }
  }
  return sent;
}
