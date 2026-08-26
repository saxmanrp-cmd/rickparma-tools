// Make Help Me / suggested timing aware of posts that are already planned.
(() => {
  const MAX_POSTS_PER_DAY = 2;
  const MIN_SPACING_MS = 5 * 60 * 60 * 1000;
  const q = (selector, root=document) => root.querySelector(selector);

  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function localDateInput(date) {
    return localDateKey(date);
  }

  function localTimeInput(date) {
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }

  function formatSlot(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
    }).format(date);
  }

  function usablePostMoment(post) {
    const status = String(post?.status || '').toLowerCase();
    if (['draft','failed','cancelled','canceled','deleted'].includes(status)) return null;
    const raw = post?.scheduledAt || post?.publishedAt || post?.postedAt || post?.createdAt;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function existingPostTimes() {
    const posts = (typeof state !== 'undefined' && Array.isArray(state?.posts)) ? state.posts : [];
    return posts.map(usablePostMoment).filter(Boolean);
  }

  function sameLocalDay(a,b) {
    return localDateKey(a) === localDateKey(b);
  }

  function hasEnoughSpacing(candidate, times) {
    return times.every(time => Math.abs(candidate.getTime() - time.getTime()) >= MIN_SPACING_MS);
  }

  function candidateTimesForDay(base, day, now) {
    const seen = new Set();
    const values = [];
    const add = (hour, minute) => {
      const candidate = new Date(day.getFullYear(),day.getMonth(),day.getDate(),hour,minute,0,0);
      const key = candidate.getTime();
      if (candidate <= new Date(now.getTime() + 30 * 60 * 1000) || seen.has(key)) return;
      seen.add(key);
      values.push(candidate);
    };
    add(base.getHours(),base.getMinutes());
    add(12,0);
    add(18,0);
    add(18,30);
    return values;
  }

  function findOpenSlot(baseCandidate, now=new Date()) {
    const existing = existingPostTimes();
    const originalDay = localDateKey(baseCandidate);

    for (let offset=0; offset<10; offset++) {
      const day = new Date(baseCandidate);
      day.setDate(baseCandidate.getDate()+offset);
      const dayPosts = existing.filter(time => sameLocalDay(time,day));
      if (dayPosts.length >= MAX_POSTS_PER_DAY) continue;

      for (const candidate of candidateTimesForDay(baseCandidate,day,now)) {
        if (hasEnoughSpacing(candidate,dayPosts)) {
          return {
            slot:candidate,
            moved:localDateKey(candidate) !== originalDay || candidate.getTime() !== baseCandidate.getTime(),
            dayCount:dayPosts.length,
            originalDayCount:existing.filter(time => localDateKey(time) === originalDay).length,
          };
        }
      }
    }

    const fallback = new Date(baseCandidate);
    fallback.setDate(fallback.getDate()+1);
    return {slot:fallback,moved:true,dayCount:0,originalDayCount:existing.filter(time => localDateKey(time) === originalDay).length};
  }

  function currentSuggestedSlot() {
    const date = q('#scheduleDate')?.value;
    const time = q('#scheduleTime')?.value;
    if (!date || !time) return null;
    const slot = new Date(`${date}T${time}:00`);
    return Number.isNaN(slot.getTime()) ? null : slot;
  }

  function setSchedule(slot) {
    const date = q('#scheduleDate');
    const time = q('#scheduleTime');
    if (date) date.value = localDateInput(slot);
    if (time) time.value = localTimeInput(slot);
  }

  function addResultNote(result) {
    const panel = q('#showHelperResult');
    if (!panel || !result?.moved) return;
    const reason = result.originalDayCount >= MAX_POSTS_PER_DAY
      ? `You already have ${result.originalDayCount} posts on that day, so I moved this one to ${formatSlot(result.slot)}.`
      : `I moved this to ${formatSlot(result.slot)} so your posts are not stacked too close together.`;
    const note = document.createElement('div');
    note.className = 'smart-schedule-note';
    note.textContent = reason;
    panel.querySelector('.smart-schedule-note')?.remove();
    panel.appendChild(note);
  }

  function injectStyles() {
    if (q('#smartScheduleAwarenessStyles')) return;
    const style = document.createElement('style');
    style.id = 'smartScheduleAwarenessStyles';
    style.textContent = `
      .smart-schedule-note{margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.08);color:#b8c6d8;font-size:12px;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  async function refreshPostsIfPossible() {
    try {
      if (typeof remoteMode !== 'undefined' && remoteMode && typeof syncRemotePosts === 'function') await syncRemotePosts();
    } catch {}
  }

  async function makeSuggestionCalendarAware() {
    await refreshPostsIfPossible();
    const timing = q('input[name="timing"]:checked')?.value;
    if (timing !== 'schedule') return;
    const base = currentSuggestedSlot();
    if (!base) return;
    const result = findOpenSlot(base,new Date());
    if (!result?.slot || !result.moved) return;
    setSchedule(result.slot);
    addResultNote(result);
    try {
      if (typeof toast === 'function') {
        toast(result.originalDayCount >= MAX_POSTS_PER_DAY
          ? `Today is already full. Moved to ${formatSlot(result.slot)}.`
          : `Post spacing adjusted to ${formatSlot(result.slot)}.`);
      }
    } catch {}
  }

  function scheduleAdjustment() {
    // The original Help Me handler sets its recommendation first; then we make
    // that recommendation calendar-aware using the freshly synced post list.
    setTimeout(makeSuggestionCalendarAware,40);
    setTimeout(makeSuggestionCalendarAware,220);
  }

  function boot() {
    injectStyles();
    document.addEventListener('click',event => {
      if (event.target.closest?.('#showHelperBtn,#useReachTimeBtn')) scheduleAdjustment();
    },false);
  }

  window.SocialPublisherSmartSchedule = { findOpenSlot, existingPostTimes };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
