import { CONSENT, SOURCE, json, normalizeEmail, rateLimit, sameOrigin, saveSubscriber } from '../../../lib/subscribers';
export const dynamic='force-dynamic';
export async function POST(request: Request) {
  if(!sameOrigin(request)) return json({success:false,message:'Please use the form on this site.'},403);
  if(Number(request.headers.get('content-length')||0)>4096) return json({success:false},413);
  try {
    const raw=await request.text(); if(raw.length>4096) return json({success:false},413);
    const isJson=request.headers.get('content-type')?.includes('application/json');
    const input=isJson ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    if(input.botcheck) return json({success:true});
    const email=normalizeEmail(input.email);
    if(!email || input.consent!==CONSENT) return json({success:false,message:'Enter your email and agree to receive book updates.'},400);
    if(!await rateLimit(request)) return json({success:false,message:'Please wait before trying again.'},429);
    await saveSubscriber(email,SOURCE,CONSENT);
    if(!isJson) return new Response(null,{status:303,headers:{Location:'/?joined=1','Cache-Control':'no-store'}});
    return json({success:true});
  } catch { return json({success:false,message:'Your signup could not be saved. Please try again.'},503); }
}
