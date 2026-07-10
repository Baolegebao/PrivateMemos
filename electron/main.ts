import { app, BrowserWindow, Menu, Tray, clipboard, dialog, globalShortcut, ipcMain, nativeImage, shell, type OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { clearDataStoreDirectory, getDataStoreStatus, loadAppData, saveAppData, setDataStoreDirectory } from './dataStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pinnedWindows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
let clipboardShortcut = '';
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

ipcMain.handle('data:load', () => loadAppData());
ipcMain.handle('data:save', (_event, payload: string) => saveAppData(payload));
ipcMain.handle('data:status', () => getDataStoreStatus());
ipcMain.handle('data:setDirectory', (_event, directory: string, payload?: string) => setDataStoreDirectory(directory, payload));
ipcMain.handle('data:clearDirectory', (_event, payload?: string) => clearDataStoreDirectory(payload));
ipcMain.handle('file:chooseDirectory', () => chooseDirectory());
ipcMain.handle('file:saveFiles', (_event, files: Array<{ filename: string; content: Uint8Array | number[] }>, directory?: string) => saveFiles(files, directory));
ipcMain.handle('window:pinNote', (_event, payload: { title: string; body: string }) => createPinnedNoteWindow(payload));
ipcMain.handle('clipboard:read', () => readClipboardSnapshot());
ipcMain.handle('clipboard:defaultDirectory', () => getClipboardDefaultDirectory());
ipcMain.handle('clipboard:chooseDirectory', () => chooseDirectory());
ipcMain.handle('clipboard:saveImage', (_event, dataUrl: string, directory?: string) => saveClipboardImage(dataUrl, directory));
ipcMain.handle('clipboard:saveText', (_event, text: string, kind: 'text' | 'link', directory?: string) => saveClipboardText(text, kind, directory));
ipcMain.handle('clipboard:writeText', (_event, text: string) => writeClipboardText(text));
ipcMain.handle('clipboard:writeImage', (_event, source: string) => writeClipboardImage(source));
ipcMain.handle('clipboard:registerShortcut', (_event, accelerator: string) => registerClipboardShortcut(accelerator));
ipcMain.handle('file:openPath', (_event, targetPath: string) => shell.openPath(targetPath));
ipcMain.handle('app:getLaunchAtLogin', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('app:setLaunchAtLogin', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  return app.getLoginItemSettings().openAtLogin;
});

async function chooseDirectory() {
  const parent = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = { title: '选择保存目录', properties: ['openDirectory', 'createDirectory'] };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

async function saveFiles(files: Array<{ filename: string; content: Uint8Array | number[] }>, directory?: string) {
  const targetDirectory = directory?.trim() || await chooseDirectory();
  if (!targetDirectory) return { canceled: true, paths: [] };
  await fs.mkdir(targetDirectory, { recursive: true });
  const paths = [];
  for (const file of files) {
    const filePath = path.join(targetDirectory, path.basename(file.filename));
    await fs.writeFile(filePath, Buffer.from(file.content));
    paths.push(filePath);
  }
  return { canceled: false, paths };
}

function readClipboardSnapshot() {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const dataUrl = image.toDataURL();
    return { kind: 'image', dataUrl, signature: `image:${hash(dataUrl)}` };
  }

  const text = clipboard.readText().trim();
  if (!text) return { kind: 'empty' };
  return { kind: 'text', text, signature: `text:${hash(text)}` };
}

async function saveClipboardImage(dataUrl: string, directory?: string) {
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw new Error('Clipboard image is empty.');
  const targetDirectory = directory?.trim() || getClipboardDefaultDirectory();
  await fs.mkdir(targetDirectory, { recursive: true });
  const filePath = path.join(targetDirectory, `clipboard-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await fs.writeFile(filePath, image.toPNG());
  return { path: filePath };
}

async function saveClipboardText(text: string, kind: 'text' | 'link', directory?: string) {
  const targetDirectory = directory?.trim() || getClipboardDefaultDirectory();
  await fs.mkdir(targetDirectory, { recursive: true });
  const filePath = path.join(targetDirectory, `clipboard-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  await fs.writeFile(filePath, text, 'utf8');
  return { path: filePath };
}

function writeClipboardText(text: string) {
  clipboard.writeText(text);
  return { signature: `text:${hash(text)}` };
}

function writeClipboardImage(source: string) {
  const filePath = source.startsWith('file:///') ? decodeURIComponent(source.replace('file:///', '').replace(/\//g, path.sep)) : source;
  const image = source.startsWith('data:') ? nativeImage.createFromDataURL(source) : nativeImage.createFromPath(filePath);
  if (image.isEmpty()) throw new Error('Clipboard image is empty.');
  const dataUrl = image.toDataURL();
  clipboard.writeImage(image);
  return { signature: `image:${hash(dataUrl)}` };
}

function getClipboardDefaultDirectory() {
  const baseDirectory = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
  return path.join(baseDirectory, 'Private Memos Clipboard');
}

function normalizeAccelerator(value: string) {
  return value.trim().replace(/\s+/g, '').replace(/Control/gi, 'Ctrl').replace(/\+/g, '+');
}

function registerClipboardShortcut(accelerator: string) {
  const next = normalizeAccelerator(accelerator);
  if (!next) return { ok: false, accelerator: next, message: '快捷键不能为空。' };
  const previous = clipboardShortcut;
  if (clipboardShortcut) globalShortcut.unregister(clipboardShortcut);
  const ok = globalShortcut.register(next, () => showClipboardWindow());
  if (ok) {
    clipboardShortcut = next;
    return { ok: true, accelerator: next };
  }
  if (previous) {
    const restored = globalShortcut.register(previous, () => showClipboardWindow());
    clipboardShortcut = restored ? previous : '';
  } else {
    clipboardShortcut = '';
  }
  return { ok: false, accelerator: next, message: `快捷键 ${next} 注册失败，可能已被系统或其他软件占用。` };
}

function hash(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function createPinnedNoteWindow(payload: { title: string; body: string }) {
  const noteWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 280,
    minHeight: 260,
    title: payload.title || '钉住笔记',
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  pinnedWindows.add(noteWindow);
  noteWindow.on('closed', () => pinnedWindows.delete(noteWindow));
  void noteWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPinnedNoteHtml(payload))}`);
  return { ok: true };
}

function buildPinnedNoteHtml({ title, body }: { title: string; body: string }) {
  const content = renderPinnedNoteContent(body);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:14px;font-family:Inter,"Microsoft YaHei",sans-serif;background:#1c2d23;color:#f4efd8;}
    h1{font-size:18px;margin:0 0 12px;color:#f4efd8;}
    main{white-space:normal;line-height:1.7;font-size:14px;user-select:text;}
    img{max-width:100%;border-radius:8px;margin:8px 0;display:block;}
  </style></head><body><h1>${escapeHtml(title || '无标题')}</h1><main>${content}</main></body></html>`;
}

export function renderPinnedNoteContent(body: string) {
  const imagePattern = /!\[图片\]\(((?:data:image\/|file:\/\/\/)[^)]+)\)/g;
  let cursor = 0;
  const parts: string[] = [];
  for (const match of body.matchAll(imagePattern)) {
    parts.push(escapeHtml(body.slice(cursor, match.index)).replace(/\n/g, '<br />'));
    parts.push(`<img src="${escapeHtml(match[1])}" alt="笔记图片" />`);
    cursor = (match.index ?? 0) + match[0].length;
  }
  parts.push(escapeHtml(body.slice(cursor)).replace(/\n/g, '<br />'));
  return parts.join('');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

async function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Private Memos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = win;
  ensureTray();
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = undefined;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (process.env.ELECTRON_SMOKE_TEST === '1') {
    const result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
      const startedAt = Date.now();
      const read = () => ({
        title: document.title,
        text: document.body.innerText.slice(0, 2000),
        rootChildren: document.getElementById('root')?.children.length ?? 0,
        fields: document.querySelectorAll('input, textarea, select').length,
        hasDesktopBridge: Boolean(window.assistantApp?.clipboard?.chooseDirectory),
        hasHome: document.body.innerText.includes('首页'),
        hasNotes: document.body.innerText.includes('记事'),
        hasLedger: document.body.innerText.includes('记账'),
        hasSettings: document.body.innerText.includes('设置')
      });
      const tick = () => {
        const result = read();
        if (!result.text.includes('正在加载本地数据') || Date.now() - startedAt > 5000) resolve(result);
        else setTimeout(tick, 100);
      };
      tick();
    })`);
    console.log(JSON.stringify({ ok: true, result }));
    app.quit();
  }
}

function ensureTray() {
  if (tray) return;
  const icon = createTrayIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Private Memos');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Private Memos', click: showMainWindow },
    { label: '退出', click: quitApp }
  ]));
  tray.on('click', showMainWindow);
}

function createTrayIcon() {
  const iconPath = app.isPackaged
    ? path.join(app.getAppPath(), 'assets', 'private-memos.ico')
    : path.join(process.cwd(), 'assets', 'private-memos.ico');
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 });
  const fallback = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#0F5B62"/>
      <path d="M10 9h9l4 4v10H10z" fill="#FFF8ED"/>
      <path d="M13 15h8M13 19h6" stroke="#9A9A9A" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="23" cy="22" r="5" fill="#0F5B62"/>
    </svg>`)}`);
  return fallback.resize({ width: 16, height: 16 });
}

function showMainWindow() {
  if (!mainWindow) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showClipboardWindow() {
  showMainWindow();
  mainWindow?.webContents.send('navigate:module', 'clipboard');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(() => {
    void createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});
