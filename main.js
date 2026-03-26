const { app, BrowserWindow, globalShortcut, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server');
const fs = require('fs');

let mainWindow;

function loadConfig() {
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
    width: isDev ? 1024 : undefined,
    height: isDev ? 768 : undefined,
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
