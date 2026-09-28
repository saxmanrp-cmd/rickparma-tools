const RESPONSES_URL = 'https://api.openai.com/v1/responses';

function configured(env) {
  return !!String(env.OPENAI_API_KEY || '').trim();
}

function responseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function sourceUrls(data) {
  const urls = new Set();
  for (const item of data?.output || []) {
    if (item?.type === 'web_search_call') {
      for (const source of item?.action?.sources || []) {
        if (source?.url) urls.add(source.url);
      }
      if (item?.action?.url) urls.add(item.action.url);
    }
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        for (const ann of part?.annotations || []) {
          const url = ann?.url || ann?.url_citation?.url;
          if (url) urls.add(url);
        }
      }
    }
  }
  return [...urls];
}

async function structuredResearchResponse(env, { schema, instructions, input }) {
  if (!configured(env)) throw new Error('OPENAI_API_KEY is not configured.');
  const payload = {
    model: env.OPENAI_RESEARCH_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra',
    store: false,
    reasoning: { effort: 'medium' },
    instructions,
    input,
    tools: [{ type: 'web_search', search_context_size: 'high' }],
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        name: 'booking_research',
        strict: true,
        schema
      }
    }
  };

  const response = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(`OpenAI request failed: ${detail}`);
  }
  const text = responseText(data);
  if (!text) throw new Error('OpenAI returned no structured output.');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('OpenAI structured output could not be parsed.'); }
  return { data: parsed, sources: sourceUrls(data), responseId: data.id || null };
}

const prospectShape = {
  type: 'object',
  additionalProperties: false,
  properties: {
    requestedId: { type: 'string' },
    entity: { type: 'string' },
    room: { type: 'string' },
    category: { type: 'string' },
    profile: { type: 'string', enum: ['room', 'buyer', 'agency', 'festival', 'corporate'] },
    contactName: { type: 'string' },
    contactRole: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    websiteUrl: { type: 'string' },
    bookingUrl: { type: 'string' },
    contactRoute: { type: 'string', enum: ['email', 'phone', 'submission', 'unknown'] },
    fitScore: { type: 'integer', minimum: 0, maximum: 100 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    automationSafe: { type: 'string', enum: ['YES_TARGETED', 'MANUAL', 'NO'] },
    fitReason: { type: 'string' },
    evidenceSummary: { type: 'string' },
    sourceUrls: { type: 'array', items: { type: 'string' }, maxItems: 8 }
  },
  required: [
    'requestedId','entity','room','category','profile','contactName','contactRole','email','phone',
    'websiteUrl','bookingUrl','contactRoute','fitScore','confidence','automationSafe','fitReason',
    'evidenceSummary','sourceUrls'
  ]
};

const researchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verified: { type: 'array', items: prospectShape, maxItems: 10 },
    discovered: { type: 'array', items: prospectShape, maxItems: 12 },
    researchNotes: { type: 'string' }
  },
  required: ['verified', 'discovered', 'researchNotes']
};

function discoveryFocus() {
  const slices = [
    'Las Vegas Strip resort lounges, casino bars, lobby lounges, cocktail rooms and smaller recurring live-music stages — not headline arenas or large ticketed showrooms.',
    'Off-Strip Las Vegas cocktail lounges, supper clubs, piano bars, wine bars, speakeasies and upscale neighborhood bars with recurring live music.',
    'Las Vegas restaurants, steakhouses, Italian restaurants, seafood restaurants, rooftop restaurants and restaurant-bars that advertise recurring live music.',
    'Downtown Las Vegas, Fremont East and the Arts District: lounges, bars, restaurants, breweries and patios with recurring professional live entertainment.',
    'Spring Mountain/Chinatown, west Las Vegas, Summerlin and Centennial: lounges, restaurants, casino bars and neighborhood venues with recurring live music.',
    'Henderson, Green Valley, Enterprise/Southwest and Lake Las Vegas: lounges, restaurants, casino bars, country-club-style rooms and recurring entertainment stages.',
    'North Las Vegas and the Aliante/Centennial area: casino lounges, restaurants, bars and recurring live-music rooms that fit a polished singer/sax act.',
    'Laughlin, Nevada: casino lounges, casino bars, restaurant stages, nightclub lounges and recurring live-music rooms at Aquarius, Riverside, Edgewater, Golden Nugget, Harrah’s, Tropicana, New Pioneer, Laughlin River Lodge and other current properties.',
    'Laughlin, Nevada beyond the obvious main stages: smaller lounge programming, restaurant entertainment, resort bars and the entertainment buyers who program multiple rooms.',
    'Southern Nevada venue groups, casino/hospitality operators and entertainment directors who directly program multiple Las Vegas or Laughlin rooms.'
  ];
  const now = new Date();
  const slot = (now.getUTCDate() * 144 + now.getUTCHours() * 6 + Math.floor(now.getUTCMinutes() / 10)) % slices.length;
  return slices[slot];
}

