const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const STORAGE_KEY = 'socialPublisherV3';
const ACTIVE_VIEW_KEY = 'socialPublisherActiveView';
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const defaults = { posts: [], media: [], currentMedia: null };
let state = loadState();
let remoteMode = false;
let currentFile = null;
let editingPostId = null;
let deferredInstallPrompt = null;
let renderedMediaItems = [];
let instagramOptions = { userTags: [], collaborators: [], audioName: '' };
let placingTagIndex = null;
let pendingTagPosition = null;

function loadState() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), currentMedia: null }; }
  catch { return { ...defaults }; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ posts: state.posts, media: state.media })); }
  catch { toast('Local storage is full.'); }
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}
function escapeHtml(str='') { return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

const titles = { create:'New Post', calendar:'Calendar', history:'Posts', media:'Media', settings:'Settings' };
function navigate(view, { remember = true } = {}) {
  if (!titles[view]) view = 'create';
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $(`#view-${view}`).classList.add('active');
  $('#pageTitle').textContent = view === 'create' && editingPostId ? 'Edit Post' : titles[view];
  if (remember) {
    try { sessionStorage.setItem(ACTIVE_VIEW_KEY, view); } catch {}
  }
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  if (remoteMode && ['calendar','history','media'].includes(view)) syncRemotePosts();
  if (view === 'calendar') renderCalendar();
  if (view === 'history') renderHistory();
  if (view === 'media') renderMediaLibrary();
  if (view === 'settings') { refreshMetaStatus(); refreshThreadsStatus(); refreshTikTokStatus(); }
}
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.view)));
$$('[data-jump]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.jump)));
$('#headerSettingsBtn').addEventListener('click', () => navigate('settings'));

const caption = $('#caption');
caption.addEventListener('input', () => {
  $('#charCount').textContent = caption.value.length;
  $('#previewCaption').textContent = caption.value || 'Your caption will appear here.';
});
$('#insertTemplateBtn').addEventListener('click', () => {
  caption.value = `🎷 LIVE TONIGHT!\n\n📍 Venue:\n🗓 Date:\n⏰ Time:\n\nCome hang with me!`;
  caption.dispatchEvent(new Event('input'));
});

$$('.platform-chip').forEach(card => {
  const input = card.querySelector('input');
  input?.addEventListener('change', () => card.classList.toggle('selected', input.checked));
});

function currentInstagramType() { return $('input[name="igType"]:checked')?.value || 'post'; }
function updateInstagramTypeVisibility() {
  const selected = $('.platform-chip[data-platform="instagram"] input')?.checked;
  $('#instagramTypeWrap')?.classList.toggle('hidden', !selected);
  updateInstagramPeopleVisibility();
  updateInstagramReelAudioVisibility();
}
function updateInstagramPeopleVisibility() {
  const selected = $('.platform-chip[data-platform="instagram"] input')?.checked;
  const type = currentInstagramType();
  const supported = selected && type !== 'story';
  $('#instagramPeopleWrap')?.classList.toggle('hidden', !supported);
  if ($('#instagramPeopleHint')) $('#instagramPeopleHint').textContent = type === 'reel'
    ? 'Tag profiles in the Reel or invite up to 3 collaborators.'
    : 'Tag profiles on the photo or invite up to 3 collaborators.';
  $('#igTagPositionHelp')?.classList.toggle('hidden', type !== 'post');
  renderInstagramPeople();
}
function updateInstagramReelAudioVisibility() {
  const selected = $('.platform-chip[data-platform="instagram"] input')?.checked;
  const show = selected && currentInstagramType() === 'reel';
  $('#instagramReelAudioWrap')?.classList.toggle('hidden', !show);
  renderInstagramAudio();
}
function renderInstagramAudio() {
  const input = $('#igAudioName');
  if (input && input.value !== (instagramOptions.audioName || '')) input.value = instagramOptions.audioName || '';
  if ($('#igAudioCount')) $('#igAudioCount').textContent = String((instagramOptions.audioName || '').length);
}
$('#igAudioName')?.addEventListener('input', event => {
  instagramOptions.audioName = String(event.target.value || '').slice(0, 100);
  if ($('#igAudioCount')) $('#igAudioCount').textContent = String(instagramOptions.audioName.length);
});
$('.platform-chip[data-platform="instagram"] input')?.addEventListener('change', updateInstagramTypeVisibility);
$$('input[name="igType"]').forEach(input => input.addEventListener('change', () => {
  $$('.ig-type-segmented .segment').forEach(s => s.classList.toggle('active', s.querySelector('input')?.checked));
  updateInstagramPeopleVisibility();
  updateInstagramReelAudioVisibility();
}));
updateInstagramTypeVisibility();

function normalizeIgUsername(value='') {
  const username = String(value).trim().replace(/^@+/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(username) ? username : '';
}
function invalidatePhotoTagPositions() {
  let changed = false;
  for (const tag of instagramOptions.userTags) {
    if ('x' in tag || 'y' in tag) { delete tag.x; delete tag.y; changed = true; }
  }
  if (changed) renderInstagramPeople();
}
function renderInstagramPeople() {
  const type = currentInstagramType();
  const tagWrap = $('#igTagChips');
  const collabWrap = $('#igCollabChips');
  if (tagWrap) tagWrap.innerHTML = instagramOptions.userTags.map((tag,index) => {
    const placed = Number.isFinite(tag.x) && Number.isFinite(tag.y);
    const positionButton = type === 'post' ? `<button type="button" class="chip-position ${placed ? 'placed' : ''}" data-position-tag="${index}">${placed ? 'Placed ✓' : 'Position'}</button>` : '';
    return `<span class="people-chip"><span class="chip-name">@${escapeHtml(tag.username)}</span>${positionButton}<button type="button" class="chip-remove" data-remove-tag="${index}" aria-label="Remove @${escapeHtml(tag.username)}">×</button></span>`;
  }).join('');
  if (collabWrap) collabWrap.innerHTML = instagramOptions.collaborators.map((username,index) =>
    `<span class="people-chip"><span class="chip-name">@${escapeHtml(username)}</span><button type="button" class="chip-remove" data-remove-collab="${index}" aria-label="Remove @${escapeHtml(username)}">×</button></span>`
  ).join('');
  if ($('#addIgCollabBtn')) $('#addIgCollabBtn').disabled = instagramOptions.collaborators.length >= 3;
}
function addIgUserTag() {
  const input = $('#igTagUsername');
  const username = normalizeIgUsername(input?.value || '');
  if (!username) return toast('Enter a valid Instagram username.');
  if (instagramOptions.userTags.some(t => t.username.toLowerCase() === username.toLowerCase())) return toast('That profile is already tagged.');
  if (instagramOptions.userTags.length >= 20) return toast('Instagram allows up to 20 profile tags here.');
  instagramOptions.userTags.push({ username });
  if (input) input.value = '';
  renderInstagramPeople();
  if (currentInstagramType() === 'post') {
    if (!state.currentMedia || !String(state.currentMedia.type || '').startsWith('image/')) return toast('Tag added. Add a photo, then tap Position.');
    openTagPosition(instagramOptions.userTags.length - 1);
  }
}
function addIgCollaborator() {
  const input = $('#igCollabUsername');
  const username = normalizeIgUsername(input?.value || '');
  if (!username) return toast('Enter a valid Instagram username.');
  if (instagramOptions.collaborators.some(u => u.toLowerCase() === username.toLowerCase())) return toast('That collaborator is already added.');
  if (instagramOptions.collaborators.length >= 3) return toast('Instagram allows up to 3 collaborators.');
  instagramOptions.collaborators.push(username);
  if (input) input.value = '';
  renderInstagramPeople();
}
$('#addIgTagBtn')?.addEventListener('click', addIgUserTag);
$('#addIgCollabBtn')?.addEventListener('click', addIgCollaborator);
$('#igTagUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIgUserTag(); } });
$('#igCollabUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIgCollaborator(); } });
$('#igTagChips')?.addEventListener('click', e => {
  const remove = e.target.closest('[data-remove-tag]');
  if (remove) { instagramOptions.userTags.splice(Number(remove.dataset.removeTag),1); renderInstagramPeople(); return; }
  const position = e.target.closest('[data-position-tag]');
  if (position) openTagPosition(Number(position.dataset.positionTag));
});
$('#igCollabChips')?.addEventListener('click', e => {
  const remove = e.target.closest('[data-remove-collab]');
  if (!remove) return;
  instagramOptions.collaborators.splice(Number(remove.dataset.removeCollab),1);
  renderInstagramPeople();
});
function openTagPosition(index) {
  const tag = instagramOptions.userTags[index];
  if (!tag) return;
  if (currentInstagramType() !== 'post') return;
  const media = state.currentMedia;
  const src = media?.url || media?.dataUrl;
  if (!src || !String(media?.type || '').startsWith('image/')) return toast('Choose a photo before positioning tags.');
  placingTagIndex = index;
  pendingTagPosition = Number.isFinite(tag.x) && Number.isFinite(tag.y) ? { x:tag.x, y:tag.y } : null;
  $('#tagPositionTitle').textContent = `Place @${tag.username}`;
  $('#tagPositionImage').src = src;
  $('#tagPositionSheet').classList.remove('hidden');
  $('#tagPositionSheet').setAttribute('aria-hidden','false');
  updateTagPositionMarker();
}
function closeTagPosition() {
  $('#tagPositionSheet').classList.add('hidden');
  $('#tagPositionSheet').setAttribute('aria-hidden','true');
  placingTagIndex = null;
  pendingTagPosition = null;
}
function updateTagPositionMarker() {
  const marker = $('#tagPositionMarker');
  const save = $('#saveTagPositionBtn');
  if (!pendingTagPosition) { marker.classList.add('hidden'); save.disabled = true; return; }
  marker.classList.remove('hidden');
  marker.style.left = `${pendingTagPosition.x * 100}%`;
  marker.style.top = `${pendingTagPosition.y * 100}%`;
  save.disabled = false;
}
$('#tagPositionCanvas')?.addEventListener('click', e => {
  const rect = e.currentTarget.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  pendingTagPosition = {
    x:Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y:Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
  updateTagPositionMarker();
});
$('#saveTagPositionBtn')?.addEventListener('click', () => {
  const tag = instagramOptions.userTags[placingTagIndex];
  if (!tag || !pendingTagPosition) return;
  tag.x = Number(pendingTagPosition.x.toFixed(4));
  tag.y = Number(pendingTagPosition.y.toFixed(4));
  renderInstagramPeople();
  closeTagPosition();
  toast(`@${tag.username} positioned.`);
});
$('#closeTagPositionBtn')?.addEventListener('click', closeTagPosition);
$('#closeTagPositionBackdrop')?.addEventListener('click', closeTagPosition);

// Keep long-running Reel/video publishing statuses fresh without requiring a manual reload.
setInterval(() => {
  if (remoteMode && ($('#view-history')?.classList.contains('active') || $('#view-calendar')?.classList.contains('active'))) {
    syncRemotePosts().catch(() => {});
  }
}, 15000);

$$('.segment').forEach(segment => segment.addEventListener('click', () => {
  const input = segment.querySelector('input');
  if (!input) return;
  if (editingPostId && input.value === 'now') {
    toast('Scheduled posts stay scheduled while editing.');
    return;
  }
  $$('.segment').forEach(s => s.classList.remove('active'));
  segment.classList.add('active');
  input.checked = true;
  const scheduled = input.value === 'schedule';
  $('#scheduleFields').classList.toggle('hidden', !scheduled);
  $('#primaryActionBtn').textContent = editingPostId ? 'Save Changes' : scheduled ? 'Schedule Post' : 'Post Now';
  if (scheduled && !$('#scheduleDate').value) setDefaultSchedule();
const todayForInput = new Date();
$('#scheduleDate').min = `${todayForInput.getFullYear()}-${String(todayForInput.getMonth()+1).padStart(2,'0')}-${String(todayForInput.getDate()).padStart(2,'0')}`;
}));
function setDefaultSchedule() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  $('#scheduleDate').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
setDefaultSchedule();

function setScheduleFromIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return setDefaultSchedule();
  $('#scheduleDate').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  $('#scheduleTime').value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function setPlatformSelection(platforms = []) {
  $$('.platform-chip').forEach(card => {
    const input = card.querySelector('input');
    if (!input || input.disabled) return;
    input.checked = platforms.includes(input.value);
    card.classList.toggle('selected', input.checked);
  });
}

function setScheduleTiming() {
  const segment = $('.segment input[value="schedule"]')?.closest('.segment');
  if (segment) segment.click();
}

function applyComposerMode() {
  const editing = Boolean(editingPostId);
  $('#saveDraftBtn').textContent = editing ? 'Cancel' : 'Save Draft';
  $('#primaryActionBtn').textContent = editing ? 'Save Changes' : (getTiming() === 'schedule' ? 'Schedule Post' : 'Post Now');
  $('#deleteScheduledBtn')?.classList.toggle('hidden', !editing);
  if ($('#view-create').classList.contains('active')) $('#pageTitle').textContent = editing ? 'Edit Post' : 'New Post';
}

const mediaInput = $('#mediaInput');
const dropZone = $('#dropZone');
mediaInput.addEventListener('change', () => mediaInput.files?.[0] && handleMedia(mediaInput.files[0]));
$('#changeMediaBtn').addEventListener('click', e => { e.preventDefault(); mediaInput.click(); });
dropZone.addEventListener('dragover', e => e.preventDefault());
dropZone.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleMedia(f); });

async function handleMedia(file) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return toast('Choose a photo or video.');
  try {
    invalidatePhotoTagPositions();
    currentFile = file.type.startsWith('image/') ? await normalizeImage(file) : file;
    const dataUrl = await fileToDataUrl(currentFile);
    state.currentMedia = { name:currentFile.name, type:currentFile.type, dataUrl, createdAt:new Date().toISOString() };
    renderCurrentMedia();
    if (file.type.startsWith('image/') && currentFile.type === 'image/jpeg' && file.type !== 'image/jpeg') toast('Image converted for Instagram.');
  } catch {
    toast('Could not prepare that media file.');
  }
}

async function normalizeImage(file) {
  const decoded = await decodeImage(file);
  const maxSide = 2160;
  const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
  const w = Math.max(1, Math.round(decoded.width * scale));
  const h = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha:false });
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h); ctx.drawImage(decoded.source,0,0,w,h);
  decoded.cleanup?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('convert failed')), 'image/jpeg', .92));
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type:'image/jpeg', lastModified:Date.now() });
}
async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { source:bitmap, width:bitmap.width, height:bitmap.height, cleanup:()=>bitmap.close?.() };
    } catch {}
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise((resolve,reject)=>{ img.onload=resolve; img.onerror=reject; });
  return { source:img, width:img.naturalWidth, height:img.naturalHeight, cleanup:()=>URL.revokeObjectURL(url) };
}
function fileToDataUrl(file) { return new Promise((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function mediaTag(media, autoplay = false) {
  const src = media.url || media.dataUrl;
  return String(media.type || '').startsWith('video/')
    ? `<video src="${escapeHtml(src)}" ${autoplay ? 'muted loop autoplay playsinline' : 'controls muted playsinline'}></video>`
    : `<img src="${escapeHtml(src)}" alt="Selected media" />`;
}
function renderCurrentMedia() {
  const media = state.currentMedia;
  $('#uploadPrompt').classList.toggle('hidden', !!media);
  $('#mediaPreview').classList.toggle('hidden', !media);
  $('#mediaActions').classList.toggle('hidden', !media);
  if (!media) {
    $('#mediaPreview').innerHTML = '';
    $('#previewMedia').innerHTML = '<div class="preview-placeholder">Your media</div>';
    return;
  }
  $('#mediaPreview').innerHTML = mediaTag(media);
  $('#previewMedia').innerHTML = mediaTag(media, true);
}
$('#removeMediaBtn').addEventListener('click', e => {
  e.preventDefault(); invalidatePhotoTagPositions(); currentFile = null; state.currentMedia = null; mediaInput.value = ''; renderCurrentMedia();
});

function selectedPlatforms() {
  return $$('.platform-chip input:checked:not(:disabled)').map(i => {
    if (i.value === 'instagram') return `instagram_${currentInstagramType()}`;
    return i.value;
  });
}
function hasInstagramPlatform(platforms=[]) { return platforms.some(p => p === 'instagram' || p.startsWith('instagram_')); }
function validateMediaForPlatforms(platforms) {
  const hasMedia = Boolean(state.currentMedia);
  if ((hasInstagramPlatform(platforms) || platforms.includes('tiktok')) && !hasMedia) return 'Instagram and TikTok need media.';
  const mediaType = String(state.currentMedia?.type || '');
  if (platforms.includes('instagram_post') && hasMedia && !mediaType.startsWith('image/')) return 'Instagram Post currently requires a photo. Choose Reel for video.';
  if (platforms.includes('instagram_reel') && hasMedia && !mediaType.startsWith('video/')) return 'Instagram Reel requires a video.';
  return '';
}

function getTiming() { return $('input[name="timing"]:checked').value; }
function collectPost(status) {
  const platforms = selectedPlatforms();
  if (!caption.value.trim()) { toast('Add a caption.'); caption.focus(); return null; }
  if (!platforms.length) { toast('Choose a network.'); return null; }
  const mediaError = validateMediaForPlatforms(platforms); if (mediaError) { toast(mediaError); return null; }
  let scheduledAt = null;
  if (status === 'scheduled') {
    const date = $('#scheduleDate').value, time = $('#scheduleTime').value;
    if (!date || !time) return toast('Choose a date and time.'), null;
    scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    if (new Date(scheduledAt) <= new Date()) return toast('Choose a future time.'), null;
  }
  let igOptions = null;
  if (hasInstagramPlatform(platforms) && currentInstagramType() !== 'story') {
    if (instagramOptions.collaborators.length > 3) return toast('Instagram allows up to 3 collaborators.'), null;
    if (currentInstagramType() === 'post') {
      const unplaced = instagramOptions.userTags.find(t => !Number.isFinite(t.x) || !Number.isFinite(t.y));
      if (unplaced) return toast(`Position @${unplaced.username} on the photo first.`), null;
    }
    igOptions = {
      userTags:instagramOptions.userTags.map(t => ({ username:t.username, ...(Number.isFinite(t.x) ? {x:t.x} : {}), ...(Number.isFinite(t.y) ? {y:t.y} : {}) })),
      collaborators:[...instagramOptions.collaborators],
      audioName:currentInstagramType() === 'reel' ? String(instagramOptions.audioName || '').trim() : '',
    };
  }
  return { caption:caption.value.trim(), platforms, status, scheduledAt, instagramOptions:igOptions };
}

async function submitPost(status) {
  const effectiveStatus = editingPostId ? 'scheduled' : status;
  const draft = collectPost(effectiveStatus); if (!draft) return;
  const btn = editingPostId ? $('#primaryActionBtn') : (status === 'draft' ? $('#saveDraftBtn') : $('#primaryActionBtn'));
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = editingPostId ? 'Saving…' : status === 'draft' ? 'Saving…' : status === 'scheduled' ? 'Scheduling…' : 'Posting…';
  try {
    if (editingPostId) {
      if (remoteMode) await updateRemoteScheduledPost(editingPostId, draft);
      else updateLocalScheduledPost(editingPostId, draft);
      toast('Changes saved.');
      finishEditing();
      navigate('calendar');
      return;
    }

    if (remoteMode) await submitRemotePost(draft);
    else submitLocalPost(draft);
    if (status === 'draft') toast('Draft saved.');
    else if (status === 'scheduled') { toast('Scheduled.'); navigate('calendar'); }
    else { toast('Post queued.'); navigate('history'); }
    if (status !== 'draft') clearComposer();
  } catch (err) {
    toast(err.message || 'Could not save post.');
  } finally {
    btn.disabled = false;
    if (!editingPostId) btn.textContent = oldText;
    applyComposerMode();
  }
}

async function uploadCurrentFileIfNeeded() {
  if (!currentFile) return null;
  const ext = currentFile.type === 'image/jpeg'
    ? 'jpg'
    : (currentFile.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  const mediaKey = `${crypto.randomUUID()}.${ext || 'bin'}`;
  const mediaType = currentFile.type;
  const upload = await fetch(`/api/media/${encodeURIComponent(mediaKey)}`, {
    method:'PUT', headers:{'content-type':mediaType}, body:currentFile
  });
  const uploadData = await upload.json().catch(()=>({}));
  if (!upload.ok) throw new Error(uploadData.error || 'Media upload failed.');
  return { mediaKey, mediaType };
}

async function submitRemotePost(draft) {
  const uploaded = await uploadCurrentFileIfNeeded();
  let mediaKey = state.currentMedia?.mediaKey || null;
  let mediaType = state.currentMedia?.type || null;
  if (uploaded) {
    mediaKey = uploaded.mediaKey;
    mediaType = uploaded.mediaType;
  }
  const apiStatus = draft.status === 'ready' ? 'queued' : draft.status;
  const r = await fetch('/api/posts', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ caption:draft.caption, platforms:draft.platforms, status:apiStatus, scheduledAt:draft.scheduledAt, mediaKey, mediaType, instagramOptions:draft.instagramOptions }),
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || 'Could not create post.');
  await syncRemotePosts();
  if (apiStatus === 'queued') setTimeout(syncRemotePosts, 3500);
}

async function updateRemoteScheduledPost(id, draft) {
  const uploaded = await uploadCurrentFileIfNeeded();
  let mediaKey = state.currentMedia?.mediaKey || null;
  let mediaType = state.currentMedia?.type || null;
  if (uploaded) {
    mediaKey = uploaded.mediaKey;
    mediaType = uploaded.mediaType;
  }
  const r = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    method:'PATCH',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      caption:draft.caption,
      platforms:draft.platforms,
      scheduledAt:draft.scheduledAt,
      mediaKey,
      mediaType,
      instagramOptions:draft.instagramOptions,
    }),
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || 'Could not update scheduled post.');
  await syncRemotePosts();
}

