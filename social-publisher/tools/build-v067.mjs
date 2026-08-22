import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('social-publisher');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);
function replaceOnce(text, needle, replacement, label) {
  if (!text.includes(needle)) throw new Error(`Missing ${label}`);
  return text.replace(needle, replacement);
}

const reachJs = String.raw`(() => {
  const q = selector => document.querySelector(selector);

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
    const now = new Date();
    const urgent = intent === 'urgent_event';
    const slot = urgent ? null : nextSuggestedSlot(kind, now);

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
      timeTitle: urgent ? 'Post now' : `Suggested test window: ${formatSlot(slot)}`,
      timeBody: urgent
        ? 'Your caption sounds time-sensitive, so waiting for a generic window is more likely to hurt than help.'
        : 'This is a starting window based on format and local day/time. Personal account analytics will eventually replace these general rules.'
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

    const timeButton = q('#useReachTimeBtn');
    if (timeButton) timeButton.textContent = intel.timingMode === 'now' ? 'Use Post Now' : 'Use Suggested Time';
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
    toast(`Suggested time set: ${formatSlot(intel.slot)}.`);
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
})();
`;

write('public/reach-intelligence.js', reachJs);

let index = read('public/index.html');
const intelMarkup = `            <div id="reachIntelligence" class="reach-intelligence hidden">
              <div class="reach-intel-divider"></div>
              <div class="reach-intel-head">
                <div>
                  <strong>Reach Intelligence</strong>
                  <span>Format + caption + local timing</span>
                </div>
                <b id="reachFitScore" class="reach-fit-score">FORMAT FIT</b>
              </div>
              <div class="reach-intel-grid">
                <div class="reach-intel-tip"><small>CONTENT</small><strong id="reachContentTitle"></strong><p id="reachContentBody"></p></div>
                <div class="reach-intel-tip"><small>WHEN</small><strong id="reachTimeTitle"></strong><p id="reachTimeBody"></p></div>
                <div class="reach-intel-tip"><small>CAPTION</small><strong>Caption structure</strong><p id="reachCaptionBody"></p></div>
                <div class="reach-intel-tip"><small>FOLLOW-UP</small><strong>Second touch</strong><p id="reachFollowupBody"></p></div>
              </div>
              <div class="reach-intel-actions">
                <button id="useReachTimeBtn" class="button secondary" type="button">Use Suggested Time</button>
                <button id="useReachCaptionBtn" class="button secondary" type="button">Use Caption Starter</button>
              </div>
              <div class="reach-intel-note">Learning mode: timing windows are starting points until Social Publisher has enough of your own post-performance data to personalize them.</div>
            </div>`;
if (!index.includes('id="reachIntelligence"')) {
  index = replaceOnce(index,
    '            <button id="applyMaxReachBtn" class="button max-reach-button full" type="button" disabled>Apply Recommendation</button>',
    `${intelMarkup}\n            <button id="applyMaxReachBtn" class="button max-reach-button full" type="button" disabled>Apply Recommendation</button>`,
    'Max Reach apply button');
}
if (!index.includes('/reach-intelligence.js')) {
  index = replaceOnce(index, '  <script src="/app.js"></script>', '  <script src="/app.js"></script>\n  <script src="/reach-intelligence.js"></script>', 'app script');
}
index = index.replace('Social Publisher v0.6.6</div>', 'Social Publisher v0.6.7</div>');
write('public/index.html', index);

