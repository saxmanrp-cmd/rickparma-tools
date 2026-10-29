import { fetchOfficialZip, parseOfficialZip, SOURCE_URL } from './snhd.js';

export const now = () => new Date().toISOString();
export const setting = async (db,key,fallback='') => (await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first())?.value ?? fallback;
export const setSetting = (db,key,value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,String(value)).run();
export const audit = (db,event,detail,businessKey=null) => db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),event,businessKey,JSON.stringify(detail)).run();

export async function importOfficial(db,blob=null) {
  const before=(await db.prepare('SELECT business_key,grade,inspection_date,eligible,hold_reason FROM businesses').all()).results;
  const old=new Map(before.map(row=>[row.business_key,row]));
  const snapshot=await parseOfficialZip(blob??await fetchOfficialZip(),new Set(old.keys()));
  if(snapshot.rows_seen<1000)throw Error('Official download appears incomplete');
  const last=await db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM source_runs').first();
  const runId=last.id+1;
  const batch=[db.prepare("UPDATE businesses SET eligible=0,hold_reason='absent from latest official snapshot',checked_at=? WHERE last_seen_run IS NOT NULL").bind(snapshot.checked_at)];
  for(const item of snapshot.records){
    batch.push(db.prepare(`INSERT INTO businesses
      (business_key,facility_id,permit_number,name,location_name,address,city,zip_code,record_status,grade,inspection_date,latest_grade,latest_date,source_run_id,source_url,checked_at,eligible,hold_reason,last_seen_run)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(business_key) DO UPDATE SET facility_id=excluded.facility_id,permit_number=excluded.permit_number,name=excluded.name,location_name=excluded.location_name,address=excluded.address,city=excluded.city,zip_code=excluded.zip_code,record_status=excluded.record_status,grade=excluded.grade,inspection_date=excluded.inspection_date,latest_grade=excluded.latest_grade,latest_date=excluded.latest_date,source_run_id=excluded.source_run_id,source_url=excluded.source_url,checked_at=excluded.checked_at,eligible=excluded.eligible,hold_reason=excluded.hold_reason,last_seen_run=excluded.last_seen_run`).bind(
      item.business_key,item.facility_id,item.permit_number,item.name,item.location_name,item.address,item.city,item.zip_code,item.record_status,item.grade,item.inspection_date,item.latest_grade,item.latest_date,runId,SOURCE_URL,snapshot.checked_at,item.eligible,item.hold_reason,runId));
    const previous=old.get(item.business_key);
    if(!previous||previous.grade!==item.grade||previous.inspection_date!==item.inspection_date||previous.eligible!==item.eligible||previous.hold_reason!==item.hold_reason){
      batch.push(db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(snapshot.checked_at,'qualification_changed',item.business_key,JSON.stringify({grade:item.grade,inspection_date:item.inspection_date,eligible:!!item.eligible,reason:item.hold_reason,run_id:runId})));
    }
    old.delete(item.business_key);
  }
  for(const [key,previous] of old)if(previous.eligible){
    batch.push(db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(snapshot.checked_at,'qualification_changed',key,JSON.stringify({eligible:false,reason:'absent from latest official snapshot',run_id:runId})));
  }
  batch.push(db.prepare('INSERT INTO source_runs(id,source,url,sha256,checked_at,rows_seen,qualified,held) VALUES(?,?,?,?,?,?,?,?)').bind(runId,snapshot.source,SOURCE_URL,snapshot.sha256,snapshot.checked_at,snapshot.rows_seen,snapshot.qualified,snapshot.records.length-snapshot.qualified));
  batch.push(db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(snapshot.checked_at,'source_import',null,JSON.stringify({run_id:runId,sha256:snapshot.sha256,rows:snapshot.rows_seen,qualified:snapshot.qualified,url:SOURCE_URL})));
  await db.batch(batch);
  return {run_id:runId,rows:snapshot.rows_seen,qualified:snapshot.qualified,held:snapshot.records.length-snapshot.qualified,checked_at:snapshot.checked_at};
}