function submitLocalPost(draft) {
  const media = state.currentMedia ? { ...state.currentMedia } : null;
  if (media && !state.media.some(m => m.dataUrl === media.dataUrl)) state.media.unshift(media);
  state.posts.unshift({
    id:crypto.randomUUID?.() || String(Date.now()), caption:draft.caption, platforms:draft.platforms, media,
    status:draft.status, scheduledAt:draft.scheduledAt, instagramOptions:draft.instagramOptions, createdAt:new Date().toISOString(),
  });
  saveState(); renderHistory(); renderCalendar(); renderMediaLibrary();
}

function updateLocalScheduledPost(id, draft) {
  const post = state.posts.find(p => p.id === id && p.status === 'scheduled');
  if (!post) throw new Error('Scheduled post was not found.');
  const media = state.currentMedia ? { ...state.currentMedia } : null;
  post.caption = draft.caption;
  post.platforms = draft.platforms;
  post.scheduledAt = draft.scheduledAt;
  post.media = media;
  post.instagramOptions = draft.instagramOptions;
  post.updatedAt = new Date().toISOString();
  if (media && media.dataUrl && !state.media.some(m => m.dataUrl === media.dataUrl)) state.media.unshift(media);
  saveState(); renderHistory(); renderCalendar(); renderMediaLibrary();
}

