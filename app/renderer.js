import { parsePlaylist } from './parsers.js';

const root = document.getElementById('root');
const openBtn = document.getElementById('openBtn');
let searchInput;
let savedPlaylists = [];

let channels = [];
let groups = [];
let favorites = new Set(JSON.parse(localStorage.getItem('favorites')||'[]'));
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
    channels = [];
    for (const f of res.files) {
      const parsed = parsePlaylist(f.content, f.path);
      channels = channels.concat(parsed);
    }
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

let editMode = false;
let editablePlaylists = [];

async function loadSavedPlaylists() {
  try {
    const res = await window.electronAPI.playlistsList();
    savedPlaylists = Array.isArray(res) ? res : [];
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

  

  // URL import section
  const pmSection = document.createElement('div');
  pmSection.style.borderBottom = '1px solid var(--border)';
  pmSection.style.paddingBottom = '8px';
  pmSection.style.marginBottom = '12px';

  const pmTitle = document.createElement('strong');
  pmTitle.textContent = 'URL 불러오기';
  pmSection.appendChild(pmTitle);

  const urlInput = document.createElement('input');
  urlInput.placeholder = 'URL 입력';
  urlInput.style.fontSize = '11px';
  pmSection.appendChild(urlInput);

  const nameInput = document.createElement('input');
  nameInput.placeholder = '이름';
  nameInput.style.fontSize = '11px';
  pmSection.appendChild(nameInput);

  const addBtn = document.createElement('button');
  addBtn.textContent = '불러오기';
  addBtn.className = 'primary';
  addBtn.style.width = '100%';
  addBtn.onclick = async () => {
    const url = urlInput.value.trim();
    if (!url) return alert('URL을 입력하세요');
    addBtn.disabled = true;
    addBtn.textContent = '불러오는 중...';
    const res = await window.electronAPI.fetchUrl(url);
    if (!res.ok) { alert('불러오기 실패: ' + (res.error||'unknown')); addBtn.disabled = false; addBtn.textContent = '불러오기'; return; }
    const name = nameInput.value.trim() || url.split('/').pop() || 'playlist';
    const saveRes = await window.electronAPI.playlistsAdd({ name, url, content: res.content });
    if (saveRes.ok) { await loadSavedPlaylists(); render(); }
    addBtn.disabled = false;
    addBtn.textContent = '불러오기';
  };
  pmSection.appendChild(addBtn);
  leftCol.appendChild(pmSection);

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
      actionDiv.appendChild(playBtn);

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

      row.appendChild(handle); row.appendChild(nameInput2); row.appendChild(urlInput2); row.appendChild(saveBtn); row.appendChild(delBtn2);
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

  // Backup section
  const backupDiv = document.createElement('div');
  backupDiv.style.fontSize = '11px';
  backupDiv.style.paddingTop = '8px';
  backupDiv.style.borderTop = '1px solid var(--border)';
  backupDiv.style.display = 'flex';
  backupDiv.style.alignItems = 'center';
  backupDiv.style.gap = '4px';
  backupDiv.style.flexWrap = 'wrap';

  const autoChk = document.createElement('input');
  autoChk.type = 'checkbox';
  autoChk.id = 'autoBackupChk';
  const autoLabel = document.createElement('label');
  autoLabel.htmlFor = 'autoBackupChk';
  autoLabel.textContent = '자동백업';
  autoLabel.style.marginBottom = '0px';
  autoLabel.style.cursor = 'pointer';
  autoLabel.style.flex = '0 0 auto';

  const minutesInput = document.createElement('input');
  minutesInput.type = 'number';
  minutesInput.min = '1';
  minutesInput.style.width = '40px';
  minutesInput.style.marginBottom = '0px';
  minutesInput.style.fontSize = '11px';
  minutesInput.value = localStorage.getItem('autoBackupMinutes') || '60';

  const minutesLabel = document.createElement('label');
  minutesLabel.textContent = '분';
  minutesLabel.style.margin = '0px';
  minutesLabel.style.flex = '0 0 auto';

  const openFolderBtn = document.createElement('button');
  openFolderBtn.textContent = '📁';
  openFolderBtn.style.padding = '3px 5px';
  openFolderBtn.style.fontSize = '11px';
  openFolderBtn.onclick = async () => {
    const r = await window.electronAPI.playlistsOpenBackupDir();
    if (!r || !r.ok) showToast('폴더 열기 실패', 'error');
  };

  const backupsModalBtn = document.createElement('button');
  backupsModalBtn.textContent = '🔄';
  backupsModalBtn.style.padding = '3px 5px';
  backupsModalBtn.style.fontSize = '11px';
  backupsModalBtn.onclick = () => showBackupsModal();

  const enabled = localStorage.getItem('autoBackupEnabled') === '1';
  autoChk.checked = enabled;

  backupDiv.appendChild(autoChk); backupDiv.appendChild(autoLabel); backupDiv.appendChild(minutesInput); backupDiv.appendChild(minutesLabel); backupDiv.appendChild(openFolderBtn); backupDiv.appendChild(backupsModalBtn);
  leftCol.appendChild(backupDiv);

  const scheduleAutoBackup = () => {
    if (window._autoBackupTimer) { clearInterval(window._autoBackupTimer); window._autoBackupTimer = null; }
    const on = !!autoChk.checked;
    const mins = Math.max(1, Number(minutesInput.value || 60));
    localStorage.setItem('autoBackupMinutes', String(mins));
    localStorage.setItem('autoBackupEnabled', on ? '1' : '0');
    if (on) {
      window._autoBackupTimer = setInterval(async () => {
        const r = await window.electronAPI.playlistsCreateBackup();
        if (r && r.ok) showToast('자동 백업 완료', 'success');
      }, mins * 60 * 1000);
    }
  };
  minutesInput.onchange = scheduleAutoBackup; autoChk.onchange = scheduleAutoBackup;
  scheduleAutoBackup();

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

  // Search input
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = '🔍 채널 검색';
  search.style.marginBottom = '8px';
  let filterText = '';
  search.oninput = () => { filterText = search.value.toLowerCase(); render(); };
  leftCol.appendChild(search);

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

  const filtered = playlistChannels.filter(c => {
    if (currentGroup !== 'All' && (c.group || 'Ungrouped') !== currentGroup) return false;
    if (!filterText) return true;
    return (c.name || '').toLowerCase().includes(filterText) || (c.group||'').toLowerCase().includes(filterText);
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
      title.textContent = ch.name;
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
  if (favorites.has(ch.url)) favorites.delete(ch.url); else favorites.add(ch.url);
  localStorage.setItem('favorites', JSON.stringify(Array.from(favorites)));
}

async function playChannel(ch) {
  // 재시도 중이면 무시
  if (isRetrying) {
    showToast('현재 채널 재생 중... 잠깐만 기다려주세요', 'info');
    return;
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
  if (currentPlayingUrl === url && isRetrying) {
    return;
  }

  currentPlayingUrl = url;
  isRetrying = false;

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
        const hls = new window.Hls();
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

  const epgUrl = localStorage.getItem('epgUrl');
  if (epgUrl && ch.tvgId) {
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

(async () => { await loadSavedPlaylists(); render(); })();
