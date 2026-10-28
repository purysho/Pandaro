const { app, BrowserWindow, shell } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

function createWindow() {
  const indexPath = join(__dirname, '..', 'dist', 'index.html');
  const localUrl = pathToFileURL(indexPath).href;
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: 'Pandaro',
    autoHideMenuBar: true,
    backgroundColor: '#f7f3ea',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.on('will-navigate', (event, destination) => {
    if (destination !== localUrl) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore malformed or non-web targets.
    }
    return { action: 'deny' };
  });

  void window.loadFile(indexPath);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