function clearComposer() {
  caption.value=''; caption.dispatchEvent(new Event('input'));
  currentFile=null; state.currentMedia=null; mediaInput.value=''; renderCurrentMedia();
  instagramOptions = { userTags: [], collaborators: [], audioName: '' }; renderInstagramPeople(); renderInstagramAudio();
  setPlatformSelection(['instagram','facebook']);
  const igPost = $('input[name="igType"][value="post"]'); if (igPost) { igPost.checked=true; igPost.dispatchEvent(new Event('change')); }
  updateInstagramTypeVisibility();
  const nowSegment = $('.segment input[value="now"]')?.closest('.segment');
  if (nowSegment) nowSegment.click();
  setDefaultSchedule();
}

function finishEditing() {
  editingPostId = null;
  clearComposer();
  applyComposerMode();
}

function startEditingScheduledPost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post || post.status !== 'scheduled') return toast('That post is no longer scheduled.');
  editingPostId = id;
  caption.value = post.caption || '';
  caption.dispatchEvent(new Event('input'));
  instagramOptions = normalizeStoredInstagramOptions(post.instagramOptions);
  renderInstagramPeople();
  renderInstagramAudio();
  {
    const plats = post.platforms || [];
    setPlatformSelection(plats.map(p => p.startsWith('instagram_') || p === 'instagram' ? 'instagram' : p));
    const ig = plats.find(p => p.startsWith('instagram_'));
    if (ig) { const type = ig.replace('instagram_',''); const input = $(`input[name="igType"][value="${type}"]`); if (input) { input.checked=true; input.dispatchEvent(new Event('change')); } }
    updateInstagramTypeVisibility();
  }
  currentFile = null;
  mediaInput.value = '';
  if (remoteMode && post.mediaKey) {
    state.currentMedia = {
      name:post.mediaKey,
      type:post.mediaType || 'image/jpeg',
      url:`/media/${encodeURIComponent(post.mediaKey)}`,
      mediaKey:post.mediaKey,
      existing:true,
    };
  } else {
    state.currentMedia = post.media ? { ...post.media } : null;
  }
  renderCurrentMedia();
  setScheduleFromIso(post.scheduledAt);
  setScheduleTiming();
  navigate('create');
  applyComposerMode();
}

