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


function venueComparable(value) {
  return norm(value)
    .replace(/^the\s+/, '')
    .replace(/\b(?:hotel|casino|resort|lounge|club|bar|room|stage|showroom|theater|theatre)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function venueNames(input = {}) {
  const values = [
    input.entity, input.Entity,
    input.room, input.Room, input['Room / Stage']
  ];
  const names = new Set();
  for (const value of values) {
    const raw = norm(value);
    const comparable = venueComparable(value);
    if (raw) names.add(raw);
    if (comparable) names.add(comparable);
  }
  return names;
}

function venueSetsOverlap(a, b) {
  for (const left of a) {
    for (const right of b) {
      if (left === right) return true;
    }
  }
  return false;
}

export async function matchesKnownCurrentVenue(env, item = {}) {
  const candidateNames = venueNames(item);

  const current = await env.DB.prepare(`
    SELECT entity,room
    FROM prospects
    WHERE current_venue=1 OR room_preference='PERFORMING'
  `).all();

  for (const row of (current.results || [])) {
    if (venueSetsOverlap(candidateNames, venueNames(row))) return true;
  }

  const stateRow = await env.DB.prepare(
    "SELECT state_json FROM app_state WHERE id='rick' LIMIT 1"
  ).first();

  const state = parsedJson(stateRow?.state_json, {});
  for (const [name, preference] of Object.entries(state.roomPrefs || {})) {
    if (String(preference || '').toUpperCase() !== 'PERFORMING') continue;
    if (venueSetsOverlap(candidateNames, venueNames({ entity: name, room: name }))) {
      return true;
    }
  }

  return false;
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

function parsedJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); }
  catch { return fallback; }
}

