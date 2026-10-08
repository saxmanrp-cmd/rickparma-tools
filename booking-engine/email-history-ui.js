(() => {
  'use strict';

  function esc(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  async function api(path) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected.');
    return window.BookingCloud.api(path);
  }

  function looksLikeBounce(message) {
    const text = [message?.subject,message?.body].filter(Boolean).join('\n');
    return /(undeliverable|delivery has failed|delivery status notification|couldn['’]?t be delivered|unknown to address|recipient address rejected|mail delivery failed|failure notice)/i.test(text);
  }

  function time(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  async function render() {
    const home = document.querySelector('[data-view="dashboard"]');
    if (!home) return;

    let host = home.querySelector('[data-email-history-home]');
    if (!host) {
      host = document.createElement('section');
      host.className = 'email-history-home';
      host.dataset.emailHistoryHome = 'true';
      const needs = home.querySelector('[data-needs-rick-inbox]');
      const agent = home.querySelector('[data-agent-home]');
      if (needs) needs.after(host);
      else if (agent) agent.after(host);
      else home.appendChild(host);
    }

    try {
      const [messagesData, prospectsData] = await Promise.all([
        api('/api/messages?limit=80'),
        api('/api/prospects?limit=500')
      ]);
      const prospects = new Map((prospectsData.prospects || []).map(p => [p.id,p]));
      const messages = (messagesData.messages || []).filter(m => m.channel === 'email').slice(0,16);

      host.innerHTML = `
        <div class="email-home-head">
          <div><div class="eyebrow">EMAIL</div><strong>Booking Messages</strong></div>
          <span>${messages.length}</span>
        </div>
        ${messages.length ? `<div class="email-home-list">${messages.map(m => {
          const p = prospects.get(m.contactId);
          const bounce = looksLikeBounce(m);
          const peer = m.direction === 'inbound' ? (m.sender || '') : (m.recipient || '');
          const stamp = m.receivedAt || m.sentAt || m.createdAt;
          return `
            <details class="email-home-item ${bounce ? 'bounce' : ''}">
              <summary>
                <div>
                  <strong>${esc(bounce ? 'Undeliverable' : (m.subject || '(No subject)'))}</strong>
                  <span>${esc(p?.entity || peer || 'Booking email')} • ${m.direction === 'inbound' ? 'Received' : 'Sent'}</span>
                </div>
                <time>${esc(time(stamp))}</time>
              </summary>
              <div class="email-home-body">
                <div class="email-home-meta">${esc(peer)}</div>
                <pre>${esc(m.body || 'No message body.')}</pre>
              </div>
            </details>`;
        }).join('')}</div>` : '<div class="email-home-empty">No booking emails yet.</div>'}
      `;
    } catch (error) {
      host.innerHTML = '';
    }
  }

  function styles() {
    if (document.querySelector('#email-history-home-styles')) return;
    const style = document.createElement('style');
    style.id = 'email-history-home-styles';
    style.textContent = `
      .email-history-home{border:1px solid var(--line);border-radius:20px;background:var(--surface);padding:15px;margin:12px 0}.email-home-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.email-home-head strong{font-size:18px}.email-home-head>span{padding:4px 8px;border-radius:999px;background:var(--surface-3);font-size:10px;color:var(--muted)}.email-home-list{display:grid;gap:8px;margin-top:12px}.email-home-item{border:1px solid var(--line);border-radius:13px;background:var(--surface-2);overflow:hidden}.email-home-item.bounce{border-color:rgba(240,122,131,.42)}.email-home-item summary{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:11px;cursor:pointer;list-style:none}.email-home-item summary::-webkit-details-marker{display:none}.email-home-item summary strong{display:block;font-size:12px}.email-home-item summary span{display:block;color:var(--muted);font-size:9px;margin-top:3px}.email-home-item summary time{font-size:9px;color:var(--muted);white-space:nowrap}.email-home-body{border-top:1px solid var(--line);padding:11px}.email-home-meta{font-size:9px;color:var(--muted);margin-bottom:8px}.email-home-body pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:11px;line-height:1.5;margin:0;color:#d8dee8;max-height:340px;overflow:auto}.email-home-empty{color:var(--muted);font-size:11px;padding:16px 0 2px}
    `;
    document.head.appendChild(style);
  }

  styles();
  window.addEventListener('load', () => setTimeout(render, 2200));
  window.addEventListener('booking-agent-refresh', render);
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-view="dashboard"].active') && !document.querySelector('[data-email-history-home]')) render();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();