async function deleteScheduledPost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post || post.status !== 'scheduled') return toast('That post is no longer scheduled.');
  if (!confirm('Delete this scheduled post?')) return;
  try {
    if (remoteMode) {
      const r = await fetch(`/api/posts/${encodeURIComponent(id)}`, { method:'DELETE' });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(data.error || 'Could not delete scheduled post.');
      await syncRemotePosts();
    } else {
      state.posts = state.posts.filter(p => p.id !== id);
      saveState(); renderHistory(); renderCalendar(); renderMediaLibrary();
    }
    if (editingPostId === id) finishEditing();
    toast('Scheduled post deleted.');
    navigate('calendar');
  } catch (err) {
    toast(err.message || 'Could not delete scheduled post.');
  }
}

$('#saveDraftBtn').addEventListener('click', () => { if (editingPostId) { finishEditing(); navigate('calendar'); } else submitPost('draft'); });
$('#primaryActionBtn').addEventListener('click', () => submitPost(editingPostId ? 'scheduled' : (getTiming() === 'schedule' ? 'scheduled' : 'ready')));
$('#deleteScheduledBtn')?.addEventListener('click', () => editingPostId && deleteScheduledPost(editingPostId));

function openPreview() { $('#previewSheet').classList.remove('hidden'); $('#previewSheet').setAttribute('aria-hidden','false'); }
function closePreview() { $('#previewSheet').classList.add('hidden'); $('#previewSheet').setAttribute('aria-hidden','true'); }
$('#previewBtn').addEventListener('click', openPreview);
$('#closePreviewBtn').addEventListener('click', closePreview);
$('#closePreviewBackdrop').addEventListener('click', closePreview);

