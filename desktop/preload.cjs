const { contextBridge, ipcRenderer } = require('electron');

// Exposes a strict, sandboxed desktop bridge so Planaday detects native Desktop mode,
// opens additional windows, triggers native printing, and receives OS-associated PDF/.dmtheme files.
contextBridge.exposeInMainWorld('dayplanaDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '4.2.0',
  openNewWindow: () => ipcRenderer.invoke('planaday:new-window'),
  printCurrentWindow: () => ipcRenderer.invoke('planaday:print'),
  onOpenFile: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('planaday:open-file', listener);
    return () => ipcRenderer.removeListener('planaday:open-file', listener);
  },
});
