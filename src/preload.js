const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  fetchUrl: (url) => ipcRenderer.invoke('fetch:url', url),
  authSet: (rule) => ipcRenderer.invoke('auth:set', rule),
  authList: () => ipcRenderer.invoke('auth:list'),
  authRemove: (id) => ipcRenderer.invoke('auth:remove', id),
  playlistsList: () => ipcRenderer.invoke('playlists:list'),
  playlistsAdd: (pl) => ipcRenderer.invoke('playlists:add', pl),
  playlistsRemove: (id) => ipcRenderer.invoke('playlists:remove', id),
  playlistsGet: (id) => ipcRenderer.invoke('playlists:get', id),
  playlistsUpdate: (list) => ipcRenderer.invoke('playlists:update', list),
  playlistsExport: () => ipcRenderer.invoke('playlists:export'),
  playlistsImport: () => ipcRenderer.invoke('playlists:import')
  ,playlistsBackups: () => ipcRenderer.invoke('playlists:backups')
  ,playlistsRestore: (filename) => ipcRenderer.invoke('playlists:restore', filename)
  ,playlistsCreateBackup: () => ipcRenderer.invoke('playlists:createBackup'),
  playlistsOpenBackupDir: () => ipcRenderer.invoke('playlists:openBackupDir')
  ,favoritesSaveFile: (content) => ipcRenderer.invoke('favorites:saveFile', content)
  ,favoritesLoadFile: () => ipcRenderer.invoke('favorites:loadFile')
  ,settingsGet: () => ipcRenderer.invoke('settings:get')
  ,settingsSet: (obj) => ipcRenderer.invoke('settings:set', obj)
  ,appRestart: () => ipcRenderer.invoke('app:restart')
});
