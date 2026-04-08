import { parsePlaylist } from './parsers.js';

console.log('🚀 [RENDERER] 렌더러 파일 로드됨');
console.log('Window innerHeight:', window.innerHeight);

// Force window size
try {
  window.electronAPI.winResize(1200, 800);
  console.log('✅ Window 리사이즈 완료');
} catch (e) {
  console.error('❌ Window 리사이즈 실패:', e);
}

// Internationalization
let currentLanguage = localStorage.getItem('language') || 'ko';
let translations = {};

async function loadTranslations(lang) {
  try {
    const response = await fetch(`./locales/${lang}.json`);
    translations = await response.json();
  } catch (e) {
    console.error('Failed to load translations:', e);
    translations = {};
  }
}

function t(key, fallback = key) {
  const keys = key.split('.');
  let value = translations;
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) return fallback;
  }
  return value || fallback;
}

async function setLanguage(lang) {
  currentLanguage = lang;
  await loadTranslations(lang);
  updateUIText();
  render();
}

function updateUIText() {
  // Update header buttons
  document.getElementById('favoritesBtn').textContent = t('favorites');
  document.getElementById('openUrlBtn').textContent = t('loadUrl');
  document.getElementById('settingsBtn').textContent = t('settings');
  document.getElementById('openBtn').textContent = t('addPlaylist');

  const sidebarToggle = document.getElementById('sidebarToggleFixed');
  if (sidebarToggle) sidebarToggle.title = t('sidebarToggle');

  // Update sidebar if visible
  updateSidebarText();
}

function updateSidebarText() {
  // This will be called when sidebar content changes
  const searchInput = document.querySelector('input[placeholder*="검색"], input[placeholder*="Search"]');
  if (searchInput) searchInput.placeholder = t('search');

  const groupSelect = document.querySelector('select');
  if (groupSelect) {
    const allOption = groupSelect.querySelector('option[value="All"]');
    if (allOption) allOption.textContent = t('all');
  }
}

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

// MPV Player Support
let useMpvPlayer = false;
let currentMpv = null;
let mpvInitialized = false;

// Sidebar navigation
let sidebarView = 'main'; // 'main' or 'channels'
let sidebarHidden = localStorage.getItem('sidebarHidden') === '1';
const SIDEBAR_VISIBLE_WIDTH = '340px';

// Favorites view state
let selectedFavoritesView = false; // true = 즐겨찾기 뷰