function normalizeStoredInstagramOptions(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const userTags = Array.isArray(raw.userTags) ? raw.userTags.map(t => ({
    username:normalizeIgUsername(t?.username || ''),
    ...(Number.isFinite(Number(t?.x)) ? {x:Number(t.x)} : {}),
    ...(Number.isFinite(Number(t?.y)) ? {y:Number(t.y)} : {}),
  })).filter(t => t.username) : [];
  const collaborators = Array.isArray(raw.collaborators) ? raw.collaborators.map(normalizeIgUsername).filter(Boolean).slice(0,3) : [];
  const audioName = String(raw.audioName || '').trim().replace(/\s+/g, ' ').slice(0,100);
  return { userTags, collaborators, audioName };
}
function instagramPeopleSummaryHtml(post) {
  const opts = normalizeStoredInstagramOptions(post.instagramOptions);
  const bits = [];
  if (opts.userTags.length) bits.push(`Tagged ${opts.userTags.map(t=>'@'+escapeHtml(t.username)).join(', ')}`);
  if (opts.collaborators.length) bits.push(`Collab ${opts.collaborators.map(u=>'@'+escapeHtml(u)).join(', ')}`);
  if (opts.audioName) bits.push(`Audio “${escapeHtml(opts.audioName)}”`);
  return bits.length ? `<div class="people-summary">${bits.join(' · ')}</div>` : '';
}

function platformName(p) { return ({instagram:'Instagram',instagram_post:'Instagram Post',instagram_story:'Instagram Story',instagram_reel:'Instagram Reel',facebook:'Facebook',threads:'Threads',tiktok:'TikTok'}[p] || p); }
function platformLabel(list) { return (list||[]).map(platformName).join(' + '); }
function formatDate(iso) { if (!iso) return ''; return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)); }
function postIcon(status) { return status === 'scheduled' ? '◷' : status === 'draft' ? '✎' : ['failed','partial_failed'].includes(status) ? '!' : status === 'published' ? '✓' : '↗'; }
function statusLabel(status) { return ({ready:'ready',queued:'posting',publishing:'posting',published:'posted',partial_failed:'partial',failed:'failed'}[status] || status); }
function publishReceiptHtml(post) {
  const results = post.publishResults;
  if (!results || typeof results !== 'object') return '';
  const entries = Object.entries(results);
  if (!entries.length) return '';
  return `<div class="result-row">${entries.map(([platform,result]) => {
    const ok = Boolean(result?.ok);
    const note = result?.draft ? 'sent' : ok ? 'posted' : 'failed';
    return `<span class="result-chip ${ok ? 'ok' : 'bad'}" title="${escapeHtml(result?.error || note)}">${escapeHtml(platformName(platform))} ${ok ? '✓' : '✕'}</span>`;
  }).join('')}</div>`;
}

function renderHistory() {
  const el = $('#historyContent');
  if (!state.posts.length) { el.innerHTML = '<div class="empty-state"><div><strong>No posts yet</strong></div></div>'; return; }
  el.innerHTML = `<div class="history-list">${state.posts.map(p => {
    const failed = ['failed','partial_failed'].includes(p.status);
    let action;
    if (p.status === 'scheduled') {
      action = `<button class="edit-post-button" data-edit-scheduled="${escapeHtml(p.id)}">Edit</button>`;
    } else if (['queued','publishing'].includes(p.status)) {
      action = `<span class="badge ${escapeHtml(p.status)}">${escapeHtml(statusLabel(p.status))}</span>`;
    } else {
      action = `<div class="item-actions">${failed && remoteMode ? `<button class="retry-button action-pill" data-retry="${escapeHtml(p.id)}">Retry</button>` : ''}<button class="reuse-button action-pill" data-use-again="${escapeHtml(p.id)}">Use Again</button></div>`;
    }
    return `<div class="history-item has-action"><div class="item-icon">${postIcon(p.status)}</div><div class="item-copy"><div class="item-title">${escapeHtml(p.caption.replace(/\n/g,' '))}</div><div class="item-sub">${platformLabel(p.platforms)} · ${formatDate(p.publishedAt || p.scheduledAt || p.createdAt)}</div>${instagramPeopleSummaryHtml(p)}${publishReceiptHtml(p)}${p.lastError ? `<div class="item-error">${escapeHtml(p.lastError)}</div>`:''}</div>${action}</div>`;
  }).join('')}</div>`;
}
$('#historyContent').addEventListener('click', async e => {
  const edit=e.target.closest('[data-edit-scheduled]');
  if (edit) return startEditingScheduledPost(edit.dataset.editScheduled);
  const reuse=e.target.closest('[data-use-again]');
  if (reuse) return reusePost(reuse.dataset.useAgain);
  const btn=e.target.closest('[data-retry]'); if(!btn) return;
  btn.disabled=true;
  const r=await fetch(`/api/posts/${encodeURIComponent(btn.dataset.retry)}/retry`,{method:'POST'});
  if(r.ok){toast('Retry queued.'); await syncRemotePosts(); setTimeout(syncRemotePosts,3500);} else {toast('Retry failed.'); btn.disabled=false;}
});

