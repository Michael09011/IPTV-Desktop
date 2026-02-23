const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { session } = require('electron');
const path = require('path');
const fs = require('fs');

// Settings file stored in userData
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
function loadSettingsSync() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
    }
  } catch (e) {}
  return {};
}
function saveSettingsSync(s) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8'); } catch (e) {}
}

// Read settings synchronously before app ready so we can apply GPU setting
const _initialSettings = loadSettingsSync();
try {
  if (_initialSettings.disableHardwareAcceleration !== false) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
  }
} catch (e) { /* ignore */ }

const RULES_FILE = path.join(app.getPath('userData'), 'auth_rules.json');
let authRules = [];

function loadAuthRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      authRules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')) || [];
    }
  } catch (e) { authRules = []; }
}

function saveAuthRules() {
  try { fs.writeFileSync(RULES_FILE, JSON.stringify(authRules, null, 2)); } catch (e) {}
}

loadAuthRules();

const PLAYLISTS_FILE = path.join(app.getPath('userData'), 'playlists.json');
let playlists = [];

function loadPlaylists() {
  try {
    if (fs.existsSync(PLAYLISTS_FILE)) {
      playlists = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8')) || [];
    }
  } catch (e) { playlists = []; }
}

function savePlaylists() {
  try { fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2)); } catch (e) {}
}

loadPlaylists();

const BACKUP_DIR = path.join(app.getPath('userData'), 'playlists_backups');

function ensureBackupDir() {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

function savePlaylistsBackup() {
  try {
    ensureBackupDir();
    const name = `playlists_backup_${Date.now()}.json`;
    const full = path.join(BACKUP_DIR, name);
    fs.writeFileSync(full, JSON.stringify(playlists, null, 2), 'utf8');
    // prune old backups (keep last 20)
    const files = fs.readdirSync(BACKUP_DIR).map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR,f)).mtimeMs })).sort((a,b)=>b.t-a.t);
    if (files.length > 20) {
      for (let i = 20; i < files.length; i++) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, files[i].f)); } catch (e) {}
      }
    }
    return { ok: true, path: full };
  } catch (e) { return { ok: false, error: e.message }; }
}