async function existingForImport(env, id, key) {
  const byId = id ? await env.DB.prepare('SELECT * FROM prospects WHERE id=? LIMIT 1').bind(id).first() : null;
  if (byId) return byId;
  return env.DB.prepare('SELECT * FROM prospects WHERE dedupe_key=? LIMIT 1').bind(key).first();
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
    const existing = await existingForImport(env, id, key);
    const roomPref = text(roomPrefs[room] || roomPrefs[entity] || contactPrefs[id] || existing?.room_preference || 'OPEN');
    const status = text(merged.Status || existing?.status || 'researched');
    const currentVenue = roomPref === 'PERFORMING' || String(merged['Current Venue'] || '').toLowerCase() === 'true' ? 1 : Number(existing?.current_venue || 0);
    const suppressed = status.toLowerCase() === 'do not contact' ? 1 : Number(existing?.suppressed || 0);
    const importedMetadata = {
      imported: true,
      priority: merged.Priority || null,
      notes: merged.Notes || null,
      bookingSubmissionRoute: merged['Booking / Submission Route'] || null,
      rawLane: merged.Lane || null
    };

    if (existing) {
      // Browser import is user-state sync. Once web research has verified a contact,
      // never replace that verified email/role/route with an older static seed row.
      const verified = !!existing.verified_at;
      const metadata = { ...parsedJson(existing.metadata_json, {}), ...importedMetadata };
      await env.DB.prepare(`
        UPDATE prospects SET
          entity=CASE WHEN verified_at IS NULL THEN ? ELSE entity END,
          room=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),room) ELSE room END,
          category=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),category) ELSE category END,
          profile=CASE WHEN verified_at IS NULL THEN ? ELSE profile END,
          contact_name=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),contact_name) ELSE contact_name END,
          contact_role=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),contact_role) ELSE contact_role END,
          email=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),email) ELSE email END,
          phone=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),phone) ELSE phone END,
          website_url=CASE WHEN verified_at IS NULL THEN COALESCE(NULLIF(?,''),website_url) ELSE website_url END,
          contact_route=CASE WHEN verified_at IS NULL THEN ? ELSE contact_route END,
          fit_score=CASE WHEN verified_at IS NULL THEN MAX(fit_score,?) ELSE fit_score END,
          automation_safe=CASE WHEN verified_at IS NULL AND automation_safe!='YES_TARGETED' THEN ? ELSE automation_safe END,
          status=?, room_preference=?, relationship=?, text_ok=?, current_venue=?, suppressed=MAX(suppressed,?),
          campaign_type=COALESCE(campaign_type,?), metadata_json=?
        WHERE id=?
      `).bind(
        entity, room, text(merged.Category), profileFor(merged), text(merged.Contact), text(merged.Role), email, phone,
        text(merged.Website || merged['Website URL']),
        email ? 'email' : phone ? 'phone' : /https?:\/\//i.test(text(merged['Booking / Submission Route'])) ? 'submission' : 'unknown',
        Number(merged.Score || merged['Fit Score'] || 0) || 0, autoSafe(merged['Automation Safe?']), status, roomPref,
        text(relationships[id] || existing.relationship || 'Cold'), textOk[id] ? 1 : Number(existing.text_ok || 0),
        currentVenue, suppressed, profileFor(merged), JSON.stringify(metadata), existing.id
      ).run();
      updated++;
      continue;
    }

    await env.DB.prepare(`
      INSERT INTO prospects (
        id,dedupe_key,entity,room,category,profile,contact_name,contact_role,email,phone,
        website_url,booking_url,contact_route,fit_score,confidence,automation_safe,fit_reason,
        evidence_summary,source_urls_json,status,room_preference,relationship,text_ok,current_venue,
        suppressed,campaign_type,last_researched_at,metadata_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)
    `).bind(
      id, key, entity, room, text(merged.Category), profileFor(merged), text(merged.Contact), text(merged.Role),
      email, phone, text(merged.Website || merged['Website URL']), text(merged['Booking URL']),
      email ? 'email' : phone ? 'phone' : /https?:\/\//i.test(text(merged['Booking / Submission Route'])) ? 'submission' : 'unknown',
      Number(merged.Score || merged['Fit Score'] || 0) || 0, Number(merged.Confidence || 0) || 0,
      autoSafe(merged['Automation Safe?']), text(merged['Fit Reason']), text(merged['Evidence Summary']), sourceJson(merged),
      status, roomPref, text(relationships[id] || 'Cold'), textOk[id] ? 1 : 0, currentVenue, suppressed,
      profileFor(merged), JSON.stringify(importedMetadata)
    ).run();
    imported++;
  }
  return { imported, updated, total: imported + updated };
}