async function reusePost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return toast('That post is no longer available.');
  editingPostId = null;
  if (remoteMode) await Promise.allSettled([refreshThreadsStatus(), refreshTikTokStatus()]);
  caption.value = post.caption || '';
  caption.dispatchEvent(new Event('input'));
  instagramOptions = normalizeStoredInstagramOptions(post.instagramOptions);
  renderInstagramPeople();
  renderInstagramAudio();
  const platforms = post.platforms || [];
  setPlatformSelection(platforms.map(p => p.startsWith('instagram_') || p === 'instagram' ? 'instagram' : p));
  const ig = platforms.find(p => p.startsWith('instagram_'));
  const igType = ig ? ig.replace('instagram_','') : 'post';
  const igInput = $(`input[name="igType"][value="${igType}"]`);
  if (igInput) { igInput.checked = true; igInput.dispatchEvent(new Event('change')); }
  updateInstagramTypeVisibility();
  currentFile = null;
  mediaInput.value = '';
  if (remoteMode && post.mediaKey) {
    state.currentMedia = { name:post.mediaKey, type:post.mediaType || 'image/jpeg', url:`/media/${encodeURIComponent(post.mediaKey)}`, mediaKey:post.mediaKey, existing:true };
  } else {
    state.currentMedia = post.media ? { ...post.media } : null;
  }
  renderCurrentMedia();
  const nowSegment = $('.segment input[value="now"]')?.closest('.segment');
  if (nowSegment) nowSegment.click();
  applyComposerMode();
  navigate('create');
  toast('Loaded into Create.');
}

function renderCalendar() {
  const el = $('#calendarContent');
  const scheduled = state.posts.filter(p => p.status === 'scheduled' && p.scheduledAt).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
  if (!scheduled.length) { el.innerHTML = '<div class="empty-state"><div><strong>Nothing scheduled</strong></div></div>'; return; }
  let lastDay = '';
  el.innerHTML = `<div class="calendar-list">${scheduled.map(p => {
    const day = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date(p.scheduledAt));
    const head = day !== lastDay ? `<div class="calendar-day">${day}</div>` : '';
    lastDay = day;
    return `${head}<div class="calendar-item"><div class="item-icon">◷</div><div><div class="item-title">${escapeHtml(p.caption.replace(/\n/g,' '))}</div><div class="item-sub">${platformLabel(p.platforms)} · ${formatDate(p.scheduledAt)}</div></div><button class="edit-post-button" data-edit-scheduled="${escapeHtml(p.id)}">Edit</button></div>`;
  }).join('')}</div>`;
}
$('#calendarContent').addEventListener('click', e => {
  const edit=e.target.closest('[data-edit-scheduled]');
  if (edit) startEditingScheduledPost(edit.dataset.editScheduled);
});

