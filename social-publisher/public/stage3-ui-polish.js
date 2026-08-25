// Stage 3 UI polish: keep the proven working feature set, but make Create and Calendar much easier to read.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function esc(value='') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function injectStyles() {
    if (q('#stage3UiPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'stage3UiPolishStyles';
    style.textContent = `
      body.recovery-easy .field-hint,
      body.recovery-easy .micro-hint,
      body.recovery-easy .audio-meta-row,
      body.recovery-easy .char-count{font-size:14px!important;line-height:1.45!important}
      body.recovery-easy .bottom-nav .nav-item small{font-size:13px!important;font-weight:800!important}
      body.recovery-easy .bottom-nav .nav-item span{font-size:23px!important}

      /* Max Reach should read like help, not an analytics console. */
      body.recovery-easy #maxReachCard{padding:17px!important;border-color:rgba(145,116,255,.28)!important;background:linear-gradient(145deg,#171329,#101723 58%,#10131a)!important}
      body.recovery-easy #maxReachCard .max-reach-head{align-items:flex-start!important}
      body.recovery-easy #maxReachCard .max-reach-badge,
      body.recovery-easy #maxReachDetails,
      body.recovery-easy #reachFitScore,
      body.recovery-easy #reachPersonalizedSummary,
      body.recovery-easy #reachLearningNote,
      body.recovery-easy #reachIntelligence .reach-intel-head span,
      body.recovery-easy #reachIntelligence .reach-intel-tip small{display:none!important}
      body.recovery-easy #maxReachCard .max-reach-head .section-label{font-size:20px!important;line-height:1.2!important}
      body.recovery-easy #maxReachCard .max-reach-head .field-hint{font-size:15px!important;line-height:1.45!important;color:#b8c1cf!important;margin-top:6px!important}
      body.recovery-easy #maxReachSummary{font-size:16px!important;line-height:1.45!important;color:#f1f3f7!important;margin:13px 0!important}
      body.recovery-easy #reachIntelligence{margin-top:12px!important}
      body.recovery-easy #reachIntelligence .reach-intel-head strong{font-size:18px!important}
      body.recovery-easy #reachIntelligence .reach-intel-grid{grid-template-columns:1fr!important;gap:10px!important}
      body.recovery-easy #reachIntelligence .reach-intel-tip{padding:12px!important;border-radius:13px!important}
      body.recovery-easy #reachIntelligence .reach-intel-tip strong{font-size:16px!important;line-height:1.3!important}
      body.recovery-easy #reachIntelligence .reach-intel-tip p{font-size:15px!important;line-height:1.45!important;margin-top:5px!important}
      body.recovery-easy #reachIntelligence .reach-intel-actions{grid-template-columns:1fr!important;gap:9px!important}
      body.recovery-easy #reachIntelligence .reach-intel-actions button,
      body.recovery-easy #applyMaxReachBtn{font-size:16px!important;min-height:50px!important}

      /* Calendar: one simple dropdown of event names, then only the selected show's flyer/action. */
      body.recovery-easy #view-calendar{padding-bottom:28px}
      body.recovery-easy #view-calendar>.page-row{margin-bottom:10px}
      body.recovery-easy #view-calendar>.page-row h2{font-size:28px!important;line-height:1.15!important}
      body.recovery-easy .easy-calendar-intro{display:none!important}
      body.recovery-easy #gigCampaign.card{padding:0!important;margin:0 0 14px!important;border:0!important;background:transparent!important;box-shadow:none!important}
      body.recovery-easy #calendarSync{padding:0!important;margin:0!important;border:0!important}
      body.recovery-easy .calendar-sync-head{display:none!important}
      body.recovery-easy .show-date-picker{margin:0 0 14px;padding:16px;border-radius:17px;background:#111827;border:1px solid rgba(145,116,255,.28)}
      body.recovery-easy .show-date-picker label{display:block;font-size:19px;font-weight:900;color:#f4f5f8;margin-bottom:10px}
      body.recovery-easy .show-date-picker select{width:100%;min-height:60px;border-radius:14px;background:#0a1019;border:1px solid rgba(255,255,255,.14);color:#fff;padding:0 14px;font-size:19px!important;font-weight:800}
      body.recovery-easy .calendar-sync-list{display:block!important;margin:0!important}
      body.recovery-easy .calendar-sync-event{display:none!important;grid-template-columns:96px minmax(0,1fr)!important;gap:14px!important;padding:14px!important;border-radius:17px!important;background:#0b1119!important;border:1px solid rgba(255,255,255,.07)!important;box-shadow:none!important}
      body.recovery-easy .calendar-sync-event.is-selected-show{display:grid!important}
      body.recovery-easy .calendar-sync-thumb{width:96px!important;height:122px!important;border-radius:13px!important;background:#141b25!important;align-self:start!important}
      body.recovery-easy .calendar-sync-thumb img,
      body.recovery-easy .calendar-sync-thumb video{width:100%!important;height:100%!important;object-fit:cover!important}
      body.recovery-easy .calendar-sync-copy strong{font-size:20px!important;line-height:1.25!important;white-space:normal!important}
      body.recovery-easy .calendar-sync-copy small{display:block!important;font-size:16px!important;line-height:1.35!important;margin-top:7px!important;color:#ffbd84!important}
      body.recovery-easy .calendar-sync-copy p{font-size:16px!important;line-height:1.4!important;margin-top:8px!important;color:#aeb8c7!important;white-space:normal!important}
      body.recovery-easy .calendar-sync-flyer-note{display:none!important}
      body.recovery-easy .calendar-sync-controls{grid-column:1/-1!important;display:grid!important;grid-template-columns:1fr!important;gap:10px!important;margin-top:2px!important}
      body.recovery-easy .calendar-sync-select{min-height:54px!important;border-radius:14px!important;font-size:18px!important;padding:0 13px!important}
      body.recovery-easy .calendar-sync-action{min-height:56px!important;border-radius:14px!important;font-size:18px!important;width:100%!important}
      body.recovery-easy .calendar-sync-refresh{font-size:15px!important;min-height:42px!important;padding:8px 3px!important;margin:8px 0 0!important}
      body.recovery-easy .calendar-sync-empty{font-size:17px!important;line-height:1.45!important}

      /* Everything secondary is collapsed so Calendar stays about the selected event. */
      body.recovery-easy .easy-manual-show{margin-top:14px!important;padding-top:10px!important}
      body.recovery-easy .easy-manual-show>summary{font-size:16px!important;line-height:1.3!important;padding:14px!important}
      body.recovery-easy .saved-promo-plans{margin-top:12px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.recovery-easy .saved-promo-plans>summary{list-style:none;cursor:pointer;padding:13px;border-radius:13px;background:#101620;color:#c7ced8;font-size:16px;font-weight:800}
      body.recovery-easy .saved-promo-plans>summary::-webkit-details-marker{display:none}
      body.recovery-easy .saved-promo-plans>summary::after{content:'＋';float:right;color:#9d8cff}
      body.recovery-easy .saved-promo-plans[open]>summary::after{content:'−'}
      body.recovery-easy .saved-promo-plans .gig-campaign-list{margin-top:10px!important}
      body.recovery-easy .gig-group{padding:14px!important;border-radius:15px!important;background:#0b1119!important}
      body.recovery-easy .gig-group-head strong{font-size:18px!important}
      body.recovery-easy .gig-group-hide{font-size:14px!important;padding:7px!important}
      body.recovery-easy .gig-phase-select{font-size:16px!important;min-height:50px!important}
      body.recovery-easy .gig-phase strong{font-size:16px!important}
      body.recovery-easy .gig-phase-time{font-size:15px!important}
      body.recovery-easy .gig-phase-actions button{font-size:15px!important;min-height:48px!important}

      body.recovery-easy .scheduled-posts-details{margin:14px 0 0;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.recovery-easy .scheduled-posts-details>summary{list-style:none;cursor:pointer;padding:13px;border-radius:13px;background:#0d131c;color:#c4cbd6;font-size:16px;font-weight:800}
      body.recovery-easy .scheduled-posts-details>summary::-webkit-details-marker{display:none}
      body.recovery-easy .scheduled-posts-details>summary::after{content:'＋';float:right;color:#8f99a8}
      body.recovery-easy .scheduled-posts-details[open]>summary::after{content:'−'}
      body.recovery-easy .scheduled-posts-details.is-empty{display:none!important}
      body.recovery-easy .scheduled-posts-details #calendarContent{margin-top:10px}

      @media(max-width:390px){
        body.recovery-easy .calendar-sync-event{grid-template-columns:84px minmax(0,1fr)!important;padding:12px!important;gap:11px!important}
        body.recovery-easy .calendar-sync-thumb{width:84px!important;height:108px!important}
        body.recovery-easy .calendar-sync-copy strong{font-size:19px!important}
        body.recovery-easy .calendar-sync-copy p{font-size:15px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function simplifyMaxReach() {
    setText(q('#maxReachCard .max-reach-head .section-label'), 'Help Me Get More Views ✨');
    setText(q('#maxReachCard .max-reach-head .field-hint'), 'After you choose your flyer, photo, or video, I’ll suggest the best way and time to post it.');
    const summary = q('#maxReachSummary');
    if (summary && /add a photo or video/i.test(summary.textContent || '')) {
      summary.textContent = 'Choose your media first — I’ll handle the recommendations after that.';
    }
    setText(q('#applyMaxReachBtn'), 'Use My Best Setup');
    setText(q('#reachIntelligence .reach-intel-head strong'), 'My Suggestions');
    setText(q('#useReachTimeBtn'), 'Use This Time');
    setText(q('#useReachCaptionBtn'), 'Use This Caption');
  }

  function simplifyCalendarTitle() {
    const view = q('#view-calendar');
    const row = view?.querySelector(':scope > .page-row');
    setText(row?.querySelector('h2'), 'Calendar');
    setText(q('#calendarSyncRefresh'), '↻ Refresh Events');
  }

  function dateOnlyLabel(raw='') {
    const text = String(raw).trim();
    return text.split(/\s+at\s+/i)[0] || text;
  }

  function buildShowDateDropdown() {
    const list = q('#calendarSyncList');
    if (!list) return;
    const cards = qa('.calendar-sync-event', list);
    if (!cards.length) {
      q('#showDatePickerWrap')?.remove();
      return;
    }

    q('#showMoreGigsBtn')?.remove();

    let wrap = q('#showDatePickerWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'showDatePickerWrap';
      wrap.className = 'show-date-picker';
      wrap.innerHTML = '<label for="showDatePicker">Choose an event</label><select id="showDatePicker" aria-label="Choose an event"></select>';
      list.parentNode.insertBefore(wrap, list);
    }

    const select = q('#showDatePicker');
    if (!select) return;
    const baseChoices = cards.map((card, index) => ({
      index,
      date: dateOnlyLabel(q('.calendar-sync-copy small', card)?.textContent || `Show ${index + 1}`),
      title: String(q('.calendar-sync-copy strong', card)?.textContent || '').trim() || `Show ${index + 1}`,
    }));
    const counts = baseChoices.reduce((map, choice) => {
      const key = choice.title.toLowerCase();
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const choices = baseChoices.map(choice => ({
      ...choice,
      label: counts[choice.title.toLowerCase()] > 1 ? `${choice.title} — ${choice.date}` : choice.title,
    }));
    const signature = choices.map(choice => choice.label).join('|');
    const oldValue = select.value;
    if (select.dataset.signature !== signature) {
      select.innerHTML = choices.map(choice => `<option value="${choice.index}">${esc(choice.label)}</option>`).join('');
      select.dataset.signature = signature;
      if (choices.some(choice => String(choice.index) === oldValue)) select.value = oldValue;
      else select.value = '0';
    }

    const showSelected = () => {
      const currentCards = qa('.calendar-sync-event', q('#calendarSyncList'));
      const selected = Number(select.value || 0);
      currentCards.forEach((card, index) => card.classList.toggle('is-selected-show', index === selected));
    };
    select.onchange = showSelected;
    showSelected();
  }

  function wrapSavedPromoPlans() {
    const list = q('#gigCampaignList');
    if (!list || list.closest('#savedPromoPlans')) return;
    const details = document.createElement('details');
    details.id = 'savedPromoPlans';
    details.className = 'saved-promo-plans';
    const summary = document.createElement('summary');
    summary.textContent = 'More Promo Plans';
    details.appendChild(summary);
    list.parentNode.insertBefore(details, list);
    details.appendChild(list);
  }

  function wrapScheduledPosts() {
    const content = q('#calendarContent');
    if (!content) return;
    let details = content.closest('#scheduledPostsDetails');
    if (!details) {
      details = document.createElement('details');
      details.id = 'scheduledPostsDetails';
      details.className = 'scheduled-posts-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Scheduled Posts';
      details.appendChild(summary);
      content.parentNode.insertBefore(details, content);
      details.appendChild(content);
    }
    const text = String(content.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const empty = !text || text === 'nothing scheduled' || text.includes('nothing scheduled');
    details.classList.toggle('is-empty', empty);
  }

  function apply() {
    injectStyles();
    simplifyMaxReach();
    simplifyCalendarTitle();
    buildShowDateDropdown();
    wrapSavedPromoPlans();
    wrapScheduledPosts();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Event Name Calendar';
  }

  apply();
  [250, 700, 1400, 2800].forEach(delay => setTimeout(apply, delay));
  q('.nav-item[data-view="calendar"]')?.addEventListener('click', () => {
    setTimeout(apply, 80);
    setTimeout(apply, 450);
  });
})();