function ensureFixedSidebarToggle() {
  if (typeof document === 'undefined') return null;
  let btn = document.getElementById('sidebarToggleFixed');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebarToggleFixed';
    btn.className = 'sidebar-toggle-fixed';
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
    document.body.appendChild(btn);
  }
  btn.innerHTML = sidebarHidden ? '&#9654;' : '&#9664;';
  btn.title = t('sidebarToggle');
  // add pulse when visible to draw attention
  if (!sidebarHidden) btn.classList.add('pulse'); else btn.classList.remove('pulse');
  btn.onclick = () => {
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
async function ensureHlsAvailable(needHls) {
  if (needHls && !window.Hls) {
    // HLS.js already loaded in index.html
  }
  return window.Hls;
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
document.addEventListener('DOMContentLoaded', async () => {
  // Load translations
  await loadTranslations(currentLanguage);
  updateUIText();

  const sbtn = document.getElementById('settingsBtn');
  if (sbtn) sbtn.addEventListener('click', showSettingsModal);
  const openUrlBtn = document.getElementById('openUrlBtn');
  if (openUrlBtn) openUrlBtn.addEventListener('click', showUrlModal);
  const favoritesBtn = document.getElementById('favoritesBtn');
  if (favoritesBtn) favoritesBtn.addEventListener('click', () => {
    selectedFavoritesView = true;
    sidebarView = 'channels';
    render();
  });
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
  const title = document.createElement('h3'); title.textContent = t('settings'); title.style.margin='0 0 12px 0'; body.appendChild(title);

  // GPU toggle
  const gpuRow = document.createElement('div'); gpuRow.style.display='flex'; gpuRow.style.alignItems='center'; gpuRow.style.gap='8px'; gpuRow.style.marginBottom='8px';
  const gpuChk = document.createElement('input'); gpuChk.type='checkbox'; gpuChk.checked = settings.disableHardwareAcceleration !== false; // default true
  const gpuLabel = document.createElement('label'); gpuLabel.textContent = t('disableHardwareAccel'); gpuRow.appendChild(gpuChk); gpuRow.appendChild(gpuLabel);
  body.appendChild(gpuRow);

  // Favorites-only channel filter setting
  const favOnlyRow = document.createElement('div'); favOnlyRow.style.display='flex'; favOnlyRow.style.alignItems='center'; favOnlyRow.style.gap='8px'; favOnlyRow.style.marginBottom='8px';
  const favOnlyChk = document.createElement('input'); favOnlyChk.type='checkbox'; favOnlyChk.checked = channelFavoritesOnly;
  const favOnlyLabel = document.createElement('label'); favOnlyLabel.textContent = t('favoritesOnly'); favOnlyLabel.htmlFor = 'favOnlySetting';
  favOnlyChk.id = 'favOnlySetting';
  favOnlyRow.appendChild(favOnlyChk); favOnlyRow.appendChild(favOnlyLabel);
  body.appendChild(favOnlyRow);

  // Language selection
  const langRow = document.createElement('div'); langRow.style.display='flex'; langRow.style.alignItems='center'; langRow.style.gap='8px'; langRow.style.marginBottom='8px';
  const langLabel = document.createElement('label'); langLabel.textContent = t('language');
  const langSelect = document.createElement('select'); langSelect.style.width='120px';
  const langOptions = [
    { value: 'ko', text: '한국어' },
    { value: 'en', text: 'English' },
    { value: 'ja', text: '日本語' },
    { value: 'zh', text: '中文' },
    { value: 'fr', text: 'Français' },
    { value: 'de', text: 'Deutsch' },
    { value: 'zh-TW', text: '繁體中文' },
    { value: 'es', text: 'Español' }
  ];
  langOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (currentLanguage === opt.value) option.selected = true;
    langSelect.appendChild(option);
  });
  langRow.appendChild(langLabel); langRow.appendChild(langSelect);
  body.appendChild(langRow);

  // Clear cache button
  const cacheRow = document.createElement('div'); cacheRow.style.display='flex'; cacheRow.style.gap='8px'; cacheRow.style.marginTop='8px';
  const clearCacheBtn = document.createElement('button'); clearCacheBtn.textContent = t('clearCache'); clearCacheBtn.onclick = async () => {
    try {
      // request main to open userData folder so user can delete Cache manually
      await window.electronAPI.playlistsOpenBackupDir();
      showToast(t('backupDirOpened'), 'info');
    } catch (e) { showToast(t('openFolderFailed', '폴더 열기 실패'), 'error'); }
  };
  cacheRow.appendChild(clearCacheBtn);
  body.appendChild(cacheRow);

  // Auto-backup settings in modal
  const autoRow = document.createElement('div'); autoRow.style.display='flex'; autoRow.style.alignItems='center'; autoRow.style.gap='8px'; autoRow.style.marginTop='8px';
  const autoChk = document.createElement('input'); autoChk.type='checkbox'; autoChk.checked = localStorage.getItem('autoBackupEnabled') === '1';
  const minutesInput = document.createElement('input'); minutesInput.type='number'; minutesInput.min='1'; minutesInput.style.width='64px'; minutesInput.value = localStorage.getItem('autoBackupMinutes') || '60';
  const autoLabel = document.createElement('label'); autoLabel.textContent = t('autoBackup') + ' (' + t('minutes') + ')'; autoRow.appendChild(autoChk); autoRow.appendChild(autoLabel); autoRow.appendChild(minutesInput);
  body.appendChild(autoRow);

  // Auto-refresh settings for remote playlists
  const refreshRow = document.createElement('div'); refreshRow.style.display='flex'; refreshRow.style.alignItems='center'; refreshRow.style.gap='8px'; refreshRow.style.marginTop='8px';
  const refreshChk = document.createElement('input'); refreshChk.type='checkbox'; refreshChk.checked = localStorage.getItem('autoRefreshEnabled') === '1';
  const refreshSelect = document.createElement('select'); refreshSelect.style.width='80px';
  const refreshOptions = [
    { value: '360', text: t('hours6') },
    { value: '720', text: t('hours12') },
    { value: '1440', text: t('hours24') }
  ];
  refreshOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('autoRefreshMinutes') === opt.value) option.selected = true;
    refreshSelect.appendChild(option);
  });
  const refreshLabel = document.createElement('label'); refreshLabel.textContent = t('autoRefreshM3U');
  refreshRow.appendChild(refreshChk); refreshRow.appendChild(refreshLabel); refreshRow.appendChild(refreshSelect);
  body.appendChild(refreshRow);

  // EPG auto-refresh settings
  const epgRefreshRow = document.createElement('div'); epgRefreshRow.style.display='flex'; epgRefreshRow.style.alignItems='center'; epgRefreshRow.style.gap='8px'; epgRefreshRow.style.marginTop='8px';
  const epgRefreshChk = document.createElement('input'); epgRefreshChk.type='checkbox'; epgRefreshChk.checked = localStorage.getItem('epgAutoRefreshEnabled') === '1';
  const epgRefreshSelect = document.createElement('select'); epgRefreshSelect.style.width='80px';
  const epgRefreshOptions = [
    { value: '360', text: t('hours6') },
    { value: '720', text: t('hours12') },
    { value: '1440', text: t('hours24') }
  ];
  epgRefreshOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('epgAutoRefreshMinutes') === opt.value) option.selected = true;
    epgRefreshSelect.appendChild(option);
  });
  const epgRefreshLabel = document.createElement('label'); epgRefreshLabel.textContent = t('autoRefreshEPG');
  epgRefreshRow.appendChild(epgRefreshChk); epgRefreshRow.appendChild(epgRefreshLabel); epgRefreshRow.appendChild(epgRefreshSelect);
  body.appendChild(epgRefreshRow);

  // EPG settings
  const epgRow = document.createElement('div'); epgRow.style.display='flex'; epgRow.style.alignItems='center'; epgRow.style.gap='8px'; epgRow.style.marginTop='8px';
  const epgChk = document.createElement('input'); epgChk.type='checkbox'; epgChk.checked = localStorage.getItem('epgEnabled') === '1';
  const epgLabel = document.createElement('label'); epgLabel.textContent = t('enableEPG');
  epgRow.appendChild(epgChk); epgRow.appendChild(epgLabel);
  body.appendChild(epgRow);

  // Version and GitHub link
  const versionRow = document.createElement('div'); versionRow.style.marginTop='16px'; versionRow.style.paddingTop='12px'; versionRow.style.borderTop='1px solid var(--border)'; versionRow.style.textAlign='center';
  const versionText = document.createElement('div'); versionText.style.fontSize='12px'; versionText.style.color='var(--text-muted)'; versionText.textContent = t('version');
  const githubLink = document.createElement('a'); githubLink.href='#'; githubLink.textContent = t('visitReleases'); githubLink.style.fontSize='12px'; githubLink.style.color='var(--primary)'; githubLink.style.textDecoration='none'; githubLink.style.display='block'; githubLink.style.marginTop='4px';
  githubLink.onclick = (e) => {
    e.preventDefault();
    window.electronAPI.openExternal('https://github.com/Michael09011/IPTV-Desktop/releases');
  };
  versionRow.appendChild(versionText);
  versionRow.appendChild(githubLink);
  body.appendChild(versionRow);

  // License section
  const licenseRow = document.createElement('div'); licenseRow.style.marginTop='16px'; licenseRow.style.paddingTop='12px'; licenseRow.style.borderTop='1px solid var(--border)';
  const licenseTitle = document.createElement('h4'); licenseTitle.textContent = t('license'); licenseTitle.style.margin='0 0 8px 0'; licenseTitle.style.fontSize='14px';
  licenseRow.appendChild(licenseTitle);
  const licenseText = document.createElement('div'); licenseText.style.fontSize='11px'; licenseText.style.lineHeight='1.4'; licenseText.style.color='var(--text-muted)'; licenseText.style.maxHeight='120px'; licenseText.style.overflowY='auto';
  licenseText.innerHTML = `
    <strong>MIT License</strong><br>
    Copyright (c) 2026 Michael<br><br>
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:<br><br>
    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.<br><br>
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  `;
  licenseRow.appendChild(licenseText);
  body.appendChild(licenseRow);

  // Network buffer settings
  const bufferRow = document.createElement('div'); bufferRow.style.display='flex'; bufferRow.style.alignItems='center'; bufferRow.style.gap='8px'; bufferRow.style.marginTop='8px';
  const bufferModeSelect = document.createElement('select'); bufferModeSelect.style.width='80px';
  const bufferOptions = [
    { value: 'auto', text: t('auto') },
    { value: 'manual', text: t('manual') }
  ];
  bufferOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('bufferMode') === opt.value) option.selected = true;
    bufferModeSelect.appendChild(option);
  });
  const bufferLabel = document.createElement('label'); bufferLabel.textContent = t('networkBuffer');
  const bufferInput = document.createElement('input'); bufferInput.type='number'; bufferInput.min='10'; bufferInput.max='300'; bufferInput.step='5'; bufferInput.style.width='64px'; bufferInput.value = localStorage.getItem('maxBufferLength') || '30';
  bufferInput.disabled = localStorage.getItem('bufferMode') !== 'manual';
  bufferModeSelect.onchange = () => { bufferInput.disabled = bufferModeSelect.value !== 'manual'; };
  bufferRow.appendChild(bufferLabel); bufferRow.appendChild(bufferModeSelect); bufferRow.appendChild(bufferInput);
  body.appendChild(bufferRow);

  // External player settings
  const externalRow = document.createElement('div'); externalRow.style.display='flex'; externalRow.style.alignItems='center'; externalRow.style.gap='8px'; externalRow.style.marginTop='8px';
  const externalChk = document.createElement('input'); externalChk.type='checkbox'; externalChk.checked = localStorage.getItem('useExternalPlayer') === '1';
  const externalLabel = document.createElement('label'); externalLabel.textContent = t('useExternalPlayer');
  const playerSelect = document.createElement('select'); playerSelect.style.width='80px';
  const playerOptions = [
    { value: 'vlc', text: 'VLC' },
    { value: 'iina', text: 'IINA' }
  ];
  playerOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (localStorage.getItem('externalPlayerType') === opt.value || (!localStorage.getItem('externalPlayerType') && opt.value === 'vlc')) option.selected = true;
    playerSelect.appendChild(option);
  });
  const playerPathInput = document.createElement('input'); playerPathInput.type='text'; playerPathInput.placeholder = t('playerPathPlaceholder', '플레이어 경로 (선택)'); playerPathInput.style.width='200px'; playerPathInput.value = localStorage.getItem('externalPlayerPath') || '';
  externalRow.appendChild(externalChk); externalRow.appendChild(externalLabel); externalRow.appendChild(playerSelect); externalRow.appendChild(playerPathInput);
  body.appendChild(externalRow);

  // MPV player settings (NEW)
  const mpvRow = document.createElement('div'); mpvRow.style.display='flex'; mpvRow.style.alignItems='center'; mpvRow.style.gap='8px'; mpvRow.style.marginTop='8px';
  const mpvChk = document.createElement('input'); mpvChk.type='checkbox'; mpvChk.checked = localStorage.getItem('useMpvPlayer') === '1';
  const mpvLabel = document.createElement('label'); mpvLabel.textContent = t('useMPVPlayer');
  const mpvNote = document.createElement('small'); mpvNote.textContent = t('mpvNote'); mpvNote.style.display='block'; mpvNote.style.marginTop='4px'; mpvNote.style.color='var(--text-muted)'; mpvNote.style.fontSize='11px';
  mpvRow.appendChild(mpvChk); mpvRow.appendChild(mpvLabel);
  body.appendChild(mpvRow);
  body.appendChild(mpvNote);

  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.style.marginTop='12px'; actions.style.justifyContent='flex-end';
  const restartBtn = document.createElement('button'); restartBtn.textContent = t('save'); restartBtn.className='primary'; restartBtn.onclick = async () => {
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
    localStorage.setItem('channelFavoritesOnly', favOnlyChk.checked ? '1' : '0');
    channelFavoritesOnly = favOnlyChk.checked;
    localStorage.setItem('language', langSelect.value || 'ko');
    // 언어 변경 시 즉시 적용
    if (currentLanguage !== langSelect.value) {
      await setLanguage(langSelect.value);
    }
    localStorage.setItem('bufferMode', bufferModeSelect.value || 'auto');
    localStorage.setItem('maxBufferLength', bufferInput.value || '30');
    localStorage.setItem('useExternalPlayer', externalChk.checked ? '1' : '0');
    localStorage.setItem('externalPlayerType', playerSelect.value || 'vlc');
    localStorage.setItem('externalPlayerPath', playerPathInput.value.trim() || '');
    localStorage.setItem('useMpvPlayer', mpvChk.checked ? '1' : '0');
    // 재설정 자동 갱신 타이머
    scheduleAutoRefresh();
    scheduleAutoEPGRefresh();
    
    if (currentGpuSetting !== newGpuSetting) {
      showToast(t('toast.gpuRestart'), 'info');
      await window.electronAPI.appRestart();
    } else {
      showToast(t('toast.settingsSaved'), 'success');
      modal.remove();
    }
  };
  const closeBtn = document.createElement('button'); closeBtn.textContent = t('close'); closeBtn.onclick = () => modal.remove();
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
    // 헤더에 재생 중 표시가 나오지 않도록 빈 문자열 유지
    el.textContent = '';
  } catch (e) {}
}

