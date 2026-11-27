import { ownerGuard } from '../../../../../lib/admin';
import { csvCell, database, type Subscriber } from '../../../../../lib/subscribers';
export const dynamic='force-dynamic';
export async function GET(request: Request) {
  const denied=await ownerGuard(); if(denied) return denied;
  const all=new URL(request.url).searchParams.get('all')==='1';
  const rows=await database().prepare(`SELECT * FROM subscribers ${all?'':"WHERE status='subscribed'"} ORDER BY subscribed_at DESC`).all<Subscriber>();
  const fields=['email','status','subscribed_at','consent_at','consent_text','source'];
  const csv=[fields.map(csvCell).join(','),...rows.results.map(r=>[r.email,r.status,new Date(r.subscribed_at).toISOString(),new Date(r.consent_at).toISOString(),r.consent_text,r.source].map(csvCell).join(','))].join('\r\n');
  return new Response('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="the-limo-man-subscribers.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie'}});
}
