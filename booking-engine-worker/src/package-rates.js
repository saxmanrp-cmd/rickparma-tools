export const PACKAGE_RATES = Object.freeze({
  label: 'Basic Package Rates',
  title: 'Musician/DJ/MC Packages',
  intro: 'Starting package rates for private events, weddings and corporate events.',
  groups: [
    {
      title: 'Private Parties & Social Events',
      minimum: '3-hour minimum',
      items: [
        { label: 'Basic DJ Package', rate: '$600' },
        { label: 'DJ + MC Package', rate: '$800' },
        { label: 'DJ + MC + Equipment Package', rate: '$1,000–$4,000' },
        { label: 'Additional Time', rate: '$100/hour' }
      ]
    },
    {
      title: 'Weddings & Corporate Events',
      minimum: '3-hour minimum',
      items: [
        { label: 'Basic DJ Package', rate: '$1,000' },
        { label: 'DJ + MC Package', rate: '$1,600' },
        { label: 'DJ + MC + Equipment Package', rate: '$2,000–$4,000' },
        { label: 'Additional Time', rate: '$300/hour' }
      ]
    }
  ],
  smallVenue: {
    title: 'Small Venues',
    description: 'Bars, lounges and restaurants',
    rate: '$300–$500',
    note: 'Depending on the day and frequency of booking.'
  },
  note: 'Equipment package pricing varies based on venue size, guest count, sound requirements, lighting, setup needs and production requirements. Rates are starting guidelines and may vary based on event size, location, travel and specific client needs.'
});

export function packageRatesForReply() {
  return [
    PACKAGE_RATES.label,
    PACKAGE_RATES.title,
    PACKAGE_RATES.intro,
    PACKAGE_RATES.smallVenue.title,
    `${PACKAGE_RATES.smallVenue.description} — ${PACKAGE_RATES.smallVenue.rate}`,
    PACKAGE_RATES.smallVenue.note,
    ...PACKAGE_RATES.groups.flatMap(group => [
      group.title,
      group.minimum,
      ...group.items.map(item => `${item.label} — ${item.rate}`)
    ]),
    'The 3-hour minimum applies to private party, wedding and corporate packages; no minimum is specified for small-venue bookings.',
    PACKAGE_RATES.note
  ].join('\n');
}