function toggleFav(ch) {
  if (!ch || !ch.url) return;
  try {
    if (favorites.has(ch.url)) {
      favorites.delete(ch.url);
      showToast('즐겨찾기에서 제거됨', 'info');
    } else {
      favorites.set(ch.url, {
        name: ch.name || ch.url,
        group: ch.group || '',
        tvgId: ch.tvgId || '',
        logo: ch.logo || '',
        addedAt: Date.now(),
      });
      showToast('즐겨찾기에 추가됨', 'success');
    }
    saveFavorites();
  } catch (e) {
    console.error('toggleFav error', e);
  }
}

async function showUrlModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed'; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0; modal.style.zIndex='10000';
  modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.background='rgba(0,0,0,0.6)';
  const body = document.createElement('div'); body.style.background='var(--card)'; body.style.padding='18px'; body.style.borderRadius='8px'; body.style.width='520px'; body.style.border='1px solid var(--border)';
  const title = document.createElement('h3'); title.textContent = t('loadUrl'); title.style.margin='0 0 12px 0'; body.appendChild(title);

  // show current playing status (without URL detail)
  const curDiv = document.createElement('div'); curDiv.style.marginBottom='8px'; curDiv.style.color='var(--text-muted)';
  const info = getChannelInfoByUrl(currentPlayingUrl);
  curDiv.textContent = info ? `${t('currentPlaying')}: ${info.name || info.group || ''}` : t('currentPlaying') + ' ' + t('none');
  body.appendChild(curDiv);

  const urlInput = document.createElement('input'); urlInput.placeholder = t('url'); urlInput.style.width='100%'; urlInput.style.marginBottom='8px'; body.appendChild(urlInput);
  const nameInput = document.createElement('input'); nameInput.placeholder = t('name'); nameInput.style.width='100%'; nameInput.style.marginBottom='8px'; body.appendChild(nameInput);
  const epgUrlInput = document.createElement('input'); epgUrlInput.placeholder = t('epgUrl'); epgUrlInput.style.width='100%'; epgUrlInput.style.marginBottom='8px'; body.appendChild(epgUrlInput);
  const addBtn = document.createElement('button'); addBtn.textContent = t('load'); addBtn.className='primary'; addBtn.style.width='100%';
  addBtn.onclick = async () => {
    const url = urlInput.value.trim(); if (!url) return alert(t('alerts.enterUrl'));
    addBtn.disabled = true; addBtn.textContent = t('toast.loading');
    const res = await window.electronAPI.fetchUrl(url);
    if (!res.ok) { alert(t('alerts.loadFailed') + ': ' + (res.error || t('alerts.unknownError'))); addBtn.disabled=false; addBtn.textContent = t('load'); return; }
    const name = nameInput.value.trim() || url.split('/').pop() || 'playlist';
    const epgUrl = epgUrlInput.value.trim();
    const saveRes = await window.electronAPI.playlistsAdd({ name, url, epgUrl: epgUrl || undefined, content: res.content });
    if (saveRes.ok) { await loadSavedPlaylists(); render(); modal.remove(); }
    addBtn.disabled = false; addBtn.textContent = t('load');
  };
  body.appendChild(addBtn);

  const closeBtn = document.createElement('button'); closeBtn.textContent = t('close'); closeBtn.style.marginTop='8px'; closeBtn.onclick = () => modal.remove();
  body.appendChild(closeBtn);
  modal.appendChild(body); document.body.appendChild(modal);
}

