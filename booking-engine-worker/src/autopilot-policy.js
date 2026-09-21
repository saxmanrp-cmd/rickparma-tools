const THROUGHPUT_PROFILE_VERSION = 2;

export const DEFAULT_AUTOPILOT_CONFIG = Object.freeze({
  mode: 'shadow',
  timezone: 'America/Los_Angeles',
  throughputProfileVersion: THROUGHPUT_PROFILE_VERSION,
  researchDailyTarget: 15,
  verifyDailyTarget: 15,
  dailyInitialEmailLimit: 10,
  dailyFollowupEmailLimit: 5,
  dailyAutoReplyLimit: 10,
  minFitScore: 82,
  minConfidence: 0.82,
  sendWindowStartHour: 9,
  sendWindowEndHour: 16,
  sendWeekdaysOnly: true,
  maxColdTouches: 5,
  followupDays: [5, 10, 16, 75],
  allowColdSms: false,
  allowAutoRoutineReplies: true,
  requirePhysicalPostalAddress: true,
  businessPostalAddress: '',
  optOutLine: "If you'd rather not hear from me, reply ‘no thanks’ and I won't follow up.",
  pilotRequireVerifiedEmail: true,
  pilotApprovedDraftId: '',
  stopOnReply: true,
  stopOnOptOut: true,
  stopOnPass: true,
  stopOnBooked: true
});

export function normalizeAutopilotConfig(input = {}) {
  const source = input || {};
  const out = { ...DEFAULT_AUTOPILOT_CONFIG, ...source };

  // One-time throughput upgrade approved by Rick on 2026-09-21.
  // Keep all safety gates, targeting thresholds, send window, and follow-up policy intact.
  if (Number(source.throughputProfileVersion || 0) < THROUGHPUT_PROFILE_VERSION) {
    out.researchDailyTarget = 15;
    out.verifyDailyTarget = 15;
    out.dailyInitialEmailLimit = 10;
    out.throughputProfileVersion = THROUGHPUT_PROFILE_VERSION;
  }

  if (!['off', 'shadow', 'pilot', 'live'].includes(out.mode)) out.mode = 'shadow';
  out.throughputProfileVersion = THROUGHPUT_PROFILE_VERSION;
  out.researchDailyTarget = clampInt(out.researchDailyTarget, 0, 20, 15);
  out.verifyDailyTarget = clampInt(out.verifyDailyTarget, 0, 20, 15);
  out.dailyInitialEmailLimit = clampInt(out.dailyInitialEmailLimit, 0, 50, 10);
  out.dailyFollowupEmailLimit = clampInt(out.dailyFollowupEmailLimit, 0, 100, 5);
  out.dailyAutoReplyLimit = clampInt(out.dailyAutoReplyLimit, 0, 100, 10);
  out.minFitScore = clampInt(out.minFitScore, 0, 100, 82);
  out.minConfidence = clampNum(out.minConfidence, 0, 1, 0.82);
  out.sendWindowStartHour = clampInt(out.sendWindowStartHour, 0, 23, 9);
  out.sendWindowEndHour = clampInt(out.sendWindowEndHour, 1, 24, 16);
  out.maxColdTouches = clampInt(out.maxColdTouches, 1, 8, 5);
  out.followupDays = Array.isArray(out.followupDays)
    ? out.followupDays.map(v => clampInt(v, 1, 365, 5)).slice(0, 8)
    : [...DEFAULT_AUTOPILOT_CONFIG.followupDays];
  out.allowColdSms = false;
  out.businessPostalAddress = String(out.businessPostalAddress || '').trim().slice(0, 300);
  out.pilotApprovedDraftId = String(out.pilotApprovedDraftId || '').trim().slice(0, 100);
  out.optOutLine = String(out.optOutLine || DEFAULT_AUTOPILOT_CONFIG.optOutLine).trim().slice(0, 500);
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}
function clampNum(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export async function getAutopilotConfig(env) {
  if (!env.DB) return normalizeAutopilotConfig();
  const row = await env.DB.prepare('SELECT config_json FROM autopilot_config WHERE id = ?').bind('default').first();
  let parsed = {};
  try { parsed = JSON.parse(row?.config_json || '{}'); } catch {}

  const config = normalizeAutopilotConfig(parsed);

  // Persist the one-time profile migration so later user edits remain authoritative.
  if (Number(parsed.throughputProfileVersion || 0) < THROUGHPUT_PROFILE_VERSION) {
    await env.DB.prepare(`
      INSERT INTO autopilot_config (id, config_json, updated_at)
      VALUES ('default', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP
    `).bind(JSON.stringify(config)).run();
  }

  return config;
}

export async function saveAutopilotConfig(env, input = {}) {
  const config = normalizeAutopilotConfig(input);
  await env.DB.prepare(`
    INSERT INTO autopilot_config (id, config_json, updated_at)
    VALUES ('default', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP
  `).bind(JSON.stringify(config)).run();
  return config;
}

export function localParts(date = new Date(), timezone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
    weekday: weekdayMap[map.weekday],
    dateKey: `${map.year}-${map.month}-${map.day}`
  };
}

export function withinSendWindow(config, date = new Date()) {
  const p = localParts(date, config.timezone);
  if (config.sendWeekdaysOnly && (p.weekday === 0 || p.weekday === 6)) return false;
  return p.hour >= config.sendWindowStartHour && p.hour < config.sendWindowEndHour;
}

