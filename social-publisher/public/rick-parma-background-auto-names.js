// One-time cleanup for the Rick Parma Comics background pack.
// Uses recognizable names when available; only falls back to pack order when the pack is complete.
(() => {
  const CATEGORY = 'Rick Parma Comics';
  const canonical = [
    'Neon Nightlife',
    'Backstage Pass',
    'Casino Lounge',
    'Retro Action Vibe',
    'Noir Detective',
    'Beach Party Vibes',
    'Sci-Fi City',
    'Comic Newsroom',
    'Grand Stage Entrance',
    'Upscale Lounge',
  ];

  const rules = [
    {keys:['neon','nightlife'], name:'Neon Nightlife'},
    {keys:['backstage'], name:'Backstage Pass'},
    {keys:['casino'], name:'Casino Lounge'},
    {keys:['retro','action'], name:'Retro Action Vibe'},
    {keys:['noir','detective'], name:'Noir Detective'},
    {keys:['beach','party'], name:'Beach Party Vibes'},
    {keys:['sci-fi','sci fi','scifi','cyberpunk'], name:'Sci-Fi City'},
    {keys:['newsroom','breaking news','rp news'], name:'Comic Newsroom'},
    {keys:['grand stage','stage entrance'], name:'Grand Stage Entrance'},
    {keys:['upscale lounge','lounge'], name:'Upscale Lounge'},
  ];

  function normalize(value='') {
    return String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  }
  function slug(value='') {
    return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';
  }
  function looksMachineNamed(value='') {
    const compact = String(value || '').replace(/[^A-Fa-f0-9]/g,'');
    return compact.length >= 20 && /^[A-Fa-f0-9]+$/.test(compact);
  }
  function recognizableName(template) {
    const haystack = normalize([template?.name,template?.pairId,template?.id].filter(Boolean).join(' '));
    for (const rule of rules) {
      if (rule.keys.some(key => haystack.includes(key))) return rule.name;
    }
    return '';
  }
  function needsName(template) {
    const current = String(template?.name || '').trim();
    if (!current || looksMachineNamed(current) || /^scene\s*\d+$/i.test(current) || /^background$/i.test(current)) return true;
    return !canonical.some(name => normalize(name) === normalize(current));
  }

  async function patch(template,name) {
    const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name,
        category:CATEGORY,
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

  function assignFallback(items,changes) {
    const unresolved = items.filter(item => !changes.has(item.id) && needsName(item));
    if (!unresolved.length) return;

    const story = unresolved.filter(item => item.format === 'story');
    const feed = unresolved.filter(item => item.format === 'feed');

    // Safe fallback: only infer by order when a complete 10-scene sequence exists.
    const assignSequence = list => {
      if (list.length !== 10) return;
      list.forEach((item,index) => changes.set(item.id,canonical[index]));
    };
    assignSequence(story);
    assignSequence(feed);

    // Some original uploads were a single-format 10-image pack.
    if (unresolved.length === 10 && !story.length && !feed.length) assignSequence(unresolved);
  }

  async function run() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const items = (Array.isArray(data.templates) ? data.templates : [])
        .filter(template => String(template.category || '') === CATEGORY);
      if (!items.length) return;

      const changes = new Map();
      for (const item of items) {
        const name = recognizableName(item);
        if (name && normalize(item.name) !== normalize(name)) changes.set(item.id,name);
      }
      assignFallback(items,changes);
      if (!changes.size) return;

      for (const item of items) {
        const name = changes.get(item.id);
        if (name) await patch(item,name);
      }

      document.querySelector('#comicReloadBtn')?.click();
      const mediaActive = document.querySelector('#view-media')?.classList.contains('active');
      if (mediaActive) setTimeout(() => document.querySelector('.nav-item[data-view="media"]')?.click(),100);
    } catch (error) {
      console.warn('Rick Parma background naming cleanup skipped:',error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => setTimeout(run,700),{once:true});
  else setTimeout(run,700);
})();