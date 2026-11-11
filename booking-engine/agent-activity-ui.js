(() => {
  'use strict';

  function esc(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  async function api(path) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected.');
    return window.BookingCloud.api(path);
  }

  const EVENT_LABELS = {
    autopilot_initial_sent: 'Sent first outreach',
    autopilot_followup_sent: 'Sent follow-up',
    autopilot_shadow_draft: 'Prepared shadow draft',
    autopilot_reply_sent: 'Replied automatically',
    autopilot_escalation_created: 'Needs Rick',
    autopilot_opt_out: 'Stopped — opt out',
    autopilot_grouped_recipient: 'Grouped duplicate buyer',
    message_received: 'Received reply'
  };

  function formatTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function statusClass(status) {
    const s = String(status || '').toLowerCase();
    if (/replied|booked|contacted/.test(s)) return 'agent-radar-good';
    if (/pass|do not contact|invalid/.test(s)) return 'agent-radar-stop';
    if (/discovered|research|manual|submission/.test(s)) return 'agent-radar-warn';
    return '';
  }

  async function render() {
    const campaigns = document.querySelector('[data-view="campaigns"]');
    if (!campaigns) return;
    let panel = campaigns.querySelector('[data-agent-activity]');
    if (!panel) {
      panel = document.createElement('div');
      panel.dataset.agentActivity = 'true';
      panel.className = 'agent-activity-wrap';
      const review = campaigns.querySelector('[data-agent-review]');
      if (review) review.after(panel);
      else {
        const list = campaigns.querySelector('#campaignList');
        if (list) list.before(panel); else campaigns.appendChild(panel);
      }
    }

    try {
      const [eventsData, prospectsData] = await Promise.all([
        api('/api/events?limit=20'),
        api('/api/prospects?limit=14')
      ]);
      const events = eventsData.events || [];
      const prospects = prospectsData.prospects || [];
      panel.innerHTML = `
        <section class="agent-activity-card">
          <div class="agent-activity-head"><div><div class="eyebrow">AUTONOMOUS LOG</div><strong>Agent Activity</strong></div><span>${events.length}</span></div>
          ${events.length ? `<div class="agent-timeline">${events.slice(0,12).map(e => {
            const payload = e.payload || {};
            const detail = payload.category || payload.purpose || payload.recipient || '';
            return `<div class="agent-timeline-row"><div class="agent-timeline-dot"></div><div><strong>${esc(EVENT_LABELS[e.eventType] || e.eventType)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div><time>${esc(formatTime(e.createdAt))}</time></div>`;
          }).join('')}</div>` : '<div class="agent-activity-empty">No autonomous activity yet.</div>'}
        </section>
        <section class="agent-activity-card">
          <div class="agent-activity-head"><div><div class="eyebrow">CURRENT RESEARCH</div><strong>Prospect Radar</strong></div><span>${prospects.length}</span></div>
          ${prospects.length ? `<div class="agent-radar">${prospects.slice(0,10).map(p => `<div class="agent-radar-row"><div><strong>${esc(p.entity)}</strong><span>${esc([p.contact_name,p.contact_role].filter(Boolean).join(' • ') || p.room || p.profile)}</span></div><div class="agent-radar-score"><b>${Number(p.fit_score || 0)}</b><span class="${statusClass(p.status)}">${esc(p.status || p.automation_safe)}</span></div></div>`).join('')}</div>` : '<div class="agent-activity-empty">No server-side prospects yet.</div>'}
        </section>`;
    } catch {
      panel.innerHTML = '';
    }
  }

  function injectStyles() {
    if (document.querySelector('#agent-activity-styles')) return;
    const style = document.createElement('style');
    style.id = 'agent-activity-styles';
    style.textContent = `
      .agent-activity-wrap{display:grid;gap:12px;margin:12px 0}.agent-activity-card{border:1px solid var(--line);border-radius:18px;background:var(--surface);padding:15px}.agent-activity-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.agent-activity-head strong{font-size:17px}.agent-activity-head>span{padding:4px 7px;border-radius:999px;background:var(--surface-3);color:var(--muted);font-size:10px}.agent-timeline{margin-top:10px}.agent-timeline-row{display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:start;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}.agent-timeline-dot{width:7px;height:7px;border-radius:50%;background:#8ea8d8;margin-top:4px}.agent-timeline-row strong{display:block;font-size:11px}.agent-timeline-row span{display:block;color:var(--muted);font-size:10px;margin-top:2px}.agent-timeline-row time{font-size:9px;color:var(--muted);white-space:nowrap}.agent-radar{margin-top:9px}.agent-radar-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.05)}.agent-radar-row strong{display:block;font-size:12px}.agent-radar-row>div>span{display:block;color:var(--muted);font-size:10px;margin-top:2px}.agent-radar-score{text-align:right;flex:0 0 auto}.agent-radar-score b{display:block;font-size:14px}.agent-radar-score span{font-size:9px!important}.agent-radar-good{color:#8ce1b2!important}.agent-radar-warn{color:#ffd37f!important}.agent-radar-stop{color:#ff9b9b!important}.agent-activity-empty{padding:16px 0 4px;color:var(--muted);font-size:11px}`;
    document.head.appendChild(style);
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-view="campaigns"].active') && !document.querySelector('[data-agent-activity]')) render();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  window.addEventListener('load', () => setTimeout(render, 1800));
  window.addEventListener('booking-agent-refresh', render);
})();
