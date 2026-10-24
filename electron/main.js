// RoarWriter for Mac and Windows (The Mad Lions Lab, Oct 2026). The app itself (app/) is inside the program, so
// writing never waits for the internet; the scripts are kept on the computer and sent to the RoarMe account when
// there is a connection. The app adds what a browser cannot: a real menu with the writing shortcuts, a PDF saved
// straight to a file, Save As for Final Draft and Fountain, and updating itself from the GitHub releases.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const updater = require('./updater')

nativeTheme.themeSource = 'dark'

// the page comes from app://rw/ (the app/ folder inside the program): a real origin, so its modules load, its
// storage stays put between versions, and nothing outside app/ can be reached through it
const APP_DIR = path.join(__dirname, '..', 'app')
const HOME = 'app://rw/index.html'
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
function serveApp() {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.normalize(path.join(APP_DIR, rel))
    if (!file.startsWith(APP_DIR + path.sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
let win = null
let quitting = false

// only web and mail links leave the app, for the computer's browser
const openOutside = (url) => { if (/^(https?:|mailto:)/i.test(String(url))) shell.openExternal(url) }

const frame = process.platform === 'darwin'
  ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 21 } }
  : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#16181d', symbolColor: '#eef0f3', height: 58 } }

function open() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#16181d', autoHideMenuBar: true, ...frame,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  })
  win.loadURL(HOME)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://rw/')) { e.preventDefault(); openOutside(url) } })
  // Greek and English spelling
  try { win.webContents.session.setSpellCheckerLanguages(['el', 'en-US']) } catch { /* not on this system */ }
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.misspelledWord) return
    const items = p.dictionarySuggestions.slice(0, 6).map((s) => ({ label: s, click: () => win.webContents.replaceMisspelling(s) }))
    items.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) })
    Menu.buildFromTemplate(items).popup()
  })
  win.on('closed', () => { win = null })
}

const send = (cmd) => win?.webContents.send('rw:menu', cmd)
function menu() {
  const mac = process.platform === 'darwin'
  const cmd = mac ? 'Cmd' : 'Ctrl'
  const types = [['Scene Heading', 'scene', 1], ['Action', 'action', 2], ['Character', 'character', 3], ['Parenthetical', 'paren', 4], ['Dialogue', 'dialogue', 5], ['Transition', 'transition', 6], ['Shot', 'shot', 7], ['Unformatted Text', 'general', 0]]
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Title Page…', click: () => send('title') },
      { type: 'separator' },
      { label: 'Export PDF…', accelerator: `${cmd}+P`, click: () => send('pdf') },
      { label: 'Save as Final Draft (.fdx)…', click: () => send('fdx') },
      { label: 'Save as Fountain…', click: () => send('fountain') },
      ...(mac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ] },
    { role: 'editMenu' },
    { label: 'Format', submenu: types.map(([label, t, n]) => ({ label, accelerator: `${cmd}+${n}`, click: () => send('type:' + t) })) },
    { label: 'AI', submenu: [{ label: 'Show AI', accelerator: `${cmd}+Shift+A`, click: () => send('ai') }] },
    // the zoom is the page's, as in Final Draft (the whole window does not grow)
    { label: 'View', submenu: [
      { label: 'Zoom In', accelerator: `${cmd}+=`, click: () => send('zoom-in') },
      { label: 'Zoom Out', accelerator: `${cmd}+-`, click: () => send('zoom-out') },
      { label: 'Actual Size', accelerator: `${cmd}+Shift+0`, click: () => send('zoom-reset') },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]))
}

// the PDF: the pages the app laid out, printed to a file the person chooses
ipcMain.handle('rw:pdf', async (_e, html, name, pageSize) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (canceled || !filePath) return false
  const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  const tmp = path.join(app.getPath('temp'), `roarwriter-${Date.now()}.html`)
  fs.writeFileSync(tmp, html)
  try {
    await page.loadFile(tmp)
    await new Promise((r) => setTimeout(r, 400)) // the typeface
    const pdf = await page.webContents.printToPDF({ pageSize, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true })
    fs.writeFileSync(filePath, pdf)
    shell.showItemInFolder(filePath)
    return true
  } finally { page.destroy(); fs.rm(tmp, () => {}) }
})
// Final Draft and Fountain files
ipcMain.handle('rw:save-text', async (_e, name, text) => {
  const ext = path.extname(name).slice(1)
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: ext === 'fdx' ? 'Final Draft' : 'Fountain', extensions: [ext] }] })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, text, 'utf8')
  return true
})
ipcMain.handle('rw:version', () => app.getVersion())

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.whenReady().then(() => {
  serveApp()
  menu()
  open()
  updater.start(ipcMain, () => { quitting = true })
  app.on('activate', () => { if (!win) open() })
})
app.on('before-quit', () => { quitting = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
