const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  updateContentDimensions: (dimensions) => ipcRenderer.invoke('update-content-dimensions', dimensions),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  getDesktopSources: () => desktopCapturer.getSources({ types: ['screen'], fetchStream: false }),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
});