let css = read('public/styles.css');
const cssBlock = `

/* v0.6.7 Reach Intelligence */
.reach-intelligence{margin-top:12px}.reach-intel-divider{height:1px;background:rgba(155,122,255,.28);margin:2px 0 12px}.reach-intel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.reach-intel-head strong,.reach-intel-head span{display:block}.reach-intel-head strong{font-size:13px}.reach-intel-head span{font-size:10px;color:var(--muted);margin-top:3px}.reach-fit-score{flex:0 0 auto;border:1px solid #6656c7;background:#28203e;color:#cfc4ff;border-radius:999px;padding:5px 8px;font-size:8px;letter-spacing:.08em}.reach-intel-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.reach-intel-tip{background:#0e121a;border:1px solid #2b3341;border-radius:12px;padding:10px;min-width:0}.reach-intel-tip small{display:block;color:#a996ff;font-size:8px;font-weight:900;letter-spacing:.11em;margin-bottom:5px}.reach-intel-tip strong{display:block;font-size:11px;line-height:1.25}.reach-intel-tip p{margin:5px 0 0;color:var(--muted);font-size:10px;line-height:1.4}.reach-intel-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.reach-intel-actions .button{min-height:42px;font-size:11px;padding:8px}.reach-intel-note{font-size:9px;line-height:1.4;color:#747e8e;margin-top:8px}.max-reach-card{overflow:hidden}
@media(max-width:430px){.reach-intel-grid{grid-template-columns:1fr}.reach-intel-actions{grid-template-columns:1fr 1fr}}
`;
if (!css.includes('v0.6.7 Reach Intelligence')) css += cssBlock;
write('public/styles.css', css);

let sw = read('public/service-worker.js');
sw = sw.replace("const CACHE = 'social-publisher-shell-v661';", "const CACHE = 'social-publisher-shell-v670';");
sw = sw.replace("'/app.js', '/manifest.webmanifest'", "'/app.js', '/reach-intelligence.js', '/manifest.webmanifest'");
write('public/service-worker.js', sw);

let backend = read('src/index.js');
backend = backend.replace("version: '0.6.6.1'", "version: '0.6.7'");
backend = backend.replace("RickParma-SocialPublisher/0.6.6.1", "RickParma-SocialPublisher/0.6.7");
write('src/index.js', backend);

let pkg = read('package.json').replace('"version": "0.6.6.1"', '"version": "0.6.7"');
write('package.json', pkg);
let lock = read('package-lock.json').replaceAll('"version": "0.6.6.1"', '"version": "0.6.7"');
write('package-lock.json', lock);
write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.7 - Reach Intelligence\n');
write('UPGRADE-v0.6.7.md', `# Social Publisher v0.6.7\n\nReach Intelligence adds a first strategy layer on top of Max Reach.\n\n- Classifies the post intent from media + caption.\n- Gives a transparent Format Fit score.\n- Recommends content framing, caption structure and follow-up strategy.\n- Suggests a local posting test window and can place it directly into Schedule.\n- Time-sensitive captions such as “tonight” switch the advice to Post Now.\n- Offers a caption starter when the caption field is empty.\n- Keeps existing Max Reach routing, Facebook Reels, Threads reliability and failed-only Retry unchanged.\n- General timing windows are explicitly marked Learning Mode until first-party performance analytics are added.\n- No D1 migration, new secrets or account reconnects are required.\n`);

let tests = read('tests/smoke.test.mjs');
tests = tests.replace("assert.equal(health.version, '0.6.6.1');", "assert.equal(health.version, '0.6.7');");
const testBlock = `\n\ntest('Reach Intelligence is wired into Max Reach', () => {\n  const html = read('public/index.html');\n  const reach = read('public/reach-intelligence.js');\n  const css = read('public/styles.css');\n  const sw = read('public/service-worker.js');\n\n  for (const needle of ['id=\"reachIntelligence\"','id=\"reachFitScore\"','id=\"useReachTimeBtn\"','id=\"useReachCaptionBtn\"','/reach-intelligence.js']) {\n    assert.equal(html.includes(needle), true, \`HTML missing \${needle}\`);\n  }\n  for (const needle of ['buildReachIntelligence','classifyIntent','nextSuggestedSlot','Learning mode','timingMode','Caption starter added']) {\n    assert.equal(reach.includes(needle), true, \`Reach Intelligence missing \${needle}\`);\n  }\n  assert.equal(css.includes('v0.6.7 Reach Intelligence'), true);\n  assert.equal(sw.includes('/reach-intelligence.js'), true);\n  assert.equal(sw.includes('social-publisher-shell-v670'), true);\n});\n`;
if (!tests.includes("test('Reach Intelligence is wired into Max Reach'")) tests += testBlock;
write('tests/smoke.test.mjs', tests);

console.log('Built Social Publisher v0.6.7 Reach Intelligence');
