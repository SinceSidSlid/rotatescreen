const { app, BrowserWindow, globalShortcut, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server');
const fs = require('fs');

let mainWindow;

const DEFAULT_CONFIG = {
  calendarIntervalSeconds: 30,
  noteIntervalSeconds: 10,
  calendarEmbedUrl: 'https://calendar.google.com/calendar',
  port: 3000,
};

function ensureDataFiles() {
  const configPath = path.join(__dirname, 'config.json');
  const notesPath = path.join(__dirname, 'notes.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
  if (!fs.existsSync(notesPath)) {
    fs.writeFileSync(notesPath, '[]', 'utf-8');
  }
}

function loadConfig() {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
}

function createWindow() {
  const config = loadConfig();

  const isDev = process.env.NODE_ENV === 'development';

  mainWindow = new BrowserWindow({
    fullscreen: !isDev,
    frame: isDev,
    kiosk: !isDev,
    autoHideMenuBar: true,
    width: isDev ? 1280 : undefined,
    height: isDev ? 720 : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Handle webview new-window requests (Google sign-in popups)
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      // Open any Google URL in a new Electron window with the same session
      const authWin = new BrowserWindow({
        width: 600,
        height: 750,
        parent: mainWindow,
        webPreferences: {
          partition: 'persist:google',
        },
      });
      authWin.loadURL(url);
      authWin.on('closed', () => {
        // Reload the webview directly
        webContents.loadURL(webContents.getURL());
      });
      return { action: 'deny' };
    });

    // Also handle in-page navigation to sign-in
    webContents.on('will-navigate', (event, url) => {
      if (url.includes('accounts.google.com')) {
        event.preventDefault();
        const authWin = new BrowserWindow({
          width: 600,
          height: 750,
          parent: mainWindow,
          webPreferences: {
            partition: 'persist:google',
          },
        });
        authWin.loadURL(url);
        authWin.on('closed', () => {
          webContents.loadURL(webContents.getURL());
        });
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function tryStartServer(port) {
  try {
    await startServer(port);
    console.log('Server started on port', port);
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${port} already in use — assuming standalone server is running`);
    } else {
      throw e;
    }
  }
}

app.whenReady().then(async () => {
  const config = loadConfig();
  await tryStartServer(config.port || 3000);
  createWindow();

  globalShortcut.register('Escape', () => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
