// v0.7.1 Content Coach recommends what to post before media is selected.
(() => {
  const q = selector => document.querySelector(selector);
  let profile = null;
  let ideaIndex = 0;

  const ideas = [
    {
      id:'short_video', kind:'short', title:'Post a 15–30 second performance clip',
      media:'Use vertical 9:16 video. Start on the strongest musical or crowd moment in the first 1–2 seconds — no long intro.',
      why:'Short performance clips are the strongest discovery format when you want new people to stop, watch and share.',
      starter:'Turn this one up. 🔥\n\nA quick moment from the set.\n\nWhat do you think?',
      accept:'video/*'
    },
    {
      id:'event_promo', kind:'photo', title:'Post a clean show announcement',
      media:'Use one strong performance photo or a simple event graphic. Make venue, date and time instantly readable.',
      why:'A clear event post gives followers something easy to save, share and act on without burying the details.',
      starter:'Save the date. 🎶\n\n[Venue] · [Date] · [Time]\n\nWho’s coming?',
      accept:'image/*,video/*'
    },
    {
      id:'behind_scenes', kind:'short', title:'Post a behind-the-scenes moment',
      media:'Use a short vertical clip from soundcheck, rehearsal, setup or backstage. Start on the interesting moment.',
      why:'Behind-the-scenes content gives the audience access they do not get from the polished performance and builds connection.',
      starter:'A little behind the scenes. 👀\n\n[One detail about what is happening]\n\nWant to see the finished version?',
      accept:'video/*'
    },
    {
      id:'photo', kind:'photo', title:'Post one strong live photo',
      media:'Choose a photo with a clear subject and strong stage energy. Let the image stop the scroll and the caption add context.',
      why:'A strong photo is fast to consume, easy to share and gives you a useful change of pace between video posts.',
      starter:'One of those moments. 📸\n\n[Where this was / what was happening]\n\nWhat should I play next?',
      accept:'image/*'
    },
    {
      id:'recap', kind:'short', title:'Post the best moment from your latest show',
      media:'Use the payoff: crowd reaction, a vocal peak, sax solo or the moment the room came alive. Keep it tight and vertical.',
      why:'Recap clips turn a finished show into social proof and give people a reason to catch the next one.',
      starter:'What a night. 🙌\n\n[One sentence about the moment]\n\nMore soon.',
      accept:'video/*'
    },
    {
      id:'video', kind:'video', title:'Post a fuller performance moment',
      media:'Use a 30–90 second performance sequence with a strong opening. Save the best 15–30 seconds for a separate short-form cut too.',
      why:'A fuller clip rewards people who already care while giving you raw material for a second discovery post.',
      starter:'A moment worth watching all the way through.\n\n[One sentence of context]\n\nWhat part hits you most?',
      accept:'video/*'
    }
  ];

  const fallbackSchedule = {
    short:{0:['11:00','18:00'],1:['12:00','18:30'],2:['12:00','18:30'],3:['12:00','18:30'],4:['12:00','18:30'],5:['12:00','16:30'],6:['11:00','18:00']},
    photo:{0:['10:30','17:30'],1:['12:00','18:00'],2:['12:00','18:00'],3:['12:00','18:00'],4:['12:00','18:00'],5:['12:00','17:00'],6:['10:30','17:30']},
    video:{0:['11:00','18:00'],1:['18:30'],2:['18:30'],3:['18:30'],4:['18:30'],5:['17:00'],6:['11:00','18:00']}
  };

  function injectStyles() {
    if (q('#contentCoachStyles')) return;
    const style = document.createElement('style');
    style.id = 'contentCoachStyles';
    style.textContent = `
      .content-coach-card{position:relative;overflow:hidden;border:1px solid rgba(145,116,255,.28);background:linear-gradient(145deg,#13111f,#0d1118 58%,#10151d);padding:15px;margin-bottom:14px}
      .content-coach-card:before{content:'';position:absolute;width:170px;height:170px;border-radius:50%;right:-90px;top:-105px;background:rgba(117,83,255,.14);filter:blur(2px);pointer-events:none}
      .content-coach-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:relative}
      .content-coach-kicker{font-size:9px;font-weight:900;letter-spacing:.12em;color:#a895ff;text-transform:uppercase}
      .content-coach-head h3{font-size:17px;line-height:1.2;margin:4px 0 0}.content-coach-badge{border:1px solid #51447b;background:#251f3b;color:#d8ceff;border-radius:999px;padding:4px 8px;font-size:8px;font-weight:900;letter-spacing:.05em;white-space:nowrap}
      .content-coach-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.content-coach-tip{background:#0a0e14;border-radius:11px;padding:10px;min-width:0}.content-coach-tip small{display:block;color:#788395;font-size:8px;font-weight:900;letter-spacing:.08em;margin-bottom:5px}.content-coach-tip strong{display:block;font-size:11px;line-height:1.35}.content-coach-tip p{font-size:10px;line-height:1.45;color:#aeb7c6;margin:4px 0 0;white-space:pre-line}
      .content-coach-caption{margin-top:8px;background:#0a0e14;border-radius:11px;padding:10px}.content-coach-caption small{display:block;color:#788395;font-size:8px;font-weight:900;letter-spacing:.08em;margin-bottom:5px}.content-coach-caption p{font-size:10px;line-height:1.45;color:#ccd3df;margin:0;white-space:pre-line}
      .content-coach-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.content-coach-start{background:linear-gradient(135deg,#6557dc,#9b7aff)!important}.content-coach-next{padding-left:13px!important;padding-right:13px!important}
      .content-coach-foot{font-size:9px;line-height:1.4;color:#778193;margin-top:8px}
      @media(max-width:390px){.content-coach-grid{grid-template-columns:1fr}.content-coach-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    const dropZone = q('#dropZone');
    if (!dropZone || q('#contentCoach')) return;
    injectStyles();
    const card = document.createElement('div');
    card.id = 'contentCoach';
    card.className = 'card content-coach-card';
    card.innerHTML = `
      <div class="content-coach-head">
        <div><div class="content-coach-kicker">Content Coach</div><h3 id="coachTitle">What should I post next?</h3></div>
        <span id="coachBadge" class="content-coach-badge">LEARNING</span>
      </div>
      <div class="content-coach-grid">
        <div class="content-coach-tip"><small>WHAT TO POST</small><strong id="coachWhat"></strong><p id="coachMedia"></p></div>
        <div class="content-coach-tip"><small>WHY THIS</small><strong id="coachWhyTitle">Best next move</strong><p id="coachWhy"></p></div>
        <div class="content-coach-tip"><small>WHEN</small><strong id="coachWhen"></strong><p id="coachWhenWhy"></p></div>
        <div class="content-coach-tip"><small>LEARNING</small><strong id="coachLearning"></strong><p id="coachLearningWhy"></p></div>
      </div>
      <div class="content-coach-caption"><small>CAPTION STARTER</small><p id="coachCaption"></p></div>
      <div class="content-coach-actions">
        <button id="coachStartBtn" class="button primary content-coach-start" type="button">Start This Post</button>
        <button id="coachNextBtn" class="button secondary content-coach-next" type="button">Another Idea</button>
      </div>
      <div id="coachFoot" class="content-coach-foot">Loading your performance profile…</div>
    `;
    dropZone.parentNode.insertBefore(card, dropZone);
    q('#coachStartBtn')?.addEventListener('click', startCurrentIdea);
    q('#coachNextBtn')?.addEventListener('click', () => {
      ideaIndex = (ideaIndex + 1) % orderedIdeas().length;
      render();
    });
    render();
  }

  function orderedIdeas() {
    const preferred = String(profile?.bestFormat?.kind || '');
    if (!preferred) return ideas;
    const index = ideas.findIndex(idea => idea.id === preferred);
    if (index <= 0) return ideas;
    return [ideas[index], ...ideas.slice(0,index), ...ideas.slice(index + 1)];
  }

  function nextSuggestedSlot(kind, now=new Date()) {
    const schedule = fallbackSchedule[kind] || fallbackSchedule.short;
    const minimum = new Date(now.getTime() + 30 * 60 * 1000);
    for (let offset=0; offset<8; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      for (const hhmm of schedule[day.getDay()] || []) {
        const [hour,minute] = hhmm.split(':').map(Number);
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
        if (candidate >= minimum) return candidate;
      }
    }
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  function formatSlot(date) {
    try {
      return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
    } catch { return 'Next strong posting window'; }
  }

  function render() {
    if (!q('#contentCoach')) return;
    const list = orderedIdeas();
    if (ideaIndex >= list.length) ideaIndex = 0;
    const idea = list[ideaIndex];
    const personalized = Boolean(profile?.ready);
    const sampleCount = Number(profile?.sampleCount || 0);
    const targetSamples = Number(profile?.targetSamples || 5);
    const bestFormat = profile?.bestFormat;
    const formatLift = Number(bestFormat?.liftPercent || 0);
    const bestWindow = profile?.bestWindow;
    const captionPattern = profile?.captionPattern;

    q('#coachBadge').textContent = personalized ? 'PERSONALIZED' : 'LEARNING';
    q('#coachTitle').textContent = personalized && ideaIndex === 0 ? 'Your best next post' : 'What should I post next?';
    q('#coachWhat').textContent = idea.title;
    q('#coachMedia').textContent = idea.media;

    let why = idea.why;
    if (personalized && ideaIndex === 0 && bestFormat) {
      const lift = formatLift > 4 ? ` — about ${formatLift}% above your current baseline` : '';
      why = `Your own results currently favor ${bestFormat.label || idea.title}${lift}. ${idea.why}`;
    }
    q('#coachWhy').textContent = why;

    if (personalized && bestWindow?.label) {
      q('#coachWhen').textContent = bestWindow.label;
      const lift = Number(bestWindow.liftPercent || 0);
      q('#coachWhenWhy').textContent = lift > 4
        ? `That window is running about ${lift}% above your baseline. Smart Plan will lock the exact next slot after you choose media.`
        : 'This is your strongest learned window so far. Smart Plan will lock the exact next slot after you choose media.';
    } else {
      const slot = nextSuggestedSlot(idea.kind);
      q('#coachWhen').textContent = formatSlot(slot);
      q('#coachWhenWhy').textContent = 'This is a starting test window. Your own performance data replaces general timing rules as the sample grows.';
    }

    if (personalized) {
      q('#coachLearning').textContent = `${sampleCount} posts learned`;
      q('#coachLearningWhy').textContent = captionPattern?.label
        ? `Your model is also tracking caption patterns. ${captionPattern.label}${Number(captionPattern.liftPercent || 0) > 4 ? ` are about ${captionPattern.liftPercent}% stronger in your sample` : ' are currently your strongest pattern'}.`
        : 'Recommendations now blend your own Instagram, Facebook and available Threads results.';
      q('#coachFoot').textContent = 'Personalized mode · Content Coach will keep changing as new post performance comes in.';
    } else {
      q('#coachLearning').textContent = `${sampleCount}/${targetSamples} posts toward personalization`;
      q('#coachLearningWhy').textContent = 'Until the sample is large enough, Content Coach blends proven format rules with the results already collected.';
      q('#coachFoot').textContent = 'Learning mode · No extra setup needed. Social Publisher learns automatically from published posts.';
    }

    q('#coachCaption').textContent = idea.starter;
  }

  function startCurrentIdea() {
    const idea = orderedIdeas()[ideaIndex] || ideas[0];
    const caption = q('#caption');
    if (caption && !caption.value.trim()) {
      caption.value = idea.starter;
      caption.dispatchEvent(new Event('input',{bubbles:true}));
    }

    try { sessionStorage.setItem('sp_content_coach_idea', JSON.stringify({ id:idea.id, title:idea.title, createdAt:Date.now() })); } catch {}

    const input = q('#mediaInput');
    if (input) {
      const previousAccept = input.accept;
      input.accept = idea.accept;
      input.click();
      setTimeout(() => { input.accept = previousAccept || 'image/*,video/*'; }, 1500);
    } else {
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    }

    if (typeof toast === 'function') {
      toast(caption?.value.trim() === idea.starter ? 'Idea loaded. Choose the media.' : 'Idea selected. Your existing caption was kept.');
    }
  }

  async function loadProfile() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const response = await fetch(`/api/intelligence/profile?timezone=${encodeURIComponent(timezone)}`, {headers:{accept:'application/json'}});
      if (!response.ok) return;
      profile = await response.json();
      ideaIndex = 0;
      render();
    } catch {}
  }

  injectUi();
  setTimeout(loadProfile, 250);
  window.addEventListener('focus', loadProfile);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadProfile(); });
  setInterval(loadProfile, 5 * 60 * 1000);
})();
