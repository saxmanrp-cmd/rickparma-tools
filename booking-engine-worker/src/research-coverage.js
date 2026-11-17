export const COVERAGE_KEY = 'booking-neighborhood-research-v1';
const observedAt = '2026-11-15';
// Research starting points, not approved recipients or proof of an available gig.
// Each pass must recheck current programming, fit, exclusions and booking email.
export const RESEARCH_AREAS = [
  { id: 'south-strip-enterprise', name: 'South Strip, Enterprise and M Resort',
    scope: 'Independently owned neighborhood bars, restaurant lounges and patios around Enterprise, Silverado Ranch, South Point, Silverton and M Resort. Inspect each resort bar separately.',
    examples: [
      { venue: 'M Resort', room: 'M Bar', url: 'https://www.pennentertainment.com/m-resort/dining', observedAt, note: 'Official dining listings identify live entertainment; recheck the current room lineup and booking route.' },
      { venue: 'M Resort', room: "AMP’D", url: 'https://www.pennentertainment.com/m-resort/dining', observedAt, note: 'A distinct live-band room. Do not collapse the property into a generic casino/showroom prospect.' },
      { venue: 'Bootlegger Italian Bistro', room: 'Dining room and Copa', url: 'https://www.bootleggerlasvegas.com/entertainment', observedAt, note: 'Official nightly-music page; distinguish the dining-room program from separate Copa shows.' }
    ] },
  { id: 'summerlin-west', name: 'Summerlin, west Las Vegas and Rampart',
    scope: 'Small cocktail and wine bars, restaurant lounges, supper clubs and individual casino bars around Summerlin, Rampart, Suncoast, Red Rock and Charleston.',
    examples: [
      { venue: 'Suncoast Hotel & Casino', room: '90 NINETY Bar + Grill', url: 'https://suncoast.boydgaming.com/dine/sc-90-ninety-bar-grill', observedAt, note: 'Official recurring live-entertainment page. Research the actual bar buyer, not only the Suncoast Showroom.' },
      { venue: 'The Resort at Summerlin / Rampart', room: 'Round Bar', url: 'https://theresortatsummerlin.com/las-vegas-restaurants/bars-lounges/round-bar/', observedAt, note: 'Official page describes recurring live music. Check current branding and the correct buyer.' },
      { venue: 'Rouge Room', room: 'Lounge', url: 'https://www.rougeroomlv.com/event/weekly-happenings/', observedAt, note: 'Official live-musician, band and DJ program; recheck fit and any existing relationship.' }
    ] },
  { id: 'downtown-arts', name: 'Downtown, Fremont East and Arts District',
    scope: 'Smaller independent bars, speakeasies, listening lounges, breweries, patios and restaurant-bars on and around Main, Commerce, Fremont East and surrounding side streets.',
    examples: [{ venue: 'The Mob Museum', room: 'The Underground', url: 'https://themobmuseum.org/events-posts/free-live-music-in-the-underground/', observedAt, note: 'Official live-music calendar; assess genre compatibility rather than assuming every jazz program fits.' }] },
  { id: 'spring-mountain', name: 'Spring Mountain, Chinatown and central-west neighborhoods',
    scope: 'Lesser-publicized neighborhood cocktail bars, small restaurant stages, wine bars and supper clubs around Spring Mountain, Decatur, Jones, Rainbow and Sahara.', examples: [] },
  { id: 'henderson-green-valley', name: 'Henderson, Green Valley and Water Street',
    scope: 'Independent neighborhood bars and restaurant lounges, Water Street taverns, Green Valley casino bars, Anthem and Seven Hills rooms. Check a variety of weekdays, not only weekend festivals.',
    examples: [
      { venue: 'Gold Mine Tavern', room: 'Tavern / patio', url: 'https://goldminetavern.com/music-calendar', observedAt, note: 'Official recurring-band calendar; assess stylistic fit before treating it as a target.' },
      { venue: 'Green Valley Ranch', room: "Hank’s bar / lounge", url: 'https://greenvalleyranch.com/eat-and-drink/hanks/', observedAt, note: 'Official restaurant page advertises bar music. Meal-ordering emails are not booking contacts.' }
    ] },
  { id: 'north-centennial', name: 'North Las Vegas, Aliante and Centennial',
    scope: 'Smaller local casino bars, taverns, restaurants, lounges, golf-club bars and live-music patios across Aliante, Centennial Hills and North Las Vegas neighborhoods.', examples: [] },
  { id: 'east-paradise', name: 'East Las Vegas, Paradise and UNLV corridors',
    scope: 'Neighborhood bars and restaurant lounges around Tropicana, Eastern, Maryland Parkway, Boulder Highway, Flamingo and the university area; seek recurring paid live music rather than karaoke alone.', examples: [] },
  { id: 'southwest-durango', name: 'Southwest, Durango, Rhodes Ranch and Mountains Edge',
    scope: 'Local wine bars, small restaurant lounges, cocktail bars, patios and casino bars around Durango, Blue Diamond, Warm Springs, Rhodes Ranch and Mountains Edge.', examples: [] },
  { id: 'strip-hidden-rooms', name: 'Smaller rooms inside Strip and near-Strip properties',
    scope: 'Look beyond headline entertainment listings: lobby bars, cocktail lounges, restaurant bars, piano lounges and intimate live-music rooms inside each property. Exclude arenas and large ticketed concert rooms.', examples: [] },
  { id: 'lake-las-vegas-laughlin', name: 'Lake Las Vegas, Boulder City and Laughlin',
    scope: 'Smaller waterfront, hotel, restaurant and neighborhood rooms in Lake Las Vegas and Boulder City; individual lounge and bar programs in Laughlin casino resorts, not just main showrooms.',
    examples: [{ venue: 'The Speakeasy at Lake Las Vegas', room: 'Bar / lounge', url: 'https://www.thespeakeasyllv.com/', observedAt, note: 'Official page lists weekend live music. Verify the current professional email and suitability.' }] }
];

export async function nextResearchCoverage(env) {
  const row = await env.DB.prepare('SELECT cursor FROM sync_state WHERE provider=?').bind(COVERAGE_KEY).first();
  const raw = Number(row?.cursor || 0);
  const pass = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
  return { ...RESEARCH_AREAS[pass % RESEARCH_AREAS.length], pass };
}

export async function finishResearchCoverage(env, coverage, summary = {}) {
  await env.DB.prepare(`INSERT INTO sync_state(provider,cursor,metadata_json) VALUES (?,?,?)
    ON CONFLICT(provider) DO UPDATE SET cursor=excluded.cursor,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(COVERAGE_KEY, String(coverage.pass + 1), JSON.stringify({
      lastArea: coverage.id, lastAreaName: coverage.name, completedAt: new Date().toISOString(),
      completedPasses: coverage.pass + 1, verified: Number(summary.verified || 0), staged: Number(summary.discovered || 0),
      note: 'One bounded research pass; this is not a claim that every venue in the area has been found.'
    })).run();
}

export function coverageBrief(coverage) {
  if (!coverage?.id || !coverage.name) return '';
  const examples = (coverage.examples || []).map(item =>
    `- ${item.venue} / ${item.room}: ${item.url} — research starting point observed ${item.observedAt}. ${item.note}`
  ).join('\n');
  return `TODAY’S NEIGHBORHOOD DEEP DIVE: ${coverage.name}\n${coverage.scope}\n${examples ? `ROOM-LEVEL STARTING POINTS (REVERIFY; NOT APPROVED EMAIL RECIPIENTS):\n${examples}` : 'Search for small independent rooms beyond well-known venue lists.'}`;
}
