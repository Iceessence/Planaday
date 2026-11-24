const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');

const LOCAL_PORT = 41932;
let mainWindow = null;
let tray = null;
let isQuitting = false;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
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

function startLocalStaticServer() {
  const webRoot = fs.existsSync(path.join(__dirname, 'web'))
    ? path.join(__dirname, 'web')
    : path.resolve(__dirname, '../dist');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Local desktop bundle has no built-in sync API. Set your Docker LAN or Tailscale Server URL in Settings → 3-Mode Sync.' }));
        return;
      }
      let filePath = path.join(webRoot, reqPath === '/' ? 'index.html' : reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(webRoot, 'index.html');
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
      // Fallback to an ephemeral port if LOCAL_PORT is already occupied
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : LOCAL_PORT;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    server.listen(LOCAL_PORT, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${LOCAL_PORT}`);
    });
  });
}

function createTray(appIcon) {
  tray = new Tray(appIcon);
  tray.setToolTip('Planaday — Running in background for alarms & timers');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Planaday', click: () => showMainWindow() },
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
      backgroundThrottling: false, // Keep timers & alarms ticking accurately while minimized to tray
    },
  });

  await mainWindow.loadURL(localUrl);

  // Minimize to background tray instead of quitting so alarms & timers fire without Chrome open
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    const appIcon = nativeImage.createFromBuffer(buildPlanadayIconPng());
    createTray(appIcon);
    await createWindow(appIcon);
    app.on('activate', () => showMainWindow());
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});
