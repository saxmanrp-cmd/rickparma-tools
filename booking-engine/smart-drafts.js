(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const SEQUENCES = {
    room: [
      { day: 0, kind: 'intro' },
      { day: 5, kind: 'email' },
      { day: 10, kind: 'secondary' },
      { day: 16, kind: 'email' },
      { day: 75, kind: 'revisit' }
    ],
    buyer: [
      { day: 0, kind: 'intro' },
      { day: 7, kind: 'email' },
      { day: 14, kind: 'secondary' },
      { day: 90, kind: 'revisit' }
    ],
    agent: [
      { day: 0, kind: 'intro' },
      { day: 6, kind: 'email' },
      { day: 12, kind: 'secondary' },
      { day: 60, kind: 'revisit' }
    ]
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function contactById(id) {
    const base = window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id);
    if (!base) return null;
    return { ...base, ...(readState().overrides?.[id] || {}) };
  }

  function campaignContext(id) {
    return readState().campaignContexts?.[id] || null;
  }

  function typeFor(c) {
    if (campaignContext(c?.['Contact ID'])?.grouped) return 'buyer';
    if (c?.Lane === 'Agency / Promoter') return 'agent';
    if (c?.Lane === 'Strategic Buyer') return 'buyer';
    return 'room';
  }

  function campaignFor(id) {
    return readState().campaigns?.[id] || null;
  }

  function relationshipFor(id) {
    return readState().relationships?.[id] || 'Cold';
  }

  function textOkFor(id) {
    return !!readState().textOk?.[id];
  }

  function stepFor(c, campaign) {
    const type = campaign?.type || typeFor(c);
    const sequence = SEQUENCES[type] || SEQUENCES.room;
    return sequence[Math.min(campaign?.step || 0, sequence.length - 1)];
  }

  function firstName(c) {
    if (!c?.Contact || /booking|management|department|submission|entertainment/i.test(c.Contact)) return '';
    return c.Contact.trim().split(/\s+/)[0];
  }

  function hello(c) {
    const first = firstName(c);
    return first ? `Hi ${first},` : 'Hello,';
  }

  function knownRelationship(id) {
    return ['Familiar', 'Know Them', 'Worked Together', 'Current Booker'].includes(relationshipFor(id));
  }

  function pitchKit() {
    return window.BookingPitchKit || null;
  }

  function packageFor(c, campaign) {
    const type = campaign?.type || typeFor(c);
    if (pitchKit()?.campaignPackage) return pitchKit().campaignPackage(c, type);
    return {
      profile: type === 'agent' ? 'agency' : type,
      proof: 'Las Vegas singer / saxophonist',
      media: [{ label: 'Website', url: 'https://rickparma.com/' }],
      links: [{ label: 'Website', url: 'https://rickparma.com/' }],
      signature: 'Rick Parma\nSinger • Saxophonist • Entertainer\nLas Vegas, NV\nhttps://rickparma.com/'
    };
  }

  function mediaBlock(c, campaign, limit = 2) {
    return packageFor(c, campaign).media.slice(0, limit).map(a => `${a.label}: ${a.url}`).join('\n');
  }

  function calendarUrl(c, campaign) {
    const pack = packageFor(c, campaign);
    return pack.links.find(x => x.key === 'calendar')?.url || 'https://rickparma.com/#calendar';
  }

  function signatureBlock(c, campaign) {
    return packageFor(c, campaign).signature || 'Rick Parma\nSinger • Saxophonist • Entertainer\nhttps://rickparma.com/';
  }

  function representationLine() {
    const settings = readState().settings || {};
    if (!settings.includeRepresentation || !settings.representation) return '';
    return `\n${settings.representation}`;
  }

  function subjectFor(c, campaign) {
    const type = campaign?.type || typeFor(c);
    const step = stepFor(c, campaign || { type, step: 0 });
    const profile = packageFor(c, campaign).profile;
    if (step.kind === 'email' && (campaign?.step || 0) > 0) return `Quick follow-up — Rick Parma / live music`;
    if (profile === 'festival') return 'Festival consideration — Rick Parma | vocalist + saxophonist';
    if (profile === 'corporate') return 'Las Vegas live entertainment — Rick Parma';
    if (profile === 'agency') return 'Las Vegas singer/sax — solo through full band | Rick Parma';
    if (type === 'buyer') return 'Las Vegas live music — Rick Parma | singer + sax';
    return `Live music for ${c.Entity} — Rick Parma`;
  }

  function groupedBuyerLine(c) {
    const context = campaignContext(c['Contact ID']);
    const rooms = context?.allEntities?.filter(Boolean) || [];
    if (rooms.length < 2) return '';
    const names = rooms.slice(0, 4).join(', ');
    return `\n\nI noticed this booking route is connected with several rooms (${names}${rooms.length > 4 ? ', and others' : ''}), so I wanted to reach out once rather than send separate pitches for each venue.`;
  }

  function quickLook(c, campaign) {
    const media = mediaBlock(c, campaign, 2);
    const calendar = calendarUrl(c, campaign);
    return `Quick look:\n${media}${media ? '\n' : ''}Current dates: ${calendar}`;
  }

  function knownIntro(c, campaign) {
    const profile = packageFor(c, campaign).profile;
    let ask = 'I’m putting more focus on recurring solo singer/sax, lounge and casino-bar dates around Vegas, while still being able to scale up when needed.';
    if (profile === 'festival') ask = 'I’m lining up upcoming festival and concert-series opportunities and wanted to put myself back on your radar.';
    if (profile === 'corporate') ask = 'I’m lining up more corporate and private-event dates and wanted to put myself back on your radar.';
    if (profile === 'agency') ask = 'I’m expanding recurring Las Vegas placements and wanted to put myself back on your radar for clients or rooms that need a versatile singer/sax act.';

    return `${hello(c)}\n\nWanted to check in. ${ask}\n\nIf anything coming up feels like a fit, I’d love to be considered.\n\n${quickLook(c, campaign)}\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function roomIntro(c, campaign) {
    return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based vocalist and saxophonist, and I’m reaching out specifically about ${c.Entity}. My solo show is built for lounges, casino bars, restaurants and cocktail rooms — live vocals + sax, polished tracks, flexible volume, and a set that moves through R&B, Motown, soul, funk, pop, Top 40 and neo-soul based on the room.\n\nI’ve been performing professionally for more than three decades and currently work regularly around Las Vegas, including ARIA and Westgate. I’m looking for recurring local dates and I think ${c.Entity} could be a strong fit.\n\n${quickLook(c, campaign)}\n\nIf you’re filling upcoming dates, regular rotations or fill-in opportunities, I’d love to be considered.\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function buyerIntro(c, campaign) {
    return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based vocalist and saxophonist with more than three decades of professional experience. My sweet spot is polished solo singer/sax and flexible lounge entertainment, and I can scale through duo or full band when the room calls for it.\n\nI currently perform regularly at ARIA and Westgate, with a repertoire spanning R&B, Motown, soul, funk, pop, Top 40 and neo-soul. I’m reaching out because I’m interested in building the right relationship across the rooms you program rather than pitching one date and disappearing.${groupedBuyerLine(c)}\n\n${quickLook(c, campaign)}\n\nIf you’re filling lounges, casino bars, restaurants or special-event rooms, I’d love to be considered wherever the fit makes sense.\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function agencyIntro(c, campaign) {
    return `${hello(c)}\n\nI’m Rick Parma, a Chicago-born, Las Vegas-based vocalist and saxophonist with more than three decades of professional experience across casinos, lounges, corporate events, private events and festivals. My act scales from polished solo singer/sax through full band.\n\nMy background includes a short touring period with trumpeter Tom Browne and Heatwave, major festival appearances, and regular Las Vegas casino work including ARIA and Westgate. Musically I cover R&B, Motown, soul, funk, pop, Top 40 and neo-soul, with a room-first approach rather than a rigid set list.\n\n${quickLook(c, campaign)}\n\nI’d love to connect about clients or rooms where that versatility would be useful.\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function festivalIntro(c, campaign) {
    return `${hello(c)}\n\nI’m Rick Parma, a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and recording artist, and I’d love to be considered for ${c.Entity}.\n\nOver more than three decades as a professional musician, I’ve performed at the Newport Jazz Festival, Long Beach Jazz Festival, Taste of Soul in Los Angeles and the Life Luxe Jazz Festival in Cabo San Lucas for three consecutive years. Earlier in my career I also spent a short period touring with trumpeter Tom Browne and legendary R&B/funk group Heatwave.\n\nMy live show blends R&B, soul, funk, jazz and pop with vocals and saxophone, and can be presented from a compact format through full band.\n\n${quickLook(c, campaign)}\n\nI’d be glad to provide any additional festival materials, stage information or music you need.\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function corporateIntro(c, campaign) {
    return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based vocalist, saxophonist and entertainer with more than three decades of professional experience in corporate, private, casino and special-event settings. I’m reaching out about entertainment opportunities with ${c.Entity}.\n\nMy show can scale from polished solo singer/sax through full band, and I build the music around the audience rather than forcing a fixed set. I’ve maintained a longstanding performance relationship with the AKA organization for roughly a decade and regularly perform in Las Vegas casino environments including ARIA and Westgate.\n\n${quickLook(c, campaign)}\n\nIf you’re planning upcoming receptions, dinners, conferences, celebrations or private events, I’d love to be considered.\n\n${signatureBlock(c, campaign)}${representationLine()}`;
  }

  function introEmail(c, campaign) {
    const id = c['Contact ID'];
    if (knownRelationship(id)) return knownIntro(c, campaign);
    const type = campaign?.type || typeFor(c);
    const profile = packageFor(c, campaign).profile;
    if (profile === 'festival') return festivalIntro(c, campaign);
    if (profile === 'corporate') return corporateIntro(c, campaign);
    if (profile === 'agency' || type === 'agent') return agencyIntro(c, campaign);
    if (type === 'buyer') return buyerIntro(c, campaign);
    return roomIntro(c, campaign);
  }

  function followupEmail(c, campaign) {
    const step = campaign?.step || 0;
    const profile = packageFor(c, campaign).profile;
    const oneMedia = mediaBlock(c, campaign, 1);
    const calendar = calendarUrl(c, campaign);
    const what = profile === 'festival'
      ? 'festival or concert-series programming'
      : profile === 'corporate'
        ? 'corporate or private-event entertainment'
        : profile === 'agency'
          ? 'clients or rooms that need a versatile singer/sax act'
          : 'live music dates';

    if (step >= 3) {
      return `${hello(c)}\n\nOne last quick follow-up in case you’re currently filling ${what}. I’d still love to be considered if something fits.\n\n${oneMedia}\nCurrent dates: ${calendar}\n\nThanks,\nRick`;
    }
    return `${hello(c)}\n\nJust bringing this back up in case you’re currently filling ${what}. If there’s a fit, I’d be glad to send anything else you need.\n\n${oneMedia}\nCurrent dates: ${calendar}\n\nThanks,\nRick`;
  }

  function textMessage(c, campaign) {
    const first = firstName(c);
    const opening = first ? `Hey ${first}, Rick Parma here.` : 'Hi, Rick Parma here.';
    const profile = packageFor(c, campaign).profile;
    if (profile === 'festival') return `${opening} Wanted to check in about upcoming festival or concert-series programming. I’d love to be considered if you have anything that fits my singer/sax show.`;
    if (profile === 'corporate') return `${opening} Wanted to check in about upcoming corporate or private events. If you need live singer/sax entertainment, I’d love to be considered.`;
    if (profile === 'agency') return `${opening} Just checking in on upcoming rooms or clients. I’m focusing on solo singer/sax and flexible lounge work around Vegas, with full-band options too.`;
    if ((campaign?.step || 0) === 0) return `${opening} Wanted to check in about upcoming live music dates. I’m focusing on solo singer/sax and flexible lounge work around Vegas. Anything coming up that might fit?`;
    return `${opening} Just circling back on live music dates. If you have anything coming up that fits solo singer/sax or a flexible lounge setup, I’d love to be considered.`;
  }

  function callScript(c, campaign) {
    const known = knownRelationship(c['Contact ID']);
    const profile = packageFor(c, campaign).profile;
    if (known) {
      const first = firstName(c);
      return `${first ? `Hey ${first}` : 'Hey'}, it’s Rick Parma. I wanted to check in and see what you’re filling right now. I’m looking for more singer/sax opportunities around Vegas and wanted to see if anything on your calendar might fit.`;
    }
    if (profile === 'festival') return `Hi, this is Rick Parma. I’m a Las Vegas-based vocalist and saxophonist calling about artist consideration for ${c.Entity}. I’ve performed at Newport, Long Beach, Taste of Soul and Life Luxe Cabo, and I wanted to ask who handles performer submissions and what materials you prefer.`;
    if (profile === 'corporate') return `Hi, this is Rick Parma. I’m a Las Vegas vocalist and saxophonist calling about live entertainment opportunities with ${c.Entity}. I work solo through full band for corporate and private events. Who is the right person to speak with about entertainment booking?`;
    if (profile === 'agency') return `Hi, this is Rick Parma. I’m a Las Vegas singer and saxophonist calling to introduce myself for representation or placement opportunities. My act scales from solo singer/sax through full band. Who is the best person to send my promo material to?`;
    return `Hi, this is Rick Parma. I’m a Las Vegas singer and saxophonist calling about live entertainment opportunities with ${c.Entity}. I’m especially looking for solo singer/sax, lounge, cocktail and casino-bar work. Who is the right person to speak with about booking or sending my promo material?`;
  }

  function recommendedChannel(c, campaign) {
    const step = stepFor(c, campaign);
    const known = knownRelationship(c['Contact ID']);
    const textOk = textOkFor(c['Contact ID']);
    if (step.kind === 'revisit') return 'Revisit';
    if (step.kind === 'email') return c.Email ? 'Email' : c.Phone ? 'Call' : 'Research';
    if (step.kind === 'secondary') {
      if (known && textOk && c.Phone) return 'Text';
      if (c.Phone) return 'Call';
      return c.Email ? 'Email' : 'Research';
    }
    if (known && textOk && c.Phone && ['Worked Together', 'Current Booker'].includes(relationshipFor(c['Contact ID']))) return 'Text';
    if (c.Email) return 'Email';
    if (c.Phone) return 'Call';
    return 'Research';
  }

  function draftFor(id) {
    const c = contactById(id);
    if (!c) return null;
    const smartType = typeFor(c);
    const saved = campaignFor(id);
    const campaign = saved ? { ...saved, type: smartType } : { type: smartType, step: 0 };
    const step = stepFor(c, campaign);
    const channel = recommendedChannel(c, campaign);
    const body = channel === 'Text'
      ? textMessage(c, campaign)
      : channel === 'Call'
        ? callScript(c, campaign)
        : step.kind === 'email' && (campaign.step || 0) > 0
          ? followupEmail(c, campaign)
          : introEmail(c, campaign);
    return {
      c,
      campaign,
      step,
      channel,
      profile: packageFor(c, campaign).profile,
      subject: subjectFor(c, campaign),
      body
    };
  }

  function smartAction(id) {
    const d = draftFor(id);
    if (!d) return;
    const { c, channel, subject, body } = d;
    if (channel === 'Email' && c.Email) {
      location.href = `mailto:${encodeURIComponent(c.Email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'Text' && c.Phone) {
      const phone = String(c.Phone).replace(/[^0-9+]/g, '');
      location.href = `sms:${phone}?&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'Call' && c.Phone) {
      navigator.clipboard?.writeText(body).catch(() => {});
      location.href = `tel:${String(c.Phone).replace(/[^0-9+]/g, '')}`;
      return;
    }
    navigator.clipboard?.writeText(body).then(() => toast('Outreach copied')).catch(() => toast('Could not copy outreach'));
  }

  function rewritePreview(preview) {
    if (preview.dataset.smartDraftApplied === 'true') return;
    const title = preview.querySelector('h2')?.textContent?.trim();
    if (!title) return;
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const target = norm(title);
    const c = window.BOOKING_DATA?.contacts?.find(x => norm(x.Entity) === target)
      || window.BOOKING_DATA?.contacts?.find(x => target.includes(norm(x.Entity)) || norm(x.Entity).includes(target));
    if (!c) return;
    const d = draftFor(c['Contact ID']);
    if (!d) return;
    const subjectInput = preview.querySelector('input');
    const body = preview.querySelector('textarea');
    if (subjectInput && d.channel === 'Email') subjectInput.value = d.subject;
    if (body) body.value = d.body;
    const eyebrow = preview.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = `${d.channel} • ${String(d.profile || 'smart').toUpperCase()} CAMPAIGN`;
    preview.dataset.smartDraftApplied = 'true';
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action-id]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    smartAction(btn.dataset.actionId);
  }, true);

  const observer = new MutationObserver(() => {
    document.querySelectorAll('.campaign-preview').forEach(rewritePreview);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.BookingSmartDrafts = { draftFor, recommendedChannel, subjectFor };
})();