let editMode = false;
let editablePlaylists = [];

// persistent channel search text to avoid losing input when re-rendering
let channelFilterText = '';
let channelFavoritesOnly = localStorage.getItem('channelFavoritesOnly') === '1';
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
const scheduleRender = debounce(() => render(), 300);

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
  savedTitle.textContent = `${t('playlists', '재생목록')} (${savedPlaylists.length})`;
  savedTitle.style.display = 'block';
  savedTitle.style.marginBottom = '8px';
  savedDiv.appendChild(savedTitle);

  const editToggle = document.createElement('button');
  editToggle.textContent = editMode ? t('done', '완료') : t('edit', '편집');
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

      // 외부 플레이어 옵션
      const externalDiv = document.createElement('div');
      externalDiv.style.display = 'flex';
      externalDiv.style.alignItems = 'center';
      externalDiv.style.gap = '4px';
      externalDiv.style.marginBottom = '4px';
      const externalChk = document.createElement('input');
      externalChk.type = 'checkbox';
      externalChk.checked = p.externalPlayerOnly || false;
      externalChk.onchange = async () => {
        console.log('체크박스 변경:', { id: p.id, name: p.name, externalPlayerOnly: externalChk.checked });
        const updated = { ...p, externalPlayerOnly: externalChk.checked };
        console.log('저장할 플레이리스트:', updated);
        const res = await window.electronAPI.playlistsAdd(updated);
        console.log('저장 결과:', res);
        await loadSavedPlaylists();
        console.log('로드된 플레이리스트:', savedPlaylists.find(x => x.id === p.id));
        render();
      };
      const externalLabel = document.createElement('label');
      externalLabel.textContent = t('externalPlayerOnly', '외부 플레이어만 사용');
      externalLabel.style.fontSize = '10px';
      externalLabel.style.color = 'var(--text-muted)';
      externalDiv.appendChild(externalChk);
      externalDiv.appendChild(externalLabel);
      item.appendChild(externalDiv);

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
      playBtn.textContent = t('channels', '채널 보기');
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
          channelFilterText = ''; // 플레이리스트 변경 시 검색 초기화
          currentGroup = 'All'; // 그룹도 초기화
          sidebarView = 'channels';
          render();
        }
      };
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = '🔄';
      refreshBtn.title = t('refreshFromUrl', 'URL에서 갱신');
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
            const upd = await window.electronAPI.playlistsAdd({ id: p.id, name: p.name, url: p.url, content: res.content, externalPlayerOnly: p.externalPlayerOnly });
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

  // Favorites section
  const favDiv = document.createElement('div');
  favDiv.style.marginTop = '16px';
  const favTitleRow = document.createElement('div');
  favTitleRow.style.display = 'flex';
  favTitleRow.style.alignItems = 'center';
  favTitleRow.style.justifyContent = 'space-between';
  favTitleRow.style.marginBottom = '8px';
  
  const favTitle = document.createElement('strong');
  favTitle.textContent = `${t('favorites', '즐겨찾기')} (${favorites.size})`;
  favTitle.style.flex = '1';
  favTitleRow.appendChild(favTitle);
  
  const favManageBtn = document.createElement('button');
  favManageBtn.textContent = t('viewFavorites', '👁️ 보기');
  favManageBtn.style.padding = '4px 8px';
  favManageBtn.style.fontSize = '11px';
  favManageBtn.style.background = 'var(--primary)';
  favManageBtn.style.border = 'none';
  favManageBtn.style.borderRadius = '4px';
  favManageBtn.style.color = '#fff';
  favManageBtn.style.cursor = 'pointer';
  favManageBtn.onclick = () => {
    selectedFavoritesView = true;
    sidebarView = 'channels';
    render();
  };
  favTitleRow.appendChild(favManageBtn);
  favDiv.appendChild(favTitleRow);

  const favList = document.createElement('div');
  favList.style.display = 'flex';
  favList.style.flexDirection = 'column';
  favList.style.gap = '4px';
  favList.style.maxHeight = '200px';
  favList.style.overflowY = 'auto';

  Array.from(favorites.entries()).forEach(([url, info]) => {
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.borderRadius = '4px';
    item.style.background = 'var(--accent)';
    item.style.cursor = 'pointer';
    item.style.fontSize = '11px';
    item.onmouseenter = () => { item.style.background = '#334155'; };
    item.onmouseleave = () => { item.style.background = 'var(--accent)'; };

    const nameDiv = document.createElement('div');
    nameDiv.textContent = info.name || url;
    nameDiv.style.fontWeight = '600';
    item.appendChild(nameDiv);

    const groupDiv = document.createElement('div');
    groupDiv.textContent = info.group || '';
    groupDiv.style.fontSize = '10px';
    groupDiv.style.color = 'var(--text-muted)';
    item.appendChild(groupDiv);

    item.onclick = () => {
      // Find channel and play
      const ch = channels.find(c => c.url === url) || { url, name: info.name, group: info.group };
      playChannel(ch);
    };

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.padding = '2px 4px';
    delBtn.style.fontSize = '10px';
    delBtn.style.background = '#dc2626';
    delBtn.style.border = 'none';
    delBtn.style.borderRadius = '2px';
    delBtn.style.color = '#fff';
    delBtn.style.cursor = 'pointer';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      favorites.delete(url);
      saveFavorites();
      render();
    };
    item.appendChild(delBtn);

    favList.appendChild(item);
  });

  // 메인 화면에서 즐겨찾기 섹션 제거됨 - 헤더의 "⭐ 즐겨찾기" 버튼으로 접근

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
  backBtn.textContent = t('back', '← 뒤로');
  backBtn.style.padding = '6px 10px';
  backBtn.style.fontSize = '11px';
  backBtn.onclick = () => {
    sidebarView = 'main';
    selectedPlaylistId = null;
    selectedPlaylistName = null;
    selectedFavoritesView = false;
    playlistChannels = [];
    render();
  };
  headerDiv.appendChild(backBtn);

  const titleDiv = document.createElement('div');
  titleDiv.textContent = selectedFavoritesView ? '즐겨찾기' : selectedPlaylistName;
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
  search.placeholder = t('searchPlaceholder', '🔍 채널 검색 (이름, 그룹, TVG, URL 등)');
  search.style.marginBottom = '8px';
  search.value = channelFilterText || '';

  const controlsRow = document.createElement('div'); controlsRow.style.display = 'flex'; controlsRow.style.gap = '6px'; controlsRow.style.flexWrap = 'wrap';
  const exportFavBtn = document.createElement('button'); exportFavBtn.textContent = t('exportFavorites', '즐겨찾기 내보내기'); exportFavBtn.style.fontSize = '11px';
  exportFavBtn.onclick = () => {
    try {
      const data = JSON.stringify(Object.fromEntries(favorites), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'favorites.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { showToast('내보내기 실패', 'error'); }
  };
  const saveToFileBtn = document.createElement('button'); saveToFileBtn.textContent = t('saveToFile'); saveToFileBtn.style.fontSize = '11px';
  saveToFileBtn.onclick = async () => {
    try {
      const obj = Object.fromEntries(favorites);
      const r = await window.electronAPI.favoritesSaveFile(obj);
      if (r && r.ok) showToast('파일에 저장됨', 'success'); else showToast('파일 저장 실패', 'error');
    } catch (e) { showToast('파일 저장 실패', 'error'); }
  };
  const loadFromFileBtn = document.createElement('button'); loadFromFileBtn.textContent = t('loadFromFile'); loadFromFileBtn.style.fontSize = '11px';
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
  const importFavBtn = document.createElement('button'); importFavBtn.textContent = t('importFavorites', '즐겨찾기 가져오기'); importFavBtn.style.fontSize = '11px';
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

  search.oninput = () => { channelFilterText = search.value.toLowerCase(); renderFavoritesOrChannelList(channelSection, groupSel); };
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
  leftCol.appendChild(controlsRow);

  // Group selector (숨김 - 즐겨찾기 뷰일 때는 필요 없음)
  const groupSel = document.createElement('select');
  groupSel.style.marginBottom = '12px';
  groupSel.style.display = selectedFavoritesView ? 'none' : 'block';
  groupSel.onchange = (e) => { currentGroup = e.target.value; render(); };
  leftCol.appendChild(groupSel);

  // Channel list
  const channelSection = document.createElement('div');
  channelSection.style.flex = '1';
  channelSection.style.overflowY = 'auto';

  renderFavoritesOrChannelList(channelSection, groupSel);

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

function renderChannelList(channelSection, groupSel, favOnlyChk) {
  // Update group selector
  const groups = ['All', ...Array.from(new Set(playlistChannels.map(c => c.group || t('ungrouped', 'Ungrouped')))).sort()];
  groupSel.innerHTML = '';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g === 'All' ? t('all') : g;
    if (g === currentGroup) opt.selected = true;
    groupSel.appendChild(opt);
  });

  // Filter channels
  const tokens = (channelFilterText || '').split(/\s+/).filter(Boolean);
  const filtered = playlistChannels.filter(c => {
    if (currentGroup !== 'All' && (c.group || 'Ungrouped') !== currentGroup) return false;
    if (channelFavoritesOnly && !favorites.has(c.url)) return false;
    if (!tokens.length) return true;
    const hay = [ (c.name||''), (c.group||''), (c.tvgId||''), (c.url||'') ].map(x => String(x).toLowerCase());
    return tokens.every(tok => hay.some(h => h.includes(tok)));
  });

  // Clear and rebuild channel list
  channelSection.innerHTML = '';
  if (playlistChannels.length > 0) {
    const channelCountTitle = document.createElement('strong');
    channelCountTitle.textContent = `${t('channels', '채널')} (${filtered.length}/${playlistChannels.length})`;
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
      meta.textContent = (ch.group || t('ungrouped', 'Ungrouped')) + (ch.tvgId ? ' • ' + ch.tvgId : '');
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
}

/**
 * renderFavoritesOrChannelList - 즐겨찾기 또는 채널 리스트 표시
 * selectedFavoritesView가 true면 즐겨찾기 리스트, false면 채널 리스트 표시
 */
function renderFavoritesOrChannelList(channelSection, groupSel) {
  if (selectedFavoritesView) {
    // 즐겨찾기 뷰
    renderFavoritesScreen(channelSection, groupSel);
  } else {
    // 채널 리스트 뷰 (기존 로직)
    renderChannelList(channelSection, groupSel);
  }
}

/**
 * renderFavoritesScreen - 즐겨찾기 리스트를 플레이리스트 채널처럼 표시
 */
function renderFavoritesScreen(channelSection, groupSel) {
  // 즐겨찾기를 그룹화
  const favMap = new Map();
  Array.from(favorites.entries()).forEach(([url, info]) => {
    const group = info.group || t('favorites', '즐겨찾기');
    if (!favMap.has(group)) favMap.set(group, []);
    favMap.get(group).push({ url, ...info });
  });

  // 그룹 셀렉터 업데이트
  groupSel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'All';
  optAll.textContent = `${t('all')} (${favorites.size})`;
  groupSel.appendChild(optAll);

  Array.from(favMap.keys()).sort().forEach(group => {
    const opt = document.createElement('option');
    opt.value = group;
    opt.textContent = `${group} (${favMap.get(group).length})`;
    if (group === currentGroup) opt.selected = true;
    groupSel.appendChild(opt);
  });

  // 현재 그룹의 즐겨찾기 필터링
  let filtered = [];
  if (currentGroup === 'All') {
    filtered = Array.from(favorites.entries()).map(([url, info]) => ({ url, ...info }));
  } else {
    filtered = favMap.get(currentGroup) || [];
  }

  // 검색 필터 적용
  if (channelFilterText) {
    filtered = filtered.filter(ch => {
      const searchStr = channelFilterText.toLowerCase();
      return (ch.name || '').toLowerCase().includes(searchStr) ||
             (ch.url || '').toLowerCase().includes(searchStr) ||
             (ch.group || '').toLowerCase().includes(searchStr);
    });
  }

  // 즐겨찾기 표시
  if (favorites.size > 0) {
    const favCountTitle = document.createElement('strong');
    favCountTitle.textContent = `${t('favorites', '즐겨찾기')} (${filtered.length}/${favorites.size})`;
    favCountTitle.style.display = 'block';
    favCountTitle.style.marginBottom = '8px';
    channelSection.appendChild(favCountTitle);

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
      
      title.innerHTML = highlightMatch(ch.name || ch.url);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = (ch.group || '즐겨찾기') + (ch.tvgId ? ' • ' + ch.tvgId : '');
      infoWrap.appendChild(title); 
      infoWrap.appendChild(meta);
      el.appendChild(infoWrap);

      // 즐겨찾기 버튼 (항상 별표로 표시)
      const favBtn = document.createElement('button');
      favBtn.textContent = '★';
      favBtn.style.padding = '4px 6px';
      favBtn.style.fontSize = '12px';
      favBtn.style.color = '#fbbf24';
      favBtn.onclick = (e) => { 
        e.stopPropagation(); 
        favorites.delete(ch.url); 
        saveFavorites(); 
        render(); 
      };
      el.appendChild(favBtn);

      el.onclick = () => playChannel({ url: ch.url, name: ch.name, group: ch.group, logo: ch.logo, tvgId: ch.tvgId });
      channelSection.appendChild(el);
    });
  } else {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = t('noFavorites', '즐겨찾기가 없습니다');
    emptyMsg.style.padding = '16px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = 'var(--text-muted)';
    channelSection.appendChild(emptyMsg);
  }
}

