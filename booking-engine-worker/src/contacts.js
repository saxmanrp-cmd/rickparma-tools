function text(value) { return String(value ?? '').trim(); }

function normEmail(value) {
  return text(value).toLowerCase();
}

function normPhone(value) {
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function marketText(value) {
  return text(value).replace(/\s+/g, ' ');
}

function isVegasMarket(value) {
  return /\b(las vegas|vegas|southern nevada|nevada)\b/i.test(text(value));
}

function contactScore(contact = {}) {
  let score = Math.max(0, Math.min(1, Number(contact.confidence || 0))) * 20;
  const role = text(contact.role).toLowerCase();
  if (isVegasMarket(contact.market)) score += 80;
  if (contact.isPrimarySuggested) score += 24;
  if (/owner|principal|president|founder/.test(role)) score += 22;
  if (/sales director|booking director|entertainment director|director/.test(role)) score += 18;
  if (/booking|talent buyer|sales/.test(role)) score += 10;
  if (text(contact.email)) score += 5;
  if (text(contact.phone)) score += 4;
  return score;
}

export async function ensureProspectContactsSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS prospect_contacts (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      market TEXT,
      website_url TEXT,
      social_url TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      source_message_id TEXT,
      source_kind TEXT NOT NULL DEFAULT 'reply',
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect
    ON prospect_contacts(prospect_id, is_primary DESC, updated_at DESC)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_prospect_contacts_email
    ON prospect_contacts(email)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_prospect_contacts_phone
    ON prospect_contacts(phone)
  `).run();
}

async function findExistingContact(env, prospectId, contact) {
  const email = normEmail(contact.email);
  const phone = normPhone(contact.phone);
  const name = text(contact.name);

  if (email) {
    const row = await env.DB.prepare(
      'SELECT * FROM prospect_contacts WHERE prospect_id=? AND lower(email)=? LIMIT 1'
    ).bind(prospectId, email).first();
    if (row) return row;
  }

  if (phone) {
    const row = await env.DB.prepare(
      'SELECT * FROM prospect_contacts WHERE prospect_id=? AND phone=? LIMIT 1'
    ).bind(prospectId, phone).first();
    if (row) return row;
  }

  if (name) {
    return env.DB.prepare(
      'SELECT * FROM prospect_contacts WHERE prospect_id=? AND lower(name)=lower(?) LIMIT 1'
    ).bind(prospectId, name).first();
  }

  return null;
}

async function upsertContact(env, prospectId, messageId, raw) {
  const name = text(raw.name);
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence || 0)));
  if (!name || confidence < 0.65) return null;

  const contact = {
    name,
    role: text(raw.role),
    email: normEmail(raw.email),
    phone: normPhone(raw.phone),
    market: marketText(raw.market),
    websiteUrl: text(raw.websiteUrl),
    socialUrl: text(raw.socialUrl),
    isPrimarySuggested: raw.isPrimarySuggested === true,
    confidence
  };

  const existing = await findExistingContact(env, prospectId, contact);
  const metadata = JSON.stringify({
    explicitFromReply: true,
    sourceText: text(raw.sourceText).slice(0, 500)
  });

  if (existing) {
    await env.DB.prepare(`
      UPDATE prospect_contacts SET
        name=COALESCE(NULLIF(?,''),name),
        role=COALESCE(NULLIF(?,''),role),
        email=COALESCE(NULLIF(?,''),email),
        phone=COALESCE(NULLIF(?,''),phone),
        market=COALESCE(NULLIF(?,''),market),
        website_url=COALESCE(NULLIF(?,''),website_url),
        social_url=COALESCE(NULLIF(?,''),social_url),
        confidence=MAX(confidence,?),
        source_message_id=COALESCE(NULLIF(?,''),source_message_id),
        metadata_json=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      contact.name,
      contact.role,
      contact.email,
      contact.phone,
      contact.market,
      contact.websiteUrl,
      contact.socialUrl,
      contact.confidence,
      messageId || '',
      metadata,
      existing.id
    ).run();
    return { ...contact, id: existing.id };
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO prospect_contacts (
      id,prospect_id,name,role,email,phone,market,website_url,social_url,
      is_primary,confidence,source_message_id,source_kind,metadata_json
    ) VALUES (?,?,?,?,?,?,?,?,?,0,?,?, 'reply',?)
  `).bind(
    id,
    prospectId,
    contact.name,
    contact.role || null,
    contact.email || null,
    contact.phone || null,
    contact.market || null,
    contact.websiteUrl || null,
    contact.socialUrl || null,
    contact.confidence,
    messageId || null,
    metadata
  ).run();
  return { ...contact, id };
}

export async function learnContactsFromReply(env, prospect, message, extraction = {}) {
  if (!env?.DB || !prospect?.id || !message?.id) {
    return { version: 'reply-contacts-v1', learned: 0, primaryUpdated: false };
  }

  await ensureProspectContactsSchema(env);

  const candidates = Array.isArray(extraction.discoveredContacts)
    ? extraction.discoveredContacts.slice(0, 10)
    : [];

  let learned = 0;
  for (const raw of candidates) {
    const saved = await upsertContact(env, prospect.id, message.id, raw);
    if (saved) learned++;
  }

  const orgWebsite = text(extraction.organizationWebsite);
  if (orgWebsite) {
    await env.DB.prepare(
      "UPDATE prospects SET website_url=COALESCE(NULLIF(website_url,''),?) WHERE id=?"
    ).bind(orgWebsite, prospect.id).run();
  }

  const result = await env.DB.prepare(`
    SELECT * FROM prospect_contacts
    WHERE prospect_id=?
    ORDER BY updated_at DESC
  `).bind(prospect.id).all();

  const contacts = result.results || [];
  const vegasContacts = contacts.filter(row => isVegasMarket(row.market));
  const unassignedMarketContacts = contacts.filter(row => !text(row.market));
  // This Booking Engine is Las Vegas-first. If a reply explicitly labels contacts
  // for other markets, keep them as alternates instead of replacing the Vegas route.
  const pool = vegasContacts.length ? vegasContacts : unassignedMarketContacts;
  const best = pool
    .filter(row => text(row.name) && Number(row.confidence || 0) >= 0.8)
    .sort((a, b) => contactScore(b) - contactScore(a))[0] || null;

  let primaryUpdated = false;
  if (best) {
    await env.DB.prepare('UPDATE prospect_contacts SET is_primary=0 WHERE prospect_id=?')
      .bind(prospect.id).run();
    await env.DB.prepare('UPDATE prospect_contacts SET is_primary=1,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(best.id).run();

    await env.DB.prepare(`
      UPDATE prospects SET
        contact_name=?,
        contact_role=COALESCE(NULLIF(?,''),contact_role),
        phone=COALESCE(NULLIF(?,''),phone)
      WHERE id=?
    `).bind(best.name, best.role || '', best.phone || '', prospect.id).run();
    primaryUpdated = true;
  }

  return {
    version: 'reply-contacts-v1',
    learned,
    primaryUpdated,
    primaryContact: best ? {
      id: best.id,
      name: best.name,
      role: best.role || '',
      phone: best.phone || '',
      email: best.email || '',
      market: best.market || ''
    } : null,
    organizationWebsite: orgWebsite || ''
  };
}

export async function listProspectContacts(env, prospectId) {
  await ensureProspectContactsSchema(env);
  const result = await env.DB.prepare(`
    SELECT id,prospect_id,name,role,email,phone,market,website_url,social_url,
           is_primary,confidence,source_message_id,source_kind,created_at,updated_at
    FROM prospect_contacts
    WHERE prospect_id=?
    ORDER BY is_primary DESC,updated_at DESC,name ASC
  `).bind(prospectId).all();
  return result.results || [];
}