function renderMediaLibrary() {
  const el = $('#mediaLibrary');
  const media = remoteMode ? state.posts.filter(p=>p.mediaKey).map(p=>({ url:`/media/${encodeURIComponent(p.mediaKey)}`, type:p.mediaType || 'image/jpeg', name:p.mediaKey, mediaKey:p.mediaKey, existing:true })) : state.media;
  renderedMediaItems = [...new Map(media.map(m=>[(m.url||m.dataUrl),m])).values()];
  if (!renderedMediaItems.length) { el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div><strong>No media yet</strong></div></div>'; return; }
  el.innerHTML = renderedMediaItems.map((m,index) => `<button class="media-tile" type="button" data-use-media="${index}" aria-label="Use this media">${String(m.type).startsWith('video/') ? `<video src="${escapeHtml(m.url||m.dataUrl)}" muted playsinline></video>` : `<img src="${escapeHtml(m.url||m.dataUrl)}" alt="Media" />`}<span class="media-use-label">Use</span></button>`).join('');
}
$('#mediaLibrary').addEventListener('click', e => {
  const tile = e.target.closest('[data-use-media]');
  if (!tile) return;
  const media = renderedMediaItems[Number(tile.dataset.useMedia)];
  if (!media) return;
  invalidatePhotoTagPositions();
  currentFile = null;
  mediaInput.value = '';
  state.currentMedia = { ...media };
  renderCurrentMedia();
  navigate('create');
  toast('Media added to Create.');
});

async function syncRemotePosts() {
  if (!remoteMode) return;
  try {
    const r = await fetch('/api/posts');
    if (r.status === 401) return showLogin();
    const data = await r.json();
    if (!r.ok) return;
    state.posts = (data.posts || []).map(p => ({
      id:p.id, caption:p.caption, platforms:p.platforms || [], mediaKey:p.media_key, mediaType:p.media_type,
      status:p.status, scheduledAt:p.scheduled_at, publishedAt:p.published_at, publishResults:p.publish_results,
      instagramOptions:p.instagram_options || null, lastError:p.last_error, createdAt:p.created_at, updatedAt:p.updated_at,
    }));
    renderHistory(); renderCalendar(); renderMediaLibrary();
  } catch {}
}

async function refreshMetaStatus() {
  const text = $('#metaStatusText'), connect = $('#connectMetaBtn'), disconnect = $('#disconnectMetaBtn'), details = $('#metaAccountDetails'), help = $('#setupHelp');
  $('#logoutBtn').classList.toggle('hidden', !remoteMode);
  text.textContent = 'Checking…'; details.classList.add('hidden'); help.classList.add('hidden');
  if (!remoteMode) {
    text.textContent = 'Local test mode'; connect.textContent='Cloud setup needed'; connect.disabled=true; connect.classList.remove('hidden'); disconnect.classList.add('hidden'); help.classList.remove('hidden'); return;
  }
  try {
    const r = await fetch('/api/meta/status', { headers:{accept:'application/json'} });
    if (r.status===401) return showLogin();
    const data = await r.json();
    if (r.status === 503 || data.configured === false) {
      text.textContent = 'Needs Meta setup'; connect.textContent = 'Connect Meta'; connect.disabled = false; connect.classList.remove('hidden'); disconnect.classList.add('hidden'); help.classList.remove('hidden'); return;
    }
    if (data.needsSelection && data.candidates?.length) {
      text.textContent = 'Choose Facebook Page'; connect.classList.add('hidden'); disconnect.classList.remove('hidden');
      details.innerHTML = data.candidates.map(c => `<button class="candidate-button" type="button" data-page-id="${escapeHtml(c.pageId)}"><span><strong>${escapeHtml(c.pageName)}</strong><small>${c.instagramUsername ? '@'+escapeHtml(c.instagramUsername) : 'No Instagram linked'}</small></span><b>Choose</b></button>`).join('');
      details.classList.remove('hidden'); return;
    }
    if (!data.connected) {
      text.textContent = 'Not connected'; connect.textContent = 'Connect Meta'; connect.disabled = false; connect.classList.remove('hidden'); disconnect.classList.add('hidden'); return;
    }
    text.textContent = 'Connected'; connect.classList.add('hidden'); disconnect.classList.remove('hidden');
    details.innerHTML = `<div class="detail-row"><span>Facebook</span><strong>${escapeHtml(data.facebook?.name || 'Connected')}</strong></div><div class="detail-row"><span>Instagram</span><strong>${escapeHtml(data.instagram?.username ? '@'+data.instagram.username : data.instagram?.name || 'Not linked')}</strong></div>`;
    details.classList.remove('hidden');
  } catch { text.textContent = 'Connection error'; }
}

$('#metaAccountDetails').addEventListener('click', async e => {
  const btn = e.target.closest('[data-page-id]'); if (!btn) return;
  btn.disabled = true;
  const r = await fetch('/api/meta/select', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ pageId:btn.dataset.pageId }) });
  if (r.ok) { toast('Page selected.'); refreshMetaStatus(); } else { btn.disabled=false; toast('Could not select Page.'); }
});
$('#connectMetaBtn').addEventListener('click', async () => {
  if (!remoteMode) return toast('Deploy the Cloudflare build first.');
  const r = await fetch('/api/meta/status');
  const data = await r.json().catch(()=>({}));
  if (!r.ok || data.configured === false) { $('#setupHelp').classList.remove('hidden'); toast('Add Meta credentials first.'); return; }
  location.href = '/api/meta/connect';
});
$('#disconnectMetaBtn').addEventListener('click', async () => {
  if (!confirm('Disconnect Facebook and Instagram?')) return;
  const r = await fetch('/api/meta/disconnect',{method:'POST'});
  if (r.ok) { toast('Disconnected.'); refreshMetaStatus(); } else toast('Could not disconnect.');
});
async function refreshThreadsStatus() {
  const text = $('#threadsStatusText'), connect = $('#connectThreadsBtn'), disconnect = $('#disconnectThreadsBtn'), details = $('#threadsAccountDetails');
  const chip = $('.platform-chip[data-platform="threads"]');
  const input = chip?.querySelector('input');
  if (!text) return;
  text.textContent = 'Checking…'; details?.classList.add('hidden');
  if (!remoteMode) { text.textContent='Cloud setup needed'; connect?.classList.remove('hidden'); if(connect) connect.disabled=true; disconnect?.classList.add('hidden'); if(input) input.disabled=true; chip?.classList.add('disabled-platform'); return; }
  try {
    const r = await fetch('/api/threads/status', { headers:{accept:'application/json'} });
    if (r.status===401) return showLogin();
    const data = await r.json().catch(()=>({}));
    if (data.schemaNeeded) { text.textContent='Database update needed'; if(connect){connect.classList.remove('hidden');connect.disabled=true;} disconnect?.classList.add('hidden'); if(input) input.disabled=true; chip?.classList.add('disabled-platform'); return; }
    if (data.configured===false) { text.textContent='Needs Threads setup'; if(connect){connect.classList.remove('hidden');connect.disabled=false;} disconnect?.classList.add('hidden'); if(input) input.disabled=true; chip?.classList.add('disabled-platform'); return; }
    if (!data.connected) { text.textContent='Not connected'; if(connect){connect.classList.remove('hidden');connect.disabled=false;} disconnect?.classList.add('hidden'); if(input) input.disabled=true; chip?.classList.add('disabled-platform'); return; }
    text.textContent='Connected'; connect?.classList.add('hidden'); disconnect?.classList.remove('hidden');
    if (details) { details.innerHTML=`<div class="detail-row"><span>Account</span><strong>${escapeHtml(data.account?.username ? '@'+data.account.username : 'Threads')}</strong></div><div class="detail-row"><span>Posting</span><strong>Post + Schedule</strong></div>`; details.classList.remove('hidden'); }
    if(input) input.disabled=false; chip?.classList.remove('disabled-platform');
  } catch { text.textContent='Connection error'; if(input) input.disabled=true; chip?.classList.add('disabled-platform'); }
}
$('#connectThreadsBtn')?.addEventListener('click', async()=>{
  if(!remoteMode) return toast('Deploy the Cloudflare build first.');
  const r=await fetch('/api/threads/status'); const data=await r.json().catch(()=>({}));
  if(!r.ok || data.configured===false || data.schemaNeeded) return toast(data.schemaNeeded ? 'Run the database update first.' : 'Add Threads credentials first.');
  location.href='/api/threads/connect';
});
$('#disconnectThreadsBtn')?.addEventListener('click', async()=>{
  if(!confirm('Disconnect Threads?')) return; const r=await fetch('/api/threads/disconnect',{method:'POST'});
  if(r.ok){toast('Threads disconnected.');refreshThreadsStatus();} else toast('Could not disconnect Threads.');
});