/**
 * Play channel using MPV player (NEW)
 * Supports RTMP, MPEG-TS, HLS, DASH, and more
 */
async function playChannelWithFFmpeg(ch) {
  const statusDiv = document.getElementById('playerStatus');
  const epgDiv = document.getElementById('epg');
  epgDiv.innerHTML = '';
  statusDiv.innerHTML = '';
  
  const url = ch.url;
  if (!url) return;

  try {
    statusDiv.textContent = '스트림 변환 중...';
    statusDiv.style.color = '#f59e0b';
    
    console.log(`[FFmpeg] Starting conversion: ${url}`);
    
    // FFmpeg 스트림 변환 시작 (RTMP/MPEG-TS → HLS)
    const res = await window.electronAPI.startFFmpegStream(url);
    
    if (!res.ok) {
      throw new Error(res.error || 'FFmpeg 변환 실패');
    }
    
    const hlsUrl = res.hlsUrl;
    console.log(`[FFmpeg] Conversion successful. HLS URL: ${hlsUrl}`);
    
    // HLS.js로 재생
    statusDiv.textContent = 'HLS 로딩 중...';
    statusDiv.style.color = '#f59e0b';
    
    // 기존 HLS 플레이어 정리
    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    if (currentVideo) {
      currentVideo.pause();
      currentVideo.src = '';
    }
    
    // HLS.js 초기화
    const hlsConfig = {};
    const bufferMode = localStorage.getItem('bufferMode') || 'auto';
    const maxBufferLength = localStorage.getItem('maxBufferLength') || '30';
    
    if (bufferMode === 'manual') {
      hlsConfig.maxBufferLength = parseInt(maxBufferLength) || 30;
    }
    
    currentHls = new window.Hls(hlsConfig);
    currentVideo = document.getElementById('video');
    
    // HLS 이벤트
    currentHls.on(window.Hls.Events.MANIFEST_LOADING, () => {
      console.log('[HLS] Manifest loading...');
    });
    
    currentHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      console.log('[HLS] Manifest parsed successfully');
      statusDiv.textContent = '재생 중...';
      statusDiv.style.color = '#10b981';
      currentPlayingUrl = url;
      isRetrying = false;
      currentVideo.play().catch(err => {
        console.error('[HLS] Play error:', err);
        showToast('재생 실패', 'error');
      });
    });
    
    currentHls.on(window.Hls.Events.ERROR, (ev, data) => {
      const { type, details, fatal } = data || {};
      if (!fatal) return;
      
      console.error(`[HLS] Fatal error - ${details}`);
      statusDiv.textContent = `HLS 오류: ${details}. 재시도 중...`;
      statusDiv.style.color = '#dc2626';
      
      currentHls?.destroy();
      currentHls = null;
      
      // 재시도
      if (!isRetrying) {
        isRetrying = true;
        currentRetryTimer = setTimeout(() => {
          playChannelWithFFmpeg(ch);
        }, HLS_BASE_DELAY_MS);
      }
    });
    
    currentHls.attachMedia(currentVideo);
    currentHls.loadSource(hlsUrl);
    
    try { updateCurrentChannelDisplay(); } catch (e) {}

    // EPG 표시
    const epgUrl = selectedPlaylistId ? savedPlaylists.find(p => p.id === selectedPlaylistId)?.epgUrl : localStorage.getItem('epgUrl');
    if (epgUrl && ch.tvgId && localStorage.getItem('epgEnabled') === '1') {
      try {
        const res = await window.electronAPI.fetchUrl(epgUrl);
        if (res.ok) {
          const programs = parseEPG(res.content);
          const now = new Date();
          const nowPrograms = programs.filter(p => (p.channelId === ch.tvgId || p.channel === ch.tvgId) && p.start && p.end && now >= p.start && now < p.end);
          if (nowPrograms.length) {
            epgDiv.innerHTML = `<strong>현재:</strong> ${nowPrograms.slice(0,2).map(p=>`${p.title}`).join(' / ')}`;
          }
        }
      } catch (e) {
        console.log('[EPG] Fetch error:', e.message);
      }
    }

  } catch (e) {
    console.error('[FFmpeg] Error:', e.message);
    statusDiv.textContent = `오류: ${e.message}`;
    statusDiv.style.color = '#dc2626';
    
    // 기본 플레이어로 폴백
    try {
      playChannel(ch);
    } catch (e2) {
      console.error('Fallback failed:', e2.message);
    }
    
    throw e;
  }
}

