(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function contactById(id) {
    const base = window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id);
    if (!base) return null;
    return { ...base, ...(readState().overrides?.[id] || {}) };
  }

  function routeText(c) {
    return [c?.['Booking / Submission Route'], c?.Category, c?.Notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function isSubmissionRoute(c) {
    const text = routeText(c);
    return /(submission|submit|application|apply|booking form|artist form|artist request|performer form|performer application|talent submission)/i.test(text);
  }

  function isGenericContact(c) {
    const name = String(c?.Contact || '').toLowerCase();
    const role = String(c?.Role || '').toLowerCase();
    return !c?.Contact
      || /(booking|management|department|submission|entertainment|artist relations|talent)/i.test(name)
      || /(general|booking|submission|artist relations|talent|entertainment department)/i.test(role);
  }

  function extractUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s)\]}>"']+/i);
    return match ? match[0].replace(/[.,;]+$/, '') : '';
  }

  function submissionInfo(c) {
    if (!c || !isSubmissionRoute(c)) return null;
    const route = c['Booking / Submission Route'] || '';
    const routeUrl = extractUrl(route);
    const sourceUrl = /^https?:\/\//i.test(String(c['Source URL'] || '')) ? String(c['Source URL']) : '';
    const url = routeUrl || sourceUrl;
    if (!url) return null;

    const directNamedEmail = !!c.Email && !isGenericContact(c);
    const shouldPrefer = !directNamedEmail || !c.Email;
    return {
      url,
      route,
      prefer: shouldPrefer,
      label: /application|apply/i.test(routeText(c)) ? 'Artist Application' : 'Submission Form'
    };
  }

  function campaignStep(id) {
    return Number(readState().campaigns?.[id]?.step || 0);
  }

  function shouldUseSubmission(c) {
    const info = submissionInfo(c);
    if (!info || !info.prefer) return false;
    return campaignStep(c['Contact ID']) === 0;
  }

  function shortSubmissionPitch(c) {
    const assets = window.BookingPitchKit?.selectedAssets?.(c) || [{ label: 'Website', url: 'https://rickparma.com/' }];
    const media = assets.slice(0, 2).map(a => `${a.label}: ${a.url}`).join('\n');
    return `Rick Parma — Las Vegas singer / saxophonist\n\nSolo singer/sax through full band, specializing in R&B, Motown, soul, pop, Top 40 and neo-soul. Extensive Las Vegas casino, lounge and corporate experience, including ARIA and Westgate. Looking for recurring lounge, casino-bar, restaurant and special-event opportunities.\n\n${media}`;
  }

  async function openSubmission(c) {
    const info = submissionInfo(c);
    if (!info) return;
    try {
      await navigator.clipboard.writeText(shortSubmissionPitch(c));
      toast('Submission pitch copied');
    } catch {
      toast('Opening submission form');
    }
    window.open(info.url, '_blank', 'noopener');
  }

  function decorateCards() {
    document.querySelectorAll('[data-view="campaigns"] [data-campaign-id]').forEach(card => {
      const id = card.dataset.campaignId;
      const c = contactById(id);
      if (!c) return;
      const info = submissionInfo(c);
      const use = shouldUseSubmission(c);

      const oldNote = card.querySelector('[data-submission-route]');
      if (!info) {
        oldNote?.remove();
        return;
      }

      let note = oldNote;
      if (!note) {
        note = document.createElement('div');
        note.dataset.submissionRoute = 'true';
        note.className = 'submission-route-note';
        const controls = card.querySelector('.campaign-controls');
        if (controls) controls.before(note); else card.appendChild(note);
      }
      const routeDescription = info.route ? ` • ${info.route}` : '';
      note.innerHTML = `<strong>${escapeHtml(info.label)}</strong><span>Official route available${escapeHtml(routeDescription)}</span>`;

      if (use) {
        const badge = card.querySelector('.campaign-channel');
        if (badge) {
          badge.className = 'campaign-channel channel-submission';
          badge.textContent = 'SUBMIT';
        }
        const action = card.querySelector('[data-action-id]');
        if (action) {
          action.textContent = 'Open Submission';
          action.dataset.submissionAction = 'true';
        }
      }
    });
  }

  function decoratePreview() {
    document.querySelectorAll('.campaign-preview').forEach(preview => {
      if (preview.querySelector('[data-submission-preview]')) return;
      const title = preview.querySelector('h2')?.textContent?.trim();
      if (!title) return;
      const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const target = normalize(title);
      const c = (window.BOOKING_DATA?.contacts || []).find(x => normalize(x.Entity) === target)
        || (window.BOOKING_DATA?.contacts || []).find(x => target.includes(normalize(x.Entity)) || normalize(x.Entity).includes(target));
      if (!c || !shouldUseSubmission(c)) return;
      const info = submissionInfo(c);
      if (!info) return;

      const box = document.createElement('div');
      box.dataset.submissionPreview = 'true';
      box.className = 'submission-preview';
      box.innerHTML = `<strong>Official submission route</strong><span>${escapeHtml(info.route || info.label)}</span><button class="primary" type="button">Copy Pitch & Open Form</button>`;
      box.querySelector('button').onclick = () => openSubmission(c);
      const copy = preview.querySelector('.campaign-copy');
      if (copy) copy.before(box); else preview.appendChild(box);
    });
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  function injectStyles() {
    if (document.querySelector('#submission-channel-styles')) return;
    const style = document.createElement('style');
    style.id = 'submission-channel-styles';
    style.textContent = `
      .channel-submission{color:#d7b8ff;background:rgba(177,125,255,.12)!important}.submission-route-note{display:grid;gap:3px;margin-top:12px;padding:9px 11px;border:1px solid rgba(177,125,255,.22);background:rgba(177,125,255,.06);border-radius:11px;font-size:11px}.submission-route-note strong{color:#d7b8ff}.submission-route-note span{color:var(--muted);line-height:1.4}.submission-preview{display:grid;gap:7px;padding:12px;margin:12px 0;border:1px solid rgba(177,125,255,.24);border-radius:13px;background:rgba(177,125,255,.06)}.submission-preview strong{font-size:12px;color:#d7b8ff}.submission-preview span{color:var(--muted);font-size:12px;line-height:1.4}.submission-preview button{margin-top:4px}`;
    document.head.appendChild(style);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action-id]');
    if (!btn) return;
    const c = contactById(btn.dataset.actionId);
    if (!c || !shouldUseSubmission(c)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openSubmission(c);
  }, true);

  injectStyles();
  const observer = new MutationObserver(() => {
    decorateCards();
    decoratePreview();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => {
    decorateCards();
    decoratePreview();
  }, 0);

  window.BookingSubmissionChannel = { submissionInfo, shouldUseSubmission, shortSubmissionPitch };
})();
