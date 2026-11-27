import { ownerGuard } from '../../../../lib/admin';
import { database, json, sameOrigin } from '../../../../lib/subscribers';
export const dynamic='force-dynamic';
export async function GET(request: Request) {
  const denied=await ownerGuard(); if(denied) return denied;
  const url=new URL(request.url), search=(url.searchParams.get('search')||'').slice(0,100).toLowerCase(), status=url.searchParams.get('status');
  const page=Math.max(0,Math.min(10000,Math.floor(Number(url.searchParams.get('page'))||0)));
  const conditions=['instr(email, ?) > 0'], args:(string|number)[]=[search];
  if(status==='subscribed'||status==='unsubscribed'){conditions.push('status=?');args.push(status);}
  const where=conditions.join(' AND '),db=database();
  const [rows,total,counts]=await Promise.all([
    db.prepare(`SELECT * FROM subscribers WHERE ${where} ORDER BY subscribed_at DESC LIMIT 100 OFFSET ?`).bind(...args,page*100).all(),
    db.prepare(`SELECT count(*) AS count FROM subscribers WHERE ${where}`).bind(...args).first<{count:number}>(),
    db.prepare("SELECT count(*) AS total,SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) AS active FROM subscribers").first(),
  ]);
  return json({subscribers:rows.results,total:total?.count||0,counts,page});
}
export async function PATCH(request: Request) {
  const denied=await ownerGuard(); if(denied) return denied;
  if(!sameOrigin(request)) return json({error:'Invalid origin.'},403);
  try {
    const {id}=await request.json() as {id?:unknown};
    if(typeof id!=='string'||id.length>60) return json({error:'Invalid subscriber.'},400);
    await database().prepare("UPDATE subscribers SET status='unsubscribed',updated_at=? WHERE id=?").bind(Date.now(),id).run();
    return json({success:true});
  } catch { return json({error:'Update failed.'},400); }
}
