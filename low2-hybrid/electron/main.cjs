/**
 * Proceso principal de Electron para el Estudio 3D de LOW 2.0.
 * Carga el renderer construido por Vite (dist/renderer). El renderer es una app
 * web pura (Three.js) → sin integración de Node, contextIsolation activo.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0e0f13',
    title: 'LOW 2.0 — Estudio 3D',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);

  // dev: si se define LOW_DEV_URL, carga el server de Vite; si no, el build local
  const devUrl = process.env.LOW_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }
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
