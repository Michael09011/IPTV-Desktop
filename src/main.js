const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { session } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

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
  // Enable H.265 decoding support
  app.commandLine.appendSwitch('--enable-hevc-decoding');
  app.commandLine.appendSwitch('--enable-features', 'PlatformHEVCDecoderSupport,HEVCDecoder');
  app.commandLine.appendSwitch('--enable-accelerated-video-decode');
  app.commandLine.appendSwitch('--disable-web-security');
  app.commandLine.appendSwitch('--allow-running-insecure-content');
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
    } else {
      // First run: initialize with default playlists
      playlists = [
        { name: '샘플 플레이리스트', url: '', content: '#EXTM3U\n#EXTINF:-1,샘플 채널\nhttp://example.com/sample.m3u8' }
      ];
      savePlaylists(); // Save the initial playlists
    }
  } catch (e) { playlists = []; }
}

function savePlaylists() {
  try { fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2)); } catch (e) {}
}

loadPlaylists();

// ==================== FFmpeg 스트림 변환 관리 ====================
let ffmpegProcesses = {}; // URL -> FFmpeg 프로세스
let hlsServers = {};      // URL -> HLS 서버 정보

const net = require('net');

// 사용 가능한 포트 찾기
function findAvailablePort(startPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => findAvailablePort(startPort + 1));
  });
}

