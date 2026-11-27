import { requireChatGPTUser } from '../../chatgpt-auth';
import { isOwner } from '../../../lib/admin';
import admin from '../../../site/admin.html?raw';
export const dynamic='force-dynamic';
export async function GET() {
  await requireChatGPTUser('/admin/subscribers');
  if(!await isOwner()) return new Response('This list is only available to The Limo Man site owner.',{status:403,headers:{'Cache-Control':'no-store'}});
  return new Response(admin,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',Vary:'Cookie','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY'}});
}
