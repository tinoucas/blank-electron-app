const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Packaged apps ship their config as a resource; WEBAPP_CONFIG lets you run src/ directly.
const configPath = process.env.WEBAPP_CONFIG || path.join(process.resourcesPath, 'app-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
// The icon sits next to the config, both in apps/<id>/ and in the packaged resources.
const iconPath = path.join(path.dirname(configPath), 'icon.png');

// Give every wrapped site its own profile (cookies, storage) even in dev.
app.setName(config.name);
// "profile" keeps the original folder (and logins) when an app is renamed.
app.setPath('userData', path.join(app.getPath('appData'), config.profile || config.name));

const startHost = new URL(config.url).hostname;
const allowedHosts = [startHost, ...(config.allowedHosts || [])];

function isAllowed(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (!['https:', 'http:'].includes(protocol)) return false;
    return allowedHosts.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { width: config.width || 1280, height: config.height || 800 };
  }
}

function saveState(win) {
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

let win;

function createWindow() {
  const state = loadState();
  win = new BrowserWindow({
    ...state,
    title: config.name,
    // Window icon for Linux/Windows; Wayland compositors read it via xdg-toplevel-icon.
    ...(fs.existsSync(iconPath) && { icon: iconPath }),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));

  if (config.userAgent) win.webContents.setUserAgent(config.userAgent);

  // Keep the site in the app; send everything else to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(config.url);
}

function buildMenu() {
  const nav = (fn) => () => win && fn(win.webContents.navigationHistory);
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: nav((h) => h.canGoBack() && h.goBack()) },
        { label: 'Forward', accelerator: 'Alt+Right', click: nav((h) => h.canGoForward() && h.goForward()) },
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => win && win.loadURL(config.url) },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