// FFmpeg 스트림 변환 (RTMP/MPEG-TS → HLS)
ipcMain.handle('start-ffmpeg-stream', async (event, url) => {
  try {
    // 이미 변환 중이면 기존 HLS URL 반환
    if (hlsServers[url]) {
      return { ok: true, hlsUrl: hlsServers[url].hlsUrl, port: hlsServers[url].port };
    }

    // RTMP/MPEG-TS 확인
    const isRtmp = url.startsWith('rtmp://');
    const isMpegTs = url.endsWith('.ts') || url.includes('.ts?');
    
    if (!isRtmp && !isMpegTs) {
      // HLS/M3U8은 직접 반환
      return { ok: true, hlsUrl: url, port: null };
    }

    // 사용 가능한 포트 찾기
    const port = await findAvailablePort();
    const hlsUrl = `http://127.0.0.1:${port}/stream.m3u8`;
    const tmpDir = path.join(app.getPath('userData'), 'hls-tmp');
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const timestamp = Date.now();
    const segmentPath = path.join(tmpDir, `seg-%03d-${timestamp}.ts`);
    const playlistFile = path.join(tmpDir, `playlist-${timestamp}.m3u8`);

    console.log(`[FFmpeg] Converting: ${url} → HLS at http://127.0.0.1:${port}`);

    // FFmpeg 프로세스 시작
    const ffmpegCmd = ffmpeg(url)
      .inputOptions([
        '-rtsp_transport', 'tcp',
        '-allowed_extensions', 'ALL',
        '-protocol_whitelist', 'file,http,https,tcp,tls,rtmp,rtp'
      ])
      .outputOptions([
        '-c:v', 'copy',           // 비디오 코덱 복사 (재인코딩 X)
        '-c:a', 'aac',            // 오디오 AAC
        '-f', 'hls',              // HLS 포맷
        '-hls_time', '2',         // 세그먼트 길이 2초
        '-hls_list_size', '5',    // 재생목록 최대 5개
        '-hls_wrap', '10',        // 순환
        '-hls_flags', 'delete_segments',
        '-start_number', '0'
      ])
      .output(playlistFile)
      .on('error', (err) => {
        console.error(`[FFmpeg] Error (${url}): ${err.message}`);
        delete ffmpegProcesses[url];
        delete hlsServers[url];
      })
      .on('end', () => {
        console.log(`[FFmpeg] Stream ended: ${url}`);
        delete ffmpegProcesses[url];
        delete hlsServers[url];
      });

    // 간단한 HTTP 서버로 HLS 파일 제공
    const http = require('http');
    const server = http.createServer((req, res) => {
      try {
        if (req.url === '/stream.m3u8') {
          const content = fs.readFileSync(playlistFile, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
          res.end(content);
        } else if (req.url.endsWith('.ts')) {
          const file = path.join(tmpDir, req.url.split('/').pop());
          if (fs.existsSync(file)) {
            res.writeHead(200, { 'Content-Type': 'video/MP2T' });
            res.end(fs.readFileSync(file));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[HLS Server] Listening on port ${port}`);
      ffmpegCmd.run();
    });

    ffmpegProcesses[url] = ffmpegCmd;
    hlsServers[url] = { port, hlsUrl, server, tmpDir };

    return { ok: true, hlsUrl, port };
  } catch (e) {
    console.error(`[FFmpeg] Error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// FFmpeg 스트림 중지
ipcMain.handle('stop-ffmpeg-stream', async (event, url) => {
  try {
    if (ffmpegProcesses[url]) {
      ffmpegProcesses[url].kill();
      delete ffmpegProcesses[url];
    }
    if (hlsServers[url]) {
      hlsServers[url].server.close();
      delete hlsServers[url];
    }
    console.log(`[FFmpeg] Stream stopped: ${url}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

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
    playlists = data.map(p => ({ id: p.id || Date.now().toString(), name: p.name||'', url: p.url||'', epgUrl: p.epgUrl||'', content: p.content||'', externalPlayerOnly: typeof p.externalPlayerOnly === 'boolean' ? p.externalPlayerOnly : false, created: p.created||new Date().toISOString() }));
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

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message } }
});

ipcMain.handle('spawn-vlc', async (event, url, vlcPath) => {
  try {
    const { spawn } = require('child_process');
    if (!vlcPath) {
      if (process.platform === 'darwin') vlcPath = '/Applications/VLC.app/Contents/MacOS/VLC';
      else if (process.platform === 'win32') vlcPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
      else vlcPath = 'vlc';
    }
    const child = spawn(vlcPath, [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (e) { return { ok: false, error: e.message } }
});

ipcMain.handle('spawn-iina', async (event, url, iinaPath) => {
  try {
    const { spawn } = require('child_process');
    if (!iinaPath) {
      if (process.platform === 'darwin') iinaPath = '/Applications/IINA.app/Contents/MacOS/IINA';
      else iinaPath = 'iina';
    }
    const child = spawn(iinaPath, [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (e) { return { ok: false, error: e.message } }
});

ipcMain.handle('kill-current-player', () => {
  if (global.currentPlayerPid) {
    try { process.kill(global.currentPlayerPid); } catch (e) {}
    global.currentPlayerPid = null;
  }
});

ipcMain.handle('set-current-player-pid', (event, pid) => {
  global.currentPlayerPid = pid;
});

// ===== MPV Player Support =====
const os = require('os');

global.mpvProcess = null;
global.mpvSocket = null;
global.mpvSocketPath = null;
global.mpvEventQueue = [];
global.mpvCmdId = 0;
global.mpvPendingRequests = new Map();

/**
 * Get mpv socket path based on platform
 */
function getMpvSocketPath() {
  const sockName = `mpv-socket-${Date.now()}`;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${sockName}`;
  } else {
    return path.join(os.tmpdir(), sockName);
  }
}

/**
 * Find mpv executable
 */
function findMpvExecutable() {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'darwin') {
      // Try brew first, then standard app
      try {
        execSync('which mpv', { stdio: 'ignore' });
        return 'mpv';
      } catch (e1) {
        try {
          execSync('ls /opt/homebrew/bin/mpv', { stdio: 'ignore' });
          return '/opt/homebrew/bin/mpv';
        } catch (e2) {
          return '/usr/local/bin/mpv';
        }
      }
    } else if (process.platform === 'win32') {
      try {
        execSync('where mpv', { stdio: 'ignore' });
        return 'mpv';
      } catch (e) {
        return 'C:\\Program Files\\mpv\\mpv.exe';
      }
    } else {
      try {
        execSync('which mpv', { stdio: 'ignore' });
        return 'mpv';
      } catch (e) {
        return '/usr/bin/mpv';
      }
    }
  } catch (e) {
    return 'mpv'; // fallback to PATH
  }
}

ipcMain.handle('spawn-mpv', async (event) => {
  try {
    const { spawn } = require('child_process');
    
    // Kill existing mpv if running
    if (global.mpvProcess) {
      try { global.mpvProcess.kill(); } catch (e) {}
      global.mpvProcess = null;
    }
    if (global.mpvSocket) {
      try { global.mpvSocket.destroy(); } catch (e) {}
      global.mpvSocket = null;
    }

    global.mpvSocketPath = getMpvSocketPath();
    const mpvExe = findMpvExecutable();

    console.log(`[IPC] Spawning mpv: ${mpvExe} with socket: ${global.mpvSocketPath}`);

    // Start mpv with JSON IPC socket
    global.mpvProcess = spawn(mpvExe, [
      `--input-ipc-server=${global.mpvSocketPath}`,
      '--no-terminal',
      '--force-window=immediate',
      '--keep-open=yes',
      '--idle=yes'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });

    if (process.platform !== 'win32') {
      global.mpvProcess.unref();
    }

    // Handle mpv process exit
    global.mpvProcess.on('exit', (code) => {
      console.log(`[IPC] mpv process exited with code ${code}`);
      global.mpvProcess = null;
      global.mpvSocket = null;
    });

    // Log stderr
    global.mpvProcess.stderr?.on('data', (data) => {
      console.log(`[mpv stderr] ${data}`);
    });

    return {
      ok: true,
      pid: global.mpvProcess.pid,
      socketPath: global.mpvSocketPath
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('connect-mpv-socket', async (event, socketPath) => {
  return new Promise((resolve) => {
    try {
      if (global.mpvSocket) {
        try { global.mpvSocket.destroy(); } catch (e) {}
      }

      const client = net.createConnection(socketPath);

      client.on('connect', () => {
        console.log('[IPC] Connected to mpv socket');
        global.mpvSocket = client;

        // Listen for data
        client.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const evt = JSON.parse(line);
                global.mpvEventQueue.push(evt);
              } catch (e) {
                console.error('[IPC] Parse error:', e.message);
              }
            }
          }
        });

        client.on('error', (e) => {
          console.error('[IPC] Socket error:', e.message);
          global.mpvSocket = null;
        });

        client.on('end', () => {
          console.log('[IPC] Socket closed');
          global.mpvSocket = null;
        });

        resolve({ ok: true });
      });

      client.on('error', (e) => {
        console.error('[IPC] Connection error:', e.message);
        resolve({ ok: false, error: e.message });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!global.mpvSocket) {
          client.destroy();
          resolve({ ok: false, error: 'Connection timeout' });
        }
      }, 10000);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
});

ipcMain.handle('send-mpv-command', async (event, request) => {
  try {
    if (!global.mpvSocket || !global.mpvSocket.writable) {
      return { ok: false, error: 'Socket not connected' };
    }

    const line = JSON.stringify(request) + '\n';
    global.mpvSocket.write(line);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-mpv-events', async (event) => {
  try {
    const events = global.mpvEventQueue.splice(0);
    return events;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('kill-mpv', async (event, pid) => {
  try {
    if (global.mpvProcess) {
      try { global.mpvProcess.kill(); } catch (e) {}
      global.mpvProcess = null;
    }
    if (global.mpvSocket) {
      try { global.mpvSocket.destroy(); } catch (e) {}
      global.mpvSocket = null;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('win-resize', async (event, w, h) => {
  if (win) win.setSize(w, h);
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

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      experimentalFeatures: {
        webkit: {
          webRTC: true,
          webGL: true
        },
        modules: true
      }
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

// helper used internally when we need to pull remote playlist data
async function fetchUrlContent(url) {
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
      req.setTimeout(10000, () => {
        req.abort();
        resolve({ ok: false, error: 'timeout' });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

ipcMain.handle('playlists:list', async () => {
  loadPlaylists();

  // attempt to refresh any playlists that have a remote HTTP(S) URL.
  // this will run synchronously so the first call from the renderer
  // (typically on startup) will include updated data.  If a fetch
  // fails we silently ignore it.
  let changed = false;
  const tasks = playlists.map(async (p) => {
    if (p.url && /^https?:\/\//.test(p.url)) {
      try {
        const r = await fetchUrlContent(p.url);
        if (r.ok && typeof r.content === 'string' && r.content !== p.content) {
          p.content = r.content;
          changed = true;
        }
      } catch (e) {
        // ignore individual fetch errors
      }
    }
  });
  try { await Promise.all(tasks); } catch(e){}
  if (changed) savePlaylists();

  return { playlists: playlists.map(p => ({ id: p.id, name: p.name, url: p.url, epgUrl: p.epgUrl, externalPlayerOnly: p.externalPlayerOnly, created: p.created })), changed };
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
      epgUrl: typeof pl.epgUrl === 'string' ? pl.epgUrl : existing.epgUrl || '',
      content: (typeof pl.content === 'string' && pl.content.length) ? pl.content : existing.content || '',
      externalPlayerOnly: typeof pl.externalPlayerOnly === 'boolean' ? pl.externalPlayerOnly : existing.externalPlayerOnly || false,
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
  pl.epgUrl = pl.epgUrl || '';
  pl.content = pl.content || '';
  pl.externalPlayerOnly = pl.externalPlayerOnly || false;
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
  // newList: array of playlist objects { id, name, url, content, epgUrl?, externalPlayerOnly?, created? }
  if (!Array.isArray(newList)) return { ok: false, error: 'invalid' };
  try {
    // backup current
    try { savePlaylistsBackup(); } catch (e) {}
    playlists = newList.map(p => ({
      id: p.id || Date.now().toString(),
      name: p.name || '',
      url: p.url || '',
      epgUrl: p.epgUrl || '',
      content: p.content || '',
      externalPlayerOnly: typeof p.externalPlayerOnly === 'boolean' ? p.externalPlayerOnly : false,
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
      epgUrl: p.epgUrl || '',
      content: p.content || '',
      externalPlayerOnly: typeof p.externalPlayerOnly === 'boolean' ? p.externalPlayerOnly : false,
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
