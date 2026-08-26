// Cleanup for the Rick Parma Comics background pack.
// Renames the ten core scenes deterministically even when extra backgrounds exist in the category.
(() => {
  const CATEGORY = 'Rick Parma Comics';
  const CATEGORY_ALIASES = new Set(['rick parma comics','comics']);
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
    {keys:['upscale lounge'], name:'Upscale Lounge'},
  ];

  function normalize(value='') {
    return String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  }
  function slug(value='') {
    return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';
  }
  function isTargetCategory(value='') {
    return CATEGORY_ALIASES.has(normalize(value));
  }
  function looksMachineNamed(value='') {
    const compact = String(value || '').replace(/[^A-Fa-f0-9]/g,'');
    return compact.length >= 20 && /^[A-Fa-f0-9]+$/.test(compact);
  }
  function recognizableName(template) {
    const current = String(template?.name || '').trim();
    const exact = canonical.find(name => normalize(name) === normalize(current));
    if (exact) return exact;
    const haystack = normalize([template?.name,template?.pairId,template?.id].filter(Boolean).join(' '));
    for (const rule of rules) {
      if (rule.keys.some(key => haystack.includes(normalize(key)))) return rule.name;
    }
    return '';
  }
  function genericNumber(template) {
    const haystack = [template?.name,template?.pairId].filter(Boolean).join(' ');
    const match = haystack.match(/(?:rick\s*parma\s*comic|comic|scene|background)\s*0*(\d{1,2})/i);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  function sortStable(a,b) {
    const at = Date.parse(a?.uploadedAt || a?.createdAt || 0);
    const bt = Date.parse(b?.uploadedAt || b?.createdAt || 0);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
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

  function assignCoreNames(items,changes) {
    // First keep/repair anything we can recognize from existing metadata.
    for (const item of items) {
      const recognized = recognizableName(item);
      if (recognized) changes.set(item.id,recognized);
    }

    // Old cleanup passes produced Rick Parma Comic 01..20 style names.
    // Map those directly back to the ten intended scene names, repeating for the paired format.
    for (const item of items) {
      if (changes.has(item.id)) continue;
      const number = genericNumber(item);
      if (number) changes.set(item.id,canonical[(number - 1) % canonical.length]);
    }

    // If filenames were lost completely, fill missing core names by upload order within each format.
    for (const format of ['story','feed','unknown']) {
      const group = items.filter(item => (item.format || 'unknown') === format).sort(sortStable);
      if (!group.length) continue;
      const used = new Set(group.map(item => changes.get(item.id)).filter(Boolean).map(normalize));
      const missing = canonical.filter(name => !used.has(normalize(name)));
      const unresolved = group.filter(item => !changes.has(item.id));
      const fillCount = Math.min(missing.length, unresolved.length);
      for (let i=0;i<fillCount;i++) changes.set(unresolved[i].id,missing[i]);
    }
  }

  function assignBonusNames(items,changes) {
    let bonus = 1;
    const grouped = new Map();
    for (const item of items.filter(item => !changes.has(item.id)).sort(sortStable)) {
      const key = normalize(item.pairId || item.name || item.id) || item.id;
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(item);
    }
    for (const group of grouped.values()) {
      const name = `Rick Parma Bonus Scene ${String(bonus++).padStart(2,'0')}`;
      for (const item of group) changes.set(item.id,name);
    }
  }

  async function run() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const items = (Array.isArray(data.templates) ? data.templates : [])
        .filter(template => isTargetCategory(template.category));
      if (!items.length) return;

      const changes = new Map();
      assignCoreNames(items,changes);
      assignBonusNames(items,changes);

      let changed = 0;
      for (const item of items) {
        const name = changes.get(item.id);
        if (!name) continue;
        const alreadyCorrect = normalize(item.name) === normalize(name) && normalize(item.category) === normalize(CATEGORY);
        if (alreadyCorrect) continue;
        await patch(item,name);
        changed++;
      }

      if (!changed) return;
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