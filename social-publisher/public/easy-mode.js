// v0.7.5 Easy Mode makes Create and Calendar beginner-friendly without removing power-user features.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function injectStyles() {
    if (q('#easyModeStyles')) return;
    const style = document.createElement('style');
    style.id = 'easyModeStyles';
    style.textContent = `
      body.easy-mode{font-size:16px}
      body.easy-mode .main{padding-bottom:112px}
      body.easy-mode .card{border-radius:18px}
      body.easy-mode .button{min-height:48px;border-radius:14px;font-size:15px;font-weight:850;letter-spacing:0}
      body.easy-mode .text-button{font-size:14px}
      body.easy-mode input,body.easy-mode textarea{font-size:16px}
      body.easy-mode .section-label{font-size:16px;letter-spacing:0;text-transform:none;font-weight:850;color:#eef2f8}
      body.easy-mode .small-label{font-size:15px}
      body.easy-mode .easy-hero{display:flex;align-items:center;gap:13px;padding:16px 16px 15px;margin-bottom:14px;border:1px solid rgba(145,116,255,.32);border-radius:18px;background:linear-gradient(135deg,#17122b,#111925 58%,#10131a)}
      body.easy-mode .easy-hero-emoji{width:48px;height:48px;display:grid;place-items:center;flex:0 0 48px;border-radius:15px;background:linear-gradient(135deg,#6c58e8,#d26dff);font-size:25px;box-shadow:0 8px 24px rgba(105,79,226,.28)}
      body.easy-mode .easy-hero strong{display:block;font-size:19px;line-height:1.2}
      body.easy-mode .easy-hero span{display:block;margin-top:4px;color:#aeb8c7;font-size:14px;line-height:1.4}
      body.easy-mode .easy-step-label{display:flex;align-items:center;gap:9px;margin:4px 2px 9px;font-size:16px;font-weight:850}
      body.easy-mode .easy-step-label b{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#6d5bea;color:white;font-size:14px}
      body.easy-mode #dropZone{min-height:155px;border-radius:18px;border-width:2px}
      body.easy-mode #uploadPrompt .plus{font-size:36px}
      body.easy-mode #uploadPrompt strong{font-size:17px}
      body.easy-mode #easyUploadHelp{display:block;margin-top:6px;color:#8f99a8;font-size:13px;font-weight:600}

      /* Content Coach: show one clear idea instead of four technical boxes. */
      body.easy-mode .content-coach-card{padding:17px;border-radius:18px;margin-bottom:16px}
      body.easy-mode .content-coach-kicker,body.easy-mode .content-coach-badge,
      body.easy-mode .content-coach-grid,body.easy-mode .content-coach-caption,body.easy-mode .content-coach-foot{display:none!important}
      body.easy-mode .content-coach-head h3{font-size:20px;margin:0}
      body.easy-mode .easy-coach-summary{margin-top:12px;padding:14px;border-radius:14px;background:#0b1018;border:1px solid rgba(255,255,255,.06)}
      body.easy-mode .easy-coach-summary strong{display:block;font-size:17px;line-height:1.3;color:#f3f5fa}
      body.easy-mode .easy-coach-summary span{display:block;margin-top:7px;font-size:14px;line-height:1.35;color:#b8c1cf}
      body.easy-mode .easy-coach-summary em{display:block;margin-top:9px;font-style:normal;font-size:13px;color:#cbbfff}
      body.easy-mode .content-coach-actions{grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
      body.easy-mode .content-coach-actions button{font-size:14px!important;min-height:50px}

      /* Max Reach becomes a single friendly automation button. */
      body.easy-mode #maxReachCard{padding:14px 16px;border-color:rgba(116,183,255,.22);background:linear-gradient(145deg,#101928,#0c1118 58%,#13101d)}
      body.easy-mode #maxReachCard>.max-reach-head,
      body.easy-mode #maxReachSummary,body.easy-mode #maxReachDetails,
      body.easy-mode #reachIntelligence,body.easy-mode #applyMaxReachBtn{display:none!important}
      body.easy-mode #smartPlanBlock{margin:0;padding:0;border:0;gap:10px}
      body.easy-mode .smart-plan-head strong{font-size:18px!important;line-height:1.25}
      body.easy-mode .smart-plan-head span{font-size:14px!important;line-height:1.4!important;color:#aeb8c7!important;margin-top:5px!important}
      body.easy-mode .smart-plan-badge{display:none!important}
      body.easy-mode #smartPlanBtn{font-size:0!important;min-height:52px}
      body.easy-mode #smartPlanBtn::after{content:'✨ Do It For Me';font-size:16px}
      body.easy-mode .smart-plan-result{font-size:13px!important;line-height:1.45!important;padding:11px 12px!important}

      body.easy-mode .caption-topline label{font-size:16px;font-weight:850}
      body.easy-mode #caption{min-height:130px;line-height:1.45}
      body.easy-mode .char-count{font-size:12px}
      body.easy-mode .platform-row{gap:9px}
      body.easy-mode .platform-chip{min-height:66px;border-radius:14px;padding:10px 8px;font-size:13px}
      body.easy-mode .platform-chip span:nth-of-type(2){font-size:12px}
      body.easy-mode .timing-segmented .segment span{font-size:15px}

      /* Advanced publishing features stay available, but out of the way. */
      body.easy-mode .easy-more{margin-top:12px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.easy-mode .easy-more>summary{list-style:none;cursor:pointer;padding:10px 12px;border-radius:12px;background:#0b1017;color:#bcc5d2;font-size:14px;font-weight:800}
      body.easy-mode .easy-more>summary::-webkit-details-marker{display:none}
      body.easy-mode .easy-more>summary::after{content:'＋';float:right;color:#9d8cff}
      body.easy-mode .easy-more[open]>summary::after{content:'−'}
      body.easy-mode .easy-more[open]{display:grid;gap:12px}
      body.easy-mode #view-create .field-hint,body.easy-mode #view-create .micro-hint,
      body.easy-mode #view-create .audio-meta-row,body.easy-mode #view-create .advanced-badge{font-size:12px!important;line-height:1.4}

      /* Calendar: shows first, then weekly ideas, then scheduled posts. */
      body.easy-mode #view-calendar .page-row h2{font-size:24px}
      body.easy-mode .easy-calendar-intro{margin:-2px 2px 14px;color:#aeb8c7;font-size:14px;line-height:1.4}
      body.easy-mode #view-calendar .card{padding:16px;margin-bottom:14px}
      body.easy-mode .gig-campaign-head{display:none!important}
      body.easy-mode .calendar-sync{border:0!important;margin:0!important;padding:0!important}
      body.easy-mode .calendar-sync-head{align-items:center}
      body.easy-mode .calendar-sync-head strong{font-size:19px!important;line-height:1.2}
      body.easy-mode .calendar-sync-head span{font-size:13px!important;line-height:1.35!important;margin-top:5px!important;color:#aeb8c7!important}
      body.easy-mode .calendar-sync-live{display:none!important}
      body.easy-mode .calendar-sync-list{gap:11px!important;margin-top:13px!important}
      body.easy-mode .calendar-sync-event{grid-template-columns:76px 1fr!important;gap:12px!important;padding:11px!important;border-radius:15px!important;background:#0b1119!important;border:1px solid rgba(255,255,255,.055)}
      body.easy-mode .calendar-sync-thumb{width:76px!important;height:76px!important;border-radius:12px!important;font-size:26px!important}
      body.easy-mode .calendar-sync-copy strong{font-size:16px!important;line-height:1.25!important;white-space:normal!important}
      body.easy-mode .calendar-sync-copy small{font-size:13px!important;margin-top:5px!important}
      body.easy-mode .calendar-sync-copy p{font-size:12px!important;margin-top:5px!important;white-space:normal!important;line-height:1.3}
      body.easy-mode .calendar-sync-action{grid-column:1/-1!important;width:100%!important;min-height:48px!important;font-size:15px!important;margin-top:1px}
      body.easy-mode .calendar-sync-refresh{font-size:13px!important;padding:10px 2px!important}
      body.easy-mode .calendar-sync-empty{font-size:14px!important;line-height:1.4!important;padding:13px!important}

      body.easy-mode .easy-manual-show{margin-top:14px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      body.easy-mode .easy-manual-show>summary{list-style:none;cursor:pointer;padding:12px 13px;border-radius:12px;background:#17120f;color:#ffc08c;font-size:14px;font-weight:850}
      body.easy-mode .easy-manual-show>summary::-webkit-details-marker{display:none}
      body.easy-mode .easy-manual-show>summary::after{content:'＋';float:right}
      body.easy-mode .easy-manual-show[open]>summary::after{content:'−'}
      body.easy-mode .easy-manual-show .gig-campaign-form{margin-top:12px!important;gap:10px!important}
      body.easy-mode .easy-manual-show .gig-campaign-form label{font-size:13px!important;gap:6px!important}
      body.easy-mode .easy-manual-show .gig-campaign-form label span{letter-spacing:0!important;color:#aeb8c7}

      body.easy-mode .easy-plans-title{font-size:17px;font-weight:850;margin:16px 2px 9px}
      body.easy-mode .gig-campaign-list{gap:11px!important}
      body.easy-mode .gig-group{padding:12px!important;border-radius:14px!important}
      body.easy-mode .gig-group-head strong{font-size:16px!important}
      body.easy-mode .gig-group-head small,body.easy-mode .gig-phase p{display:none!important}
      body.easy-mode .gig-group-hide{font-size:12px!important;padding:7px!important}
      body.easy-mode .gig-phase{padding-top:11px!important;margin-top:11px!important}
      body.easy-mode .gig-phase strong{font-size:14px!important}
      body.easy-mode .gig-phase-time{font-size:12px!important}
      body.easy-mode .gig-phase-actions{gap:8px!important;margin-top:9px!important}
      body.easy-mode .gig-phase-actions button{font-size:13px!important;min-height:44px!important;padding:9px 11px!important}

      body.easy-mode .weekly-plan{padding:16px!important;border-radius:18px!important}
      body.easy-mode .weekly-plan-kicker,body.easy-mode .weekly-status{display:none!important}
      body.easy-mode .weekly-plan h3{font-size:19px!important;margin:0!important}
      body.easy-mode .weekly-plan-summary{font-size:14px!important;line-height:1.4!important;color:#aeb8c7!important;margin-top:6px!important}
      body.easy-mode .weekly-plan-actions{gap:9px!important}
      body.easy-mode .weekly-plan-actions button{flex:1}
      body.easy-mode .weekly-plan-items{gap:10px!important}
      body.easy-mode .weekly-item{padding:12px!important;border-radius:14px!important}
      body.easy-mode .weekly-item small,body.easy-mode .weekly-item p:not(.weekly-item-time){display:none!important}
      body.easy-mode .weekly-item strong{font-size:15px!important;margin:0!important;line-height:1.3}
      body.easy-mode .weekly-item-time{font-size:13px!important;margin:7px 0 0!important;color:#afd2ff!important}
      body.easy-mode .weekly-item-buttons{gap:8px!important;margin-top:10px!important;flex-wrap:wrap}
      body.easy-mode .weekly-item-buttons button{font-size:13px!important;min-height:44px!important;padding:9px 11px!important}

      @media(max-width:390px){
        body.easy-mode .content-coach-actions{grid-template-columns:1fr}
        body.easy-mode .platform-row-four{grid-template-columns:1fr 1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCreateIntro() {
    const composer = q('#view-create .composer');
    if (!composer || q('#easyCreateIntro')) return;
    const intro = document.createElement('div');
    intro.id = 'easyCreateIntro';
    intro.className = 'easy-hero';
    intro.innerHTML = '<div class="easy-hero-emoji">🎉</div><div><strong>Let’s make a post</strong><span>Pick an idea or choose something from your phone. I’ll help with the rest.</span></div>';
    composer.insertBefore(intro, composer.firstChild);
  }

  function ensureMediaStep() {
    const drop = q('#dropZone');
    if (!drop) return;
    if (!q('#easyMediaStep')) {
      const step = document.createElement('div');
      step.id = 'easyMediaStep';
      step.className = 'easy-step-label';
      step.innerHTML = '<b>1</b><span>Choose something to share</span>';
      drop.parentNode.insertBefore(step, drop);
    }
    setText(q('#uploadPrompt strong'), 'Choose a Photo or Video');
    if (q('#uploadPrompt') && !q('#easyUploadHelp')) {
      const help = document.createElement('span');
      help.id = 'easyUploadHelp';
      help.textContent = 'Tap here to pick from your phone';
      q('#uploadPrompt').appendChild(help);
    }
  }

  function ensureFriendlyComposerLabels() {
    const caption = q('#caption');
    const captionCard = caption?.closest('.card');
    setText(captionCard?.querySelector('.caption-topline label'), '2 · What do you want to say?');
    setText(q('#insertTemplateBtn'), 'Use Show Caption');

    const platformRow = q('.platform-row');
    const platformCard = platformRow?.closest('.card');
    setText(platformCard?.querySelector(':scope > .section-label'), '3 · Where should it go?');

    const timing = q('.timing-segmented');
    const timingCard = timing?.closest('.card');
    setText(timingCard?.querySelector(':scope > .section-label'), '4 · Post it now or later?');
    const later = q('.timing-segmented input[value="schedule"]')?.closest('.segment')?.querySelector('span');
    setText(later, 'Later');
  }

  function ensureAdvancedDetails() {
    if (q('#easyMoreOptions')) return;
    const platformCard = q('.platform-row')?.closest('.card');
    if (!platformCard) return;
    const nodes = ['#instagramTypeWrap','#facebookTypeWrap','#instagramReelAudioWrap','#instagramPeopleWrap']
      .map(selector => q(selector)).filter(Boolean);
    if (!nodes.length) return;
    const details = document.createElement('details');
    details.id = 'easyMoreOptions';
    details.className = 'easy-more';
    const summary = document.createElement('summary');
    summary.textContent = 'More options · Reels, Stories, Tags';
    details.appendChild(summary);
    nodes[0].parentNode.insertBefore(details, nodes[0]);
    nodes.forEach(node => details.appendChild(node));
  }

  function ensureSimpleCoach() {
    const coach = q('#contentCoach');
    if (!coach) return;
    setText(q('#coachTitle'), 'Need an idea? 💡');
    setText(q('#coachStartBtn'), 'Let’s Make It 🎬');
    setText(q('#coachNextBtn'), 'Show Me Another');
    if (!q('#easyCoachSummary')) {
      const box = document.createElement('div');
      box.id = 'easyCoachSummary';
      box.className = 'easy-coach-summary';
      box.innerHTML = '<strong id="easyCoachIdea">I’m picking an idea…</strong><span id="easyCoachWhen"></span><em>Tap “Let’s Make It” and I’ll load the caption and help with the timing.</em>';
      const head = q('.content-coach-head', coach);
      head?.after(box);
    }
    const idea = String(q('#coachWhat')?.textContent || '').trim();
    const when = String(q('#coachWhen')?.textContent || '').trim();
    if (idea) setText(q('#easyCoachIdea'), idea);
    if (when) setText(q('#easyCoachWhen'), `🕒 Good time: ${when}`);
  }

  function simplifySmartPlan() {
    setText(q('.smart-plan-head strong'), 'Make This Post Better ✨');
    setText(q('.smart-plan-head span'), 'I’ll choose the best places and time for you.');
  }

  function ensureCalendarIntro() {
    const view = q('#view-calendar');
    const row = view?.querySelector('.page-row');
    if (!view || !row) return;
    setText(row.querySelector('h2'), 'My Social Plan');
    if (!q('#easyCalendarIntro')) {
      const intro = document.createElement('div');
      intro.id = 'easyCalendarIntro';
      intro.className = 'easy-calendar-intro';
      intro.textContent = 'Your shows and post ideas are all in one place. Tap what you want to work on.';
      row.after(intro);
    }
  }

  function ensureCalendarOrder() {
    const view = q('#view-calendar');
    const gig = q('#gigCampaign');
    const weekly = q('#weeklyPlan');
    if (view && gig && weekly && gig.previousElementSibling !== q('#easyCalendarIntro')) {
      view.insertBefore(gig, weekly);
    }
  }

  function simplifyCalendarSync() {
    const sync = q('#calendarSync');
    if (!sync) return;
    setText(q('.calendar-sync-head strong', sync), 'Your Upcoming Shows 🎤');
    setText(q('.calendar-sync-head span', sync), 'Tap a show and I’ll build the promo posts for you.');
    setText(q('#calendarSyncRefresh'), '↻ Refresh Shows');
    qa('[data-calendar-event]', sync).forEach(button => {
      const text = button.textContent.trim();
      if (text === 'Build Campaign') setText(button, 'Make Promo Posts ✨');
      else if (text.startsWith('Campaign Ready')) setText(button, 'Promo Ready ✓');
      else if (text === 'Use Event') setText(button, 'Use This Show');
    });
  }

  function ensureManualShowDetails() {
    if (q('#easyManualShow')) return;
    const campaign = q('#gigCampaign');
    const sync = q('#calendarSync');
    const form = campaign?.querySelector(':scope > .gig-campaign-form');
    if (!campaign || !sync || !form) return;
    const details = document.createElement('details');
    details.id = 'easyManualShow';
    details.className = 'easy-manual-show';
    const summary = document.createElement('summary');
    summary.textContent = 'Add a show that is not on my calendar';
    details.appendChild(summary);
    campaign.insertBefore(details, form);
    details.appendChild(form);
    setText(q('#buildGigCampaignBtn'), 'Make Promo Posts ✨');
  }

  function simplifyCampaignPlans() {
    const list = q('#gigCampaignList');
    if (!list) return;
    if (!q('#easyPlansTitle')) {
      const title = document.createElement('div');
      title.id = 'easyPlansTitle';
      title.className = 'easy-plans-title';
      title.textContent = 'Promo Posts You’ve Planned';
      list.parentNode.insertBefore(title, list);
    }
    qa('[data-start-gig-item]', list).forEach(button => setText(button, 'Make This Post'));
    qa('[data-done-gig-item]', list).forEach(button => setText(button, 'Done ✓'));
    qa('[data-hide-campaign]', list).forEach(button => setText(button, 'Remove'));
  }

  function simplifyWeeklyPlan() {
    const weekly = q('#weeklyPlan');
    if (!weekly) return;
    setText(q('.weekly-plan h3', weekly), 'Your Week ✨');
    const items = qa('.weekly-item', weekly).length;
    setText(q('#weeklyPlanSummary'), items
      ? 'Your ideas are ready. Tap one when you want to make it.'
      : 'Want help deciding what to post? I can pick four easy ideas for the week.');
    setText(q('#buildWeekBtn'), 'Plan My Week ✨');
    setText(q('#refreshWeekBtn'), 'Make a New Plan');
    qa('[data-start-plan]', weekly).forEach(button => setText(button, 'Make This Post'));
    qa('[data-done-plan]', weekly).forEach(button => setText(button, 'Done ✓'));
    qa('[data-dismiss-plan]', weekly).forEach(button => setText(button, 'Skip'));
  }

  function stampVersion() {
    const footer = q('.version-footer');
    if (footer) setText(footer, 'Social Publisher v0.7.5');
  }

  function apply() {
    document.body.classList.add('easy-mode');
    injectStyles();
    ensureCreateIntro();
    ensureMediaStep();
    ensureFriendlyComposerLabels();
    ensureAdvancedDetails();
    ensureSimpleCoach();
    simplifySmartPlan();
    ensureCalendarIntro();
    ensureCalendarOrder();
    simplifyCalendarSync();
    ensureManualShowDetails();
    simplifyCampaignPlans();
    simplifyWeeklyPlan();
    stampVersion();
  }

  let queued = false;
  function scheduleApply() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  apply();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); });
  window.addEventListener('focus', scheduleApply);
})();
