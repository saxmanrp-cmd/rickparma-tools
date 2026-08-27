// Installable app icon metadata for iPhone/iPad + PWA home screens.
(() => {
  const VERSION = '2026-08-26-faceid-icons';
  const head = document.head;
  if (!head) return;

  const ensureLink = (rel, href, sizes, type='image/png') => {
    const key = `link[data-social-publisher-icon="${rel}-${sizes || 'default'}"]`;
    if (head.querySelector(key)) return;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = `${href}?v=${encodeURIComponent(VERSION)}`;
    if (sizes) link.sizes = sizes;
    if (type) link.type = type;
    link.dataset.socialPublisherIcon = `${rel}-${sizes || 'default'}`;
    head.appendChild(link);
  };

  // These are the three actual icon assets needed by the current iPhone/PWA install flow.
  // The existing 180px asset is the original Social Publisher icon artwork used by iOS.
  ensureLink('apple-touch-icon','/icons/icon-180.png','180x180');
  ensureLink('icon','/icons/icon-192.png','192x192');
  ensureLink('icon','/icons/icon-512.png','512x512');
})();
