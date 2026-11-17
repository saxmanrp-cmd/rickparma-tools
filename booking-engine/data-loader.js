window.BOOKING_DATA_READY = (async () => {
  const encoded = window.__BOOKING_B64 || '';
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const d = JSON.parse(await new Response(stream).text());
  const mapRows = (headers, rows) => rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null])));
  window.BOOKING_DATA = {
    generatedAt: d.generatedAt,
    profile: d.profile,
    contacts: mapRows(d.contactHeaders, d.contactRows),
    buyerMap: mapRows(d.buyerHeaders, d.buyerRows),
    researchGaps: mapRows(d.gapHeaders, d.gapRows)
  };
  delete window.__BOOKING_B64;
  return window.BOOKING_DATA;
})();
