export function renderLoginPage({ passkeyAvailable = false } = {}) {
  const faceButton = passkeyAvailable ? `
    <button id="faceBtn" class="face" type="button"><span>◎</span> Sign in with Face ID</button>
    <div class="divider"><i></i><b>OR USE PASSWORD</b><i></i></div>` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#090b10">
<meta name="format-detection" content="telephone=no">
<title>Social Publisher</title>
<style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#090b10;color:#f7f8fb;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
  body{min-height:100dvh;display:grid;place-items:center;padding:max(28px,env(safe-area-inset-top)) 22px max(28px,env(safe-area-inset-bottom));overflow:auto}
  main{width:min(100%,420px);display:grid;gap:22px;text-align:center;margin:auto}
  .logo{width:86px;height:86px;border-radius:28px;margin:0 auto;display:grid;place-items:center;background:linear-gradient(135deg,#6454ff,#9a66ff);font-size:27px;font-weight:900}
  h1{font-size:34px;line-height:1.1;margin:0 0 12px;font-weight:900;letter-spacing:-.03em}
  form{display:grid;gap:14px}.face,.open{width:100%;min-height:62px;border-radius:18px;font:800 18px inherit;cursor:pointer;touch-action:manipulation}
  .face{border:1px solid #57496d;background:#17131f;color:#f5f2ff}.face span{font-size:25px;vertical-align:-2px;margin-right:9px}.open{border:0;background:linear-gradient(135deg,#7258ff,#9d75ff);color:#fff;box-shadow:0 14px 32px rgba(124,92,255,.22)}
  input{width:100%;height:62px;border-radius:18px;border:1px solid #384252;background:#111720;color:#fff;padding:0 18px;font-size:18px;outline:none;-webkit-user-select:text;user-select:text}
  input:focus{border-color:#8b70ff;box-shadow:0 0 0 3px rgba(139,112,255,.24)}
  .divider{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;color:#7d8798;font-size:11px;letter-spacing:.16em}.divider i{height:1px;background:#303845}.divider b{font-weight:900}
  #msg{min-height:22px;font-size:14px;line-height:1.4;color:#ff9aa6}.help{font-size:13px;line-height:1.45;color:#8f9aac;margin-top:-8px}.help strong{color:#cdd4e1}
  button:disabled{opacity:.58}
</style>
</head>
<body>
<main>
  <div class="logo">RP</div>
  <h1>Social Publisher</h1>
  ${faceButton}
  <form id="passwordForm">
    <input id="password" type="password" autocomplete="current-password" placeholder="Password" required>
    <button id="openBtn" class="open" type="submit">Open App</button>
  </form>
  <div id="msg" role="alert"></div>
  <div class="help"><strong>Face ID not opening?</strong> Your password always works here.</div>
</main>
<script>
(() => {
  const msg = document.getElementById('msg');
  const form = document.getElementById('passwordForm');
  const input = document.getElementById('password');
  const openBtn = document.getElementById('openBtn');
  const faceBtn = document.getElementById('faceBtn');
  const say = text => { msg.textContent = text || ''; };
  const toB64 = value => { const bytes=new Uint8Array(value); let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); };
  const fromB64 = value => { const n=String(value||'').replace(/-/g,'+').replace(/_/g,'/'); const s=atob(n+'='.repeat((4-n.length%4)%4)); const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i); return out.buffer; };
  async function fetchJson(url, options={}, timeout=12000) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeout);
    try {
      const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
      const data = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || 'Could not sign in.');
      return data;
    } finally { clearTimeout(timer); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password=input.value;
    if(!password){ input.focus(); return; }
    say(''); openBtn.disabled=true; openBtn.textContent='Opening…';
    try {
      await fetchJson('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      location.replace('/');
    } catch(error) {
      say(error?.name==='AbortError' ? 'Login timed out. Please try again.' : (error.message || 'Could not sign in.'));
      openBtn.disabled=false; openBtn.textContent='Open App'; input.select();
    }
  });
  faceBtn?.addEventListener('click', async () => {
    say(''); faceBtn.disabled=true; const old=faceBtn.innerHTML; faceBtn.textContent='Waiting for Face ID…';
    try {
      if(!window.PublicKeyCredential || !navigator.credentials?.get) throw new Error('Face ID sign-in is not available in this browser. Use your password.');
      const options=await fetchJson('/api/auth/passkey/login/options',{method:'POST'});
      const credential=await navigator.credentials.get({publicKey:{challenge:fromB64(options.challenge),rpId:options.rpId,allowCredentials:(options.allowCredentials||[]).map(item=>({type:'public-key',id:fromB64(item.id),...(item.transports?.length?{transports:item.transports}:{})})),userVerification:'required',timeout:30000}});
      if(!credential) throw new Error('No passkey was selected.');
      await fetchJson('/api/auth/passkey/login/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({state:options.state,credentialId:credential.id,clientDataJSON:toB64(credential.response.clientDataJSON),authenticatorData:toB64(credential.response.authenticatorData),signature:toB64(credential.response.signature),userHandle:credential.response.userHandle?toB64(credential.response.userHandle):null})});
      location.replace('/');
    } catch(error) {
      if(error?.name==='NotAllowedError') say('Face ID was cancelled or unavailable. Use your password below.');
      else if(error?.name==='AbortError') say('Face ID timed out. Use your password below.');
      else say(error.message || 'Face ID could not sign you in. Use your password below.');
      faceBtn.disabled=false; faceBtn.innerHTML=old;
    }
  });
})();
</script>
</body></html>`;

  return new Response(html, {
    headers:{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store, max-age=0',
      'pragma':'no-cache',
      'x-content-type-options':'nosniff',
    },
  });
}
