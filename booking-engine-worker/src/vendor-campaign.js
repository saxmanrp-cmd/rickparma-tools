export const VENDOR_CAMPAIGN_ID = 'peg-vendor-2026-11-09';

export function isVendorProspect(prospect) {
  return prospect?.profile === 'vendor' || prospect?.campaign_type === 'vendor';
}

export function vendorDraft({ followup = false } = {}) {
  return {
    subject: followup ? 'Following up — entertainment vendor consideration' : 'Preferred entertainment vendor consideration — Parma Entertainment Group, LLC',
    body: followup
      ? 'Hello,\n\nFollowing up on Parma Entertainment Group, LLC as an entertainment resource for your weddings, corporate functions, holiday parties, and private events. Our options include professional DJs, MCs, live singers, saxophonists, and bands.\n\nIs there a preferred-vendor process or someone who handles entertainment vendor introductions? Happy to share options or arrange a quick call.\n\nThank you,'
      : 'Hello,\n\nParma Entertainment Group, LLC provides professional DJs, MCs, live singers, saxophonists, and bands for weddings, corporate functions, holiday parties, and private events of all sizes in Las Vegas and Laughlin.\n\nWe’d love to be considered as a preferred entertainment vendor when your clients need options beyond in-house. We’re happy to share a simple one-sheet with options and starting ranges or jump on a quick call to learn what you typically need.\n\nThank you,',
    responseId: null
  };
}
