/**
 * MPV Player Adapter
 * Communicates with external mpv process via JSON-IPC
 * Supports: HLS, DASH, RTMP, MPEG-TS, and more
 */

class MPVAdapter {
  constructor() {
    this.ipcSocket = null;
    this.isConnected = false;
    this.cmdId = 0;
    this.pendingCmds = new Map();
    this.eventListeners = {};
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1500;
  }

  /**
   * Initialize mpv process (spawn external process)
   */
  async init() {
    try {
      console.log('[MPV] Initializing mpv adapter...');
      const res = await window.electronAPI.spawnMpv();
      if (!res.ok) {
        throw new Error(res.error || 'Failed to spawn mpv');
      }
      this.mpvPid = res.pid;
      this.socketPath = res.socketPath;
      console.log(`[MPV] Process spawned: PID=${this.mpvPid}, socket=${this.socketPath}`);
      
      // Give mpv a moment to start up
      await new Promise(r => setTimeout(r, 500));
      await this._connectToSocket();
      this.isConnected = true;
      this.retryCount = 0;
      console.log('[MPV] Connected to mpv socket');
      return true;
    } catch (e) {
      console.error('[MPV] Init failed:', e.message);
      throw e;
    }
  }

  /**
   * Connect to mpv IPC socket (via Electron IPC)
   */
  async _connectToSocket() {
    try {
      const res = await window.electronAPI.connectMpvSocket(this.socketPath);
      if (!res.ok) {
        throw new Error(res.error || 'Socket connection failed');
      }
      console.log('[MPV] Socket connected');
      // Start listening for events
      this._startEventListener();
    } catch (e) {
      console.error('[MPV] Socket connection failed:', e.message);
      throw e;
    }
  }

  /**
   * Load a media file/stream URL
   * @param {string} url - Stream URL (HLS, DASH, RTMP, etc.)
   */
  async loadFile(url) {
    try {
      console.log(`[MPV] Loading: ${url}`);
      await this._sendCommand('loadfile', [url]);
      return true;
    } catch (e) {
      console.error('[MPV] Load file error:', e.message);
      throw e;
    }
  }

  /**
   * Play the current media
   */
  async play() {
    try {
      await this._sendCommand('set_property', ['pause', false]);
      return true;
    } catch (e) {
      console.error('[MPV] Play error:', e.message);
      throw e;
    }
  }

  /**
   * Pause the current media
   */
  async pause() {
    try {
      await this._sendCommand('set_property', ['pause', true]);
      return true;
    } catch (e) {
      console.error('[MPV] Pause error:', e.message);
      throw e;
    }
  }

  /**
   * Stop playback and unload current file
   */
  async stop() {
    try {
      await this._sendCommand('stop', []);
      return true;
    } catch (e) {
      console.error('[MPV] Stop error:', e.message);
    }
  }

  /**
   * Set playback volume (0-100)
   */
  async setVolume(vol) {
    try {
      const v = Math.max(0, Math.min(100, parseInt(vol) || 50));
      await this._sendCommand('set_property', ['volume', v]);
      return true;
    } catch (e) {
      console.error('[MPV] Volume error:', e.message);
    }
  }

  /**
   * Seek to position in seconds
   */
  async seek(seconds) {
    try {
      await this._sendCommand('seek', [parseInt(seconds) || 0, 'absolute']);
      return true;
    } catch (e) {
      console.error('[MPV] Seek error:', e.message);
    }
  }

  /**
   * Get current playback position (seconds)
   */
  async getPosition() {
    try {
      const res = await this._sendCommand('get_property', ['time-pos']);
      return res ? parseFloat(res) : 0;
    } catch (e) {
      console.error('[MPV] Position error:', e.message);
      return 0;
    }
  }

  /**
   * Get media duration (seconds)
   */
  async getDuration() {
    try {
      const res = await this._sendCommand('get_property', ['duration']);
      return res ? parseFloat(res) : 0;
    } catch (e) {
      console.error('[MPV] Duration error:', e.message);
      return 0;
    }
  }

  /**
   * Set subtitle file
   */
  async setSubtitle(path) {
    try {
      await this._sendCommand('sub_add', [path]);
      return true;
    } catch (e) {
      console.error('[MPV] Subtitle error:', e.message);
    }
  }

  /**
   * Change audio track
   */
  async setAudioTrack(trackId) {
    try {
      await this._sendCommand('set_property', ['aid', trackId]);
      return true;
    } catch (e) {
      console.error('[MPV] Audio track error:', e.message);
    }
  }

  /**
   * Send low-level command to mpv
   * @private
   */
  async _sendCommand(command, args = []) {
    if (!this.isConnected) {
      throw new Error('MPV not connected');
    }

    const cmdId = ++this.cmdId;
    const request = {
      command: [command, ...args],
      request_id: cmdId
    };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingCmds.delete(cmdId);
        reject(new Error(`Command timeout: ${command}`));
      }, 5000);

      // Store pending command
      this.pendingCmds.set(cmdId, { resolve, reject, timeoutId });

      // Send via IPC
      window.electronAPI.sendMpvCommand(request).catch(e => {
        this.pendingCmds.delete(cmdId);
        clearTimeout(timeoutId);
        reject(e);
      });
    });
  }

  /**
   * Listen for mpv events
   * @private
   */
  _startEventListener() {
    // Poll for events via IPC
    const pollEvents = async () => {
      if (!this.isConnected) return;
      
      try {
        const events = await window.electronAPI.getMpvEvents();
        if (events && events.length > 0) {
          for (const evt of events) {
            this._handleEvent(evt);
          }
        }
      } catch (e) {
        console.error('[MPV] Event poll error:', e.message);
      }

      // Schedule next poll
      setTimeout(pollEvents, 100);
    };

    pollEvents();
  }

  /**
   * Handle incoming mpv event
   * @private
   */
  _handleEvent(evt) {
    // Handle response to our commands
    if (evt.request_id !== undefined) {
      const pending = this.pendingCmds.get(evt.request_id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingCmds.delete(evt.request_id);
        
        if (evt.error === 'success') {
          pending.resolve(evt.data);
        } else {
          pending.reject(new Error(evt.error || 'Command failed'));
        }
      }
      return;
    }

    // Handle events
    const eventType = evt.event;
    if (eventType === 'file-loaded') {
      this._emit('file-loaded');
    } else if (eventType === 'playback-restart') {
      this._emit('playback-restart');
    } else if (eventType === 'pause') {
      this._emit('pause', evt.data);
    } else if (eventType === 'unpause') {
      this._emit('unpause');
    } else if (eventType === 'seek') {
      this._emit('seek', evt.data);
    } else if (eventType === 'end-file') {
      this._emit('end-file', evt.data);
    }
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Emit event to listeners
   * @private
   */
  _emit(event, data) {
    const listeners = this.eventListeners[event] || [];
    for (const cb of listeners) {
      try {
        cb(data);
      } catch (e) {
        console.error(`[MPV] Event handler error for ${event}:`, e);
      }
    }
  }

  /**
   * Disconnect and kill mpv process
   */
  async disconnect() {
    try {
      this.isConnected = false;
      await window.electronAPI.killMpv(this.mpvPid);
      console.log('[MPV] Disconnected');
      return true;
    } catch (e) {
      console.error('[MPV] Disconnect error:', e.message);
    }
  }
}

// Export global instance
window.MPVAdapter = MPVAdapter;
