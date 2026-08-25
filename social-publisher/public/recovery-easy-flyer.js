// Recovery Stage 3: restore the beginner-friendly, flyer-first UI without booting the old feature chain.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function injectStyles() {
    if (q('#recoveryEasyFlyerStyles')) return;
    const style = document.createElement('style');
    style.id = 'recoveryEasyFlyerStyles';
    style.textContent = `
      body.recovery-easy{font-size:16px}
      body.recovery-easy .main{padding-bottom:112px}
      body.recovery-easy .card{border-radius:18px}
      body.recovery-easy .button{min-height:48px;border-radius:14px;font-size:15px;font-weight:850}
      body.recovery-easy input,body.recovery-easy textarea,body.recovery-easy select{font-size:16px}
      body.recovery-easy .section-label{font-size:16px;letter-spacing:0;text-transform:none;font-weight:850;color:#eef2f8}
      body.recovery-easy .easy-hero{display:flex;align-items:center;gap:13px;padding:16px;margin-bottom:14px;border:1px solid rgba(145,116,255,.32);border-radius:18px;background:linear-gradient(135deg,#17122b,#111925 58%,#10131a)}
      body.recovery-easy .easy-hero-emoji{width:48px;height:48px;display:grid;place-items:center;flex:0 0 48px;border-radius:15px;background:linear-gradient(135deg,#6c58e8,#d26dff);font-size:25px}
      body.recovery-easy .easy-hero strong{display:block;font-size:19px;line-height:1.2}
      body.recovery-easy .easy-hero span{display:block;margin-top:4px;color:#aeb8c7;font-size:14px;line-height:1.4}
      body.recovery-easy .easy-step-label{display:flex;align-items:center;gap:9px;margin:4px 2px 9px;font-size:16px;font-weight:850}
      body.recovery-easy .easy-step-label b{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#6d5bea;color:#fff;font-size:14px}
      body.recovery-easy #dropZone{min-height:155px;border-radius:18px;border-width:2px}
      body.recovery-easy #uploadPrompt strong{font-size:17px}
      body.recovery-easy #easyUploadHelp{display:block;margin-top:6px;color:#8f99a8;font-size:13px;font-weight:600}
      body.recovery-easy .caption-topline label{font-size:16px;font-weight:850}
      body.recovery-easy #caption{min-height:130px;line-height:1.45}
      body.recovery-easy .platform-chip{min-height:66px;border-radius:14px;padding:10px 8px;font-size:13px}
      body.recovery-easy .easy-more{margin-top:12px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.recovery-easy .easy-more>summary{list-style:none;cursor:pointer;padding:10px 12px;border-radius:12px;background:#0b1017;color:#bcc5d2;font-size:14px;font-weight:800}
      body.recovery-easy .easy-more>summary::-webkit-details-marker{display:none}
      body.recovery-easy .easy-more>summary::after{content:'＋';float:right;color:#9d8cff}
      body.recovery-easy .easy-more[open]>summary::after{content:'−'}
      body.recovery-easy #view-calendar .page-row h2{font-size:24px}
      body.recovery-easy .easy-calendar-intro{margin:-2px 2px 14px;color:#aeb8c7;font-size:14px;line-height:1.4}
      body.recovery-easy #view-calendar .card{padding:16px;margin-bottom:14px}
      body.recovery-easy .gig-campaign-head{display:none!important}
      body.recovery-easy .calendar-sync{border:0!important;margin:0!important;padding:0!important}
      body.recovery-easy .calendar-sync-head strong{font-size:19px!important}
      body.recovery-easy .calendar-sync-head span{font-size:13px!important;line-height:1.35!important;color:#aeb8c7!important}
      body.recovery-easy .calendar-sync-live{display:none!important}
      body.recovery-easy .calendar-sync-event{grid-template-columns:76px 1fr!important;gap:12px!important;padding:11px!important;border-radius:15px!important;background:#0b1119!important}
      body.recovery-easy .calendar-sync-thumb{width:76px!important;height:76px!important;border-radius:12px!important}
      body.recovery-easy .calendar-sync-copy strong{font-size:16px!important;line-height:1.25!important}
      body.recovery-easy .calendar-sync-copy small{font-size:13px!important}
      body.recovery-easy .calendar-sync-copy p{font-size:12px!important;line-height:1.3!important}
      body.recovery-easy .calendar-sync-controls{grid-template-columns:1fr!important}
      body.recovery-easy .calendar-sync-action{width:100%!important;min-height:48px!important;font-size:15px!important}
      body.recovery-easy .calendar-sync-select{min-height:48px!important;font-size:15px!important}
      body.recovery-easy .easy-manual-show{margin-top:14px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.recovery-easy .easy-manual-show>summary{list-style:none;cursor:pointer;padding:12px 13px;border-radius:12px;background:#17120f;color:#ffc08c;font-size:14px;font-weight:850}
      body.recovery-easy .easy-manual-show>summary::-webkit-details-marker{display:none}
      body.recovery-easy .easy-manual-show>summary::after{content:'＋';float:right}
      body.recovery-easy .easy-manual-show[open]>summary::after{content:'−'}
      body.recovery-easy .gig-phase-picker{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px}
      body.recovery-easy .gig-phase-select{min-height:48px;border-radius:12px;background:#101722;border:1px solid rgba(255,255,255,.11);color:#eef2f8;padding:0 11px;font-size:15px}
      body.recovery-easy .gig-phase.is-picker-hidden{display:none!important}
      body.recovery-easy .gig-group{padding:12px!important;border-radius:14px!important}
      body.recovery-easy .gig-group-head strong{font-size:16px!important}
      body.recovery-easy .gig-group-head small,body.recovery-easy .gig-phase p{display:none!important}
      body.recovery-easy .gig-phase strong{font-size:14px!important}
      body.recovery-easy .gig-phase-time{font-size:12px!important}
      body.recovery-easy .gig-phase-actions button{font-size:13px!important;min-height:44px!important;padding:9px 11px!important}
      body.recovery-easy #maxReachCard{padding:16px}
      body.recovery-easy #reachIntelligence .reach-intel-grid{grid-template-columns:1fr}
      @media(max-width:390px){body.recovery-easy .platform-row-four{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function simplifyCreate() {
    const composer = q('#view-create .composer');
    if (!composer) return;
    if (!q('#easyCreateIntro')) {
      const intro = document.createElement('div');
      intro.id = 'easyCreateIntro';
      intro.className = 'easy-hero';
      intro.innerHTML = '<div class="easy-hero-emoji">🎉</div><div><strong>Let’s make a post</strong><span>Choose your flyer, photo, or video. I’ll help with the rest.</span></div>';
      composer.insertBefore(intro, composer.firstChild);
    }
    const drop = q('#dropZone');
    if (drop && !q('#easyMediaStep')) {
      const step = document.createElement('div');
      step.id = 'easyMediaStep';
      step.className = 'easy-step-label';
      step.innerHTML = '<b>1</b><span>Choose your flyer, photo, or video</span>';
      drop.parentNode.insertBefore(step, drop);
    }
    setText(q('#uploadPrompt strong'), 'Choose From Your Phone');
    if (q('#uploadPrompt') && !q('#easyUploadHelp')) {
      const help = document.createElement('span');
      help.id = 'easyUploadHelp';
      help.textContent = 'Your event flyer is perfect here';
      q('#uploadPrompt').appendChild(help);
    }
    const captionCard = q('#caption')?.closest('.card');
    setText(captionCard?.querySelector('.caption-topline label'), '2 · What should the post say?');
    setText(q('#insertTemplateBtn'), 'Use Show Caption');
    const platformCard = q('.platform-row')?.closest('.card');
    setText(platformCard?.querySelector(':scope > .section-label'), '3 · Where should it go?');
    const timingCard = q('.timing-segmented')?.closest('.card');
    setText(timingCard?.querySelector(':scope > .section-label'), '4 · Post now or later?');
    setText(q('.timing-segmented input[value="schedule"]')?.closest('.segment')?.querySelector('span'), 'Later');

    if (platformCard && !q('#easyMoreOptions')) {
      const nodes = ['#instagramTypeWrap','#facebookTypeWrap','#instagramReelAudioWrap','#instagramPeopleWrap'].map(s => q(s)).filter(Boolean);
      if (nodes.length) {
        const details = document.createElement('details');
        details.id = 'easyMoreOptions';
        details.className = 'easy-more';
        const summary = document.createElement('summary');
        summary.textContent = 'More options · Reels, Stories, Tags';
        details.appendChild(summary);
        nodes[0].parentNode.insertBefore(details,nodes[0]);
        nodes.forEach(node => details.appendChild(node));
      }
    }
  }

  function simplifyCalendar() {
    const view = q('#view-calendar');
    const row = view?.querySelector('.page-row');
    if (row) setText(row.querySelector('h2'),'My Shows & Posts');
    if (row && !q('#easyCalendarIntro')) {
      const intro = document.createElement('div');
      intro.id = 'easyCalendarIntro';
      intro.className = 'easy-calendar-intro';
      intro.textContent = 'Your show dates and flyers come first. Pick a show, choose the kind of post, and go.';
      row.after(intro);
    }
    const sync = q('#calendarSync');
    if (sync) {
      setText(q('.calendar-sync-head strong',sync),'Your Upcoming Shows 🎤');
      setText(q('.calendar-sync-head span',sync),'Choose a show and use the flyer you already made.');
      setText(q('#calendarSyncRefresh'),'↻ Refresh Shows');
    }
    const campaign = q('#gigCampaign');
    const form = campaign?.querySelector(':scope > .gig-campaign-form');
    if (campaign && q('#calendarSync') && form && !q('#easyManualShow')) {
      const details = document.createElement('details');
      details.id = 'easyManualShow';
      details.className = 'easy-manual-show';
      const summary = document.createElement('summary');
      summary.textContent = 'Add a show that is not on my calendar';
      details.appendChild(summary);
      campaign.insertBefore(details,form);
      details.appendChild(form);
      setText(q('#buildGigCampaignBtn'),'Make Promo Posts ✨');
    }
    qa('[data-start-gig-item]').forEach(btn => setText(btn,'Make This Post'));
    qa('[data-done-gig-item]').forEach(btn => setText(btn,'Done ✓'));
    qa('[data-hide-campaign]').forEach(btn => setText(btn,'Remove'));
  }

  function simplifyCampaignGroups() {
    qa('.gig-group').forEach(group => {
      if (q('.gig-phase-picker',group)) return;
      const phases = qa('.gig-phase',group);
      if (phases.length < 2) return;
      const picker = document.createElement('div');
      picker.className = 'gig-phase-picker';
      const select = document.createElement('select');
      select.className = 'gig-phase-select';
      select.setAttribute('aria-label','Choose promo update');
      phases.forEach((phase,index) => {
        const title = q('.gig-phase-top strong',phase)?.textContent?.trim() || `Update ${index+1}`;
        const time = q('.gig-phase-time',phase)?.textContent?.trim() || '';
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = time ? `${title} · ${time}` : title;
        select.appendChild(option);
        phase.classList.toggle('is-picker-hidden',index !== 0);
      });
      const show = () => {
        const chosen = Number(select.value || 0);
        phases.forEach((phase,index) => phase.classList.toggle('is-picker-hidden',index !== chosen));
      };
      select.addEventListener('change',show);
      picker.appendChild(select);
      const head = q('.gig-group-head',group);
      if (head?.nextSibling) group.insertBefore(picker,head.nextSibling); else group.appendChild(picker);
    });
  }

  function apply() {
    document.body.classList.add('recovery-easy');
    injectStyles();
    simplifyCreate();
    simplifyCalendar();
    simplifyCampaignGroups();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Recovery Stage 3';
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };
  apply();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  q('.nav-item[data-view="calendar"]')?.addEventListener('click',() => setTimeout(schedule,120));
  window.addEventListener('focus',schedule);

  // Load the small readability/layout polish layer only after the proven working Stage 3 UI is active.
  if (!document.querySelector('script[data-stage3-ui-polish]')) {
    const polish = document.createElement('script');
    polish.src = '/stage3-ui-polish.js';
    polish.dataset.stage3UiPolish = '1';
    document.body.appendChild(polish);
  }
})();