async function playChannel(ch) {
  let useExternal = localStorage.getItem('useExternalPlayer') === '1';
  useMpvPlayer = localStorage.getItem('useMpvPlayer') === '1';

  // 플레이리스트 옵션 확인
  if (selectedPlaylistId) {
    const playlist = savedPlaylists.find(p => p.id === selectedPlaylistId);
    console.log('재생 시 플레이리스트 확인:', { selectedPlaylistId, playlist, externalPlayerOnly: playlist?.externalPlayerOnly });
    if (playlist && playlist.externalPlayerOnly) {
      console.log('외부 플레이어만 사용으로 설정됨');
      useExternal = true;
    }
  }
  console.log('playChannel useExternal:', useExternal, 'useMpv:', useMpvPlayer);
  
  if (useExternal) {
    const playerType = localStorage.getItem('externalPlayerType') || 'vlc';
    const playerPath = localStorage.getItem('externalPlayerPath') || '';
    // 이전 플레이어 죽이기
    await window.electronAPI.killCurrentPlayer();
    try {
      let res;
      if (playerType === 'vlc') {
        res = await window.electronAPI.spawnVlc(ch.url, playerPath);
        showToast('VLC로 재생 중...', 'info');
      } else if (playerType === 'iina') {
        res = await window.electronAPI.spawnIina(ch.url, playerPath);
        showToast('IINA로 재생 중...', 'info');
      } else {
        showToast('지원하지 않는 플레이어', 'error');
        return;
      }
      if (res.ok && res.pid) {
        window.electronAPI.setCurrentPlayerPid(res.pid);
      }
      // 플레이어가 열리면 내부 플레이어 정지
      const video = document.getElementById('video');
      if (video) {
        video.pause();
        video.src = '';
      }
      return;
    } catch (e) {
      showToast(`${playerType.toUpperCase()} 열기 실패: ` + e.message, 'error');
      // 실패 시 내부 플레이어로 폴백
    }
  }
  
  // FFmpeg Player check (스트림 형식 변환: RTMP/MPEG-TS → HLS)
  if (useMpvPlayer) {
    try {
      await playChannelWithFFmpeg(ch);
      return;
    } catch (e) {
      console.error('[FFmpeg] Failed:', e.message);
      showToast(`스트림 변환 오류: ${e.message}. HLS 플레이어로 전환합니다.`, 'error');
      useMpvPlayer = false;
      // Fall through to HLS player
    }
  }
  
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
  video.crossOrigin = 'anonymous';
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
    // HLS Player 시도
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
        video.addEventListener('error', (ev) => { const err = video.error; console.error('VideoElement error', err, url); showToast('플레이어 오류','error'); });
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
