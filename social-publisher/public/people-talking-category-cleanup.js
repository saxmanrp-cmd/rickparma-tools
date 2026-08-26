// One-time cleanup: retire the duplicate People Talking category without deleting its backgrounds.
(() => {
  const SOURCE = 'People Talking';
  const DESTINATION = 'Conversation Scenes';
  const DONE_KEY = 'socialPublisherPeopleTalkingCleanupV1';
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');

  async function ensureDestination() {
    const response = await fetch('/api/comic-templates/categories',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({name:DESTINATION}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Could not create ${DESTINATION}.`);
    }
  }

  async function moveTemplate(template) {
    const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:template.name,
        category:DESTINATION,
        pairId:template.pairId || '',
        format:template.format,
        bubble:template.bubble,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Could not move ${template.name || template.id}.`);
    }
  }

  async function run() {
    try {
      if (localStorage.getItem(DONE_KEY)) return;
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;

      // Rewriting the category list also permanently drops the retired People Talking label.
      await ensureDestination();

      const targets = (Array.isArray(data.templates) ? data.templates : [])
        .filter(template => normalize(template.category) === normalize(SOURCE));

      for (const template of targets) await moveTemplate(template);
      localStorage.setItem(DONE_KEY,'1');

      document.querySelector('#comicReloadBtn')?.click();
      if (document.querySelector('#view-media')?.classList.contains('active')) {
        setTimeout(() => document.querySelector('.nav-item[data-view="media"]')?.click(),120);
      }
    } catch (error) {
      console.warn('People Talking category cleanup skipped:',error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',() => setTimeout(run,1000),{once:true});
  } else {
    setTimeout(run,1000);
  }
})();