export async function profile(db){
  const rows=(await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'profile_%'").all()).results;
  return Object.fromEntries(rows.map(row=>[row.key.slice(8),row.value]));
}
export function profileMissing(p){
  const required=['business_name','services','offer','style','sender_name','title','sender_email','postal_address','contact_details'];
  const missing=required.filter(key=>!String(p[key]||'').trim());
  const address=String(p.postal_address||'');
  if(address&&!(/\b\d{5}(?:-\d{4})?\b/.test(address)&&(/\b\d+\s+\S+/.test(address)||/\bP\.?O\.?\s*Box\s+\d+/i.test(address)))||address.includes('@'))missing.push('postal_address');
  return [...new Set(missing)];
}
export const normalizeEmail = value => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(value||'').trim())?String(value).trim().toLowerCase():'';

function pacificDay(date){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function sendingAllowance(db,date=new Date()){
  const daily=Math.max(1,Math.min(100,Number(await setting(db,'daily_limit','5'))||5));
  const weekly=Math.max(1,Math.min(100,Number(await setting(db,'weekly_limit','3'))||3));
  const today=pacificDay(date);
  const monday=new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const weekStart=monday.toISOString().slice(0,10);
  const since=new Date(date.getTime()-8*86400000).toISOString();
  const outgoing=(await db.prepare("SELECT send_started_at FROM messages WHERE status IN ('sending','sent','uncertain') AND send_started_at>=?").bind(since).all()).results;
  const answers=(await db.prepare("SELECT send_started_at FROM conversation_messages WHERE status IN ('sending','sent','uncertain') AND send_started_at>=?").bind(since).all()).results;
  const days=[...outgoing,...answers].filter(row=>row.send_started_at).map(row=>pacificDay(new Date(row.send_started_at)));
  const dayUsed=days.filter(day=>day===today).length;
  const weekUsed=days.filter(day=>day>=weekStart&&day<=today).length;
  return {dailyRemaining:Math.max(0,daily-dayUsed),weeklyRemaining:Math.max(0,weekly-weekUsed),available:Math.max(0,Math.min(daily-dayUsed,weekly-weekUsed))};
}

export async function suppressed(db,key,email){
  return !!await db.prepare("SELECT 1 FROM suppressions WHERE (kind='business' AND value=?) OR (kind='email' AND value=?) LIMIT 1").bind(key,email).first();
}

export async function saveContact(db,key,email,source){
  const normalized=normalizeEmail(email);
  if(!normalized||!String(source||'').startsWith('https://'))throw Error('Add a valid public email and the HTTPS page where you found it.');
  const business=await db.prepare('SELECT business_key FROM businesses WHERE business_key=?').bind(key).first();
  if(!business)throw Error('Unknown place');
  if(await suppressed(db,key,normalized))throw Error('This place or email is on the do-not-contact list');
  await db.batch([
    db.prepare('UPDATE businesses SET contact_email=?,contact_source=?,contact_verified_at=? WHERE business_key=?').bind(normalized,source,now(),key),
    db.prepare("UPDATE messages SET status='stale',error='Contact changed' WHERE business_key=? AND status IN ('draft','approved') AND recipient<>?").bind(key,normalized),
    db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'contact_verified',key,JSON.stringify({email:normalized,source_url:source}))
  ]);
}

export async function addSuppression(db,kind,value,reason='operator request'){
  if(!['email','business'].includes(kind))throw Error('Invalid do-not-contact type');
  const cleaned=kind==='email'?normalizeEmail(value):String(value||'').trim();
  if(!cleaned)throw Error('Add a valid place or email');
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO suppressions(kind,value,reason,created_at) VALUES(?,?,?,?)').bind(kind,cleaned,reason,now()),
    db.prepare('INSERT INTO audit(at,event,business_key,detail) VALUES(?,?,?,?)').bind(now(),'suppression_added',kind==='business'?cleaned:null,JSON.stringify({kind,value:cleaned,reason}))
  ]);
}
