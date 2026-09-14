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

  function materials(c) {
    if (window.BookingPitchKit?.selectedAssets) return window.BookingPitchKit.selectedAssets(c);
    return [{ label: 'Website', url: 'https://rickparma.com/' }];
  }

  function materialBlock(c) {
    return materials(c).map(a => `${a.label}: ${a.url}`).join('\n');
  }

  function representationLine() {
    const settings = readState().settings || {};
    if (!settings.includeRepresentation || !settings.representation) return '';
    return `\n\n${settings.representation}`;
  }

  function subjectFor(c, campaign) {
    const type = campaign?.type || typeFor(c);
    const step = stepFor(c, campaign || { type, step: 0 });
    if (step.kind === 'email' && (campaign?.step || 0) > 0) return 'Following up — Rick Parma / live music';
    if (type === 'buyer') return 'Las Vegas entertainment introduction — Rick Parma';
    if (type === 'agent') return 'Las Vegas artist partnership — Rick Parma';
    return `Live music for ${c.Entity} — Rick Parma`;
  }

  function groupedBuyerLine(c) {
    const context = campaignContext(c['Contact ID']);
    const rooms = context?.allEntities?.filter(Boolean) || [];
    if (rooms.length < 2) return '';
    const names = rooms.slice(0, 4).join(', ');
    return `\n\nI noticed your contact route is tied to more than one room (${names}${rooms.length > 4 ? ', and others' : ''}), so I wanted to reach out once rather than send separate pitches for each venue.`;
  }

  function introEmail(c, campaign) {
    const id = c['Contact ID'];
    const type = campaign?.type || typeFor(c);
    const known = knownRelationship(id);
    const links = materialBlock(c);

    if (known) {
      return `${hello(c)}\n\nWanted to check in and see what you’re filling right now for live music. I’m putting more focus on solo singer/sax, lounge, casino-bar and restaurant dates around Vegas, while still being able to scale up to full band when needed.\n\nIf you have anything coming up that feels like a fit, I’d love to be considered.\n\n${links}${representationLine()}\n\nThanks,\nRick`;
    }

    if (type === 'buyer') {
      return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist. My sweet spot is polished solo singer/sax and flexible lounge entertainment — R&B, Motown, soul, pop, Top 40 and neo-soul — and I can scale through full band when the room calls for it.\n\nI’m reaching out because I’m interested in building the right relationship across the rooms you program, rather than pitching one property and disappearing. I’ve performed extensively in Las Vegas casino, lounge and corporate environments, including ARIA and Westgate.${groupedBuyerLine(c)}\n\nIf there are lounges, casino bars, restaurants or special-event rooms in your portfolio that use versatile local entertainment, I’d love to be considered.\n\n${links}${representationLine()}\n\nThank you,\nRick Parma`;
    }

    if (type === 'agent') {
      return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist with extensive casino, lounge, corporate and private-event experience. I’m looking to expand recurring local placements, especially solo singer/sax, lounge and cocktail work, while remaining available for duo and full-band dates.\n\nMusically I cover R&B, Motown, soul, pop, Top 40 and neo-soul, and my approach is built around reading the room rather than locking into one fixed set.\n\nI’d love to connect about clients or rooms where that flexibility would be useful.\n\n${links}${representationLine()}\n\nThanks,\nRick Parma`;
    }

    return `${hello(c)}\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist, and I’m reaching out specifically about ${c.Entity}. My solo setup is built for lounges, casino bars, restaurants and cocktail rooms: vocals + sax, flexible volume, polished tracks, and a set that moves through R&B, Motown, soul, pop, Top 40 and neo-soul based on the room.\n\nI’ve performed extensively around Las Vegas, including ARIA and Westgate, and I’d love to be considered for upcoming dates at ${c.Entity}.\n\n${links}${representationLine()}\n\nThanks for your time,\nRick Parma`;
  }

  function followupEmail(c, campaign) {
    const step = campaign?.step || 0;
    if (step >= 3) {
      return `${hello(c)}\n\nOne last quick follow-up in case you’re currently filling live music dates. I’d still love to be considered for solo singer/sax, lounge or flexible casino/restaurant programming if something fits.\n\n${materials(c).slice(0, 2).map(a => `${a.label}: ${a.url}`).join('\n')}\n\nThanks,\nRick`;
    }
    return `${hello(c)}\n\nJust bringing this back up in case you’re currently filling live entertainment dates. I’m available for solo singer/sax, lounge and flexible casino/restaurant programming, and I’d be glad to send anything else you need.\n\n${materials(c).slice(0, 2).map(a => `${a.label}: ${a.url}`).join('\n')}\n\nThanks,\nRick`;
  }

  function textMessage(c, campaign) {
    const first = firstName(c);
    const opening = first ? `Hey ${first}, Rick Parma here.` : 'Hi, Rick Parma here.';
    if ((campaign?.step || 0) === 0) {
      return `${opening} Wanted to check in about upcoming live music dates. I’m focusing on solo singer/sax and flexible lounge work around Vegas. Anything coming up that might fit?`;
    }
    return `${opening} Just circling back on live music dates. If you have anything coming up that fits solo singer/sax or a flexible lounge setup, I’d love to be considered.`;
  }

  function callScript(c) {
    const known = knownRelationship(c['Contact ID']);
    if (known) {
      const first = firstName(c);
      return `${first ? `Hey ${first}` : 'Hey'}, it’s Rick Parma. I wanted to check in and see what you’re filling right now for live music. I’m especially looking for solo singer/sax, lounge and casino-bar dates. Anything on your calendar that might fit?`;
    }
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
        ? callScript(c)
        : step.kind === 'email' && (campaign.step || 0) > 0
          ? followupEmail(c, campaign)
          : introEmail(c, campaign);
    return { c, campaign, step, channel, subject: subjectFor(c, campaign), body };
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
    if (eyebrow) eyebrow.textContent = `${d.channel} • SMART DRAFT`;
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

  window.BookingSmartDrafts = { draftFor, recommendedChannel };
})();
