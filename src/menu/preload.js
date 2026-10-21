// Bridge between the menu page and the main process (see ../context-menu.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuApi', {
  onShow: (callback) => ipcRenderer.on('show', (_event, model) => callback(model)),
  ready: (width, height) => ipcRenderer.send('ready', width, height),
  choose: (id) => ipcRenderer.send('choose', id),
  close: () => ipcRenderer.send('close'),
});
