import { now, setting, profile, profileMissing, suppressed, normalizeEmail, audit } from './store.js';
import { mailReady, sendMail } from './graph.js';
import { SOURCE_URL } from './snhd.js';

const activeSend=new Set(['sending','sent','uncertain']);
const escText=value=>String(value||'').trim();

export function renderLetter(p,b,kind,mentionGrade=false){
  const ad=`Advertisement from ${p.business_name}\n\n`;
  let grade='';
  if(mentionGrade&&b.eligible&&['B','C'].includes(b.grade)&&b.inspection_date){
    const date=new Date(`${b.inspection_date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
    grade=`I saw the Southern Nevada Health District record for your ${date} inspection lists a ${b.grade} grade. An inspection is a snapshot, and conditions may have changed since then. We are an independent business and are not affiliated with the district.\n\n`;
  }
  const subject=kind==='first'?`Food safety support for ${b.name}`:`Following up: food safety support for ${b.name}`;
  const opening=kind==='first'
    ?`Hello,\n\nI'm ${p.sender_name} with ${p.business_name}. We help food businesses with ${p.services}.\n\n${grade}${p.offer}\n\nIf this would be useful, just reply and I'll follow up personally.`
    :`Hello,\n\nI'm following up once on my note about ${p.services}. ${p.offer}\n\nIf it is useful, reply and I'll follow up personally.`;
  const instagram=p.instagram?`\nInstagram: ${p.instagram}`:'';
  const body=`${ad}${opening}\n\n${p.sender_name}\n${p.title}\n${p.business_name}\n${p.contact_details}${instagram}\n\n${p.postal_address}\nTo opt out, reply with 'unsubscribe' and we will not contact you again.`;
  return {subject,body};
}

export async function createDrafts(db,limit=50){
  const p=await profile(db); if(profileMissing(p).length)return 0;
  const mention=(await setting(db,'mention_grade'))==='1';
  const businesses=(await db.prepare('SELECT * FROM businesses WHERE eligible=1 AND contact_email IS NOT NULL ORDER BY inspection_date DESC LIMIT 500').all()).results;
  const messages=(await db.prepare('SELECT m.*,b.facility_id,b.name,b.address FROM messages m JOIN businesses b ON b.business_key=m.business_key').all()).results;
  const replies=(await db.prepare('SELECT business_key FROM replies WHERE business_key IS NOT NULL').all()).results;
  const suppressions=(await db.prepare('SELECT kind,value FROM suppressions').all()).results;
  const blocked=new Set(suppressions.map(x=>`${x.kind}:${x.value}`));
  const replied=new Set(replies.map(x=>x.business_key));
  const existing=new Map(); for(const m of messages){if(!existing.has(m.business_key))existing.set(m.business_key,new Map());existing.get(m.business_key).set(m.kind,m);}
  const sentFacilities=new Map(),sentLocations=new Map();
  for(const m of messages.filter(m=>activeSend.has(m.status))){
    if(m.facility_id)sentFacilities.set(m.facility_id,m.business_key);
    sentLocations.set(`${m.name.toLowerCase().trim()}|${m.address.toLowerCase().trim()}`,m.business_key);
  }
  const seenFacilities=new Set(),seenLocations=new Set();
  const changes=[];let count=0;
  for(const b of businesses){
    if(count>=limit)break;
    const place=`${b.name.toLowerCase().trim()}|${b.address.toLowerCase().trim()}`;
    if(blocked.has(`business:${b.business_key}`)||blocked.has(`email:${b.contact_email}`)||replied.has(b.business_key))continue;
    if((b.facility_id&&(seenFacilities.has(b.facility_id)||sentFacilities.has(b.facility_id)&&sentFacilities.get(b.facility_id)!==b.business_key))||seenLocations.has(place)||sentLocations.has(place)&&sentLocations.get(place)!==b.business_key)continue;
    if(b.facility_id)seenFacilities.add(b.facility_id);seenLocations.add(place);
    const prior=existing.get(b.business_key)||new Map();
    let kind='';
    if(!prior.has('first')||prior.get('first').status==='stale')kind='first';
    else if((!prior.has('followup')||prior.get('followup').status==='stale')&&prior.get('first').status==='sent'){
      const delay=Number(await setting(db,'followup_days','7'))*86400000;
      if(Date.now()-Date.parse(prior.get('first').sent_at)>=delay)kind='followup';
    }
    if(!kind)continue;
    const letter=renderLetter(p,b,kind,mention),time=now();
    changes.push(db.prepare(`INSERT INTO messages(business_key,kind,recipient,subject,body,status,grade_at_draft,date_at_draft,created_at) VALUES(?,?,?,?,?,'draft',?,?,?)
      ON CONFLICT(business_key,kind) DO UPDATE SET recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,status='draft',grade_at_draft=excluded.grade_at_draft,date_at_draft=excluded.date_at_draft,created_at=excluded.created_at,approved_at=NULL,error=NULL WHERE messages.status='stale'`).bind(b.business_key,kind,b.contact_email,letter.subject,letter.body,b.grade,b.inspection_date,time));
    changes.push(db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(time,'draft_created',b.business_key,JSON.stringify({kind,recipient:b.contact_email,subject:letter.subject})));
    count++;
  }
  if(changes.length)await db.batch(changes);
  return count;
}

function localParts(date=new Date()){
  const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(pieces.map(x=>[x.type,x.value]));
}
export async function withinHours(db,date=new Date()){
  const parts=localParts(date),time=`${parts.hour}:${parts.minute}`;
  return !['Sat','Sun'].includes(parts.weekday)&&time>=await setting(db,'hour_start','09:00')&&time<await setting(db,'hour_end','17:00');
}

export async function sendApproved(env,runId){
  const db=env.DB;
  if(await setting(db,'mode')!=='live'||await setting(db,'paused')==='1')return 0;
  const p=await profile(db);
  if(profileMissing(p).length||!await mailReady(env))throw Error('Live sending needs complete business details and Gazelle mailbox');
  if(!await withinHours(db))return 0;
  const run=await db.prepare('SELECT * FROM source_runs WHERE id=?').bind(runId).first();
  if(!run||run.url!==SOURCE_URL||Date.now()-Date.parse(run.checked_at)>3600000)throw Error('A fresh official check is required before sending');
  const local=localParts();
  const today=`${local.year}-${local.month}-${local.day}`;
  const recent=(await db.prepare("SELECT send_started_at FROM messages WHERE status IN ('sending','sent','uncertain') AND send_started_at>=?").bind(new Date(Date.now()-172800000).toISOString()).all()).results;
  const sentToday=recent.filter(item=>{
    const date=localParts(new Date(item.send_started_at));
    return `${date.year}-${date.month}-${date.day}`===today;
  }).length;
  const limit=Number(await setting(db,'daily_limit','5'));
  const allowance=Math.max(0,limit-sentToday);
  if(!allowance)return 0;
  const approved=(await db.prepare("SELECT * FROM messages WHERE status='approved' ORDER BY approved_at,id LIMIT ?").bind(allowance).all()).results;
  let sent=0;
  for(const message of approved){
    const b=await db.prepare('SELECT * FROM businesses WHERE business_key=?').bind(message.business_key).first();
    const changed=!b||b.source_run_id!==runId||!b.eligible||b.grade!==message.grade_at_draft||b.inspection_date!==message.date_at_draft||b.contact_email!==message.recipient||await suppressed(db,message.business_key,message.recipient);
    let duplicate=false;
    if(b?.facility_id)duplicate=!!await db.prepare("SELECT 1 FROM messages m JOIN businesses x ON x.business_key=m.business_key WHERE x.facility_id=? AND x.business_key<>? AND m.status IN ('sending','sent','uncertain') LIMIT 1").bind(b.facility_id,message.business_key).first();
    if(b&&!duplicate)duplicate=!!await db.prepare("SELECT 1 FROM messages m JOIN businesses x ON x.business_key=m.business_key WHERE lower(trim(x.name))=? AND lower(trim(x.address))=? AND x.business_key<>? AND m.status IN ('sending','sent','uncertain') LIMIT 1").bind(b.name.toLowerCase().trim(),b.address.toLowerCase().trim(),message.business_key).first();
    if(message.kind==='followup'&&await db.prepare('SELECT 1 FROM replies WHERE business_key=? LIMIT 1').bind(message.business_key).first())duplicate=true;
    if(changed||duplicate){
      await db.batch([db.prepare("UPDATE messages SET status='stale',error=? WHERE id=?").bind(changed?'Official record, contact, or suppression changed':'Business already contacted or replied',message.id),db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'send_skipped',message.business_key,JSON.stringify({message_id:message.id,reason:changed?'stale or suppressed':'duplicate or reply'}))]);
      continue;
    }
    const claimed=await db.prepare("UPDATE messages SET status='sending',send_started_at=? WHERE id=? AND status='approved'").bind(now(),message.id).run();
    if(!claimed.meta.changes)continue;
    await audit(db,'send_attempt',{message_id:message.id,recipient:message.recipient},message.business_key);
    try{
      await sendMail(env,{sender:p.sender_email,senderName:p.sender_name,recipient:message.recipient,subject:message.subject,body:message.body});
      await db.batch([db.prepare("UPDATE messages SET status='sent',sent_at=? WHERE id=?").bind(now(),message.id),db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'sent',message.business_key,JSON.stringify({message_id:message.id}))]);
      sent++;
    }catch(error){
      await db.batch([db.prepare("UPDATE messages SET status='uncertain',error=? WHERE id=?").bind(String(error).slice(0,300),message.id),db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'send_uncertain',message.business_key,JSON.stringify({message_id:message.id,error:String(error).slice(0,300)}))]);
      break; // A possibly accepted message is never retried automatically.
    }
  }
  return sent;
}

export function classifyReply(subject,preview,from){
  if(/mailer-daemon/i.test(from)||/delivery status notification|undeliverable/i.test(subject))return 'bounce';
  const text=`${subject}\n${String(preview||'').split(/-----original message-----/i)[0]}`.toLowerCase();
  if(/unsubscribe|remove me|stop emailing|do not contact|opt out/.test(text))return 'opt_out';
  if(/complaint|unprofessional|angry|harassment/.test(text))return 'complaint';
  if(/price|pricing|rate|cost|quote/.test(text))return 'pricing';
  if(/interested|let's talk|call me|schedule|more information/.test(text))return 'interested';
  return 'needs_review';
}

export async function recordReply(db,message){
  const external=escText(message.internetMessageId||message.id);
  if(!external||await db.prepare('SELECT 1 FROM replies WHERE external_id=?').bind(external).first())return false;
  let from=normalizeEmail(message.from?.emailAddress?.address),subject=escText(message.subject),preview=escText(message.bodyPreview).slice(0,1000);
  if(from===(await setting(db,'profile_sender_email')).toLowerCase())return false;
  const classification=classifyReply(subject,preview,from);
  let related=from?await db.prepare('SELECT business_key FROM businesses WHERE contact_email=?').bind(from).first():null;
  if(!related&&from)related=await db.prepare('SELECT business_key FROM messages WHERE recipient=? ORDER BY id DESC LIMIT 1').bind(from).first();
  if(!related&&classification==='bounce')for(const match of preview.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){
    related=await db.prepare('SELECT business_key FROM businesses WHERE contact_email=?').bind(match.toLowerCase()).first();
    if(related){from=match.toLowerCase();break;}
  }
  const businessKey=related?.business_key||null,time=now();
  const batch=[db.prepare('INSERT INTO replies(external_id,business_key,from_email,subject,classification,excerpt,received_at) VALUES(?,?,?,?,?,?,?)').bind(external,businessKey,from,subject,classification,preview,time),db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(time,'reply_received',businessKey,JSON.stringify({external_id:external,classification,from,subject}))];
  if(['opt_out','bounce'].includes(classification)){
    if(from)batch.push(db.prepare('INSERT OR IGNORE INTO suppressions(kind,value,reason,created_at) VALUES(?,?,?,?)').bind('email',from,classification,time));
    if(businessKey)batch.push(db.prepare('INSERT OR IGNORE INTO suppressions(kind,value,reason,created_at) VALUES(?,?,?,?)').bind('business',businessKey,classification,time));
  }
  if(businessKey)batch.push(db.prepare("UPDATE messages SET status='stale',error='Reply received' WHERE business_key=? AND kind='followup' AND status IN ('draft','approved')").bind(businessKey));
  await db.batch(batch);return true;
}