export function canAutonomouslySend(config) {
  if (!['pilot', 'live'].includes(config.mode)) return { ok: false, reason: 'Autopilot is not in a sending mode.' };
  if (config.requirePhysicalPostalAddress && !config.businessPostalAddress) {
    return { ok: false, reason: 'Business postal address is required before autonomous commercial email sending.' };
  }
  return { ok: true };
}

export function prospectEligible(config, prospect) {
  if (!prospect) return { ok: false, reason: 'Missing prospect.' };
  if (Number(prospect.suppressed || 0)) return { ok: false, reason: 'Suppressed.' };
  if (Number(prospect.current_venue || 0)) return { ok: false, reason: 'Current venue.' };
  if (['skip', 'SKIP', 'PERFORMING'].includes(String(prospect.room_preference || ''))) return { ok: false, reason: 'Room preference excludes outreach.' };
  if (String(prospect.status || '').toLowerCase() === 'do not contact') return { ok: false, reason: 'Do not contact.' };
  if (String(prospect.profile || prospect.campaign_type || '').toLowerCase() === 'agency') {
    return { ok: false, reason: 'Venue-first policy: independent agency/promoter outreach is manual only.' };
  }
  if (String(prospect.automation_safe || '') !== 'YES_TARGETED') return { ok: false, reason: 'Not verified for autonomous outreach.' };
  if (!String(prospect.email || '').includes('@')) return { ok: false, reason: 'No verified email.' };
  if (Number(prospect.fit_score || 0) < config.minFitScore) return { ok: false, reason: 'Fit score below threshold.' };
  if (Number(prospect.confidence || 0) < config.minConfidence) return { ok: false, reason: 'Confidence below threshold.' };
  return { ok: true };
}

function cleanBodyBeforeSignature(body, config = {}) {
  let text = String(body || '').replace(/\r\n/g, '\n').trim();

  // The standardized signature owns Rick's website and booking email. Remove common
  // AI-generated website blocks and standalone copies so those details appear once.
  text = text
    .replace(/(^|\n)(?:Website|More about my work|More about me|More info(?:rmation)?|Learn more|About my work):\s*\nhttps?:\/\/(?:www\.)?rickparma\.com\/?\s*(?=\n|$)/gi, '$1')
    .replace(/(^|\n)https?:\/\/(?:www\.)?rickparma\.com\/?\s*(?=\n|$)/gi, '$1')
    .replace(/(^|\n)Booking(?: email)?:\s*booking@rickparma\.com\s*(?=\n|$)/gi, '$1')
    .replace(/(^|\n)(?:Website|More about my work|More about me|More info(?:rmation)?|Learn more|About my work):\s*(?=\n\s*\n|\n?$)/gi, '$1');

  let lines = text.split('\n').map(line => line.replace(/[ \t]+$/g, ''));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  // Strip any existing opt-out line so this function is idempotent on old stored drafts.
  while (lines.length && /rather not hear from me|won't follow up|will not follow up|reply ['‘’\"]?no thanks/i.test(lines[lines.length - 1].trim())) {
    lines.pop();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  }

  // Remove a previously-added system signature/footer, including the legacy
  // “Rick Parma + address” footer and the current full signature.
  const addressNeedle = String(config.businessPostalAddress || '').trim().toLowerCase();
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 14); i--) {
    if (lines[i].trim().toLowerCase() !== 'rick parma') continue;
    const tail = lines.slice(i + 1).join(' ').toLowerCase();
    const looksSystemGenerated =
      /booking@rickparma\.com|rickparma\.com|singer|vocalist|saxophonist|entertainer/.test(tail)
      || (addressNeedle && tail.includes(addressNeedle))
      || /\b(?:las vegas|north las vegas),?\s+nv\b/.test(tail)
      || /\b\d{5}(?:-\d{4})?\b/.test(tail);
    if (looksSystemGenerated) {
      lines = lines.slice(0, i);
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      break;
    }
  }

  // Remove an AI-generated name/title signature that may remain above the old footer.
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    if (lines[i].trim().toLowerCase() !== 'rick parma') continue;
    const tail = lines.slice(i + 1).join(' ').toLowerCase();
    if (!tail || /singer|vocalist|saxophonist|entertainer|booking@rickparma|rickparma\.com/.test(tail)) {
      lines = lines.slice(0, i);
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      break;
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function appendComplianceFooter(body, config) {
  const content = cleanBodyBeforeSignature(body, config);
  const signature = [
    'Rick Parma',
    'Singer • Saxophonist • Entertainer',
    'booking@rickparma.com',
    'RickParma.com',
    config.businessPostalAddress || ''
  ].filter(Boolean).join('\n');

  return [content, signature, config.optOutLine || ''].filter(Boolean).join('\n\n');
}

export function categoryPolicy(category) {
  const autoReply = new Set([
    'positive_interest', 'request_materials', 'follow_up_later', 'submission_redirect',
    'question'
  ]);
  const noReply = new Set(['bounce', 'opt_out', 'not_interested', 'not_booking_contact', 'out_of_office']);
  const escalate = new Set(['availability_request', 'rate_request', 'offer_or_hold', 'other']);
  return {
    autoReply: autoReply.has(category),
    noReply: noReply.has(category),
    escalate: escalate.has(category)
  };
}