export async function researchBookingProspects(env, { verify = [], discoverCount = 5 } = {}) {
  const verifyText = verify.length
    ? verify.map(v => `- ID ${v.id}: ${v.entity}${v.room ? ` / ${v.room}` : ''}; existing contact ${v.contactName || 'unknown'} ${v.contactRole || ''}; email ${v.email || 'unknown'}; phone ${v.phone || 'unknown'}; status ${v.status || 'unknown'}${Array.isArray(v.invalidEmails) && v.invalidEmails.length ? `; BOUNCED/INVALID EMAILS — DO NOT REUSE: ${v.invalidEmails.join(', ')}` : ''}`).join('\n')
    : '- none';
  const count = Math.max(0, Math.min(10, Number(discoverCount) || 0));
  const focus = discoveryFocus();

  const input = `Research current live-music booking opportunities for Rick Parma across the Las Vegas Valley AND Laughlin, Nevada.\n\nVERIFY THESE EXISTING LEADS:\n${verifyText}\n\nAlso discover up to ${count} additional strong prospects.\n\nCURRENT DISCOVERY FOCUS FOR THIS CYCLE:\n${focus}\nThis focus is a bias for deeper coverage, not an exclusion. If the strongest current evidence points to another appropriate Las Vegas Valley or Laughlin prospect, include it.\n\nARTIST FIT:\nRick is a Las Vegas singer/saxophonist. His main music is R&B, Motown, soul, funk, pop, Top 40 and neo-soul. He can perform as a polished solo singer/sax act to tracks, duo/small combo, or full band. Favor recurring lounge, bar, restaurant, casino and hospitality work where that flexibility is useful.\n\nGEOGRAPHIC COVERAGE — SEARCH DEEPLY, NOT JUST THE MOST FAMOUS VENUES:\n- Las Vegas Strip resort lounges, lobby bars, casino bars and smaller stages\n- Downtown/Fremont East and Arts District\n- Spring Mountain/Chinatown and west Las Vegas\n- Summerlin/Centennial\n- North Las Vegas/Aliante\n- Henderson/Green Valley\n- Enterprise/Southwest and Lake Las Vegas\n- Laughlin, Nevada, including individual rooms inside casino resorts\n\nVENUE TYPES TO ACTIVELY SEEK:\ncasino lounges, casino bars, hotel lobby lounges, cocktail lounges, supper clubs, speakeasies, wine bars, piano bars, restaurant-bars, steakhouses, Italian restaurants, seafood restaurants, rooftops, breweries, patios, resort pool/lounge programming when it uses professional live musicians, and other restaurants or bars with recurring live music. Also include venue-owned entertainment departments, casino/hospitality groups and corporate/private-event buyers that directly control bookings for real rooms.\n\nDEEP-DISCOVERY RULES:\n1. Prioritize evidence of recurring music: weekly calendars, nightly entertainment, recurring residencies, live-music pages, event calendars, or repeated musician listings.\n2. Look for individual rooms inside a resort, not only the parent casino. A single property may contain several different booking opportunities.\n3. Prefer smaller and midsize rooms Rick could realistically play over headline arenas, concert halls and large ticketed showrooms.\n4. For ${count >= 6 ? 'a discovery batch of this size, aim for several direct room-level prospects and include Laughlin or a non-Strip neighborhood prospect when current evidence supports it' : 'new discoveries, favor room-level opportunities over generic directories'}.\n5. Do not return duplicates merely because the same property has multiple generic pages; a separate room is useful only when it represents a distinct entertainment opportunity.\n6. Search current 2026 schedules/pages when available so we do not chase venues that no longer program live music.
7. VENUE-FIRST POLICY: new discovery should overwhelmingly be direct venues, venue entertainment departments, casino/hospitality operators, or buyers who directly control venue calendars.
8. Do not discover independent booking agents, talent agencies, promoters, consultants, marketing companies or other intermediaries merely because they work in entertainment. Rick is building his own booking operation and the primary goal is direct venue relationships.
9. An intermediary is relevant only when current evidence shows that person/company is the explicit booking gatekeeper for a specific target venue and no practical direct venue route is available. In that case, keep automationSafe MANUAL unless the booking authority is unmistakably documented.\n\nROOM-SPECIFIC EXCLUSIONS:\nDo not recommend straight-ahead-jazz-only rooms or country-first rooms for direct room outreach. Do NOT blacklist a buyer merely because they control one excluded room; they may control other appropriate rooms.\n\nVERIFICATION RULES:\nUse current public professional sources and strongly prefer official venue/company pages, entertainment calendars, contact pages and current professional profiles/directories. Do not invent emails, phone numbers, names, roles, booking routes or room names. Only return a direct email when publicly evidenced. Never reuse an address explicitly marked BOUNCED/INVALID in the verification list; find a different current route. If a lead cannot be confidently verified, mark MANUAL or NO rather than guessing. For new discoveries, prioritize prospects with a real email or official artist-submission/contact route. Use requestedId only for leads supplied in the verification list; use an empty string for newly discovered prospects.\n\nAutomationSafe should be YES_TARGETED only when the entity/opportunity is a strong fit AND the professional contact route is sufficiently verified for targeted one-to-one outreach.\n\nSOURCE REQUIREMENT:\nFor every verified or discovered item, populate sourceUrls with the exact current webpages actually used to support the entity, room, contact, role, email, phone, booking route and fit assessment. Prefer official venue/company pages. Do not invent or reconstruct URLs.`;

  return structuredResearchResponse(env, {
    schema: researchSchema,
    instructions: 'You are the venue-acquisition research desk for a professional Southern Nevada musician booking operation. Prioritize direct venue relationships and the people who actually control live-music calendars. Search the Las Vegas Valley and Laughlin deeply, including individual lounge/bar/restaurant rooms inside larger properties. Do not fill discovery batches with agents, consultants or promoters. Be conservative with identity/contact verification. Current evidence matters more than old directory data. Return only the requested JSON structure.',
    input
  });
}