async function refreshTikTokStatus() {
  const text = $('#tiktokStatusText'), connect = $('#connectTikTokBtn'), disconnect = $('#disconnectTikTokBtn'), details = $('#tiktokAccountDetails');
  const chip = $('.platform-chip[data-platform="tiktok"]');
  const input = chip?.querySelector('input');
  text.textContent = 'Checking…'; details.classList.add('hidden');
  if (!remoteMode) {
    text.textContent = 'Cloud setup needed'; connect.classList.remove('hidden'); connect.disabled = true; disconnect.classList.add('hidden');
    if (input) input.disabled = true; chip?.classList.add('disabled-platform');
    return;
  }
  try {
    const r = await fetch('/api/tiktok/status', { headers:{accept:'application/json'} });
    if (r.status === 401) return showLogin();
    const data = await r.json().catch(()=>({}));
    if (data.schemaNeeded) {
      text.textContent = 'Database update needed'; connect.classList.remove('hidden'); connect.disabled = true; disconnect.classList.add('hidden');
      if (input) input.disabled = true; chip?.classList.add('disabled-platform'); return;
    }
    if (data.configured === false) {
      text.textContent = 'Needs TikTok setup'; connect.classList.remove('hidden'); connect.disabled = false; disconnect.classList.add('hidden');
      if (input) input.disabled = true; chip?.classList.add('disabled-platform'); return;
    }
    if (!data.connected) {
      text.textContent = 'Not connected'; connect.classList.remove('hidden'); connect.disabled = false; disconnect.classList.add('hidden');
      if (input) input.disabled = true; chip?.classList.add('disabled-platform'); return;
    }
    text.textContent = 'Connected · drafts'; connect.classList.add('hidden'); disconnect.classList.remove('hidden');
    details.innerHTML = `<div class="detail-row"><span>Account</span><strong>${escapeHtml(data.account?.displayName || 'TikTok')}</strong></div><div class="detail-row"><span>Posting</span><strong>Finish in TikTok</strong></div>`;
    details.classList.remove('hidden');
    if (input) input.disabled = false; chip?.classList.remove('disabled-platform');
  } catch {
    text.textContent = 'Connection error'; if (input) input.disabled = true; chip?.classList.add('disabled-platform');
  }
}

$('#connectTikTokBtn')?.addEventListener('click', async () => {
  if (!remoteMode) return toast('Deploy the Cloudflare build first.');
  const r = await fetch('/api/tiktok/status');
  const data = await r.json().catch(()=>({}));
  if (!r.ok || data.configured === false || data.schemaNeeded) { toast(data.schemaNeeded ? 'Run the database update first.' : 'Add TikTok credentials first.'); return; }
  location.href = '/api/tiktok/connect';
});
$('#disconnectTikTokBtn')?.addEventListener('click', async () => {
  if (!confirm('Disconnect TikTok?')) return;
  const r = await fetch('/api/tiktok/disconnect',{method:'POST'});
  if (r.ok) { toast('TikTok disconnected.'); refreshTikTokStatus(); } else toast('Could not disconnect TikTok.');
});

$('#clearHistoryBtn').addEventListener('click', () => {
  if (remoteMode) return toast('Cloud post deletion is not enabled yet.');
  if (!confirm('Clear local test data?')) return;
  state.posts=[]; state.media=[]; state.currentMedia=null; saveState(); renderCurrentMedia(); renderHistory(); renderCalendar(); renderMediaLibrary(); toast('Cleared.');
});

function showLogin() { $('#loginOverlay').classList.remove('hidden'); setTimeout(()=>$('#appPassword').focus(),50); }
function hideLogin() { $('#loginOverlay').classList.add('hidden'); $('#appPassword').value=''; $('#loginError').classList.add('hidden'); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn=e.currentTarget.querySelector('button'); btn.disabled=true;
  try {
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('#appPassword').value})});
    if(!r.ok){$('#loginError').classList.remove('hidden'); return;}
    remoteMode=true; hideLogin(); await syncRemotePosts(); refreshMetaStatus(); refreshThreadsStatus(); refreshTikTokStatus();
  } finally {btn.disabled=false;}
});
$('#logoutBtn').addEventListener('click', async()=>{ await fetch('/api/auth/logout',{method:'POST'}).catch(()=>{}); remoteMode=false; showLogin(); });

async function initBackendMode() {
  try {
    const r = await fetch('/api/auth/status', { headers:{accept:'application/json'} });
    if (!r.ok) return;
    const data = await r.json();
    if (!data.configured) return;
    remoteMode = true;
    if (!data.authenticated) showLogin();
    else {
      hideLogin();
      await syncRemotePosts();
      await Promise.allSettled([refreshMetaStatus(), refreshThreadsStatus(), refreshTikTokStatus()]);
    }
  } catch { remoteMode = false; }
}


function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIosSafari() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
function refreshInstallCard() {
  const card = $('#installCard');
  if (!card) return;
  if (isStandaloneApp()) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const button = $('#installAppBtn');
  const steps = $('#iosInstallSteps');
  if (deferredInstallPrompt) {
    button.classList.remove('hidden');
    steps.classList.add('hidden');
    $('#installStatusText').textContent = 'Install it from this browser.';
  } else if (isIosSafari()) {
    button.classList.add('hidden');
    steps.classList.remove('hidden');
    $('#installStatusText').textContent = 'Add it to your Home Screen.';
  } else {
    button.classList.add('hidden');
    steps.classList.add('hidden');
    $('#installStatusText').textContent = 'Open this page on iPhone Safari to add it.';
  }
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshInstallCard();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  refreshInstallCard();
  toast('Installed.');
});
$('#installAppBtn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice.catch(()=>null);
  deferredInstallPrompt = null;
  refreshInstallCard();
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}
refreshInstallCard();

function restoreLastView() {
  try {
    const saved = sessionStorage.getItem(ACTIVE_VIEW_KEY);
    if (saved && titles[saved]) navigate(saved, { remember:false });
    else window.scrollTo(0, 0);
  } catch { window.scrollTo(0, 0); }
}

const params = new URLSearchParams(location.search);
if (params.get('meta') === 'connected') { history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); toast('Meta connected.'); },100); }
if (params.get('meta') === 'error') { history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); toast('Meta connection failed.'); },100); }
if (params.get('meta') === 'no_pages') { history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); toast('No Facebook Pages found.'); },100); }
if (params.get('threads') === 'connected') { history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); refreshThreadsStatus(); toast('Threads connected.'); },100); }
if (params.get('threads') === 'error') { const message=params.get('message'); history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); toast(message || 'Threads connection failed.'); },100); }
if (params.get('tiktok') === 'connected') { history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); refreshTikTokStatus(); toast('TikTok connected.'); },100); }
if (params.get('tiktok') === 'error') { const message=params.get('message'); history.replaceState({},'',location.pathname); setTimeout(()=>{ navigate('settings'); toast(message || 'TikTok connection failed.'); },100); }

const hasConnectionResult = ['meta','threads','tiktok'].some(key => params.has(key));
renderCurrentMedia(); renderHistory(); renderCalendar(); renderMediaLibrary(); applyComposerMode();
if (!hasConnectionResult) restoreLastView();
initBackendMode();
