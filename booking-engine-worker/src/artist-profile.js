export const ARTIST_PROFILE = Object.freeze({
  name: 'Rick Parma',
  base: 'Las Vegas, NV',
  website: 'https://rickparma.com/',
  epk: 'https://rickparma.com/epk/',
  calendar: 'https://rickparma.com/#calendar',
  instagram: 'https://instagram.com/rickparmaofficial',
  facebook: 'https://www.facebook.com/rickparmaofficial',
  tiktok: 'https://www.tiktok.com/@rickparmaofficial',
  personalEmail: 'saxman@rickparma.com',
  bookingEmail: 'booking@rickparma.com',
  shortPromo: 'https://www.youtube.com/watch?v=A7bKax1LS_g',
  compilation: 'https://www.youtube.com/watch?v=ePFoNTC85XY',
  fullBandPromo: 'https://www.youtube.com/watch?v=6WmPyq6eoRk',
  formats: ['solo singer/sax to tracks', 'duo', 'full band'],
  styles: ['R&B', 'Motown', 'soul', 'funk', 'pop', 'Top 40', 'neo-soul'],
  positioning: [
    'Chicago-born, Las Vegas-based vocalist, saxophonist, songwriter and entertainer',
    'More than three decades of professional performance experience',
    'Regular Las Vegas casino work including ARIA and Westgate',
    'Show scales from polished solo singer/sax through full band',
    'Room-first performer who reads the audience rather than forcing a fixed set list'
  ],
  festivalCredits: [
    'Newport Jazz Festival',
    'Long Beach Jazz Festival',
    'Taste of Soul in Los Angeles',
    'Life Luxe Jazz Festival in Cabo San Lucas for three consecutive years'
  ],
  careerCredits: [
    'Short touring period with trumpeter Tom Browne',
    'Short touring period with R&B/funk group Heatwave',
    'Longstanding performance relationship with the AKA organization for roughly a decade'
  ]
});

export function campaignAssets(profile = 'room') {
  const p = ARTIST_PROFILE;
  const assets = [
    { label: 'EPK', url: p.epk },
    { label: 'Current Calendar', url: p.calendar }
  ];
  if (profile === 'festival' || profile === 'agency') {
    assets.push({ label: 'Full Band Promo', url: p.fullBandPromo });
  }
  return assets;
}

export function compactCredentials(profile = 'room') {
  const p = ARTIST_PROFILE;
  if (profile === 'festival') {
    return `More than three decades performing professionally, with appearances at ${p.festivalCredits.join(', ')}, plus earlier touring work with Tom Browne and Heatwave.`;
  }
  if (profile === 'corporate') {
    return 'More than three decades of professional performance experience across casino, corporate and private-event settings, including a longstanding AKA event relationship and regular ARIA/Westgate work.';
  }
  if (profile === 'agency') {
    return 'More than three decades of professional experience across casinos, lounges, festivals, corporate and private events, with a show that scales from solo singer/sax through full band.';
  }
  if (profile === 'buyer') {
    return 'More than three decades of professional experience with regular Las Vegas casino work including ARIA and Westgate, scalable from solo singer/sax through full band.';
  }
  return 'More than three decades of professional performance experience with regular Las Vegas casino work including ARIA and Westgate.';
}
