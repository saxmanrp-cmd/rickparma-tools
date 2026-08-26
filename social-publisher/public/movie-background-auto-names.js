// One-time cleanup for the current Movies background pack.
// Renames recognizable uploads to short, consistent scene names while preserving format/category/bubble mapping.
(() => {
  const CATEGORY = 'Movies';

  const canonicalRules = [
    { test:value => value.startsWith('cypher'), name:'Cypher Steak Dinner' },
    { test:value => value.startsWith("who's wit") || value.startsWith('whos wit') || value.startsWith("who’s wit"), name:"Who's With Me? Office Rally" },
    { test:value => value.startsWith('billy madi'), name:'Billy Madison Pool Raft' },
    { test:value => value.startsWith('you had m'), name:'You Had Me at Hello' },
    { test:value => value.startsWith('sloth'), name:'Sloth Pirate Ship Celebration' },
    { test:value => value.startsWith('dumb and'), name:'Dumb and Dumber Scooter Ride' },
    { test:value => value === 'pulp' || value.startsWith('pulp '), name:'Pulp Fiction Diner Shout' },
    { test:value => value.startsWith('charlie br'), name:'Charlie Brown Classroom' },
    { test:value => value.startsWith('spider-ma') || value.startsWith('spider-me'), name:'Spider-Man Daily Beacon' },
    { test:value => value === 'marty' || value.startsWith('marty '), name:'Marty & Doc Time Machine' },
    { test:value => value === 'neo' || value.startsWith('neo '), name:'Neo & Morpheus Matrix' },
  ];

  function normalize(value='') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g,"'")
      .replace(/\s+/g,' ');
  }

  function slug(value='') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0,90) || 'scene';
  }

  function desiredName(template) {
    if (String(template?.category || '') !== CATEGORY) return '';
    const current = normalize(template?.name);
    const id = String(template?.id || '').toUpperCase();

    // Two older Spider-Man uploads were saved with UUID-style names before naming was added.
    if (id.startsWith('2D4443FD') || id.startsWith('D35FDB4C')) return 'Spider-Man Daily Beacon';

    for (const rule of canonicalRules) {
      if (rule.test(current)) return rule.name;
    }
    return '';
  }

  async function patchTemplate(template,name) {
    const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name,
        category:template.category || CATEGORY,
        pairId:slug(name),
        format:template.format,
        bubble:template.bubble,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Could not rename ${template.name || template.id}.`);
    }
  }

  async function run() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const templates = Array.isArray(data.templates) ? data.templates : [];
      const changes = templates
        .map(template => ({template,name:desiredName(template)}))
        .filter(item => item.name && normalize(item.template.name) !== normalize(item.name));

      if (!changes.length) return;
      for (const change of changes) await patchTemplate(change.template,change.name);

      document.querySelector('#comicReloadBtn')?.click();
      if (document.querySelector('#view-media')?.classList.contains('active')) {
        setTimeout(() => document.querySelector('.nav-item[data-view="media"]')?.click(),80);
      }
    } catch (error) {
      console.warn('Movie background auto-name cleanup skipped:',error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => setTimeout(run,500),{once:true});
  else setTimeout(run,500);
})();
