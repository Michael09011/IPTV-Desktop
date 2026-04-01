# IPTV-Desktop App v0.1.3 - Cross Platform (Mac OS, Win OS, Linux)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://shields.io/)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-26.0.0-9feaf9.svg)](https://www.electronjs.org/)
[![MPV Support](https://img.shields.io/badge/mpv-player-important.svg)](https://mpv.io/)
[![Release](https://img.shields.io/badge/release-download-brightgreen.svg)](https://github.com/Michael09011/IPTV-Desktop/releases/tag/IPTV-Desktop)
[![Mobile App](https://img.shields.io/badge/Mobile%20App-View%20on%20GitHub-blue)](https://github.com/Michael09011/IPTV-Mobile-APP)
[![Korean](https://img.shields.io/badge/Korean-README-blue)](README.ko.md)
[![Japanese](https://img.shields.io/badge/Japanese-README-blue)](README.ja.md)

<img width="200" height="200" alt="IPTV-Desktop App Icon" src="build/icon.png" />

Electron-based IPTV desktop app (playlist loading, channel playback, MPV/VLC player support, EPG, auto backup, Japanese broadcast support, etc.).

## 🏗️ Tech Stack

### 🖥️ Frontend
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-191970?style=flat-square&logo=electron&logoColor=white)

- **Renderer Process**: HTML5 + CSS3 + Vanilla JavaScript
- **HLS.js**: HLS/M3U8 stream playback
- **Shaka Player**: DASH and SmoothStreaming support
- **Video.js**: Video player framework
- **MPV Adapter**: JSON-IPC controlled mpv player support (RTMP, MPEG-TS, etc.)
- **UI Framework**: Electron Renderer Process
- **Location**: `app/` directory

### ⚙️ Backend
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron%20Main-191970?style=flat-square&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

- **Main Process**: Node.js + Electron Main Process
- **API**: Preload Scripts & IPC Communication
- **mpv Integration**: External mpv process control (JSON-IPC socket)
- **Location**: `src/` directory

## 📺 Player Support

### Internal Players
- **HLS.js**: M3U8, HLS streams (default)
- **Shaka Player**: DASH, SmoothStreaming
- **Video.js**: General video player
- **Native HTML5 Video**: MP4, WebM, Ogg

### MPV Player (New Feature!)

- **External Process Execution**: MPV player runs as a separate external process.
- **JSON-IPC Control**: Controlled from Electron main process via JSON-IPC socket.
- **Multiple Format Support**: RTMP, MPEG-TS, HLS, DASH, and various stream formats.
- **High Performance Playback**: Hardware acceleration and advanced video filtering.
- **Settings**: External player path can be specified, with automatic default path detection.

## 🎨 App Icon

App icons are read from `build/icon.ico` (Windows) and `build/icon.icns` (macOS). To generate a default TV-style icon automatically, run `python generate_icon.py` (requires `pip install pillow`).

To create icons manually:
1. Draw a TV silhouette in PNG format (1024×1024px or larger).
2. For `.ico`: Use [icoconvert.com](https://icoconvert.com/) or ImageMagick/`convert`. For `.icns`: Use macOS `iconutil`.
3. Place generated files in `build/` and commit; they will be included in builds automatically.

> Build settings already point to `build/icon.ico` and `build/icon.icns` in `package.json`.

## 📥 Download

Download the latest release:

🔗 **[Go to Release Page](https://github.com/Michael09011/IPTV-Desktop/releases/tag/IPTV-Desktop)**

- 🍎 **macOS**: DMG file
- 🪟 **Windows**: NSIS installer

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Run in Development Mode**
   ```bash
   npm start
   ```

3. **Settings Menu**
   - Specify EPG URL per playlist
   - Enable/disable EPG feature
   - Set M3U and EPG auto-refresh intervals (6/12/24 hours)
   - Toast notifications for auto-refresh completion/failure
   - GPU, cache, auto backup/refresh options
   - Network buffer: Auto/manual mode, adjust buffer length in manual mode (default 30s, recommended 60~120s)
   - External player: Specify path for VLC or other external players (auto-detect default path, manual input possible)
   - Language change option: Switch app UI language to Korean/English/Japanese, etc. (added in v0.1.3)

3. **Platform-Specific Build Testing** (Common settings applied for Windows/macOS)
   ```bash
   # Windows only: NSIS installer + portable
   npm run dist:win
   
   # macOS only (must run on Mac)
   npm run dist:mac
   
   # Both platforms (run on Mac)
   npm run dist:all
   ```

## 📦 Building Bundles (For Distribution)

### 🪟 Windows
- Installer (NSIS) + Portable
  ```bash
  npm run dist:win
  # Output: dist/IPTV-Desktop Setup 0.1.0.exe
  #         dist/IPTV-Desktop-Portable.exe
  ```

### 🍎 macOS (build tool must run on macOS)
- Default DMG (x64)
  ```bash
  npm run dist:mac
  # Output: dist/IPTV-Desktop-Mac-0.1.0.dmg
  ```
- Universal (x64 + arm64)
  ```bash
  npx electron-builder --mac --x64 --arm64
  ```

### 🌍 All Platforms
- Running on macOS builds for both platforms:
  ```bash
  npm run dist:all
  ```

## 🔍 App Execution / Inspection
- Open DMG (installer window): `open dist/IPTV-Desktop-0.1.0.dmg`
- Run .app directly: `open dist/IPTV-Desktop.app`
- Check app internal resources: `ls -la dist/IPTV-Desktop.app/Contents/Resources/app`

## ⚠️ Important Behavior / Notes

- **Playlist Initialization on First Run**
  - Packaged (bundled) apps initialize existing `playlists.json` to an empty array on first run.
  - Initialization happens only once, creating a `playlists_cleared_v1` (sentinel) file in the user data folder to prevent re-initialization.
  - To re-verify initialization in development, delete the sentinel file from the app's `userData` folder.

- **Sidebar Toggle**
  - Fixed toggle button (◀/▶) in top-left corner. Clicking toggles sidebar expand/collapse.
  - Toggle updates layout directly without interrupting video playback.

- **Code Signing / Notarization**
  - Current builds are not code-signed. For distribution (including outside App Store), sign with Apple Developer account's Developer ID certificate and notarize.
  - Refer to electron-builder docs (https://www.electron.build/code-signing) for electron-builder settings and certificate preparation.

## 🐛 Debugging/Logs
- During development, check console logs in the terminal running `npm start` and developer tools (Inspect).

## 📂 Project Structure

- **Frontend**: `app/` (HTML, CSS, Vanilla JavaScript)
- **Backend**: `src/` (Main Process, Preload Scripts)
- **Build Output**: `dist/` (`.dmg`, `.exe`, etc.)
- **Resources**: `assets/`, `build/` (icons, etc.)

## 🔐 Authentication for Streams

HTTP headers can be added for specific URL patterns.

```javascript
// Add Authorization header
window.electronAPI.authSet({
  pattern: 'example.com',
  useRegex: false,
  headers: { Authorization: 'Bearer TOKEN' }
});

// List configured authentications
window.electronAPI.authList().then(console.log);
```

## 💻 System Requirements

- **macOS**: 10.13+
- **Windows**: Windows 7+
- **Node.js**: 18.0.0+
- **Disk Space**: Minimum 200MB

## ⭐ Favorites Feature Usage

- **Add to Favorites**: Click the star (☆) button in the channel list to add to favorites. Added items show filled star (★).
- **Manage Favorites**: Click `Favorites (N)` button in the left sidebar to open favorites management modal. Edit name/group or play/delete items.
- **Search/Filter**: Enter multiple tokens in search box on channel screen to filter items containing all tokens in name/group/TVG/URL. Check `Favorites only` to filter to favorites.
- **EPG Feature**: Current broadcast info shown for each channel. Can be enabled/disabled in settings, EPG URL specifiable per playlist.
- **Auto Refresh**: Set M3U and EPG data auto-refresh every 6/12/24 hours. Toast notifications on refresh.
- **Export/Import**: Export/import favorites list as JSON (browser download).
- **File Sync**: Added save/load to system files. Use `Save to File` / `Load from File` buttons to save/load directly to local files.

## 🧪 Simple Testing

1. **Run App**:
   ```bash
   npm start
   ```
2. **Load Playlist**: Click `Load` in top-left to load m3u file or URL.
3. **Enter Channel Screen**: Click `View Channels` on playlist.
4. **Add/Remove Favorites**: Click star button on channel items to add/remove.
5. **Save/Load Favorites File**: Use `Save to File` button to save favorites.json, `Load from File` to reload.

## 📱 Windows MPV Installation and Usage Guide

To use MPV player on Windows, follow these steps.

1. Install MPV
   - Using Chocolatey:
     - Run `choco install mpv` in admin PowerShell
   - Using Scoop:
     - `scoop install mpv`
   - Or download Windows build from https://mpv.io/ and extract
2. Verify MPV Path
   - Copy `mpv.exe` location.
   - Example: `C:\Program Files\mpv\mpv.exe`
3. Configure in IPTV-Desktop
   - Click settings button
   - Enable "Use External Player"
   - Enter `mpv.exe` path as external player path
4. Test MPV Playback
   - Select channel from playlist and play
   - If issues, recheck path and permissions

Additional Tips:
- Use `mpv.conf` to adjust buffer, cache, subtitles, etc.
- If UAC permission issues on Windows, run as administrator.

---

## 📝 License

© 2026 Michael. All rights reserved.

MIT License - see LICENSE file for details

---

If you have issues or want additional improvements (group folder tree, remote sync, etc.), please open an issue.