ipcMain.handle('playlists:backups', async () => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR).map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR,f)).mtimeMs }));
    files.sort((a,b)=>b.mtime-a.mtime);
    return { ok: true, backups: files };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('playlists:restore', async (event, filename) => {
  try {
    const full = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(full)) return { ok: false, error: 'not found' };
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(data)) return { ok: false, error: 'invalid backup' };
    // backup current before restore
    savePlaylistsBackup();
    playlists = data.map(p => ({ id: p.id || Date.now().toString(), name: p.name||'', url: p.url||'', content: p.content||'', created: p.created||new Date().toISOString() }));
    savePlaylists();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('playlists:createBackup', async () => {
  try {
    const r = savePlaylistsBackup();
    return r;
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('playlists:openBackupDir', async () => {
  try {
    ensureBackupDir();
    const res = await shell.openPath(BACKUP_DIR);
    return { ok: true, result: res };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Settings IPC: get/set and restart
ipcMain.handle('settings:get', async () => {
  return loadSettingsSync();
});
ipcMain.handle('settings:set', async (event, obj) => {
  const cur = loadSettingsSync();
  const next = Object.assign({}, cur, obj || {});
  saveSettingsSync(next);
  return { ok: true };
});
ipcMain.handle('app:restart', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message } }
});

// register webRequest header injection after app is ready
function registerSessionHooks() {
  try {
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const url = details.url || '';
        for (const rule of authRules) {
          try {
            if (!rule.pattern) continue;
            const match = rule.useRegex ? new RegExp(rule.pattern).test(url) : url.includes(rule.pattern);
            if (match && rule.headers) {
              details.requestHeaders = Object.assign({}, details.requestHeaders, rule.headers);
              break;
            }
          } catch (e) { continue; }
        }
      } catch (e) {}
      callback({ requestHeaders: details.requestHeaders });
    });
  } catch (e) {
    // ignore if session not available yet
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // hide native menu bar and remove application menu
  try {
    Menu.setApplicationMenu(null);
    win.setMenuBarVisibility(false);
    win.autoHideMenuBar = true;
  } catch (e) {}

  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
}

app.whenReady().then(() => {
  registerSessionHooks();
  (async () => {
    try {
      // If this is a packaged app (e.g. the DMG distributed build), clear any
      // existing playlists on first run so the DMG doesn't carry developer/test data.
      if (app.isPackaged) {
        try {
          const SENTINEL = path.join(app.getPath('userData'), 'playlists_cleared_v1');
          if (!fs.existsSync(SENTINEL)) {
            playlists = [];
            savePlaylists();
            try { fs.writeFileSync(SENTINEL, String(Date.now()), 'utf8'); } catch (e) {}
          }
        } catch (e) {
          // ignore sentinel errors
        }
      }
    } catch (e) {}
    createWindow();
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Playlists', extensions: ['m3u', 'm3u8', 'json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return { canceled: true };

  const files = [];
  for (const p of result.filePaths) {
    const content = await fs.promises.readFile(p, 'utf8');
    files.push({ path: p, content });
  }
  return { canceled: false, files };
});

ipcMain.handle('fetch:url', async (event, url) => {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? require('https') : require('http');
      const req = lib.get(url, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ ok: true, status: res.statusCode, url: res.responseUrl || url, content: data }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.setTimeout(15000, () => {
        req.abort();
        resolve({ ok: false, error: 'timeout' });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
});

ipcMain.handle('auth:set', async (event, rule) => {
  // rule: { id?, pattern, useRegex, headers: {k:v} }
  if (!rule || !rule.pattern) return { ok: false, error: 'invalid' };
  if (!rule.id) rule.id = Date.now().toString();
  authRules = authRules.filter(r => r.id !== rule.id);
  authRules.push(rule);
  saveAuthRules();
  return { ok: true, rule };
});

ipcMain.handle('auth:list', async () => {
  return authRules;
});

ipcMain.handle('auth:remove', async (event, id) => {
  authRules = authRules.filter(r => r.id !== id);
  saveAuthRules();
  return { ok: true };
});

ipcMain.handle('playlists:list', async () => {
  loadPlaylists();
  return playlists.map(p => ({ id: p.id, name: p.name, url: p.url, created: p.created }));
});

ipcMain.handle('playlists:get', async (event, id) => {
  loadPlaylists();
  const p = playlists.find(x => x.id === id);
  if (!p) return { ok: false, error: 'not found' };
  return { ok: true, playlist: p };
});

ipcMain.handle('playlists:add', async (event, pl) => {
  // pl: { id?, name, url, content }
  if (!pl) return { ok: false, error: 'invalid' };
  // create backup before mutating
  try { savePlaylistsBackup(); } catch (e) {}
  // ensure we have the latest
  loadPlaylists();
  // If updating existing playlist, merge to preserve existing content/created
  const existing = playlists.find(x => x.id === pl.id);
  if (existing) {
    const merged = {
      id: existing.id,
      name: typeof pl.name === 'string' ? pl.name : existing.name || '',
      url: typeof pl.url === 'string' ? pl.url : existing.url || '',
      content: (typeof pl.content === 'string' && pl.content.length) ? pl.content : existing.content || '',
      created: existing.created || new Date().toISOString()
    };
    playlists = playlists.filter(x => x.id !== merged.id);
    playlists.push(merged);
    savePlaylists();
    return { ok: true, playlist: merged };
  }
  // new playlist
  if (!pl.id) pl.id = Date.now().toString();
  pl.created = new Date().toISOString();
  pl.content = pl.content || '';
  playlists = playlists.filter(x => x.id !== pl.id);
  playlists.push(pl);
  savePlaylists();
  return { ok: true, playlist: pl };
});

ipcMain.handle('playlists:remove', async (event, id) => {
  try { savePlaylistsBackup(); } catch (e) {}
  playlists = playlists.filter(x => x.id !== id);
  savePlaylists();
  return { ok: true };
});

ipcMain.handle('playlists:update', async (event, newList) => {
  // newList: array of playlist objects { id, name, url, content, created? }
  if (!Array.isArray(newList)) return { ok: false, error: 'invalid' };
  try {
    // backup current
    try { savePlaylistsBackup(); } catch (e) {}
    playlists = newList.map(p => ({
      id: p.id || Date.now().toString(),
      name: p.name || '',
      url: p.url || '',
      content: p.content || '',
      created: p.created || new Date().toISOString()
    }));
    savePlaylists();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('playlists:export', async (event) => {
  try {
    loadPlaylists();
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '플레이리스트 내보내기',
      defaultPath: 'playlists.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    await fs.promises.writeFile(filePath, JSON.stringify(playlists, null, 2), 'utf8');
    return { ok: true, path: filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('playlists:import', async (event) => {
  try {
    const res = await dialog.showOpenDialog({
      title: '플레이리스트 가져오기',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true };
    const data = await fs.promises.readFile(res.filePaths[0], 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return { ok: false, error: 'invalid format' };
    // backup current then normalize and replace current playlists
    try { savePlaylistsBackup(); } catch (e) {}
    playlists = parsed.map(p => ({
      id: p.id || Date.now().toString(),
      name: p.name || '',
      url: p.url || '',
      content: p.content || '',
      created: p.created || new Date().toISOString()
    }));
    savePlaylists();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Favorites file save/load handlers (renderer passes/receives JSON-serializable object)
ipcMain.handle('favorites:saveFile', async (event, content) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '즐겨찾기 내보내기',
      defaultPath: 'favorites.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    // content may be object or string
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.promises.writeFile(filePath, data, 'utf8');
    return { ok: true, path: filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('favorites:loadFile', async (event) => {
  try {
    const res = await dialog.showOpenDialog({ title: '즐겨찾기 가져오기', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true };
    const data = await fs.promises.readFile(res.filePaths[0], 'utf8');
    const parsed = JSON.parse(data);
    return { ok: true, favorites: parsed };
  } catch (e) { return { ok: false, error: e.message }; }
});
