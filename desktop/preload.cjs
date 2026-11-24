const { contextBridge } = require('electron');

// Exposes a clean marker so Dayplana knows it is running inside the native Desktop App
contextBridge.exposeInMainWorld('dayplanaDesktop', {
  isDesktop: true,
  platform: process.platform,
});
