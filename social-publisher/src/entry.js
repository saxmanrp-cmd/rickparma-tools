import core from './index.js';
import {
  getPasskeyAvailability,
  handlePasskeyRequest,
  isLegacySessionAuthenticated,
} from './passkey-auth.js';
import {
  addThreadsInsightsScope,
  persistThreadsInsightsScope,
} from './threads-insights.js';
import { handleContentPlanRequest } from './content-plan.js';
import { handleSiteCalendarRequest } from './site-calendar.js';
import { handleTextBlastRequest } from './text-blast-bridge.js';
import { renderLoginPage } from './login-page.js';

const VERSION = '0.7.6';
const APP_BOOT = '0765';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

async function requireAppLogin(request, env) {
  const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
  if (!configured) return json({ error:'App login is not configured.' }, { status:503 });
  if (!await isLegacySessionAuthenticated(request, env)) return json({ error:'Authentication required.' }, { status:401 });
  return null;
}

function addFreshAssetVersions(html) {
  const assets = [
    'styles.css', 'app.js', 'reach-intelligence.js', 'passkeys.js', 'smart-plan.js',
    'login-stability.js', 'content-coach.js', 'weekly-planner.js', 'gig-campaign.js',
    'calendar-sync.js', 'easy-mode.js', 'flyer-first.js', 'interaction-recovery.js',
  ];
  for (const asset of assets) {
    html = html.replaceAll(`/${asset}"`, `/${asset}?v=${APP_BOOT}"`);
    html = html.replaceAll(`/${asset}'`, `/${asset}?v=${APP_BOOT}'`);
  }
  return html;
}

function injectBootRecovery(html) {
  const boot = `<script>
  window.__SP_BOOT='${APP_BOOT}';
  window.__SP_BOOT_ERRORS=[];
  (function(){
    try {
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function(items){ items.forEach(function(item){ item.unregister(); }); }).catch(function(){});
      if ('caches' in window) caches.keys().then(function(keys){ return Promise.all(keys.filter(function(k){ return k.indexOf('social-publisher-shell-')===0; }).map(function(k){ return caches.delete(k); })); }).catch(function(){});
    } catch(e) {}
    function showBootError(message){
      window.__SP_BOOT_ERRORS.push(String(message||'Unknown startup error'));
      if (document.getElementById('spBootError')) return;
      var box=document.createElement('div');
      box.id='spBootError';
      box.style.cssText='position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;padding:12px 14px;border-radius:12px;background:#5a1d27;color:#fff;font:600 13px/1.35 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35)';
      box.textContent='Social Publisher had trouble starting. Refresh once. If this stays here, send me a screenshot of this message.';
      document.addEventListener('DOMContentLoaded',function(){ document.body.appendChild(box); },{once:true});
      if (document.body) document.body.appendChild(box);
    }
    window.addEventListener('error',function(e){ showBootError((e&&e.message)||'Script error'); });
    window.addEventListener('unhandledrejection',function(e){ showBootError((e&&e.reason&&e.reason.message)||'Startup promise failed'); });

    document.addEventListener('click',function(e){
      var button=e.target&&e.target.closest&&e.target.closest('.nav-item[data-view]');
      if(!button) return;
      var view=button.getAttribute('data-view');
      var panel=document.getElementById('view-'+view);
      if(!panel) return;
      document.querySelectorAll('.view').forEach(function(el){ el.classList.remove('active'); });
      document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.toggle('active',el===button); });
      panel.classList.add('active');
      var title=document.getElementById('pageTitle');
      var names={create:'New Post',calendar:'Calendar',history:'Posts',media:'Media',settings:'Settings'};
      if(title&&names[view]) title.textContent=names[view];
      window.scrollTo(0,0);
    },true);
  })();
  </script>`;
  return html.includes('</head>') ? html.replace('</head>', `${boot}</head>`) : `${boot}${html}`;
}

function injectInteractionRecovery(html) {
  const tag = `<script src="/interaction-recovery.js?v=${APP_BOOT}"></script>`;
  if (html.includes('/interaction-recovery.js')) return html;
  return html.includes('</body>') ? html.replace('</body>', `${tag}</body>`) : `${html}${tag}`;
}

async function freshAppShell(request, env) {
  const assetResponse = await env.ASSETS.fetch(request);
  if (!assetResponse.ok) return assetResponse;
  const contentType = assetResponse.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return assetResponse;

  let html = await assetResponse.text();
  html = addFreshAssetVersions(html);
  html = injectBootRecovery(html);
  html = injectInteractionRecovery(html);

  const headers = new Headers({
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store, no-cache, must-revalidate, max-age=0',
    'pragma':'no-cache',
    'expires':'0',
    'x-social-publisher-boot':APP_BOOT,
  });
  return new Response(html, { status:assetResponse.status, headers });
}

async function handleAppShell(request, env) {
  const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
  if (configured) {
    const authenticated = await isLegacySessionAuthenticated(request, env);
    if (!authenticated) {
      const passkeyAvailable = await getPasskeyAvailability(env);
      return renderLoginPage({ passkeyAvailable });
    }
  }
  return freshAppShell(request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET') {
      return handleAppShell(request, env);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok:true, service:'social-publisher-v3', version:VERSION, boot:APP_BOOT, time:new Date().toISOString() });
    }

    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
      const authenticated = configured ? await isLegacySessionAuthenticated(request, env) : false;
      const passkeyAvailable = await getPasskeyAvailability(env);
      return json({ configured, authenticated, passkeyAvailable });
    }

    const passkeyResponse = await handlePasskeyRequest(request, env);
    if (passkeyResponse) return passkeyResponse;

    if (url.pathname.startsWith('/api/content-plan')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleContentPlanRequest(request, env);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/site-calendar')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleSiteCalendarRequest(request, env);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/text-blast')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleTextBlastRequest(request, env);
      if (response) return response;
    }

    if (url.pathname === '/api/threads/connect' && request.method === 'GET') {
      const response = await core.fetch(request, env, ctx);
      return addThreadsInsightsScope(response);
    }

    if (url.pathname === '/api/threads/callback' && request.method === 'GET') {
      const response = await core.fetch(request, env, ctx);
      await persistThreadsInsightsScope(response, env).catch(() => false);
      return response;
    }

    return core.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  },
};
