(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';

  const DEFAULTS = {
    website: 'https://rickparma.com/',
    calendar: 'https://rickparma.com/#calendar',
    bookingPage: 'https://rickparma.com/#booking',
    instagram: 'https://instagram.com/rickparmaofficial',
    facebook: 'https://www.facebook.com/rickparmaofficial',
    tiktok: 'https://www.tiktok.com/@rickparmaofficial',
    personalEmail: 'saxman@rickparma.com',
    bookingEmail: 'booking@rickparma.com',
    epk: '',
    soloPromo: 'https://www.youtube.com/watch?v=A7bKax1LS_g',
    compilation: 'https://www.youtube.com/watch?v=ePFoNTC85XY',
    fullBandPromo: 'https://www.youtube.com/watch?v=6WmPyq6eoRk'
  };

  const LABELS = {
    website: 'Website',
    calendar: 'Live Dates',
    bookingPage: 'Booking',
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    epk: 'EPK',
    soloPromo: 'Short Promo',
    compilation: 'Compilation',
    fullBandPromo: 'Full Band Promo'
  };

  const BIOS = {
    oneLine: 'Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and entertainer with more than three decades of professional experience, blending R&B, soul, Motown, funk, pop and neo-soul in a show that scales from solo singer/sax through full band.',

    compact: 'Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist and entertainer with more than three decades of professional experience. His soulful vocals, expressive saxophone and room-reading performance style move easily through R&B, Motown, soul, funk, pop, Top 40 and neo-soul, from polished solo singer/sax sets through full-band shows.',

    short: 'Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and entertainer with more than three decades of professional experience. Known for soulful vocals, expressive saxophone and an ability to read the room, Parma blends R&B, soul, Motown, funk, pop, Top 40 and neo-soul into a versatile live show that can scale from solo singer/sax through full band. His career includes casino and lounge work throughout Las Vegas, regular appearances at ARIA and Westgate, a short touring period with trumpeter Tom Browne and R&B/funk group Heatwave, and performances at major music and jazz festivals.',

    room: 'Las Vegas-based vocalist and saxophonist Rick Parma brings more than three decades of professional experience to a polished solo singer/sax show built for lounges, casino bars, restaurants and cocktail rooms. He mixes R&B, Motown, soul, funk, pop, Top 40 and neo-soul while reading the room and adjusting the energy to the audience.',

    buyer: 'Rick Parma is a Las Vegas-based vocalist, saxophonist and entertainer with more than three decades of professional experience. A regular performer at ARIA and Westgate, he works comfortably from polished solo singer/sax and lounge programming through duo and full-band formats, with a repertoire spanning R&B, Motown, soul, funk, pop, Top 40 and neo-soul.',

    agency: 'Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and entertainer with more than three decades of professional experience across casinos, lounges, corporate events, private events and festivals. His career includes a short touring period with Tom Browne and Heatwave, major festival appearances and regular Las Vegas casino work. His act scales from solo singer/sax through full band.',

    festival: 'Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and recording artist whose career spans more than three decades. His festival history includes Newport Jazz Festival, Long Beach Jazz Festival, Taste of Soul in Los Angeles and three consecutive years at the Life Luxe Jazz Festival in Cabo San Lucas. He also spent a short period touring with trumpeter Tom Browne and legendary R&B/funk group Heatwave. His music blends R&B, soul, funk, jazz and pop with soulful vocals and expressive saxophone.',

    corporate: 'Rick Parma is a Las Vegas-based vocalist, saxophonist and entertainer with more than three decades of professional experience in corporate, private, casino and special-event settings. He has maintained a longstanding performance relationship with the AKA organization for roughly a decade and is known for reading the room, engaging mixed-age audiences and scaling his show from polished solo singer/sax through full band.',

    full: `Rick Parma is a Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and entertainer whose career has been built around one thing: making people feel the music. Drawn to music at the age of eight, Parma picked up the saxophone at fourteen and developed a passionate style rooted in R&B, soul, funk, jazz and pop. Over more than three decades as a professional musician, his combination of soulful vocals, expressive saxophone and natural ability to connect with a crowd has taken him from intimate lounges and private events to major festivals, casino stages and concert venues. In the late 1990s, Parma spent a short period touring with acclaimed trumpeter Tom Browne and legendary R&B/funk group Heatwave, an early chapter in a career that would continue to cross musical styles and generations.

As a recording artist and live performer, Parma has built a résumé that includes an extensive catalog of original music, high-profile collaborations and appearances at countless jazz and music festivals. His albums include Just Gettin’ Started, The Cool Night Air, Piece of Heaven and Chocolate Cake, alongside numerous singles and collaborations. Festival appearances have included the Newport Jazz Festival, Long Beach Jazz Festival, Taste of Soul in Los Angeles, and the international Life Luxe Jazz Festival in Cabo San Lucas, where he performed for three consecutive years, along with many other jazz festivals and special events throughout his career. For the past 10 years, Parma has also maintained a longstanding performance relationship with the AKA organization, becoming a familiar entertainer for its events and celebrations. His career has placed him onstage alongside and in support of an impressive range of musicians while allowing him to move effortlessly between jazz, R&B, Motown, soul, funk, pop and contemporary music.

Today, Parma is firmly established in the Las Vegas entertainment scene, where he has become a monthly staple at both ARIA Resort & Casino and Westgate Las Vegas Resort & Casino. Whether performing solo, fronting a band, singing a classic R&B favorite or stepping forward with his signature saxophone, Parma approaches every performance by reading the room and creating an experience around the audience rather than simply playing a predetermined set. His regular casino appearances, private and corporate performances, festival history and decades of professional experience have made versatility one of the defining qualities of his career. More than a saxophonist or singer, Rick Parma is a complete entertainer—combining musicianship, personality and decades of stage experience to turn every performance into an event.`
  };

  const PROOF = {
    room: '30+ years professional • Las Vegas-based • regular ARIA & Westgate performer • solo singer/sax specialist',
    buyer: '30+ years professional • ARIA + Westgate • solo through full band • casino/lounge/corporate experience',
    agency: '30+ years professional • Tom Browne + Heatwave touring history • Las Vegas casino work • solo through full band',
    festival: 'Newport • Long Beach • Taste of Soul • Life Luxe Cabo ×3 • Tom Browne + Heatwave • recording artist',
    corporate: '30+ years professional • 10-year AKA relationship • casino/corporate/private events • solo through full band'
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function kit() {
    const state = readState();
    return { ...DEFAULTS, ...(state.pitchKit || {}) };
  }

  function saveKit(next) {
    const state = readState();
    state.pitchKit = { ...kit(), ...next };
    writeState(state);
  }

  function baseTypeFor(contact) {
    if (contact?.Lane === 'Agency / Promoter') return 'agency';
    if (contact?.Lane === 'Strategic Buyer') return 'buyer';
    return 'room';
  }

  function profileFor(contact, forcedType = '') {
    const text = [
      contact?.Entity,
      contact?.Category,
      contact?.Lane,
      contact?.Role,
      contact?.Notes,
      contact?.['Booking / Submission Route']
    ].filter(Boolean).join(' ').toLowerCase();

    if (/(festival|music fest|jazz fest|arts fest|concert series)/i.test(text)) return 'festival';
    if (/(corporate|private event|special event|convention|association|event planner|event company|wedding|gala)/i.test(text)) return 'corporate';
    if (forcedType === 'agent') return 'agency';
    if (forcedType === 'buyer') return 'buyer';
    if (forcedType === 'room') return 'room';
    return baseTypeFor(contact);
  }

  function selectedAssets(contact, forcedType = '') {
    const k = kit();
    const profile = profileFor(contact, forcedType);
    const ordered = profile === 'festival'
      ? ['epk', 'compilation', 'fullBandPromo']
      : profile === 'corporate'
        ? ['epk', 'soloPromo', 'compilation']
        : profile === 'agency'
          ? ['epk', 'fullBandPromo', 'soloPromo']
          : profile === 'buyer'
            ? ['epk', 'soloPromo', 'compilation']
            : ['epk', 'soloPromo'];

    const seen = new Set();
    return ordered
      .map(key => ({ key, label: LABELS[key], url: k[key] }))
      .filter(item => item.url && !seen.has(item.url) && seen.add(item.url))
      .slice(0, 2);
  }

  function supportLinks(contact, forcedType = '') {
    const k = kit();
    const profile = profileFor(contact, forcedType);
    const keys = profile === 'room'
      ? ['website', 'calendar', 'instagram']
      : profile === 'corporate'
        ? ['website', 'calendar', 'instagram']
        : ['website', 'calendar', 'instagram'];
    return keys.map(key => ({ key, label: LABELS[key], url: k[key] })).filter(x => x.url);
  }

  function bioFor(contact, forcedType = '', size = 'profile') {
    if (size === 'full') return BIOS.full;
    if (size === 'oneLine') return BIOS.oneLine;
    if (size === 'compact') return BIOS.compact;
    if (size === 'short') return BIOS.short;
    const profile = profileFor(contact, forcedType);
    return BIOS[profile] || BIOS.short;
  }

  function proofFor(contact, forcedType = '') {
    const profile = profileFor(contact, forcedType);
    return PROOF[profile] || PROOF.room;
  }

  function textBlock(contact, forcedType = '') {
    return selectedAssets(contact, forcedType).map(a => `${a.label}: ${a.url}`).join('\n');
  }

  function linkBlock(contact, forcedType = '', limit = 3) {
    return supportLinks(contact, forcedType).slice(0, limit).map(a => `${a.label}: ${a.url}`).join('\n');
  }

  function signature(contact, forcedType = '') {
    const k = kit();
    const links = supportLinks(contact, forcedType);
    const website = links.find(x => x.key === 'website')?.url || k.website;
    const calendar = links.find(x => x.key === 'calendar')?.url || k.calendar;
    const instagram = links.find(x => x.key === 'instagram')?.url || k.instagram;
    return `Rick Parma\nSinger • Saxophonist • Entertainer\nLas Vegas, NV\n${website}\nLive dates: ${calendar}\nInstagram: ${instagram}`;
  }

  function campaignPackage(contact, forcedType = '') {
    const profile = profileFor(contact, forcedType);
    return {
      profile,
      bio: bioFor(contact, forcedType, 'profile'),
      compactBio: BIOS.compact,
      oneLineBio: BIOS.oneLine,
      fullBio: BIOS.full,
      proof: proofFor(contact, forcedType),
      media: selectedAssets(contact, forcedType),
      links: supportLinks(contact, forcedType),
      signature: signature(contact, forcedType)
    };
  }

  function injectSettings() {
    const settings = document.querySelector('[data-view="settings"]');
    if (!settings || settings.querySelector('[data-pitch-kit]')) return;
    const k = kit();
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.dataset.pitchKit = 'true';
    card.innerHTML = `
      <h3>Campaign Asset Library</h3>
      <p>The engine automatically chooses the right bio, credentials, video and links for each type of buyer. These are your master campaign assets.</p>
      <label>Main website<input id="kitWebsite" type="url" value="${escapeHtml(k.website)}"></label>
      <label>Live calendar<input id="kitCalendar" type="url" value="${escapeHtml(k.calendar)}"></label>
      <label>Booking page<input id="kitBooking" type="url" value="${escapeHtml(k.bookingPage)}"></label>
      <label>Instagram<input id="kitInstagram" type="url" value="${escapeHtml(k.instagram)}"></label>
      <label>Facebook<input id="kitFacebook" type="url" value="${escapeHtml(k.facebook)}"></label>
      <label>TikTok<input id="kitTikTok" type="url" value="${escapeHtml(k.tiktok)}"></label>
      <label>General EPK <span style="font-weight:500">(optional)</span><input id="kitEpk" type="url" value="${escapeHtml(k.epk)}" placeholder="Dedicated EPK link if you add one later"></label>
      <label>Solo / Short Promo<input id="kitSolo" type="url" value="${escapeHtml(k.soloPromo)}"></label>
      <label>Compilation<input id="kitCompilation" type="url" value="${escapeHtml(k.compilation)}"></label>
      <label>Full Band Promo<input id="kitBand" type="url" value="${escapeHtml(k.fullBandPromo)}"></label>
      <div class="pitch-kit-rule">
        <strong>Room / lounge</strong><span>Solo angle • Short Promo • current dates</span>
        <strong>Casino buyer</strong><span>ARIA/Westgate proof • Solo + Compilation</span>
        <strong>Agency</strong><span>Career résumé • Full Band + Solo</span>
        <strong>Festival</strong><span>Festival/touring credits • Compilation + Full Band</span>
        <strong>Corporate</strong><span>AKA/corporate proof • Solo + Compilation</span>
      </div>
      <details class="bio-library"><summary>Bio & credential library</summary>
        <div><strong>One-line:</strong><p>${escapeHtml(BIOS.oneLine)}</p></div>
        <div><strong>Short bio:</strong><p>${escapeHtml(BIOS.short)}</p></div>
        <div><strong>Festival angle:</strong><p>${escapeHtml(BIOS.festival)}</p></div>
        <div><strong>Corporate angle:</strong><p>${escapeHtml(BIOS.corporate)}</p></div>
      </details>
      <button class="primary" id="savePitchKit">Save Campaign Assets</button>`;

    const senderCard = settings.querySelector('[data-sender-policy]');
    if (senderCard) senderCard.after(card);
    else settings.appendChild(card);

    card.querySelector('#savePitchKit')?.addEventListener('click', () => {
      saveKit({
        website: card.querySelector('#kitWebsite')?.value.trim() || DEFAULTS.website,
        calendar: card.querySelector('#kitCalendar')?.value.trim() || DEFAULTS.calendar,
        bookingPage: card.querySelector('#kitBooking')?.value.trim() || DEFAULTS.bookingPage,
        instagram: card.querySelector('#kitInstagram')?.value.trim() || DEFAULTS.instagram,
        facebook: card.querySelector('#kitFacebook')?.value.trim() || DEFAULTS.facebook,
        tiktok: card.querySelector('#kitTikTok')?.value.trim() || DEFAULTS.tiktok,
        epk: card.querySelector('#kitEpk')?.value.trim() || '',
        soloPromo: card.querySelector('#kitSolo')?.value.trim() || DEFAULTS.soloPromo,
        compilation: card.querySelector('#kitCompilation')?.value.trim() || DEFAULTS.compilation,
        fullBandPromo: card.querySelector('#kitBand')?.value.trim() || DEFAULTS.fullBandPromo
      });
      toast('Campaign assets saved');
      decorateCampaigns(true);
    });
  }

  function contactById(id) {
    return window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id) || null;
  }

  function decorateCampaigns(force = false) {
    document.querySelectorAll('[data-view="campaigns"] [data-campaign-id]').forEach(card => {
      const id = card.dataset.campaignId;
      const c = contactById(id);
      if (!c) return;
      if (force) card.querySelector('[data-materials-hint]')?.remove();
      if (card.querySelector('[data-materials-hint]')) return;
      const pack = campaignPackage(c);
      const hint = document.createElement('div');
      hint.className = 'materials-hint';
      hint.dataset.materialsHint = 'true';
      hint.innerHTML = `<div><span>${escapeHtml(pack.profile.toUpperCase())} campaign:</span> ${escapeHtml(pack.proof)}</div><div>${pack.media.map(a => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.label)}</a>`).join(' · ')}${pack.media.length ? ' · ' : ''}<a href="${escapeHtml(kit().calendar)}" target="_blank" rel="noopener">Live Dates</a></div>`;
      const controls = card.querySelector('.campaign-controls');
      if (controls) controls.before(hint); else card.appendChild(hint);
    });
  }

  function decoratePreview() {
    document.querySelectorAll('.campaign-preview').forEach(preview => {
      if (preview.querySelector('[data-preview-materials]')) return;
      const title = preview.querySelector('h2')?.textContent?.trim();
      if (!title) return;
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const target = norm(title);
      const c = window.BOOKING_DATA?.contacts?.find(x => norm(x.Entity) === target)
        || window.BOOKING_DATA?.contacts?.find(x => target.includes(norm(x.Entity)) || norm(x.Entity).includes(target));
      if (!c) return;
      const pack = campaignPackage(c);
      const box = document.createElement('div');
      box.className = 'preview-materials';
      box.dataset.previewMaterials = 'true';
      box.innerHTML = `<strong>${escapeHtml(pack.profile.toUpperCase())} campaign package</strong><span>${escapeHtml(pack.proof)}</span>${pack.media.map(a => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.label)} ↗</a>`).join('')}<a href="${escapeHtml(kit().calendar)}" target="_blank" rel="noopener">Current calendar ↗</a>`;
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
    if (document.querySelector('#pitch-kit-styles')) return;
    const style = document.createElement('style');
    style.id = 'pitch-kit-styles';
    style.textContent = `
      .pitch-kit-rule{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;padding:13px;margin:2px 0 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2);font-size:12px}.pitch-kit-rule span{color:var(--muted)}.bio-library{margin:0 0 16px;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2)}.bio-library summary{cursor:pointer;font-size:12px;font-weight:800}.bio-library div{margin-top:12px}.bio-library p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.materials-hint{display:grid;gap:5px;margin-top:12px;padding:9px 11px;border-radius:11px;background:rgba(120,167,255,.07);border:1px solid rgba(120,167,255,.18);font-size:11px;color:var(--muted);line-height:1.4}.materials-hint span{font-weight:800;color:#c9d9f7}.materials-hint a{color:var(--accent);text-decoration:none}.preview-materials{display:grid;gap:7px;padding:12px;margin:12px 0;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.preview-materials strong{font-size:12px}.preview-materials span{font-size:11px;color:var(--muted);line-height:1.4}.preview-materials a{color:var(--accent);font-size:12px;text-decoration:none}`;
    document.head.appendChild(style);
  }

  window.BookingPitchKit = {
    kit,
    saveKit,
    profileFor,
    bioFor,
    proofFor,
    selectedAssets,
    supportLinks,
    textBlock,
    linkBlock,
    signature,
    campaignPackage,
    BIOS
  };

  injectStyles();
  const observer = new MutationObserver(() => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  });
  setTimeout(() => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  }, 0);
})();
