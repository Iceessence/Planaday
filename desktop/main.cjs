const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');

const LOCAL_PORT = 41932;
let mainWindow = null;
const secondaryWindows = new Set();
let tray = null;
let isQuitting = false;
let localServerUrl = null;
let pendingOpenFiles = [];

const SUPPORTED_OPEN_EXTS = new Set(['.pdf', '.dmtheme']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** Build a genuine 32x32 amber & cream Planaday "P" PNG buffer for Windows/macOS/Linux Tray & Window icons. */
function buildPlanadayIconPng() {
  const w = 32;
  const h = 32;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * (w * 4 + 1) + 1 + x * 4;
      const dx = Math.max(0, Math.abs(x - 15.5) - 10.5);
      const dy = Math.max(0, Math.abs(y - 15.5) - 10.5);
      const inRounded = dx * dx + dy * dy <= 25;
      if (!inRounded) continue;
      const inStem = x >= 10 && x <= 13 && y >= 7 && y <= 24;
      const inTop = y >= 7 && y <= 9 && x >= 10 && x <= 19;
      const inMid = y >= 15 && y <= 17 && x >= 10 && x <= 19;
      const distBowl = Math.hypot((x - 18) / 4.5, (y - 12) / 5);
      const inBowl = x >= 17 && y >= 7 && y <= 17 && distBowl >= 0.55 && distBowl <= 1.08;
      if (inStem || inTop || inMid || inBowl) {
        raw[idx] = 250;
        raw[idx + 1] = 246;
        raw[idx + 2] = 238;
        raw[idx + 3] = 255;
      } else {
        raw[idx] = 169;
        raw[idx + 1] = 116;
        raw[idx + 2] = 52;
        raw[idx + 3] = 255;
      }
    }
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function extractSupportedFilesFromArgv(argv) {
  const out = [];
  for (const arg of argv || []) {
    if (!arg || arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (SUPPORTED_OPEN_EXTS.has(ext) && fs.existsSync(arg)) {
      out.push(path.resolve(arg));
    }
  }
  return out;
}

function deliverFileToRenderer(targetWin, filePath) {
  try {
    if (!targetWin || targetWin.isDestroyed()) return;
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_OPEN_EXTS.has(ext)) return;
    const stat = fs.statSync(filePath);
    if (stat.size > 64 * 1024 * 1024) return;
    const bytes = fs.readFileSync(filePath);
    targetWin.webContents.send('planaday:open-file', {
      fileName: path.basename(filePath),
      ext,
      base64: bytes.toString('base64'),
    });
  } catch {
    // Non-fatal if file is unreadable
  }
}

function startLocalStaticServer() {
  if (localServerUrl) return Promise.resolve(localServerUrl);
  const webRoot = fs.existsSync(path.join(__dirname, 'web'))
    ? path.join(__dirname, 'web')
    : path.resolve(__dirname, '../dist');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error:
              'Local desktop bundle has no built-in sync API. Set your Docker LAN or Tailscale Server URL in Settings → 3-Mode Sync.',
          })
        );
        return;
      }
      const resolvedWebRoot = path.resolve(webRoot);
      let decodedPath = '/';
      try {
        decodedPath = decodeURIComponent(reqPath);
      } catch {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      const relativeReq = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
      let filePath = path.resolve(resolvedWebRoot, relativeReq);
      // Enforce strict directory containment so path-traversal URLs cannot read host files
      if (filePath !== resolvedWebRoot && !filePath.startsWith(resolvedWebRoot + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(resolvedWebRoot, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.on('error', () => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : LOCAL_PORT;
        localServerUrl = `http://127.0.0.1:${port}`;
        resolve(localServerUrl);
      });
    });

    server.listen(LOCAL_PORT, '127.0.0.1', () => {
      localServerUrl = `http://127.0.0.1:${LOCAL_PORT}`;
      resolve(localServerUrl);
    });
  });
}

function attachWindowSecurityGuards(win, allowedOrigin) {
  // PD-020: Restrict external window opens & unexpected top-level navigations away from local bundle
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });
}

async function openAdditionalWindow(appIcon) {
  const localUrl = await startLocalStaticServer();
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    icon: appIcon,
    title: 'Planaday — Workspace Window',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  attachWindowSecurityGuards(win, localUrl);
  secondaryWindows.add(win);
  win.on('closed', () => secondaryWindows.delete(win));
  await win.loadURL(localUrl);
  return win;
}

function createTray(appIcon) {
  tray = new Tray(appIcon);
  tray.setToolTip('Planaday — Running in background for alarms & timers');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Planaday', click: () => showMainWindow() },
      { label: 'New Workspace Window', click: () => void openAdditionalWindow(appIcon) },
      { type: 'separator' },
      {
        label: 'Quit Planaday',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function createWindow(appIcon) {
  const localUrl = await startLocalStaticServer();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    icon: appIcon,
    title: 'Planaday — Personal & Professional Planner',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // Keep timers & alarms ticking accurately while minimized to tray
    },
  });

  attachWindowSecurityGuards(mainWindow, localUrl);
  await mainWindow.loadURL(localUrl);

  mainWindow.webContents.on('did-finish-load', () => {
    for (const fp of pendingOpenFiles) {
      deliverFileToRenderer(mainWindow, fp);
    }
    pendingOpenFiles = [];
  });

  // Minimize to background tray instead of quitting so alarms & timers fire without Chrome open
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

pendingOpenFiles = extractSupportedFilesFromArgv(process.argv);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showMainWindow();
    const files = extractSupportedFilesFromArgv(argv);
    for (const fp of files) {
      deliverFileToRenderer(mainWindow, fp);
    }
  });

  app.whenReady().then(async () => {
    const appIcon = nativeImage.createFromBuffer(buildPlanadayIconPng());
    createTray(appIcon);

    ipcMain.handle('planaday:new-window', async () => {
      await openAdditionalWindow(appIcon);
      return { ok: true };
    });
    ipcMain.handle('planaday:print', (event) => {
      event.sender.print({ silent: false, printBackground: true });
      return { ok: true };
    });

    await createWindow(appIcon);
    app.on('activate', () => showMainWindow());
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});
