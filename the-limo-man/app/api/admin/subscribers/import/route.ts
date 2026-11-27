import { ownerGuard } from '../../../../../lib/admin';
import { CONSENT, database, json, normalizeEmail, parseCsv, sameOrigin } from '../../../../../lib/subscribers';
export const dynamic='force-dynamic';
export async function POST(request: Request) {
  const denied=await ownerGuard(); if(denied) return denied;
  if(!sameOrigin(request)) return json({error:'Invalid origin.'},403);
  try {
    const text=await request.text(); if(text.length>1_000_000) return json({error:'Import at most 1 MB.'},413);
    const [head,...rows]=parseCsv(text.replace(/^\uFEFF/,''));
    if(!head||rows.length>2000) return json({error:'Import up to 2,000 rows.'},400);
    const headers=head.map(h=>h.trim().toLowerCase().replace(/[ _-]/g,''));
    const emailAt=headers.indexOf('email'),consentAt=headers.findIndex(h=>h==='consent'||h==='consenttext'),dateAt=headers.findIndex(h=>h==='subscribedat'||h==='submittedat');
    if(emailAt<0||consentAt<0) return json({error:'The CSV needs Email and Consent columns.'},400);
    const records=new Map<string,{at:number;consent:string}>(); let invalid=0;
    for(const row of rows){
      const email=normalizeEmail(row[emailAt]),consent=row[consentAt]?.trim();
      if(!email||!consent||!/agree|consent|true|yes/i.test(consent)){invalid++;continue;}
      const parsed=dateAt>=0?Date.parse(row[dateAt]):NaN;
      const at=Number.isFinite(parsed)?parsed:Date.now();
      const prev=records.get(email); if(!prev||at<prev.at) records.set(email,{at,consent:consent==='true'?CONSENT:consent});
    }
    const db=database(); let inserted=0;
    for(const [email,r] of records){
      const result=await db.prepare(`INSERT INTO subscribers (id,email,status,source,consent_text,subscribed_at,consent_at,updated_at,signup_count)
        VALUES (?,?,'subscribed','Imported signup',?,?,?,?,1) ON CONFLICT(email) DO NOTHING`)
        .bind(crypto.randomUUID(),email,r.consent,r.at,r.at,Date.now()).run();
      inserted+=result.meta.changes||0;
    }
    return json({success:true,inserted,duplicates:records.size-inserted,skipped:invalid});
  }catch{return json({error:'Could not import this CSV.'},400);}
}
