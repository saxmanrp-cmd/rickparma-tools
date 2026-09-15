function text(v) { return String(v ?? '').trim(); }
function norm(v) { return text(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function normEmail(v) { return text(v).toLowerCase(); }
function normPhone(v) {
  const raw = text(v);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function dedupeKey(input = {}) {
  const email = normEmail(input.email || input.Email);
  if (email && email.includes('@')) return `email:${email}`;
  const entity = norm(input.entity || input.Entity);
  const room = norm(input.room || input.Room || input['Room / Stage']);
  const contact = norm(input.contactName || input.Contact);
  return `entity:${entity}|room:${room}|contact:${contact}`;
}

function profileFor(input = {}) {
  const lane = text(input.profile || input.Lane || input.category || input.Category).toLowerCase();
  const all = [
    input.entity, input.Entity, input.room, input.Room, input.category, input.Category,
    input.Notes, input['Booking / Submission Route']
  ].map(text).join(' ').toLowerCase();
  if (/festival|concert series|arts festival/.test(all)) return 'festival';
  if (/corporate|private event|event planner|convention|meeting|association/.test(all)) return 'corporate';
  if (/agency|promoter|representation/.test(lane) || /agency|talent agency|promoter/.test(all)) return 'agency';
  if (/strategic buyer|buyer|entertainment director|booking director/.test(lane)) return 'buyer';
  return 'room';
}

function autoSafe(value) {
  const v = text(value).toUpperCase();
  if (v.includes('YES')) return 'YES_TARGETED';
  if (v.includes('NO')) return 'NO';
  return 'MANUAL';
}

function sourceJson(input) {
  const urls = [];
  const direct = input.sourceUrls || input['Source URLs'];
  if (Array.isArray(direct)) urls.push(...direct);
  if (input['Source URL']) urls.push(input['Source URL']);
  return JSON.stringify([...new Set(urls.map(text).filter(Boolean))]);
}

export async function importProspects(env, contacts = [], state = {}) {
  let imported = 0;
  let updated = 0;
  const roomPrefs = state.roomPrefs || {};
  const contactPrefs = state.contactPrefs || {};
  const overrides = state.overrides || {};
  const relationships = state.relationships || {};
  const textOk = state.textOk || {};

  for (const raw of contacts.slice(0, 1000)) {
    const id = text(raw['Contact ID']) || `IMPORTED-${crypto.randomUUID()}`;
    const merged = { ...raw, ...(overrides[id] || {}) };
    const entity = text(merged.Entity || merged.entity);
    if (!entity) continue;
    const room = text(merged['Room / Stage'] || merged.Room || merged.room);
    const email = normEmail(merged.Email || merged.email);
    const phone = normPhone(merged.Phone || merged.phone);
    const key = dedupeKey({ ...merged, entity, room, email });
    const existing = await env.DB.prepare('SELECT id FROM prospects WHERE dedupe_key = ? OR id = ? LIMIT 1').bind(key, id).first();
    const roomPref = text(roomPrefs[room] || roomPrefs[entity] || contactPrefs[id] || 'OPEN');
    const status = text(merged.Status || 'researched');
    const currentVenue = roomPref === 'PERFORMING' || String(merged['Current Venue'] || '').toLowerCase() === 'true' ? 1 : 0;
    const suppressed = status.toLowerCase() === 'do not contact' ? 1 : 0;
    const metadata = {
      imported: true,
      priority: merged.Priority || null,
      notes: merged.Notes || null,
      bookingSubmissionRoute: merged['Booking / Submission Route'] || null,
      rawLane: merged.Lane || null
    };

    await env.DB.prepare(`
      INSERT INTO prospects (
        id, dedupe_key, entity, room, category, profile, contact_name, contact_role, email, phone,
        website_url, booking_url, contact_route, fit_score, confidence, automation_safe, fit_reason,
        evidence_summary, source_urls_json, status, room_preference, relationship, text_ok, current_venue,
        suppressed, campaign_type, last_researched_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        entity = excluded.entity,
        room = COALESCE(NULLIF(excluded.room,''), prospects.room),
        category = COALESCE(NULLIF(excluded.category,''), prospects.category),
        profile = COALESCE(NULLIF(excluded.profile,''), prospects.profile),
        contact_name = COALESCE(NULLIF(excluded.contact_name,''), prospects.contact_name),
        contact_role = COALESCE(NULLIF(excluded.contact_role,''), prospects.contact_role),
        email = COALESCE(NULLIF(excluded.email,''), prospects.email),
        phone = COALESCE(NULLIF(excluded.phone,''), prospects.phone),
        website_url = COALESCE(NULLIF(excluded.website_url,''), prospects.website_url),
        booking_url = COALESCE(NULLIF(excluded.booking_url,''), prospects.booking_url),
        contact_route = COALESCE(NULLIF(excluded.contact_route,''), prospects.contact_route),
        fit_score = MAX(prospects.fit_score, excluded.fit_score),
        automation_safe = CASE WHEN prospects.automation_safe='YES_TARGETED' THEN prospects.automation_safe ELSE excluded.automation_safe END,
        status = excluded.status,
        room_preference = excluded.room_preference,
        relationship = excluded.relationship,
        text_ok = excluded.text_ok,
        current_venue = excluded.current_venue,
        suppressed = MAX(prospects.suppressed, excluded.suppressed),
        metadata_json = excluded.metadata_json
    `).bind(
      existing?.id || id, key, entity, room, text(merged.Category), profileFor(merged), text(merged.Contact), text(merged.Role),
      email, phone, text(merged.Website || merged['Website URL']), text(merged['Booking URL']),
      email ? 'email' : phone ? 'phone' : /https?:\/\//i.test(text(merged['Booking / Submission Route'])) ? 'submission' : 'unknown',
      Number(merged.Score || merged['Fit Score'] || 0) || 0, Number(merged.Confidence || 0) || 0,
      autoSafe(merged['Automation Safe?']), text(merged['Fit Reason']), text(merged['Evidence Summary']), sourceJson(merged),
      status, roomPref, text(relationships[id] || 'Cold'), textOk[id] ? 1 : 0, currentVenue, suppressed,
      profileFor(merged), JSON.stringify(metadata)
    ).run();

    if (existing) updated++; else imported++;
  }
  return { imported, updated, total: imported + updated };
}

export async function upsertResearchedProspect(env, item = {}, fallbackId = '') {
  const entity = text(item.entity);
  if (!entity) return null;
  const email = normEmail(item.email);
  const phone = normPhone(item.phone);
  const key = dedupeKey({ entity, room: item.room, contactName: item.contactName, email });
  const existing = await env.DB.prepare('SELECT id, metadata_json FROM prospects WHERE dedupe_key = ? OR id = ? LIMIT 1')
    .bind(key, fallbackId || item.requestedId || '').first();
  const id = existing?.id || fallbackId || item.requestedId || `AUTO-${crypto.randomUUID()}`;
  let metadata = {};
  try { metadata = JSON.parse(existing?.metadata_json || '{}'); } catch {}
  metadata.lastResearchResponse = {
    fitReason: item.fitReason || '',
    evidenceSummary: item.evidenceSummary || ''
  };

  await env.DB.prepare(`
    INSERT INTO prospects (
      id, dedupe_key, entity, room, category, profile, contact_name, contact_role, email, phone,
      website_url, booking_url, contact_route, fit_score, confidence, automation_safe, fit_reason,
      evidence_summary, source_urls_json, status, campaign_type, verified_at, last_researched_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'researched', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      entity = excluded.entity,
      room = excluded.room,
      category = excluded.category,
      profile = excluded.profile,
      contact_name = excluded.contact_name,
      contact_role = excluded.contact_role,
      email = excluded.email,
      phone = excluded.phone,
      website_url = excluded.website_url,
      booking_url = excluded.booking_url,
      contact_route = excluded.contact_route,
      fit_score = excluded.fit_score,
      confidence = excluded.confidence,
      automation_safe = excluded.automation_safe,
      fit_reason = excluded.fit_reason,
      evidence_summary = excluded.evidence_summary,
      source_urls_json = excluded.source_urls_json,
      campaign_type = excluded.campaign_type,
      verified_at = CURRENT_TIMESTAMP,
      last_researched_at = CURRENT_TIMESTAMP,
      metadata_json = excluded.metadata_json
  `).bind(
    id, key, entity, text(item.room), text(item.category), text(item.profile || 'room'), text(item.contactName),
    text(item.contactRole), email, phone, text(item.websiteUrl), text(item.bookingUrl), text(item.contactRoute || 'unknown'),
    Number(item.fitScore || 0), Number(item.confidence || 0), text(item.automationSafe || 'MANUAL'), text(item.fitReason),
    text(item.evidenceSummary), JSON.stringify(Array.isArray(item.sourceUrls) ? item.sourceUrls : []), text(item.profile || 'room'),
    JSON.stringify(metadata)
  ).run();
  return id;
}

export async function verificationTargets(env, limit = 6) {
  const result = await env.DB.prepare(`
    SELECT id, entity, room, contact_name, contact_role, email, phone, automation_safe, confidence, last_researched_at
    FROM prospects
    WHERE suppressed = 0
      AND current_venue = 0
      AND room_preference NOT IN ('SKIP','PERFORMING')
      AND (automation_safe != 'YES_TARGETED' OR confidence < 0.82 OR verified_at IS NULL)
    ORDER BY fit_score DESC, confidence ASC, last_researched_at ASC
    LIMIT ?
  `).bind(Math.max(1, Math.min(20, Number(limit) || 6))).all();
  return result.results || [];
}

export async function listProspects(env, { limit = 100, status = '', eligibleOnly = false } = {}) {
  const cap = Math.max(1, Math.min(500, Number(limit) || 100));
  let sql = 'SELECT * FROM prospects WHERE 1=1';
  const binds = [];
  if (status) { sql += ' AND status = ?'; binds.push(status); }
  if (eligibleOnly) {
    sql += " AND suppressed=0 AND current_venue=0 AND automation_safe='YES_TARGETED' AND email IS NOT NULL AND email != ''";
  }
  sql += ' ORDER BY fit_score DESC, confidence DESC, discovered_at DESC LIMIT ?';
  binds.push(cap);
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return (result.results || []).map(row => ({
    ...row,
    sourceUrls: (() => { try { return JSON.parse(row.source_urls_json || '[]'); } catch { return []; } })(),
    metadata: (() => { try { return JSON.parse(row.metadata_json || '{}'); } catch { return {}; } })()
  }));
}

export async function getProspect(env, id) {
  return env.DB.prepare('SELECT * FROM prospects WHERE id = ? LIMIT 1').bind(id).first();
}

export async function suppressProspect(env, id, reason, kind = 'contact') {
  const p = await getProspect(env, id);
  if (!p) return false;
  await env.DB.prepare("UPDATE prospects SET suppressed=1, status='Do not contact', campaign_active=0, next_action_at=NULL WHERE id=?").bind(id).run();
  const values = [];
  if (p.email) values.push(['email', normEmail(p.email)]);
  if (p.phone) values.push(['phone', normPhone(p.phone)]);
  if (!values.length) values.push([kind, id]);
  for (const [k, v] of values) {
    await env.DB.prepare(`INSERT OR IGNORE INTO suppressions (contact_id, kind, value, reason) VALUES (?, ?, ?, ?)`)
      .bind(id, k, v, text(reason)).run();
    if (k === 'email') await env.DB.prepare("UPDATE prospects SET suppressed=1, status='Do not contact', campaign_active=0, next_action_at=NULL WHERE lower(email)=?").bind(v).run();
    if (k === 'phone') await env.DB.prepare("UPDATE prospects SET suppressed=1, status='Do not contact', campaign_active=0, next_action_at=NULL WHERE phone=?").bind(v).run();
  }
  return true;
}
