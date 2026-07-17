const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');

const DEV = process.env.NODE_ENV === 'development' || !app.isPackaged;
const OVERLAY_WIDTH = 380;
const OVERLAY_MAX_WIDTH = 600;

let mainWindow = null;

function positionTopRight(win) {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const bounds = win.getBounds();
  const x = screenWidth - bounds.width - 16;
  const y = 60;
  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: 40,
    minWidth: 200,
    minHeight: 30,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    focusable: true,
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.setContentProtection(true);
  mainWindow.setAlwaysOnTop(true, 'floating');

  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setHiddenInMissionControl(true);
  }

  mainWindow.once('ready-to-show', () => {
    positionTopRight(mainWindow);
    mainWindow.showInactive();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function updateContentDimensions(width, height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [cx, cy] = mainWindow.getPosition();
  const newWidth = Math.min(width + 32, OVERLAY_MAX_WIDTH);
  const newHeight = Math.ceil(height);
  mainWindow.setBounds({ x: cx, y: cy, width: newWidth, height: newHeight });
}

ipcMain.handle('update-content-dimensions', (_, dimensions) => {
  updateContentDimensions(dimensions.width, dimensions.height);
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('set-always-on-top', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value);
});

ipcMain.handle('show-save-dialog', async (_, defaultName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Lecture Notes',
    defaultPath: defaultName || 'openpen-notes.pdf',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  return result;
});

app.whenReady().then(() => {
  createWindow();
  app.dock?.hide();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

module.exports = { updateContentDimensions };
