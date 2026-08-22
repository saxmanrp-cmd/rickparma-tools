(() => {
  const q = selector => document.querySelector(selector);
  let performanceProfile = null;
  let profileLoaded = false;

  function localDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function localTimeInput(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatSlot(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
    }).format(date);
  }

  function classifyIntent(text, mediaType) {
    const normalized = String(text || '').toLowerCase();
    if (/\b(tonight|today|this evening|right now|last minute)\b/.test(normalized)) return 'urgent_event';
    if (/\b(ticket|tickets|show|gig|live at|performing|performance at|venue|doors|join me|save the date)\b/.test(normalized)) return 'event_promo';
    if (/\b(backstage|soundcheck|rehearsal|behind the scenes|bts)\b/.test(normalized)) return 'behind_scenes';
    if (/\b(last night|recap|thank you|what a night)\b/.test(normalized)) return 'recap';
    if (String(mediaType || '').startsWith('video/')) return 'performance_clip';
    return 'announcement';
  }

  const slotsByKind = {
    short: {
      0:['11:00','18:00'], 1:['12:00','18:30'], 2:['12:00','18:30'], 3:['12:00','18:30'],
      4:['12:00','18:30'], 5:['12:00','16:30'], 6:['11:00','18:00']
    },
    photo: {
      0:['10:30','17:30'], 1:['12:00','18:00'], 2:['12:00','18:00'], 3:['12:00','18:00'],
      4:['12:00','18:00'], 5:['12:00','17:00'], 6:['10:30','17:30']
    },
    video: {
      0:['11:00','18:00'], 1:['18:30'], 2:['18:30'], 3:['18:30'], 4:['18:30'], 5:['17:00'], 6:['11:00','18:00']
    }
  };

  function nextSuggestedSlot(kind, now = new Date()) {
    const schedule = slotsByKind[kind] || slotsByKind.photo;
    const minimum = new Date(now.getTime() + 30 * 60 * 1000);
    for (let offset = 0; offset < 8; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      const times = schedule[day.getDay()] || [];
      for (const hhmm of times) {
        const [hour, minute] = hhmm.split(':').map(Number);
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
        if (candidate >= minimum) return candidate;
      }
    }
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  function nextPersonalizedSlot(windowData, now = new Date()) {
    if (!windowData || !Number.isFinite(Number(windowData.weekday)) || !Number.isFinite(Number(windowData.startHour))) return null;
    const minimum = new Date(now.getTime() + 30 * 60 * 1000);
    const targetHour = Math.min(Number(windowData.startHour) + 1, Math.max(Number(windowData.startHour), Number(windowData.endHour || windowData.startHour + 2) - 1));
    for (let offset = 0; offset < 8; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      if (day.getDay() !== Number(windowData.weekday)) continue;
      const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), targetHour, 0, 0, 0);
      if (candidate >= minimum) return candidate;
    }
    return null;
  }

  async function loadPerformanceProfile() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const r = await fetch(`/api/intelligence/profile?timezone=${encodeURIComponent(timezone)}`, { headers:{accept:'application/json'} });
      if (!r.ok) return;
      performanceProfile = await r.json();
      profileLoaded = true;
      renderReachIntelligence();
    } catch {}
  }

  function buildReachIntelligence() {
    const rec = typeof getMaxReachRecommendation === 'function' ? getMaxReachRecommendation() : { ready:false };
    const media = state?.currentMedia;
    if (!rec.ready || !media) return { ready:false };

    const type = String(media.type || '');
    const captionText = q('#caption')?.value || '';
    const intent = classifyIntent(captionText, type);
    const isPhoto = type.startsWith('image/');
    const isShort = rec.badge === 'SHORT VIDEO';
    const kind = isShort ? 'short' : isPhoto ? 'photo' : 'video';
    const formatKind = isShort ? 'short_video' : isPhoto ? 'photo' : 'video';
    const now = new Date();
    const urgent = intent === 'urgent_event';
    const personalized = Boolean(performanceProfile?.ready);
    const personalizedSlot = personalized && !urgent ? nextPersonalizedSlot(performanceProfile.bestWindow, now) : null;
    const slot = urgent ? null : (personalizedSlot || nextSuggestedSlot(kind, now));

    let formatFit = isShort ? 96 : isPhoto ? 88 : 78;
    const duration = Number(media.duration || 0);
    const width = Number(media.width || 0), height = Number(media.height || 0);
    if (isShort && duration > 0 && duration <= 30) formatFit += 2;
    if (isShort && width && height && Math.abs((width / height) - (9 / 16)) < 0.01) formatFit += 1;
    formatFit = Math.min(99, formatFit);

    let contentTitle, contentBody, captionFormula, followUp, starter;
    if (urgent) {
      contentTitle = 'Urgent event push';
      contentBody = 'Lead with the event hook immediately. Put venue/time in the first two lines and keep one clear call to action.';
      captionFormula = 'TONIGHT/TODAY hook → venue + time → one CTA.';
      followUp = 'Story reminder 60–90 minutes before the event, then a recap Reel the next day.';
      starter = `Tonight! 🔥\n\n[Venue] · [Time]\n\nCome hang with me.`;
    } else if (intent === 'event_promo') {
      contentTitle = isShort ? 'Event promo Reel' : 'Saveable event promo';
      contentBody = isShort
        ? 'Open with the strongest live moment, then get the event details on screen fast. Tag the venue or collaborators when they are truly part of the post.'
        : 'Make the event details impossible to miss. Keep the first two caption lines focused on where, when and why people should care.';
      captionFormula = 'Hook → venue/date/time → one CTA.';
      followUp = 'Share a Story follow-up 2–4 hours later with a different hook or reminder.';
      starter = `Save the date. 🎶\n\n[Venue] · [Date] · [Time]\n\nWho’s coming?`;
    } else if (intent === 'behind_scenes') {
      contentTitle = 'Behind-the-scenes discovery post';
      contentBody = 'Keep it human and immediate. Start on the interesting moment instead of an intro, and let the caption add context the video cannot.';
      captionFormula = 'What they are seeing → one detail they would not know → question/CTA.';
      followUp = 'Follow with the finished performance or result within 24–48 hours.';
      starter = `A little behind the scenes. 👀\n\n[One detail about what is happening]\n\nWant to see the finished version?`;
    } else if (intent === 'recap') {
      contentTitle = 'Recap / social proof';
      contentBody = 'Lead with the crowd, payoff or strongest moment. Keep the recap tight and tag the people or venue who actually contributed.';
      captionFormula = 'Best moment → gratitude/context → next-step CTA.';
      followUp = 'Use the strongest 10–30 second moment as a separate Reel within the next day.';
      starter = `What a night. 🙌\n\n[One sentence about the moment]\n\nMore soon.`;
    } else if (isShort) {
      contentTitle = 'Performance / discovery clip';
      contentBody = 'Start on the strongest visual or musical moment. Avoid a long intro; the first 1–2 seconds should already feel like the payoff is coming.';
      captionFormula = 'Hook → one line of context → question or CTA.';
      followUp = 'Share to Story 2–4 hours later with a different line of copy, not the exact same caption.';
      starter = `Turn this one up. 🔥\n\nA quick moment from the set.\n\nWhat do you think?`;
    } else if (isPhoto) {
      contentTitle = 'Feed photo / announcement';
      contentBody = 'Make the image do the stopping and the caption do the explaining. Tag relevant people in the photo and keep the key information high in the caption.';
      captionFormula = 'What/where → why it matters → one CTA.';
      followUp = 'Use a Story follow-up later the same day to catch people who missed the feed post.';
      starter = `Save this one. 📍\n\n[What is happening + where]\n\nShare it with someone who should see it.`;
    } else {
      contentTitle = 'Full video + clip strategy';
      contentBody = 'Use the full video where it fits, but also cut the strongest 15–45 seconds into a separate vertical Reel for discovery.';
      captionFormula = 'Strong first line → context → strongest takeaway → CTA.';
      followUp = 'Publish a short highlight Reel within 24–48 hours instead of relying on the full video alone.';
      starter = `A moment worth watching all the way through.\n\n[One sentence of context]\n\nWhat part hits you most?`;
    }

    if (personalized && performanceProfile.bestFormat) {
      const best = performanceProfile.bestFormat;
      const lift = Number(best.liftPercent || 0);
      if (best.kind === formatKind) {
        contentBody += ` This matches your strongest learned format${lift > 4 ? `, currently about ${lift}% above your baseline` : ''}.`;
      } else if (lift > 4) {
        contentBody += ` Your own results currently favor ${best.label} by about ${lift}%; consider making a version in that format too.`;
      }
    }
    if (personalized && performanceProfile.captionPattern?.liftPercent > 4) {
      captionFormula += ` Your ${performanceProfile.captionPattern.label.toLowerCase()} are currently about ${performanceProfile.captionPattern.liftPercent}% stronger in your sample.`;
    }

    const personalizedWindow = personalized && personalizedSlot && performanceProfile.bestWindow;
    const timeTitle = urgent
      ? 'Post now'
      : personalizedWindow
        ? `Your learned window: ${formatSlot(slot)}`
        : `Suggested test window: ${formatSlot(slot)}`;
    const timeBody = urgent
      ? 'Your caption sounds time-sensitive, so waiting for a generic window is more likely to hurt than help.'
      : personalizedWindow
        ? `Based on ${performanceProfile.sampleCount} of your own posts. ${performanceProfile.bestWindow.label}${performanceProfile.bestWindow.liftPercent > 4 ? ` is running about ${performanceProfile.bestWindow.liftPercent}% above your current baseline` : ' is your strongest learned window so far'}.`
        : 'This is a starting window based on format and local day/time. Your own performance data will replace these general rules as the sample grows.';

    return {
      ready:true,
      formatFit,
      intent,
      contentTitle,
      contentBody,
      captionFormula,
      followUp,
      starter,
      timingMode: urgent ? 'now' : 'schedule',
      slot,
      timeTitle,
      timeBody,
      personalized,
      profile:performanceProfile,
    };
  }

  function setText(id, value) {
    const el = q(`#${id}`);
    if (el) el.textContent = value || '';
  }

  function renderReachIntelligence() {
    const panel = q('#reachIntelligence');
    if (!panel) return;
    const intel = buildReachIntelligence();
    panel.classList.toggle('hidden', !intel.ready);
    if (!intel.ready) return;

    setText('reachFitScore', `FORMAT FIT ${intel.formatFit}`);
    setText('reachContentTitle', intel.contentTitle);
    setText('reachContentBody', intel.contentBody);
    setText('reachTimeTitle', intel.timeTitle);
    setText('reachTimeBody', intel.timeBody);
    setText('reachCaptionBody', intel.captionFormula);
    setText('reachFollowupBody', intel.followUp);

    const profile = intel.profile;
    const summary = q('#reachPersonalizedSummary');
    if (summary) {
      summary.classList.remove('hidden');
      if (!profileLoaded) summary.textContent = 'PERFORMANCE LEARNING · loading your results…';
      else if (profile?.migrationNeeded) summary.textContent = 'PERFORMANCE LEARNING · database update needed';
      else if (profile?.ready) summary.textContent = `PERSONALIZED · learned from ${profile.sampleCount} posts`;
      else summary.textContent = `LEARNING · ${profile?.sampleCount || 0}/${profile?.targetSamples || 5} posts toward personalization`;
    }
    const note = q('#reachLearningNote');
    if (note) {
      note.textContent = profile?.ready
        ? 'Personalized mode: recommendations now blend your own Instagram/Facebook post performance with format rules. Threads can join the model when insight permission is enabled.'
        : `Learning mode: Social Publisher is automatically collecting post performance. ${profile?.sampleCount || 0}/${profile?.targetSamples || 5} usable posts so far; general timing rules stay in place until the sample is large enough.`;
    }

    const timeButton = q('#useReachTimeBtn');
    if (timeButton) timeButton.textContent = intel.timingMode === 'now' ? 'Use Post Now' : (intel.personalized ? 'Use My Best Time' : 'Use Suggested Time');
    const captionButton = q('#useReachCaptionBtn');
    if (captionButton) captionButton.disabled = Boolean(q('#caption')?.value.trim());
  }

  function applyReachTime() {
    const intel = buildReachIntelligence();
    if (!intel.ready) return toast('Add media first.');
    if (intel.timingMode === 'now') {
      const segment = q('.timing-segmented input[value="now"]')?.closest('.segment');
      segment?.click();
      return toast('Post Now selected.');
    }
    if (!intel.slot) return;
    if (typeof setScheduleTiming === 'function') setScheduleTiming();
    const dateInput = q('#scheduleDate');
    const timeInput = q('#scheduleTime');
    if (dateInput) dateInput.value = localDateInput(intel.slot);
    if (timeInput) timeInput.value = localTimeInput(intel.slot);
    toast(`${intel.personalized ? 'Your best learned time' : 'Suggested time'} set: ${formatSlot(intel.slot)}.`);
  }

  function applyCaptionStarter() {
    const intel = buildReachIntelligence();
    if (!intel.ready) return toast('Add media first.');
    const field = q('#caption');
    if (!field) return;
    if (field.value.trim()) return toast('Caption already has text.');
    field.value = intel.starter;
    field.dispatchEvent(new Event('input', { bubbles:true }));
    field.focus();
    toast('Caption starter added.');
  }

  q('#useReachTimeBtn')?.addEventListener('click', applyReachTime);
  q('#useReachCaptionBtn')?.addEventListener('click', applyCaptionStarter);
  q('#caption')?.addEventListener('input', renderReachIntelligence);
  q('#applyMaxReachBtn')?.addEventListener('click', () => setTimeout(renderReachIntelligence, 0));

  if (typeof renderCurrentMedia === 'function') {
    const baseRenderCurrentMedia = renderCurrentMedia;
    renderCurrentMedia = function(...args) {
      const result = baseRenderCurrentMedia(...args);
      queueMicrotask(renderReachIntelligence);
      return result;
    };
  }

  renderReachIntelligence();
  setTimeout(loadPerformanceProfile, 400);
  window.addEventListener('focus', () => {
    if (!profileLoaded) loadPerformanceProfile();
  });
  setInterval(loadPerformanceProfile, 5 * 60 * 1000);
})();
