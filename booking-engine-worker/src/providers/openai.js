const RESPONSES_URL = 'https://api.openai.com/v1/responses';

function configured(env) {
  return !!String(env.OPENAI_API_KEY || '').trim();
}

export function openaiStatus(env) {
  return {
    provider: 'openai-responses',
    configured: configured(env),
    researchModel: env.OPENAI_RESEARCH_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra',
    automationModel: env.OPENAI_MODEL || 'gpt-5.6-luna'
  };
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
      for (const source of item?.action?.sources || []) if (source?.url) urls.add(source.url);
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

async function structuredResponse(env, {
  name,
  schema,
  instructions,
  input,
  web = false,
  model = null,
  effort = 'low'
}) {
  if (!configured(env)) throw new Error('OPENAI_API_KEY is not configured.');
  const payload = {
    model: model || env.OPENAI_MODEL || 'gpt-5.6-luna',
    store: false,
    reasoning: { effort },
    instructions,
    input,
    text: {
      format: {
        type: 'json_schema',
        name,
        strict: true,
        schema
      }
    }
  };
  if (web) payload.tools = [{ type: 'web_search', search_context_size: 'medium' }];

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

export async function researchBookingProspects(env, { verify = [], discoverCount = 5 } = {}) {
  const verifyText = verify.length
    ? verify.map(v => `- ID ${v.id}: ${v.entity}${v.room ? ` / ${v.room}` : ''}; existing contact ${v.contactName || 'unknown'} ${v.contactRole || ''}; email ${v.email || 'unknown'}; phone ${v.phone || 'unknown'}`).join('\n')
    : '- none';
  const input = `Research current Las Vegas live-music booking opportunities for Rick Parma.\n\nVERIFY THESE EXISTING LEADS:\n${verifyText}\n\nAlso discover up to ${Math.max(0, Math.min(10, Number(discoverCount) || 0))} additional strong prospects.\n\nRick is a Las Vegas singer/saxophonist whose best targets are casino lounges, casino bars, upscale lounges, restaurants with recurring live music, cocktail rooms, corporate/private-event buyers, appropriate festivals, and agencies/promoters that place local live entertainment. His main music is R&B, Motown, soul, funk, pop, Top 40 and neo-soul. He can perform solo singer/sax to tracks through full band.\n\nROOM-SPECIFIC EXCLUSIONS: do not recommend straight-ahead-jazz-only rooms or country-first rooms for direct room outreach. Do NOT blacklist a buyer merely because they control one excluded room; they may control other appropriate rooms.\n\nVerification rules: use current public professional sources, strongly prefer official venue/company pages and current professional profiles/directories. Do not invent emails, phone numbers, names, roles, or booking routes. Only return a direct email when publicly evidenced. If a lead cannot be confidently verified, mark MANUAL or NO rather than guessing. For new discoveries, prioritize prospects with a real email or official artist-submission route. Use requestedId only for leads supplied in the verification list; use an empty string for newly discovered prospects.\n\nAutomationSafe should be YES_TARGETED only when the entity/opportunity is a strong fit AND the professional contact route is sufficiently verified for targeted one-to-one outreach.`;

  return structuredResponse(env, {
    name: 'booking_research',
    schema: researchSchema,
    instructions: 'You are the research desk for a professional Las Vegas musician booking operation. Be conservative with identity/contact verification. Current evidence matters more than old directory data. Return only the requested JSON structure.',
    input,
    web: true,
    effort: 'medium',
    model: env.OPENAI_RESEARCH_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra'
  });
}

const replySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [
        'positive_interest','request_materials','availability_request','rate_request','offer_or_hold',
        'not_interested','follow_up_later','submission_redirect','out_of_office','bounce','opt_out',
        'question','other'
      ]
    },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    summary: { type: 'string' },
    mustEscalate: { type: 'boolean' },
    autoReplyAllowed: { type: 'boolean' },
    followUpDate: { type: 'string' },
    extractedDateOrWindow: { type: 'string' },
    extractedMoneyOrTerms: { type: 'string' },
    submissionUrl: { type: 'string' },
    recommendedAction: { type: 'string' }
  },
  required: [
    'category','sentiment','summary','mustEscalate','autoReplyAllowed','followUpDate',
    'extractedDateOrWindow','extractedMoneyOrTerms','submissionUrl','recommendedAction'
  ]
};