export async function upsertResearchedProspect(env, item = {}, fallbackId = '') {
  const entity = text(item.entity);
  if (!entity) return null;
  const email = normEmail(item.email);
  const phone = normPhone(item.phone);
  const key = dedupeKey({ entity, room: item.room, contactName: item.contactName, email });
  const requestedId = fallbackId || item.requestedId || '';
  const byId = requestedId ? await env.DB.prepare('SELECT * FROM prospects WHERE id=? LIMIT 1').bind(requestedId).first() : null;
  const byKey = await env.DB.prepare('SELECT * FROM prospects WHERE dedupe_key=? LIMIT 1').bind(key).first();
  const existing = byId || byKey;
  const id = existing?.id || requestedId || `AUTO-${crypto.randomUUID()}`;
  const conflictingKey = byId && byKey && byId.id !== byKey.id;
  const safeKey = conflictingKey ? byId.dedupe_key : key;
  const metadata = {
    ...parsedJson(existing?.metadata_json, {}),
    lastResearchResponse: {
      fitReason: item.fitReason || '',
      evidenceSummary: item.evidenceSummary || '',
      requestedDedupeKey: key,
      dedupeCollision: !!conflictingKey
    }
  };

  if (existing) {
    await env.DB.prepare(`
      UPDATE prospects SET
        dedupe_key=?, entity=?, room=?, category=?, profile=?, contact_name=?, contact_role=?, email=?, phone=?,
        website_url=?, booking_url=?, contact_route=?, fit_score=?, confidence=?, automation_safe=?, fit_reason=?,
        evidence_summary=?, source_urls_json=?, campaign_type=?, verified_at=CURRENT_TIMESTAMP,
        last_researched_at=CURRENT_TIMESTAMP, metadata_json=?
      WHERE id=?
    `).bind(
      safeKey, entity, text(item.room), text(item.category), text(item.profile || 'room'), text(item.contactName),
      text(item.contactRole), email, phone, text(item.websiteUrl), text(item.bookingUrl), text(item.contactRoute || 'unknown'),
      Number(item.fitScore || 0), Number(item.confidence || 0), text(item.automationSafe || 'MANUAL'), text(item.fitReason),
      text(item.evidenceSummary), JSON.stringify(Array.isArray(item.sourceUrls) ? item.sourceUrls : []), text(item.profile || 'room'),
      JSON.stringify(metadata), existing.id
    ).run();
    return existing.id;
  }

  await env.DB.prepare(`
    INSERT INTO prospects (
      id,dedupe_key,entity,room,category,profile,contact_name,contact_role,email,phone,
      website_url,booking_url,contact_route,fit_score,confidence,automation_safe,fit_reason,
      evidence_summary,source_urls_json,status,campaign_type,verified_at,last_researched_at,metadata_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'researched',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
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
    SELECT id,entity,room,contact_name,contact_role,email,phone,automation_safe,confidence,last_researched_at
    FROM prospects
    WHERE suppressed=0
      AND current_venue=0
      AND room_preference NOT IN ('SKIP','PERFORMING')
      AND (
        verified_at IS NULL
        OR source_urls_json IS NULL
        OR source_urls_json='[]'
      )
    ORDER BY fit_score DESC,confidence ASC,last_researched_at ASC
    LIMIT ?
  `).bind(Math.max(1, Math.min(20, Number(limit) || 6))).all();
  return result.results || [];
}

export async function listProspects(env, { limit = 100, status = '', eligibleOnly = false } = {}) {
  const cap = Math.max(1, Math.min(500, Number(limit) || 100));
  let sql = 'SELECT * FROM prospects WHERE 1=1';
  const binds = [];
  if (status) { sql += ' AND status=?'; binds.push(status); }
  if (eligibleOnly) {
    sql += " AND suppressed=0 AND current_venue=0 AND automation_safe='YES_TARGETED' AND email IS NOT NULL AND email!=''";
  }
  sql += ' ORDER BY fit_score DESC,confidence DESC,discovered_at DESC LIMIT ?';
  binds.push(cap);
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return (result.results || []).map(row => ({
    ...row,
    sourceUrls: parsedJson(row.source_urls_json, []),
    metadata: parsedJson(row.metadata_json, {})
  }));
}

export async function getProspect(env, id) {
  return env.DB.prepare('SELECT * FROM prospects WHERE id=? LIMIT 1').bind(id).first();
}

export async function suppressProspect(env, id, reason, kind = 'contact') {
  const p = await getProspect(env, id);
  if (!p) return false;
  await env.DB.prepare("UPDATE prospects SET suppressed=1,status='Do not contact',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
  const values = [];
  if (p.email) values.push(['email', normEmail(p.email)]);
  if (p.phone) values.push(['phone', normPhone(p.phone)]);
  if (!values.length) values.push([kind, id]);
  for (const [k, v] of values) {
    await env.DB.prepare(`INSERT OR IGNORE INTO suppressions (contact_id,kind,value,reason) VALUES (?,?,?,?)`)
      .bind(id, k, v, text(reason)).run();
    if (k === 'email') {
      await env.DB.prepare("UPDATE prospects SET suppressed=1,status='Do not contact',campaign_active=0,next_action_at=NULL WHERE lower(email)=?").bind(v).run();
    }
    if (k === 'phone') {
      await env.DB.prepare("UPDATE prospects SET suppressed=1,status='Do not contact',campaign_active=0,next_action_at=NULL WHERE phone=?").bind(v).run();
    }
  }
  return true;
}
