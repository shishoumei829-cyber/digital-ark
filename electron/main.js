'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

const APP_ROOT = path.join(__dirname, '..');
let PORT = Number(process.env.PORT) || 3000;
let SERVER_URL = `http://127.0.0.1:${PORT}`;
let mainWindow = null;
let tray = null;
let serverProcess = null;

function log(...args) {
  console.log('[数字方舟]', ...args);
}

function findFreePort(start = 3000) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > start + 20) return reject(new Error('无可用端口'));
      const srv = net.createServer();
      srv.once('error', () => tryPort(p + 1));
      srv.once('listening', () => {
        srv.close(() => resolve(p));
      });
      srv.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}

function startServer() {
  const serverPath = path.join(APP_ROOT, 'server.js');
  const env = {
    ...process.env,
    PORT: String(PORT),
    ELECTRON_RUN: '1',
    ELECTRON_RUN_AS_NODE: '1'
  };

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: APP_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  serverProcess.stdout?.on('data', d => process.stdout.write(d));
  serverProcess.stderr?.on('data', d => process.stderr.write(d));
  serverProcess.on('error', err => log('后端启动失败:', err.message));
  serverProcess.on('exit', (code) => {
    if (code && code !== 0) log('后端进程退出 code=', code);
  });
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      try {
        const res = await fetch(SERVER_URL + '/health');
        if (res.ok) return resolve();
      } catch {}
      if (++n >= retries) return reject(new Error('本地服务启动超时，请检查 3000 端口是否被占用'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 920,
    minWidth: 390,
    minHeight: 700,
    title: '数字方舟',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#fdf9f3',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(SERVER_URL + '/apps/sanctuary.html').catch(err => {
    log('页面加载失败:', err.message);
    dialog.showErrorBox('数字方舟', '无法加载界面：' + err.message);
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log('did-fail-load', code, desc);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createFromNamedImage('NSApplicationIcon', [-1]);
    if (icon.isEmpty()) return;
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('数字方舟');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
    ]));
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch (e) {
    log('托盘创建跳过:', e.message);
  }
}

app.whenReady().then(async () => {
  try {
    PORT = await findFreePort(PORT);
    SERVER_URL = `http://127.0.0.1:${PORT}`;
    log('使用端口', PORT);
    startServer();
    await waitForServer();
    createWindow();
    createTray();
  } catch (e) {
    log(e.message);
    dialog.showErrorBox('数字方舟启动失败', e.message + '\n\n请双击「启动.bat」查看详细日志，或使用浏览器模式。');
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});
