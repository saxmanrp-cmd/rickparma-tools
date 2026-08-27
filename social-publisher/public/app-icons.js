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

  // Keep the original Social Publisher artwork for every Apple Home Screen size.
  // iOS scales the 180px master cleanly for older iPhone/iPad icon slots.
  ensureLink('apple-touch-icon','/icons/icon-180.png','120x120');
  ensureLink('apple-touch-icon','/icons/icon-180.png','152x152');
  ensureLink('apple-touch-icon','/icons/icon-180.png','167x167');
  ensureLink('apple-touch-icon','/icons/icon-180.png','180x180');

  // PWA/browser icon sizes.
  ensureLink('icon','/icons/icon-192.png','192x192');
  ensureLink('icon','/icons/icon-512.png','512x512');
})();
