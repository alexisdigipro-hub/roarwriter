// What RoarWriter's page may ask of the Mac/Windows app: the menu's commands, a PDF to a file, Save As, updates.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rwDesktop', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('rw:version'),
  onMenu: (fn) => { const h = (_e, cmd) => fn(String(cmd)); ipcRenderer.on('rw:menu', h); return () => ipcRenderer.removeListener('rw:menu', h) },
  pdf: (html, name, pageSize) => ipcRenderer.invoke('rw:pdf', String(html), String(name), pageSize === 'Letter' ? 'Letter' : 'A4'),
  saveText: (name, text) => ipcRenderer.invoke('rw:save-text', String(name), String(text)),
  update: {
    state: () => ipcRenderer.invoke('rw:update-state'),
    check: () => ipcRenderer.invoke('rw:update-check'),
    install: () => ipcRenderer.invoke('rw:update-install'),
    on: (fn) => { const h = (_e, s) => fn(s); ipcRenderer.on('rw:update', h); return () => ipcRenderer.removeListener('rw:update', h) },
  },
})
