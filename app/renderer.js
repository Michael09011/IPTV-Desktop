import { parsePlaylist } from './parsers.js';

const root = document.getElementById('root');
const openBtn = document.getElementById('openBtn');
let searchInput;
let savedPlaylists = [];

let channels = [];
let groups = [];
// favorites stored as an object map in localStorage: { [url]: { name, group, addedAt, tvgId } }
let favorites = new Map();
function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem('favorites') || '{}') || {};
    favorites = new Map(Object.entries(raw));
  } catch (e) { favorites = new Map(); }
}
function saveFavorites() {
  try {
    const obj = Object.fromEntries(favorites);
    localStorage.setItem('favorites', JSON.stringify(obj));
  } catch (e) {}
}
loadFavorites();
let currentGroup = 'All';
let currentHls = null;
let currentVideo = null;
let currentPlayingUrl = null;
let currentRetryTimer = null;
let isRetrying = false;
const HLS_MAX_RETRIES = 3;
const HLS_BASE_DELAY_MS = 1500;

// Sidebar navigation
let sidebarView = 'main'; // 'main' or 'channels'
let sidebarHidden = localStorage.getItem('sidebarHidden') === '1';
const SIDEBAR_VISIBLE_WIDTH = '340px';

function ensureFixedSidebarToggle() {
  if (typeof document === 'undefined') return null;
  let t = document.getElementById('sidebarToggleFixed');
  if (!t) {
    t = document.createElement('button');
    t.id = 'sidebarToggleFixed';
    t.className = 'sidebar-toggle-fixed';
    // inject minimal styles once
    if (!document.getElementById('sidebarToggleFixedStyles')) {
      const style = document.createElement('style');
      style.id = 'sidebarToggleFixedStyles';
      style.textContent = `
        .sidebar-toggle-fixed { position: fixed; left: 12px; top: 12px; z-index:10001; width:44px; height:44px; border-radius:8px; padding:0; display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; background:var(--primary); color:#fff; border:none; box-shadow:0 6px 20px rgba(0,0,0,0.45); transition: transform 160ms ease, opacity 160ms ease; }
        .sidebar-toggle-fixed:hover { transform: scale(1.06); }
        .sidebar-toggle-fixed.pulse { animation: sidebarPulse 2s infinite; }
        @keyframes sidebarPulse { 0% { box-shadow: 0 6px 20px rgba(124,58,237,0.28); } 50% { box-shadow: 0 10px 30px rgba(124,58,237,0.36); } 100% { box-shadow: 0 6px 20px rgba(124,58,237,0.28); } }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(t);
  }
  t.innerHTML = sidebarHidden ? '&#9654;' : '&#9664;';
  t.title = sidebarHidden ? '사이드바 열기' : '사이드바 숨기기';
  // add pulse when visible to draw attention
  if (!sidebarHidden) t.classList.add('pulse'); else t.classList.remove('pulse');
  t.onclick = () => {
    // Toggle state and update layout in-place to avoid re-creating the video element
    sidebarHidden = !sidebarHidden;
    localStorage.setItem('sidebarHidden', sidebarHidden ? '1' : '0');
    // update grid columns on root
    try {
      const rt = document.getElementById('root');
      if (rt) rt.style.gridTemplateColumns = sidebarHidden ? `0px 1fr` : `${SIDEBAR_VISIBLE_WIDTH} 1fr`;
      const lc = document.querySelector('.left-col');
      if (lc) lc.style.opacity = sidebarHidden ? '0' : '1';
    } catch (e) {}
    // update button appearance
    t.innerHTML = sidebarHidden ? '&#9654;' : '&#9664;';
    t.title = sidebarHidden ? '사이드바 열기' : '사이드바 숨기기';
    if (!sidebarHidden) t.classList.add('pulse'); else t.classList.remove('pulse');
  };
  return t;
}
let selectedPlaylistId = null;
let selectedPlaylistName = null;
let playlistChannels = [];

async function ensureHlsAvailable(need) {
  if (!need) { window.Hls = null; return null; }
  if (window.Hls) return window.Hls;
  const existing = document.querySelector('script[data-hls-loader]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(window.Hls || null));
      existing.addEventListener('error', () => resolve(null));
    });
  }
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js');
    window.Hls = (mod && (mod.default || mod.Hls)) || window.Hls || null;
    if (window.Hls) return window.Hls;
  } catch (e) {}
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    s.dataset.hlsLoader = '1';
    s.addEventListener('load', () => { resolve(window.Hls || null); });
    s.addEventListener('error', () => { resolve(null); });
    document.head.appendChild(s);
  });
}

async function openClickHandler() {
  if (window._openClickInProgress) return;
  window._openClickInProgress = true;
  try {
    const res = await window.electronAPI.openFile();
    if (res.canceled) return;

    // the file dialog returns an array of { path, content }
    // load the channels into the current session and **also save the
    // playlists so the button behaves like "플레이리스트 추가" rather
    // than a one‑off viewer.
    channels = [];
    for (const f of res.files) {
      const parsed = parsePlaylist(f.content, f.path);
      channels = channels.concat(parsed);

      // save the playlist so it shows up in the sidebar
      try {
        // derive a simple name from the filename
        const parts = f.path.split(/[\\\/]/);
        const name = parts[parts.length - 1] || f.path;
        const saveRes = await window.electronAPI.playlistsAdd({ name, url: '', content: f.content });
        if (saveRes && saveRes.ok) {
          showToast(`플레이리스트 "${name}" 저장됨`, 'success');
        }
      } catch (e) {
        console.warn('플레이리스트 저장 실패', e);
      }
    }

    // reload the saved list so sidebar reflects any additions
    await loadSavedPlaylists();

    const needHls = channels.some(c => c.url && c.url.endsWith('.m3u8'));
    try {
      const h = await ensureHlsAvailable(needHls);
      console.log('Hls module loaded', !!h);
    } catch (e) { console.error('ensureHlsAvailable failed', e); }
    render();
  } finally { window._openClickInProgress = false; }
}

function attachOpenBtn() {
  const btn = document.getElementById('openBtn');
  if (!btn) { console.warn('attachOpenBtn: openBtn not found'); return; }
  if (btn._attached) return; btn._attached = true;
  btn.addEventListener('click', openClickHandler);
  console.log('attachOpenBtn: handler attached');
}
attachOpenBtn();
document.addEventListener('DOMContentLoaded', attachOpenBtn);

// wire settings button (exists in index.html header)
document.addEventListener('DOMContentLoaded', () => {
  const sbtn = document.getElementById('settingsBtn');
  if (sbtn) sbtn.addEventListener('click', showSettingsModal);
  const openUrlBtn = document.getElementById('openUrlBtn');
  if (openUrlBtn) openUrlBtn.addEventListener('click', showUrlModal);
  // insert current playing display into header (after brand icon)
  try {
    const hdr = document.querySelector('header');
    if (hdr && !document.getElementById('currentChannelDisplay')) {
      const el = document.createElement('div');
      el.id = 'currentChannelDisplay';
      el.style.margin = '0 12px 0 0';
      el.style.fontSize = '13px';
      el.style.color = 'var(--text-muted)';
      el.textContent = '';
      hdr.insertBefore(el, hdr.children[1] || null);
    }
  } catch (e) {}
});

async function showSettingsModal() {
  const settings = await window.electronAPI.settingsGet().catch(()=> ({}));
  const modal = document.createElement('div'); modal.style.position='fixed'; modal.style.left=0; modal.style.top=0; modal.style.right=0; modal.style.bottom=0; modal.style.zIndex='10000'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.background='rgba(0,0,0,0.6)';
  const body = document.createElement('div'); body.style.background='var(--card)'; body.style.padding='18px'; body.style.borderRadius='8px'; body.style.width='420px'; body.style.border='1px solid var(--border)';
  const title = document.createElement('h3'); title.textContent='설정'; title.style.margin='0 0 12px 0'; body.appendChild(title);

  // GPU toggle
  const gpuRow = document.createElement('div'); gpuRow.style.display='flex'; gpuRow.style.alignItems='center'; gpuRow.style.gap='8px'; gpuRow.style.marginBottom='8px';
  const gpuChk = document.createElement('input'); gpuChk.type='checkbox'; gpuChk.checked = settings.disableHardwareAcceleration !== false; // default true
  const gpuLabel = document.createElement('label'); gpuLabel.textContent='하드웨어 가속 비활성화 (재시작 필요)'; gpuRow.appendChild(gpuChk); gpuRow.appendChild(gpuLabel);
  body.appendChild(gpuRow);

  // Clear cache button
  const cacheRow = document.createElement('div'); cacheRow.style.display='flex'; cacheRow.style.gap='8px'; cacheRow.style.marginTop='8px';
  const clearCacheBtn = document.createElement('button'); clearCacheBtn.textContent='캐시 삭제'; clearCacheBtn.onclick = async () => {
    try {
      // request main to open userData folder so user can delete Cache manually
      await window.electronAPI.playlistsOpenBackupDir();
      showToast('백업 폴더 열기 (캐시 수동 삭제 가능)', 'info');
    } catch (e) { showToast('폴더 열기 실패', 'error'); }
  };
  cacheRow.appendChild(clearCacheBtn);
  body.appendChild(cacheRow);

  // Auto-backup settings in modal
  const autoRow = document.createElement('div'); autoRow.style.display='flex'; autoRow.style.alignItems='center'; autoRow.style.gap='8px'; autoRow.style.marginTop='8px';
  const autoChk = document.createElement('input'); autoChk.type='checkbox'; autoChk.checked = localStorage.getItem('autoBackupEnabled') === '1';
  const minutesInput = document.createElement('input'); minutesInput.type='number'; minutesInput.min='1'; minutesInput.style.width='64px'; minutesInput.value = localStorage.getItem('autoBackupMinutes') || '60';
  const autoLabel = document.createElement('label'); autoLabel.textContent = '자동 백업 (분)'; autoRow.appendChild(autoChk); autoRow.appendChild(autoLabel); autoRow.appendChild(minutesInput);
  body.appendChild(autoRow);

  // Auto-refresh settings for remote playlists
  const refreshRow = document.createElement('div'); refreshRow.style.display='flex'; refreshRow.style.alignItems='center'; refreshRow.style.gap='8px'; refreshRow.style.marginTop='8px';
  const refreshChk = document.createElement('input'); refreshChk.type='checkbox'; refreshChk.checked = localStorage.getItem('autoRefreshEnabled') === '1';
  const refreshSelect = document.createElement('select'); refreshSelect.style.width='80px';
  const refreshOptions = [
    { value: '360', text: '6시간' },
    { value: '720', text: '12시간' },
    { value: '1440', text: '24시간' }
  ];
  refreshOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('autoRefreshMinutes') === opt.value) option.selected = true;
    refreshSelect.appendChild(option);
  });
  const refreshLabel = document.createElement('label'); refreshLabel.textContent = 'M3U 자동 갱신';
  refreshRow.appendChild(refreshChk); refreshRow.appendChild(refreshLabel); refreshRow.appendChild(refreshSelect);
  body.appendChild(refreshRow);

  // EPG auto-refresh settings
  const epgRefreshRow = document.createElement('div'); epgRefreshRow.style.display='flex'; epgRefreshRow.style.alignItems='center'; epgRefreshRow.style.gap='8px'; epgRefreshRow.style.marginTop='8px';
  const epgRefreshChk = document.createElement('input'); epgRefreshChk.type='checkbox'; epgRefreshChk.checked = localStorage.getItem('epgAutoRefreshEnabled') === '1';
  const epgRefreshSelect = document.createElement('select'); epgRefreshSelect.style.width='80px';
  const epgRefreshOptions = [
    { value: '360', text: '6시간' },
    { value: '720', text: '12시간' },
    { value: '1440', text: '24시간' }
  ];
  epgRefreshOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('epgAutoRefreshMinutes') === opt.value) option.selected = true;
    epgRefreshSelect.appendChild(option);
  });
  const epgRefreshLabel = document.createElement('label'); epgRefreshLabel.textContent = 'EPG 자동 갱신';
  epgRefreshRow.appendChild(epgRefreshChk); epgRefreshRow.appendChild(epgRefreshLabel); epgRefreshRow.appendChild(epgRefreshSelect);
  body.appendChild(epgRefreshRow);

  // EPG settings
  const epgRow = document.createElement('div'); epgRow.style.display='flex'; epgRow.style.alignItems='center'; epgRow.style.gap='8px'; epgRow.style.marginTop='8px';
  const epgChk = document.createElement('input'); epgChk.type='checkbox'; epgChk.checked = localStorage.getItem('epgEnabled') === '1';
  const epgLabel = document.createElement('label'); epgLabel.textContent = 'EPG 기능 활성화';
  epgRow.appendChild(epgChk); epgRow.appendChild(epgLabel);
  body.appendChild(epgRow);

  // Network buffer settings
  const bufferRow = document.createElement('div'); bufferRow.style.display='flex'; bufferRow.style.alignItems='center'; bufferRow.style.gap='8px'; bufferRow.style.marginTop='8px';
  const bufferModeSelect = document.createElement('select'); bufferModeSelect.style.width='80px';
  const bufferOptions = [
    { value: 'auto', text: '자동' },
    { value: 'manual', text: '수동' }
  ];
  bufferOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('bufferMode') === opt.value) option.selected = true;
    bufferModeSelect.appendChild(option);
  });
  const bufferLabel = document.createElement('label'); bufferLabel.textContent = '네트워크 버퍼';
  const bufferInput = document.createElement('input'); bufferInput.type='number'; bufferInput.min='10'; bufferInput.max='300'; bufferInput.step='5'; bufferInput.style.width='64px'; bufferInput.value = localStorage.getItem('maxBufferLength') || '30';
  bufferInput.disabled = localStorage.getItem('bufferMode') !== 'manual';
  bufferModeSelect.onchange = () => { bufferInput.disabled = bufferModeSelect.value !== 'manual'; };
  bufferRow.appendChild(bufferLabel); bufferRow.appendChild(bufferModeSelect); bufferRow.appendChild(bufferInput);
  body.appendChild(bufferRow);

  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.style.marginTop='12px'; actions.style.justifyContent='flex-end';
  const restartBtn = document.createElement('button'); restartBtn.textContent='저장'; restartBtn.className='primary'; restartBtn.onclick = async () => {
    // save setting then restart only if GPU setting changed
    const currentGpuSetting = settings.disableHardwareAcceleration !== false;
    const newGpuSetting = !!gpuChk.checked;
    await window.electronAPI.settingsSet({ disableHardwareAcceleration: newGpuSetting });
    // persist auto backup/refresh settings to localStorage
    localStorage.setItem('autoBackupEnabled', autoChk.checked ? '1' : '0');
    localStorage.setItem('autoBackupMinutes', String(Math.max(1, Number(minutesInput.value||60))));
    localStorage.setItem('autoRefreshEnabled', refreshChk.checked ? '1' : '0');
    localStorage.setItem('autoRefreshMinutes', refreshSelect.value || '360');
    localStorage.setItem('epgAutoRefreshEnabled', epgRefreshChk.checked ? '1' : '0');
    localStorage.setItem('epgAutoRefreshMinutes', epgRefreshSelect.value || '360');
    localStorage.setItem('epgEnabled', epgChk.checked ? '1' : '0');
    localStorage.setItem('bufferMode', bufferModeSelect.value || 'auto');
    localStorage.setItem('maxBufferLength', bufferInput.value || '30');
    // 재설정 자동 갱신 타이머
    scheduleAutoRefresh();
    scheduleAutoEPGRefresh();
    
    if (currentGpuSetting !== newGpuSetting) {
      showToast('GPU 설정 변경으로 앱 재시작 중...', 'info');
      await window.electronAPI.appRestart();
    } else {
      showToast('설정 저장됨', 'success');
      modal.remove();
    }
  };
  const closeBtn = document.createElement('button'); closeBtn.textContent='닫기'; closeBtn.onclick = () => modal.remove();
  actions.appendChild(closeBtn); actions.appendChild(restartBtn);
  body.appendChild(actions);

  modal.appendChild(body); document.body.appendChild(modal);
}

// Helper: find channel metadata by URL
function getChannelInfoByUrl(url) {
  if (!url) return null;
  let found = null;
  try {
    found = playlistChannels.find(c=>c.url===url) || channels.find(c=>c.url===url);
  } catch (e) {}
  return found || null;
}

function updateCurrentChannelDisplay() {
  try {
    const el = document.getElementById('currentChannelDisplay');
    if (!el) return;
    if (!currentPlayingUrl) { el.textContent = ''; return; }
    const info = getChannelInfoByUrl(currentPlayingUrl);
    el.textContent = info ? `재생: ${info.name || info.group || ''}` : `재생 중: ${currentPlayingUrl}`;
  } catch (e) {}
}

async function showUrlModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed'; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0; modal.style.zIndex='10000';
  modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.background='rgba(0,0,0,0.6)';
  const body = document.createElement('div'); body.style.background='var(--card)'; body.style.padding='18px'; body.style.borderRadius='8px'; body.style.width='520px'; body.style.border='1px solid var(--border)';
  const title = document.createElement('h3'); title.textContent='URL 불러오기'; title.style.margin='0 0 12px 0'; body.appendChild(title);

  // show current playing info
  const curDiv = document.createElement('div'); curDiv.style.marginBottom='8px'; curDiv.style.color='var(--text-muted)';
  const info = getChannelInfoByUrl(currentPlayingUrl);
  curDiv.textContent = info ? `현재 재생: ${info.name || info.group || ''} (${info.group||''})` : (currentPlayingUrl ? `현재 재생 URL: ${currentPlayingUrl}` : '현재 재생 없음');
  body.appendChild(curDiv);

  const urlInput = document.createElement('input'); urlInput.placeholder='URL 입력'; urlInput.style.width='100%'; urlInput.style.marginBottom='8px'; body.appendChild(urlInput);
  const nameInput = document.createElement('input'); nameInput.placeholder='이름 (선택)'; nameInput.style.width='100%'; nameInput.style.marginBottom='8px'; body.appendChild(nameInput);
  const epgUrlInput = document.createElement('input'); epgUrlInput.placeholder='EPG URL (선택)'; epgUrlInput.style.width='100%'; epgUrlInput.style.marginBottom='8px'; body.appendChild(epgUrlInput);
  const addBtn = document.createElement('button'); addBtn.textContent='불러오기'; addBtn.className='primary'; addBtn.style.width='100%';
  addBtn.onclick = async () => {
    const url = urlInput.value.trim(); if (!url) return alert('URL을 입력하세요');
    addBtn.disabled = true; addBtn.textContent = '불러오는 중...';
    const res = await window.electronAPI.fetchUrl(url);
    if (!res.ok) { alert('불러오기 실패: ' + (res.error||'unknown')); addBtn.disabled=false; addBtn.textContent='불러오기'; return; }
    const name = nameInput.value.trim() || url.split('/').pop() || 'playlist';
    const epgUrl = epgUrlInput.value.trim();
    const saveRes = await window.electronAPI.playlistsAdd({ name, url, epgUrl: epgUrl || undefined, content: res.content });
    if (saveRes.ok) { await loadSavedPlaylists(); render(); modal.remove(); }
    addBtn.disabled = false; addBtn.textContent = '불러오기';
  };
  body.appendChild(addBtn);

  const closeBtn = document.createElement('button'); closeBtn.textContent='닫기'; closeBtn.style.marginTop='8px'; closeBtn.onclick = () => modal.remove();
  body.appendChild(closeBtn);
  modal.appendChild(body); document.body.appendChild(modal);
}

let editMode = false;
let editablePlaylists = [];

// persistent channel search text to avoid losing input when re-rendering
let channelFilterText = '';
let _prevSearchSelectionStart = null;
let _prevSearchSelectionEnd = null;
let _prevSearchHadFocus = false;

async function loadSavedPlaylists() {
  try {
    const res = await window.electronAPI.playlistsList();
    if (res && Array.isArray(res.playlists)) {
      savedPlaylists = res.playlists;
    } else if (Array.isArray(res)) {
      // backwards compatibility
      savedPlaylists = res;
    } else {
      savedPlaylists = [];
    }
  } catch (e) { savedPlaylists = []; }
}

async function prepareEditablePlaylists() {
  editablePlaylists = [];
  for (const p of savedPlaylists) {
    try {
      const r = await window.electronAPI.playlistsGet(p.id);
      if (r.ok && r.playlist) editablePlaylists.push(r.playlist);
    } catch (e) {}
  }
}

function moveItem(arr, idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= arr.length) return idx;
  const tmp = arr[to]; arr[to] = arr[idx]; arr[idx] = tmp;
  return to;
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}

// scheduleRender is reused across renders to avoid recreating debounce
const scheduleRender = debounce(() => render(), 160);

function ensureSortableLoaded() {
  return new Promise((resolve) => {
    if (window.Sortable) return resolve(window.Sortable);
    const existing = document.querySelector('script[data-sortable]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Sortable));
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js';
    s.dataset.sortable = '1';
    s.onload = () => resolve(window.Sortable);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function showBackupsModal() {
  const res = await window.electronAPI.playlistsBackups();
  const modal = document.createElement('div');
  modal.style.position = 'fixed'; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0;
  modal.style.background = 'rgba(0,0,0,0.6)'; modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; modal.style.zIndex = '10000';
  const body = document.createElement('div'); body.style.background = 'var(--card)'; body.style.padding = '20px'; body.style.width = '520px'; body.style.maxHeight='80%'; body.style.overflow='auto'; body.style.borderRadius='8px'; body.style.border = '1px solid var(--border)';
  const title = document.createElement('h3'); title.textContent = '백업 관리'; title.style.margin = '0 0 16px 0'; title.style.color = 'var(--text-primary)'; body.appendChild(title);
  const list = document.createElement('select'); list.style.width = '100%'; list.style.height = '220px'; list.style.marginBottom = '12px'; list.style.background = '#0f1419'; list.style.color = 'var(--text-primary)'; list.style.border = '1px solid var(--border)'; list.style.borderRadius = '6px'; list.style.padding = '8px';
  if (res && res.ok && Array.isArray(res.backups)) {
    res.backups.forEach(b => { const opt = document.createElement('option'); opt.value = b.name; opt.textContent = `${new Date(b.mtime).toLocaleString()} — ${b.name}`; list.appendChild(opt); });
  }
  body.appendChild(list);
  const actions = document.createElement('div'); actions.style.marginTop = '12px'; actions.style.display = 'flex'; actions.style.gap = '8px'; actions.style.flexWrap = 'wrap';
  const restoreBtn = document.createElement('button'); restoreBtn.textContent = '복원'; restoreBtn.className = 'primary'; restoreBtn.style.flex = '1'; restoreBtn.onclick = async () => {
    const sel = list.value; if (!sel) return showToast('백업을 선택하세요', 'error');
    const r = await window.electronAPI.playlistsRestore(sel);
    if (r && r.ok) { await loadSavedPlaylists(); showToast('복원 완료', 'success'); render(); modal.remove(); } else { showToast('복원 실패: '+(r && r.error||'unknown'),'error'); }
  };
  const createBtn = document.createElement('button'); createBtn.textContent = '백업'; createBtn.style.flex = '1'; createBtn.onclick = async () => { const r = await window.electronAPI.playlistsExport(); if (r && r.ok) showToast('백업 완료', 'success'); else showToast('백업 실패','error'); };
  const openFolderBtn = document.createElement('button'); openFolderBtn.textContent = '폴더 열기'; openFolderBtn.style.flex = '1'; openFolderBtn.onclick = async () => { const r = await window.electronAPI.playlistsOpenBackupDir(); if (!r || !r.ok) showToast('폴더 열기 실패','error'); };
  const closeBtn = document.createElement('button'); closeBtn.textContent = '닫기'; closeBtn.style.flex = '1'; closeBtn.onclick = () => modal.remove();
  actions.appendChild(restoreBtn); actions.appendChild(createBtn); actions.appendChild(openFolderBtn); actions.appendChild(closeBtn);
  body.appendChild(actions);
  modal.appendChild(body); document.body.appendChild(modal);
}

// Auto-backup scheduler (global) — reads localStorage settings and schedules backups
function scheduleAutoBackup() {
  try {
    if (window._autoBackupTimer) { clearInterval(window._autoBackupTimer); window._autoBackupTimer = null; }
    const on = localStorage.getItem('autoBackupEnabled') === '1';
    const mins = Math.max(1, Number(localStorage.getItem('autoBackupMinutes') || '60'));
    if (on) {
      window._autoBackupTimer = setInterval(async () => {
        try {
          const r = await window.electronAPI.playlistsCreateBackup();
          if (r && r.ok) showToast('자동 백업 완료', 'success');
        } catch (e) { console.error('autoBackup error', e); }
      }, mins * 60 * 1000);
    }
  } catch (e) { console.error('scheduleAutoBackup failed', e); }
}

// Auto-refresh scheduler – fetch playlists list periodically
function scheduleAutoRefresh() {
  try {
    if (window._autoRefreshTimer) { clearInterval(window._autoRefreshTimer); window._autoRefreshTimer = null; }
    const on = localStorage.getItem('autoRefreshEnabled') === '1';
    const mins = Math.max(1, Number(localStorage.getItem('autoRefreshMinutes') || '360'));
    if (on) {
      window._autoRefreshTimer = setInterval(async () => {
        try {
          const r = await window.electronAPI.playlistsList();
          // reload metadata in any case so UI stays up to date
          await loadSavedPlaylists();
          render();
          if (r && r.changed) {
            showToast('M3U 플레이리스트 자동 갱신 완료', 'success');
          }
        } catch (e) { 
          console.error('autoRefresh error', e);
          showToast('M3U 플레이리스트 자동 갱신 실패', 'error');
        }
      }, mins * 60 * 1000);
    }
  } catch (e) { console.error('scheduleAutoRefresh failed', e); }
}

function scheduleAutoEPGRefresh() {
  try {
    if (window._autoEPGRefreshTimer) { clearInterval(window._autoEPGRefreshTimer); window._autoEPGRefreshTimer = null; }
    const on = localStorage.getItem('epgAutoRefreshEnabled') === '1';
    const mins = Math.max(1, Number(localStorage.getItem('epgAutoRefreshMinutes') || '360'));
    if (on) {
      window._autoEPGRefreshTimer = setInterval(async () => {
        try {
          // EPG 데이터 갱신 로직 (현재 플레이리스트의 EPG URL들을 확인)
          let updatedCount = 0;
          for (const playlist of savedPlaylists) {
            if (playlist.epgUrl && playlist.epgUrl.trim()) {
              try {
                const res = await window.electronAPI.fetchUrl(playlist.epgUrl);
                if (res.ok) {
                  // EPG 데이터가 성공적으로 로드됨 (캐시나 다른 방식으로 저장 가능)
                  updatedCount++;
                }
              } catch (e) {
                console.error(`EPG refresh failed for ${playlist.name}:`, e);
              }
            }
          }
          if (updatedCount > 0) {
            showToast(`EPG 데이터 ${updatedCount}개 자동 갱신 완료`, 'success');
          }
        } catch (e) { 
          console.error('autoEPGRefresh error', e);
          showToast('EPG 자동 갱신 실패', 'error');
        }
      }, mins * 60 * 1000);
    }
  } catch (e) { console.error('scheduleAutoEPGRefresh failed', e); }
}

async function showFavoritesModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed'; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0;
  modal.style.background = 'rgba(0,0,0,0.6)'; modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; modal.style.zIndex = '10000';
  const body = document.createElement('div'); body.style.background = 'var(--card)'; body.style.padding = '18px'; body.style.width = '780px'; body.style.maxHeight='86%'; body.style.overflow='auto'; body.style.borderRadius='8px'; body.style.border = '1px solid var(--border)';
  const title = document.createElement('h3'); title.textContent = '즐겨찾기 관리'; title.style.margin = '0 0 12px 0'; title.style.color = 'var(--text-primary)'; body.appendChild(title);

  const container = document.createElement('div'); container.style.display='flex'; container.style.gap='12px';

  // build groups map
  const entries = Array.from(favorites.entries()).map(([url,meta]) => ({ url, meta }));
  const groupsMap = new Map();
  entries.forEach(e => { const g = (e.meta && e.meta.group) ? e.meta.group : 'Ungrouped'; if (!groupsMap.has(g)) groupsMap.set(g, []); groupsMap.get(g).push(e); });

  // left: groups list
  const left = document.createElement('div'); left.style.width = '200px'; left.style.flex = '0 0 200px'; left.style.borderRight = '1px solid var(--border)'; left.style.paddingRight = '8px'; left.style.display='flex'; left.style.flexDirection='column';
  const groupTitle = document.createElement('strong'); groupTitle.textContent = `그룹 (${groupsMap.size})`; groupTitle.style.marginBottom='8px'; left.appendChild(groupTitle);
  const groupsList = document.createElement('div'); groupsList.style.display='flex'; groupsList.style.flexDirection='column'; groupsList.style.gap='6px';
  const allBtn = document.createElement('button'); allBtn.textContent = `All (${entries.length})`; allBtn.onclick = () => { activeGroup = 'All'; renderEntries(); };
  groupsList.appendChild(allBtn);
  const sortedGroupNames = Array.from(groupsMap.keys()).sort((a,b) => a.localeCompare(b));
  sortedGroupNames.forEach(name => {
    const btn = document.createElement('button'); btn.textContent = `${name} (${groupsMap.get(name).length})`; btn.onclick = () => { activeGroup = name; renderEntries(); };
    groupsList.appendChild(btn);
  });
  left.appendChild(groupsList);

  // new group creator
  const newGroupRow = document.createElement('div'); newGroupRow.style.display='flex'; newGroupRow.style.gap='6px'; newGroupRow.style.marginTop='8px';
  const newGroupInput = document.createElement('input'); newGroupInput.placeholder='새 그룹 이름'; newGroupInput.style.flex='1';
  const newGroupBtn = document.createElement('button'); newGroupBtn.textContent = '추가'; newGroupBtn.onclick = () => {
    const v = (newGroupInput.value||'').trim(); if (!v) return; if (!groupsMap.has(v)) { groupsMap.set(v, []); const b = document.createElement('button'); b.textContent = `${v} (0)`; b.onclick = () => { activeGroup = v; renderEntries(); }; groupsList.appendChild(b); newGroupInput.value = ''; }
  };
  newGroupRow.appendChild(newGroupInput); newGroupRow.appendChild(newGroupBtn); left.appendChild(newGroupRow);

  container.appendChild(left);

  // right: entries + sort
  const right = document.createElement('div'); right.style.flex='1'; right.style.display='flex'; right.style.flexDirection='column';
  const toolsRow = document.createElement('div'); toolsRow.style.display='flex'; toolsRow.style.justifyContent='space-between'; toolsRow.style.alignItems='center'; toolsRow.style.marginBottom='8px';
  const sortSel = document.createElement('select'); const so1 = document.createElement('option'); so1.value='recent'; so1.textContent='최근 추가'; const so2 = document.createElement('option'); so2.value='name'; so2.textContent='이름'; sortSel.appendChild(so1); sortSel.appendChild(so2);
  toolsRow.appendChild(sortSel);
  const closeBtnTop = document.createElement('button'); closeBtnTop.textContent='닫기'; closeBtnTop.onclick = () => modal.remove(); toolsRow.appendChild(closeBtnTop);
  right.appendChild(toolsRow);

  const listArea = document.createElement('div'); listArea.style.display='flex'; listArea.style.flexDirection='column'; listArea.style.gap='6px'; listArea.style.overflow='auto'; listArea.style.maxHeight = '58vh';
  right.appendChild(listArea);

  let activeGroup = 'All';
  function refreshGroups() {
    // rebuild groupsMap from favorites
    groupsMap.clear();
    Array.from(favorites.entries()).forEach(([url,meta]) => { const g = (meta && meta.group) ? meta.group : 'Ungrouped'; if (!groupsMap.has(g)) groupsMap.set(g, []); groupsMap.get(g).push({ url, meta }); });
  }

  function renderEntries() {
    refreshGroups();
    listArea.innerHTML = '';
    let items = [];
    if (activeGroup === 'All') {
      items = Array.from(favorites.entries()).map(([url,meta]) => ({ url, meta }));
    } else {
      items = (groupsMap.get(activeGroup) || []).slice();
    }
    const sortMode = sortSel.value || 'recent';
    if (sortMode === 'name') items.sort((a,b)=> (a.meta && a.meta.name || '').localeCompare(b.meta && b.meta.name || ''));
    else items.sort((a,b)=> (b.meta && b.meta.addedAt || 0) - (a.meta && a.meta.addedAt || 0));

    items.forEach(it => {
      const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='8px'; row.style.borderRadius='6px'; row.style.background='var(--accent)';
      const info = document.createElement('div'); info.style.flex='1'; info.style.overflow='hidden';
      const nameInput = document.createElement('input'); nameInput.value = it.meta && it.meta.name || ''; nameInput.style.width='100%'; nameInput.onchange = () => { it.meta.name = nameInput.value; favorites.set(it.url, it.meta); saveFavorites(); renderEntries(); };
      const metaLine = document.createElement('div'); metaLine.style.fontSize='11px'; metaLine.style.color='var(--text-muted)'; metaLine.textContent = `${it.meta && it.meta.tvgId ? it.meta.tvgId + ' • ' : ''}${it.url}`;
      info.appendChild(nameInput); info.appendChild(metaLine);

      const groupSel = document.createElement('select'); groupSel.style.width='140px';
      const optAll = document.createElement('option'); optAll.value=''; optAll.textContent='(그룹 없음)'; groupSel.appendChild(optAll);
      Array.from(groupsMap.keys()).sort().forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; if ((it.meta && it.meta.group || '') === g) o.selected = true; groupSel.appendChild(o); });
      groupSel.onchange = () => { it.meta.group = groupSel.value || ''; favorites.set(it.url, it.meta); saveFavorites(); renderEntries(); };

      const playBtn = document.createElement('button'); playBtn.textContent = '재생'; playBtn.onclick = () => { playChannel({ url: it.url, name: it.meta && it.meta.name, group: it.meta && it.meta.group, tvgId: it.meta && it.meta.tvgId }); };
      const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.background = '#dc2626'; delBtn.onclick = () => { if (!confirm('즐겨찾기에서 삭제하시겠습니까?')) return; favorites.delete(it.url); saveFavorites(); renderEntries(); showToast('삭제됨'); render(); };

      row.appendChild(info); row.appendChild(groupSel); row.appendChild(playBtn); row.appendChild(delBtn);
      listArea.appendChild(row);
    });
  }

  sortSel.onchange = renderEntries;
  container.appendChild(right);
  body.appendChild(container);
  renderEntries();
  modal.appendChild(body); document.body.appendChild(modal);
}

async function showPreviewFor(idx, previewDiv) {
  try {
    const p = editablePlaylists[idx];
    if (!p) { previewDiv.textContent = ''; return; }
    let content = p.content;
    if (!content && p.url) {
      const r = await window.electronAPI.fetchUrl(p.url);
      if (r && r.ok) content = r.content;
    }
    if (!content) { previewDiv.textContent = ''; return; }
    const parsed = parsePlaylist(content, p.url || '');
    const groupSet = Array.from(new Set(parsed.map(x=>x.group||'Ungrouped')));
    previewDiv.innerHTML = `<small>${parsed.length}개 채널 / ${groupSet.length}개 그룹</small>`;
  } catch (e) { previewDiv.textContent = ''; }
}

function render() {
  if (sidebarView === 'channels') {
    renderChannelScreen();
  } else {
    renderMainScreen();
  }
}

function renderMainScreen() {
  root.innerHTML = '';

  const leftCol = document.createElement('div');
  leftCol.className = 'left-col';
  const rightCol = document.createElement('div');
  rightCol.className = 'player';

  // sidebar animation and toggle for channel view
  leftCol.style.transition = 'width 220ms ease, opacity 220ms ease, transform 220ms ease';
  leftCol.style.overflow = 'hidden';
  leftCol.style.minWidth = '0';
  // control layout via grid columns on root to avoid clipping
  root.style.gridTemplateColumns = sidebarHidden ? `0px 1fr` : `${SIDEBAR_VISIBLE_WIDTH} 1fr`;
  leftCol.style.opacity = sidebarHidden ? '0' : '1';
  rightCol.style.position = 'relative';
  // fixed toggle will be created/updated by ensureFixedSidebarToggle

  

  // URL 입력 섹션은 헤더의 "URL 불러오기" 버튼으로 열리는 모달에서 제공됩니다.

  // Saved playlists section (메인 콘텐츠)
  const savedDiv = document.createElement('div');
  savedDiv.style.flex = '1';
  savedDiv.style.overflowY = 'auto';

  const savedTitle = document.createElement('strong');
  savedTitle.textContent = `재생목록 (${savedPlaylists.length})`;
  savedTitle.style.display = 'block';
  savedTitle.style.marginBottom = '8px';
  savedDiv.appendChild(savedTitle);

  const editToggle = document.createElement('button');
  editToggle.textContent = editMode ? '완료' : '편집';
  editToggle.style.width = '100%';
  editToggle.style.marginBottom = '8px';
  editToggle.onclick = async () => {
    if (!editMode) {
      await prepareEditablePlaylists();
      editMode = true;
    } else {
      editMode = false;
    }
    render();
  };
  savedDiv.appendChild(editToggle);

  const savedList = document.createElement('div');
  savedList.style.display = 'flex';
  savedList.style.flexDirection = 'column';
  savedList.style.gap = '6px';

  if (!editMode) {
    savedPlaylists.forEach(p => {
      const item = document.createElement('div');
      item.style.padding = '10px';
      item.style.borderRadius = '6px';
      item.style.background = 'var(--accent)';
      item.style.cursor = 'pointer';
      item.style.transition = 'all 0.15s';
      item.style.fontSize = '12px';
      item.onmouseenter = () => { item.style.background = '#334155'; item.style.transform = 'translateX(2px)'; };
      item.onmouseleave = () => { item.style.background = 'var(--accent)'; item.style.transform = 'translateX(0)'; };

      const nameDiv = document.createElement('div');
      nameDiv.textContent = p.name;
      nameDiv.style.fontWeight = '600';
      nameDiv.style.marginBottom = '4px';
      item.appendChild(nameDiv);
      if (p.url) {
        const urlDiv = document.createElement('div');
        urlDiv.textContent = p.url;
        urlDiv.style.fontSize = '10px';
        urlDiv.style.color = 'var(--text-muted)';
        urlDiv.style.wordBreak = 'break-all';
        urlDiv.style.marginBottom = '4px';
        item.appendChild(urlDiv);
      }

      const actionDiv = document.createElement('div');
      actionDiv.style.display = 'flex';
      actionDiv.style.gap = '6px';
      actionDiv.style.justifyContent = 'space-between';

      const playBtn = document.createElement('button');
      playBtn.textContent = '채널 보기';
      playBtn.style.padding = '6px 10px';
      playBtn.style.fontSize = '11px';
      playBtn.style.flex = '1';
      playBtn.style.background = 'var(--primary)';
      playBtn.onclick = async (e) => {
        e.stopPropagation();
        const r = await window.electronAPI.playlistsGet(p.id);
        if (r.ok) {
          playlistChannels = parsePlaylist(r.playlist.content, r.playlist.url || '');
          selectedPlaylistId = p.id;
          selectedPlaylistName = p.name;
          // HLS 모듈 미리 로드
          const needHls = playlistChannels.some(c => c.url && c.url.endsWith('.m3u8'));
          try {
            const h = await ensureHlsAvailable(needHls);
            console.log('Hls module loaded', !!h);
          } catch (e) { console.error('ensureHlsAvailable failed', e); }
          sidebarView = 'channels';
          currentGroup = 'All';
          render();
        }
      };
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = '🔄';
      refreshBtn.title = 'URL에서 갱신';
      refreshBtn.style.padding = '6px 8px';
      refreshBtn.style.fontSize = '11px';
      refreshBtn.style.flex = '0';
      refreshBtn.disabled = !(p.url && /^https?:\/\//.test(p.url));
      refreshBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!p.url) return;
        // visual feedback
        const origText = refreshBtn.textContent;
        refreshBtn.textContent = '⏳';
        refreshBtn.disabled = true;
        showToast('플레이리스트 갱신 중...', 'info');
        try {
          // grab the current full playlist so we can compare
          const cur = await window.electronAPI.playlistsGet(p.id).catch(()=>null);
          const oldContent = cur && cur.ok && cur.playlist ? cur.playlist.content : '';
          const res = await window.electronAPI.fetchUrl(p.url);
          if (res.ok && res.content && res.content !== oldContent) {
            const upd = await window.electronAPI.playlistsAdd({ id: p.id, name: p.name, url: p.url, content: res.content });
            if (upd && upd.ok) {
              await loadSavedPlaylists();
              showToast('플레이리스트 갱신됨', 'success');
              render();
            }
          } else if (res.ok) {
            showToast('변경사항 없음', 'info');
          } else {
            showToast('갱신 실패: ' + (res.error||'unknown'), 'error');
          }
        } catch (err) {
          console.error('manual refresh error', err);
          showToast('갱신 중 오류', 'error');
        } finally {
          refreshBtn.disabled = !(p.url && /^https?:\/\//.test(p.url));
          refreshBtn.textContent = origText;
        }
      };
      actionDiv.appendChild(playBtn);
      actionDiv.appendChild(refreshBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '❌';
      delBtn.style.padding = '6px 8px';
      delBtn.style.fontSize = '11px';
      delBtn.style.background = '#dc2626';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('삭제하시겠습니까?')) return;
        await window.electronAPI.playlistsRemove(p.id);
        await loadSavedPlaylists();
        showToast('삭제됨');
        render();
      };
      actionDiv.appendChild(delBtn);

      item.appendChild(actionDiv);
      savedList.appendChild(item);
    });
  } else {
    const editList = editablePlaylists || [];
    editList.forEach((p, idx) => {
      const row = document.createElement('div');
      row.style.padding = '6px';
      row.style.borderRadius = '4px';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.flexWrap = 'wrap';
      row.style.gap = '3px';
      row.style.marginBottom = '4px';
      row.style.fontSize = '10px';

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '≡';
      handle.style.flex = '0 0 auto';

      const nameInput2 = document.createElement('input');
      nameInput2.value = p.name || '';
      nameInput2.placeholder = '이름';
      nameInput2.style.flex = '0.7';
      nameInput2.style.minWidth = '0';
      nameInput2.style.overflow = 'hidden';
      nameInput2.style.textOverflow = 'ellipsis';
      nameInput2.style.marginBottom = '0';
      nameInput2.style.fontSize = '10px';
      nameInput2.oninput = (e) => { editablePlaylists[idx].name = e.target.value; };

      const urlInput2 = document.createElement('input');
      urlInput2.value = p.url || '';
      urlInput2.placeholder = 'URL';
      urlInput2.style.flex = '1';
      urlInput2.style.minWidth = '0';
      urlInput2.style.overflow = 'hidden';
      urlInput2.style.textOverflow = 'ellipsis';
      urlInput2.style.marginBottom = '0';
      urlInput2.style.fontSize = '10px';
      urlInput2.oninput = (e) => { editablePlaylists[idx].url = e.target.value; };

      const epgUrlInput = document.createElement('input');
      epgUrlInput.value = p.epgUrl || '';
      epgUrlInput.placeholder = 'EPG URL (선택)';
      epgUrlInput.style.flex = '1';
      epgUrlInput.style.minWidth = '0';
      epgUrlInput.style.overflow = 'hidden';
      epgUrlInput.style.textOverflow = 'ellipsis';
      epgUrlInput.style.marginBottom = '0';
      epgUrlInput.style.fontSize = '10px';
      epgUrlInput.oninput = (e) => { editablePlaylists[idx].epgUrl = e.target.value; };

      const previewDiv = document.createElement('div');
      previewDiv.style.fontSize = '9px';
      previewDiv.style.color = 'var(--text-muted)';
      previewDiv.style.marginLeft = '4px';
      previewDiv.style.flex = '1 1 100%';
      previewDiv.style.minWidth = '0';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '✓';
      saveBtn.style.padding = '3px 5px';
      saveBtn.style.fontSize = '11px';
      saveBtn.style.flex = '0 0 auto';
      saveBtn.onclick = async () => {
        const res = await window.electronAPI.playlistsAdd(editablePlaylists[idx]);
        if (res && res.ok) {
          await loadSavedPlaylists();
          editMode = false;
          showToast('저장됨', 'success');
          render();
        } else {
          showToast('저장 실패: ' + (res && res.error || 'unknown'), 'error');
        }
      };

      const delBtn2 = document.createElement('button');
      delBtn2.textContent = '✕';
      delBtn2.style.padding = '3px 5px';
      delBtn2.style.fontSize = '11px';
      delBtn2.style.background = '#dc2626';
      delBtn2.style.flex = '0 0 auto';
      delBtn2.onclick = async () => {
        if (!confirm('삭제?')) return;
        await window.electronAPI.playlistsRemove(p.id);
        await loadSavedPlaylists();
        await prepareEditablePlaylists();
        render();
      };

      row.appendChild(handle); row.appendChild(nameInput2); row.appendChild(urlInput2); row.appendChild(epgUrlInput); row.appendChild(saveBtn); row.appendChild(delBtn2);
      savedList.appendChild(row);
      savedList.appendChild(previewDiv);
    });
  }

  savedDiv.appendChild(savedList);
  if (editMode) {
    ensureSortableLoaded().then((Sortable) => {
      try {
        if (Sortable && savedList) {
          if (savedList._sortable) { try { savedList._sortable.destroy(); } catch(e){} }
          const instance = new Sortable(savedList, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            fallbackOnBody: true,
            onEnd: (evt) => {
              const from = evt.oldIndex;
              const to = evt.newIndex;
              if (from === to) return;
              const item = editablePlaylists.splice(from,1)[0];
              editablePlaylists.splice(to,0,item);
            }
          });
          savedList._sortable = instance;
        }
      } catch (e) {}
    });
  }

  leftCol.appendChild(savedDiv);

  // Favorites quick access
  const favAccess = document.createElement('div');
  favAccess.style.marginTop = '8px';
  const favBtnMain = document.createElement('button');
  favBtnMain.textContent = `즐겨찾기 (${favorites.size})`;
  favBtnMain.className = 'primary';
  favBtnMain.style.width = '100%';
  favBtnMain.onclick = () => showFavoritesModal();
  favAccess.appendChild(favBtnMain);
  leftCol.appendChild(favAccess);

  // Schedule auto-backup is now handled globally (settings modal controls)

  // Player area
  rightCol.innerHTML = `
    <video id="video" controls></video>
    <div id="playerStatus"></div>
    <div id="epg"></div>
  `;

  root.appendChild(leftCol);
  root.appendChild(rightCol);
  // ensure fixed toggle exists and is updated
  try { ensureFixedSidebarToggle(); } catch (e) {}

  if (!window._playlistShortcutsInstalled) {
    window.addEventListener('keydown', async (e) => {
      const s = e.key.toLowerCase();
      const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
      if (mod && s === 's') {
        if (editMode) { e.preventDefault(); await window.electronAPI.playlistsUpdate(editablePlaylists); await loadSavedPlaylists(); editMode = false; showToast('저장됨', 'success'); render(); }
      }
      if (e.key === 'Escape') {
        if (editMode) { e.preventDefault(); await loadSavedPlaylists(); editMode = false; render(); showToast('편집 취소'); }
      }
      if (mod && s === 'z') {
        if (editMode) { e.preventDefault(); await loadSavedPlaylists(); await prepareEditablePlaylists(); showToast('되돌리기'); render(); }
      }
    });
    window._playlistShortcutsInstalled = true;
  }
}

function renderChannelScreen() {
  // preserve search selection/focus if present to avoid losing caret on re-render
  try {
    const existingSearch = document.getElementById('channelSearchInput');
    if (existingSearch) {
      _prevSearchSelectionStart = existingSearch.selectionStart;
      _prevSearchSelectionEnd = existingSearch.selectionEnd;
      _prevSearchHadFocus = (document.activeElement === existingSearch);
      channelFilterText = existingSearch.value || channelFilterText;
    } else {
      _prevSearchSelectionStart = _prevSearchSelectionEnd = null; _prevSearchHadFocus = false;
    }
  } catch (e) { _prevSearchSelectionStart = _prevSearchSelectionEnd = null; _prevSearchHadFocus = false; }

  root.innerHTML = '';

  const leftCol = document.createElement('div');
  leftCol.className = 'left-col';
  const rightCol = document.createElement('div');
  rightCol.className = 'player';

  // ensure grid columns reflect sidebar state to avoid clipping
  root.style.gridTemplateColumns = sidebarHidden ? `0px 1fr` : `${SIDEBAR_VISIBLE_WIDTH} 1fr`;
  leftCol.style.opacity = sidebarHidden ? '0' : '1';

  // Header with back button
  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.gap = '8px';
  headerDiv.style.marginBottom = '12px';

  const backBtn = document.createElement('button');
  backBtn.textContent = '← 뒤로';
  backBtn.style.padding = '6px 10px';
  backBtn.style.fontSize = '11px';
  backBtn.onclick = () => {
    sidebarView = 'main';
    selectedPlaylistId = null;
    selectedPlaylistName = null;
    playlistChannels = [];
    render();
  };
  headerDiv.appendChild(backBtn);

  const titleDiv = document.createElement('div');
  titleDiv.textContent = selectedPlaylistName;
  titleDiv.style.fontWeight = '600';
  titleDiv.style.flex = '1';
  titleDiv.style.whiteSpace = 'nowrap';
  titleDiv.style.overflow = 'hidden';
  titleDiv.style.textOverflow = 'ellipsis';
  titleDiv.style.fontSize = '12px';
  headerDiv.appendChild(titleDiv);

  leftCol.appendChild(headerDiv);

  // Search input + 즐겨찾기 컨트롤
  const search = document.createElement('input');
  search.id = 'channelSearchInput';
  search.type = 'text';
  search.placeholder = '🔍 채널 검색 (이름, 그룹, TVG, URL 등)';
  search.style.marginBottom = '8px';
  search.value = channelFilterText || '';

  const favOnlyWrap = document.createElement('div');
  favOnlyWrap.style.display = 'flex'; favOnlyWrap.style.alignItems = 'center'; favOnlyWrap.style.gap = '8px'; favOnlyWrap.style.marginBottom = '8px';
  const favOnlyChk = document.createElement('input'); favOnlyChk.type = 'checkbox'; favOnlyChk.id = 'favOnlyChk';
  const favOnlyLabel = document.createElement('label'); favOnlyLabel.htmlFor = 'favOnlyChk'; favOnlyLabel.textContent = '즐겨찾기만';
  favOnlyWrap.appendChild(favOnlyChk); favOnlyWrap.appendChild(favOnlyLabel);

  const controlsRow = document.createElement('div'); controlsRow.style.display = 'flex'; controlsRow.style.gap = '6px'; controlsRow.style.flexWrap = 'wrap';
  const exportFavBtn = document.createElement('button'); exportFavBtn.textContent = '즐겨찾기 내보내기'; exportFavBtn.style.fontSize = '11px';
  exportFavBtn.onclick = () => {
    try {
      const data = JSON.stringify(Object.fromEntries(favorites), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'favorites.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { showToast('내보내기 실패', 'error'); }
  };
  const saveToFileBtn = document.createElement('button'); saveToFileBtn.textContent = '파일에 저장'; saveToFileBtn.style.fontSize = '11px';
  saveToFileBtn.onclick = async () => {
    try {
      const obj = Object.fromEntries(favorites);
      const r = await window.electronAPI.favoritesSaveFile(obj);
      if (r && r.ok) showToast('파일에 저장됨', 'success'); else showToast('파일 저장 실패', 'error');
    } catch (e) { showToast('파일 저장 실패', 'error'); }
  };
  const loadFromFileBtn = document.createElement('button'); loadFromFileBtn.textContent = '파일에서 불러오기'; loadFromFileBtn.style.fontSize = '11px';
  loadFromFileBtn.onclick = async () => {
    try {
      const r = await window.electronAPI.favoritesLoadFile();
      if (r && r.ok && r.favorites) {
        Object.entries(r.favorites).forEach(([k,v]) => favorites.set(k, v));
        saveFavorites();
        showToast('파일에서 불러옴', 'success'); render();
      } else if (r && r.canceled) { /* user cancelled */ } else { showToast('파일 불러오기 실패', 'error'); }
    } catch (e) { showToast('파일 불러오기 실패', 'error'); }
  };
  const importFavBtn = document.createElement('button'); importFavBtn.textContent = '즐겨찾기 가져오기'; importFavBtn.style.fontSize = '11px';
  importFavBtn.onclick = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try {
        const txt = await f.text(); const obj = JSON.parse(txt || '{}');
        Object.entries(obj || {}).forEach(([k,v]) => favorites.set(k, v));
        saveFavorites(); showToast('가져오기 완료', 'success'); render();
      } catch (e) { showToast('가져오기 실패', 'error'); }
    };
    input.click();
  };
  controlsRow.appendChild(exportFavBtn); controlsRow.appendChild(importFavBtn); controlsRow.appendChild(saveToFileBtn); controlsRow.appendChild(loadFromFileBtn);

  search.oninput = () => { channelFilterText = search.value.toLowerCase(); scheduleRender(); };
  // restore selection and focus if applicable
  try {
    if (_prevSearchHadFocus) {
      search.focus();
      if (typeof _prevSearchSelectionStart === 'number') {
        try { search.setSelectionRange(_prevSearchSelectionStart, _prevSearchSelectionEnd); } catch (e) {}
      }
    }
  } catch (e) {}
  leftCol.appendChild(search);
  leftCol.appendChild(favOnlyWrap);
  leftCol.appendChild(controlsRow);

  // Group selector
  const groupSel = document.createElement('select');
  groupSel.style.marginBottom = '12px';
  groupSel.onchange = (e) => { currentGroup = e.target.value; render(); };
  leftCol.appendChild(groupSel);

  // Channel list
  const channelSection = document.createElement('div');
  channelSection.style.flex = '1';
  channelSection.style.overflowY = 'auto';

  const groups = ['All', ...Array.from(new Set(playlistChannels.map(c => c.group || 'Ungrouped'))).sort()];
  groupSel.innerHTML = '';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    if (g === currentGroup) opt.selected = true;
    groupSel.appendChild(opt);
  });

  const tokens = (channelFilterText || '').split(/\s+/).filter(Boolean);
  const filtered = playlistChannels.filter(c => {
    if (currentGroup !== 'All' && (c.group || 'Ungrouped') !== currentGroup) return false;
    if (favOnlyChk && favOnlyChk.checked && !favorites.has(c.url)) return false;
    if (!tokens.length) return true;
    const hay = [ (c.name||''), (c.group||''), (c.tvgId||''), (c.url||'') ].map(x => String(x).toLowerCase());
    return tokens.every(tok => hay.some(h => h.includes(tok)));
  });

  if (playlistChannels.length > 0) {
    const channelCountTitle = document.createElement('strong');
    channelCountTitle.textContent = `채널 (${filtered.length}/${playlistChannels.length})`;
    channelCountTitle.style.display = 'block';
    channelCountTitle.style.marginBottom = '8px';
    channelSection.appendChild(channelCountTitle);

    filtered.forEach((ch) => {
      const el = document.createElement('div');
      el.className = 'channel';

      const logo = document.createElement('img');
      logo.src = ch.logo || '';
      logo.alt = '';
      el.appendChild(logo);

      const infoWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'title';
      function highlightMatch(text) {
        if (!channelFilterText) return text;
        try {
          const toks = (channelFilterText||'').split(/\s+/).filter(Boolean).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
          if (!toks.length) return text;
          const re = new RegExp('(' + toks.join('|') + ')', 'ig');
          return String(text).replace(re, '<mark>$1</mark>');
        } catch (e) { return text; }
      }
      title.innerHTML = highlightMatch(ch.name || '');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = (ch.group || 'Ungrouped') + (ch.tvgId ? ' • ' + ch.tvgId : '');
      infoWrap.appendChild(title); infoWrap.appendChild(meta);
      el.appendChild(infoWrap);

      const favBtn = document.createElement('button');
      favBtn.textContent = favorites.has(ch.url) ? '★' : '☆';
      favBtn.style.padding = '4px 6px';
      favBtn.style.fontSize = '12px';
      favBtn.onclick = (e) => { e.stopPropagation(); toggleFav(ch); render(); };
      el.appendChild(favBtn);

      el.onclick = () => playChannel(ch);
      channelSection.appendChild(el);
    });
  }

  leftCol.appendChild(channelSection);

  // Player area
  rightCol.innerHTML = `
    <video id="video" controls></video>
    <div id="playerStatus"></div>
    <div id="epg"></div>
  `;

  root.appendChild(leftCol);
  root.appendChild(rightCol);
  // ensure fixed toggle exists and is updated
  try { ensureFixedSidebarToggle(); } catch (e) {}
}

function toggleFav(ch) {
  if (favorites.has(ch.url)) {
    favorites.delete(ch.url);
    saveFavorites();
  } else {
    try {
      favorites.set(ch.url, { name: ch.name || '', group: ch.group || '', addedAt: Date.now(), tvgId: ch.tvgId || '' });
      saveFavorites();
    } catch (e) { console.error('toggleFav set error', e); }
  }
}

async function playChannel(ch) {
  // If a retry is in progress:
  // - selecting the same channel should cancel pending retry and immediately retry
  // - selecting a different channel cancels previous retry and proceeds normally
  if (isRetrying) {
    if (currentPlayingUrl === (ch && ch.url)) {
      // cancel scheduled retry and any existing HLS instance to try immediately
      if (currentRetryTimer) { clearTimeout(currentRetryTimer); currentRetryTimer = null; }
      if (currentHls) { try { currentHls.destroy(); } catch (e) {} currentHls = null; }
      isRetrying = false;
      showToast('같은 채널 선택: 즉시 재시도합니다', 'info');
      // fall through to attempt playing below
    } else {
      // cancelling previous retry so new selection can play
      if (currentRetryTimer) { clearTimeout(currentRetryTimer); currentRetryTimer = null; }
      isRetrying = false;
      if (currentHls) { try { currentHls.destroy(); } catch (e) {} currentHls = null; }
      if (currentVideo && currentVideo !== video) { try { currentVideo.pause(); } catch (e) {} }
      currentVideo = null;
    }
  }

  const video = document.getElementById('video');
  const epgDiv = document.getElementById('epg');
  const statusDiv = document.getElementById('playerStatus');
  epgDiv.innerHTML = '';
  statusDiv.innerHTML = '';
  const url = ch.url;
  if (!url) return;

  // 이전 재시도 취소
  if (currentRetryTimer) {
    clearTimeout(currentRetryTimer);
    currentRetryTimer = null;
  }

  // 동일 채널 선택 시 무시
  if (currentPlayingUrl === (ch && ch.url) && isRetrying) {
    return;
  }

  currentPlayingUrl = url;
  isRetrying = false;
  try { updateCurrentChannelDisplay(); } catch (e) {}

  if (currentHls) { try { currentHls.destroy(); } catch (e) {} currentHls = null; }
  if (currentVideo && currentVideo !== video) { try { currentVideo.pause(); } catch (e) {} }
  currentVideo = video;

  let attempt = 0;

  const setStatus = (msg, isError=false) => {
    statusDiv.textContent = msg;
    statusDiv.style.color = isError ? '#dc2626' : '#10b981';
  };

  const tryPlay = async () => {
    attempt++;
    setStatus(`재생 시도 중... (${attempt}회)`);
    console.log('tryPlay', { url, attempt, hasHls: !!window.Hls, videoTag: !!video });
    if (window.Hls && (window.Hls.isSupported || window.Hls.prototype) && url.endsWith('.m3u8')) {
      try {
        const bufferMode = localStorage.getItem('bufferMode') || 'auto';
        const maxBufferLength = bufferMode === 'manual' ? parseInt(localStorage.getItem('maxBufferLength') || '30') : undefined;
        const hlsConfig = {};
        if (maxBufferLength) {
          hlsConfig.maxBufferLength = maxBufferLength;
        }
        const hls = new window.Hls(hlsConfig);
        currentHls = hls;
        hls.on(window.Hls.Events.MANIFEST_LOADING, () => console.log('HLS: manifest loading'));
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { console.log('HLS: manifest parsed'); setStatus('재생 중...', false); isRetrying = false; video.play().catch(err=>{ console.error('play failed', err); showToast('재생 실패','error'); }); });
        hls.on(window.Hls.Events.LEVEL_LOADED, (ev,data) => console.log('HLS: level loaded'));
        hls.on(window.Hls.Events.FRAG_LOADED, (ev,data) => console.log('HLS: frag loaded'));
        hls.on(window.Hls.Events.ERROR, (ev, data) => {
          const { type, details, fatal } = data || {};
          console.error('HLS ERROR', { type, details, fatal, url });
          if (!fatal) return;
          try { hls.destroy(); } catch (e) {}
          currentHls = null;
          isRetrying = true;
          const delay = HLS_BASE_DELAY_MS * attempt;
          setStatus(`오류(${details}). ${Math.round(delay/1000)}초 후 재시도…`, true);
          currentRetryTimer = setTimeout(() => { currentRetryTimer = null; tryPlay(); }, delay);
        });
        hls.attachMedia(video);
        hls.loadSource(url);
        video.addEventListener('error', (ev) => { const err = video.error; console.error('VideoElement error', err); showToast('플레이어 오류','error'); });
      } catch (e) {
        console.error('Hls error', e);
        try { video.src = url; await video.play(); setStatus('재생 중...', false); isRetrying = false; } catch (err) { setStatus('재생 실패', true); }
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && url.endsWith('.m3u8')) {
      video.src = url;
      try { await video.play(); setStatus('재생 중...', false); isRetrying = false; } catch (e) { setStatus('재생 실패', true); }
    } else {
      video.src = url;
      try { await video.play(); setStatus('재생 중...', false); isRetrying = false; } catch (e) { setStatus('재생 실패', true); }
    }
  };

  tryPlay();

  const epgUrl = selectedPlaylistId ? savedPlaylists.find(p => p.id === selectedPlaylistId)?.epgUrl : localStorage.getItem('epgUrl');
  if (epgUrl && ch.tvgId && localStorage.getItem('epgEnabled') === '1') {
    const res = await window.electronAPI.fetchUrl(epgUrl);
    if (res.ok) {
      const programs = parseEPG(res.content);
      const now = new Date();
      const nowPrograms = programs.filter(p => (p.channelId === ch.tvgId || p.channel === ch.tvgId) && p.start && p.end && now >= p.start && now < p.end);
      if (nowPrograms.length) { epgDiv.innerHTML = `<strong>현재:</strong> ${nowPrograms.slice(0,2).map(p=>`${p.title}`).join(' / ')}`; }
    }
  }
}

function formatDate(d) { try { return d.toLocaleString(); } catch (e) { return '' } }

function parseEPG(xml) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const progNodes = Array.from(doc.querySelectorAll('programme'));
    return progNodes.map(n => ({
      channelId: n.getAttribute('channel'),
      channel: n.getAttribute('channel'),
      start: parseXmltvDatetime(n.getAttribute('start')),
      end: parseXmltvDatetime(n.getAttribute('stop') || n.getAttribute('end')),
      title: (n.querySelector('title') && n.querySelector('title').textContent) || ''
    }));
  } catch (e) { return []; }
}

function parseXmltvDatetime(src) {
  if (!src) return null;
  try {
    const s = src.trim();
    const m = s.match(/^([0-9]{8}T?[0-9]{6})(?:\s?([+\-][0-9]{2}:?[0-9]{2}|[+\-][0-9]{4}|Z))?$/i);
    if (!m) return new Date(s);
    let dt = m[1].replace('T','');
    const year = dt.substr(0,4), month = dt.substr(4,2), day = dt.substr(6,2), hour = dt.substr(8,2), min = dt.substr(10,2), sec = dt.substr(12,2);
    const base = `${year}-${month}-${day}T${hour}:${min}:${sec}`;
    const tz = (m[2]||'');
    if (!tz || tz.toUpperCase()==='Z') return new Date(base+'Z');
    const tzNorm = tz.includes(':') ? tz : (tz.length===5 ? tz.substr(0,3)+':'+tz.substr(3,2) : tz);
    return new Date(base+tzNorm);
  } catch (e) { return new Date(src); }
}

function showToast(msg, type='info', timeout=3000) {
  if (!window._toastRecent) window._toastRecent = new Map();
  const now = Date.now();
  if (window._toastRecent.has(msg) && now - window._toastRecent.get(msg) < 2000) return;
  window._toastRecent.set(msg, now);
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  if (!window._toastQueue) window._toastQueue = [];
  window._toastQueue.push({ msg, type, timeout });
  if (window._toastQueue.length === 1) _processToastQueue();
}

function _processToastQueue() {
  if (!window._toastQueue || !window._toastQueue.length) return;
  const { msg, type, timeout } = window._toastQueue[0];
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.background = type === 'error' ? '#dc2626' : (type === 'success' ? '#10b981' : '#1e293b');
  t.style.color = '#f1f5f9';
  t.style.padding = '10px 14px';
  t.style.marginBottom = '8px';
  t.style.borderRadius = '6px';
  t.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
  t.style.opacity = '0';
  t.style.transition = 'opacity 200ms ease';
  t.style.borderLeft = '3px solid ' + (type === 'error' ? '#ef4444' : (type === 'success' ? '#34d399' : '#6366f1'));
  container.appendChild(t);
  requestAnimationFrame(()=> t.style.opacity = '1');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(()=> { t.remove(); window._toastQueue.shift(); _processToastQueue(); }, 250); }, timeout);
}

(async () => { await loadSavedPlaylists(); render(); try { scheduleAutoBackup(); scheduleAutoRefresh(); scheduleAutoEPGRefresh(); } catch (e) {} })();
