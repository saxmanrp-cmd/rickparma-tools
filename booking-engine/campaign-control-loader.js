(() => {
  'use strict';

  let loaded = false;
  let loading = false;

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function openSettings() {
    const settings = document.querySelector('[data-nav="settings"]');
    if (settings) settings.click();
  }

  function loadControlCenter() {
    if (loaded) return Promise.resolve();
    if (loading) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (loaded) {
            clearInterval(timer);
            resolve();
          } else if (!loading || Date.now() - started > 10000) {
            clearInterval(timer);
            reject(new Error('Campaign Control Center did not finish loading.'));
          }
        }, 80);
      });
    }

    loading = true;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './campaign-control-center.js';
      script.async = false;
      script.onload = () => {
        loaded = true;
        loading = false;
        resolve();
      };
      script.onerror = () => {
        loading = false;
        reject(new Error('Campaign Control Center could not load.'));
      };
      document.body.appendChild(script);
    });
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-nav="campaigns"]');
    if (!button || loaded) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (loading) return;

    try {
      if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not ready yet.');
      await window.BookingCloud.api('/api/autopilot/status');
      await loadControlCenter();
      button.click();
    } catch (error) {
      openSettings();
      const message = /not logged in|unauthorized/i.test(String(error?.message || ''))
        ? 'Log in to Cloud CRM before opening Campaigns.'
        : (error?.message || 'Campaigns could not open.');
      toast(message);
    }
  }, true);
})();
