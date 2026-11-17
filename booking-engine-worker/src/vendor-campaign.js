export const VENDOR_CAMPAIGN_ID = 'peg-vendor-2026-11-09';

export function isVendorProspect(prospect) {
  return prospect?.profile === 'vendor' || prospect?.campaign_type === 'vendor';
}

export function vendorPersonalization(prospect = {}) {
  let metadata = prospect.metadata_json || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const approved = String(prospect['Approved venue sentence'] || metadata?.vendorSentence || '').trim();
  if (approved) return approved;
  const entity = String(prospect.entity || prospect.Organization || '').trim();
  if (!entity) throw new Error('A vendor draft requires an identified organization.');
  return `For ${entity}, we’d welcome a conversation about which entertainment formats fit your events and vendor requirements.`;
}

export function vendorDraft({ followup = false, prospect = {} } = {}) {
  const greeting = String(prospect.contact_name || prospect['Named contact'] || '').trim();
  const opening = 'Parma Entertainment Group, LLC provides professional DJs, MCs, live singers, saxophonists, and bands for weddings, corporate functions, holiday parties, and private events in Las Vegas and Laughlin.';
  const request = followup
    ? 'Following up on our vendor introduction: could you point us to the person who handles entertainment partnerships or your preferred-vendor process? We’d be happy to share performance samples.'
    : 'Who handles your entertainment partnerships, and what is your process for considering a new preferred or approved vendor? We’d be happy to share performance samples and learn about your requirements.';
  return {
    subject: followup ? 'Following up — entertainment vendor consideration' : 'Preferred entertainment vendor consideration — Parma Entertainment Group, LLC',
    body: [`Hello${greeting ? ` ${greeting}` : ''},`, opening, vendorPersonalization(prospect), request, 'Thank you,'].join('\n\n'),
    responseId: null
  };
}