export async function classifyBookingReply(env, { sender, subject, body, context = '' }) {
  const input = `Classify this reply to Rick Parma's booking outreach.\n\nFROM: ${sender || ''}\nSUBJECT: ${subject || ''}\nREPLY:\n${String(body || '').slice(0, 12000)}\n\nKNOWN CONTEXT:\n${String(context || '').slice(0, 6000)}\n\nSafety policy: offers/holds, specific date availability, money/rates, contracts, exclusivity, legal terms, unusual commitments, or anything ambiguous/high-value MUST be escalated. Routine requests for promo materials, simple acknowledgements, follow-up-later requests, submission redirects, not-interested responses, opt-outs, out-of-office notices, and basic questions answerable from the artist profile may be auto-handled. Never treat an opt-out as a sales opportunity.`;
  return structuredResponse(env, {
    name: 'booking_reply_classification',
    schema: replySchema,
    instructions: 'You triage professional booking email replies. Protect the artist from accidental commitments. Be conservative about escalation.',
    input,
    effort: 'low',
    model: env.OPENAI_MODEL || 'gpt-5.6-luna'
  });
}

const draftSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' }
  },
  required: ['subject', 'body']
};

export async function draftBookingEmail(env, { prospect, artistContext, assets, purpose = 'initial', priorMessages = '' }) {
  const input = `Write a concise, human professional booking email from Rick Parma.\n\nPURPOSE: ${purpose}\nPROSPECT:\n${JSON.stringify(prospect)}\n\nARTIST FACTS:\n${String(artistContext || '').slice(0, 7000)}\n\nUSEFUL LINKS:\n${String(assets || '').slice(0, 4000)}\n\nPRIOR THREAD IF ANY:\n${String(priorMessages || '').slice(0, 8000)}\n\nRules: 1) Do not invent facts about the venue, contact, artist, availability, rates, or relationships. 2) Keep a first cold email compact and personalized; usually 120-220 words before the compliance footer. 3) Use at most two promo/media links plus the current calendar unless a reply specifically asks for more. 4) Do not claim Rick is represented by the recipient or imply an existing relationship unless supplied. 5) Do not promise availability, pricing, contracts, exclusivity, or dates. 6) The caller is Rick Parma, not a fake agent. 7) No hypey marketing language or mass-mail wording. 8) If relatedOpportunities are supplied for the same buyer email, treat them as one relationship and do not write separate-sounding room pitches.`;
  return structuredResponse(env, {
    name: 'booking_email_draft',
    schema: draftSchema,
    instructions: 'You write targeted one-to-one booking outreach for a professional Las Vegas singer and saxophonist. Sound like a working musician contacting an entertainment professional, not a marketing blast.',
    input,
    effort: 'low',
    model: env.OPENAI_MODEL || 'gpt-5.6-luna'
  });
}

export async function draftBookingReply(env, { classification, inbound, artistContext, assets, priorMessages = '' }) {
  const input = `Draft Rick Parma's reply to a booking contact.\n\nCLASSIFICATION:\n${JSON.stringify(classification)}\n\nINBOUND:\n${JSON.stringify(inbound)}\n\nARTIST FACTS:\n${String(artistContext || '').slice(0, 7000)}\n\nLINKS:\n${String(assets || '').slice(0, 4000)}\n\nEARLIER THREAD:\n${String(priorMessages || '').slice(0, 8000)}\n\nRules: never invent availability, rates, contract terms, exclusivity, or commitments. If the classification says escalation is required, write only a brief acknowledgement that keeps the conversation warm without accepting anything (for example, thank them and say you'll confirm details). If they ask for materials, provide only relevant links. If they say no or opt out, be brief and do not sell harder. If they redirect to a submission process, thank them and acknowledge the route. Keep it natural and concise.`;
  return structuredResponse(env, {
    name: 'booking_reply_draft',
    schema: draftSchema,
    instructions: 'You write concise professional replies in Rick Parma’s voice. Protect him from accidental business commitments.',
    input,
    effort: 'low',
    model: env.OPENAI_MODEL || 'gpt-5.6-luna'
  });
}
