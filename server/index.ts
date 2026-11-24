import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { SyncDatabase, type IncomingOp } from './db.js';
import { ServerBlobStore } from './blobs.js';
import { fetchAndParseRecipeUrl } from './recipeProxy.js';
import { fetchRemoteIcs, lookupBarcodeOpenFoodFacts } from './icsProxy.js';
import { ServerAlarmScheduler } from './alarmScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildServerOptions {
  dataDir?: string;
  staticDir?: string;
}

export async function buildDayplanaServer(options: BuildServerOptions = {}) {
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.resolve(process.cwd(), 'dayplana-data');
  const staticDir = options.staticDir ?? path.resolve(__dirname, '../dist');

  const syncDb = new SyncDatabase(dataDir);
  const blobStore = new ServerBlobStore(dataDir);
  const alarmScheduler = new ServerAlarmScheduler(syncDb);
  alarmScheduler.start();

  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 * 1024, // 64 MB for long notes / batch sync / binary blobs
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Accept raw binary payloads for blob uploads
  app.addContentTypeParser(
    ['application/octet-stream', 'image/*', 'audio/*', 'application/pdf', 'image/svg+xml'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Connected SSE clients for live LAN/Tailscale sync push
  const sseClients = new Set<{ deviceId: string; write: (msg: string) => void }>();

  function broadcastSyncUpdate(sourceDeviceId: string, seq: number) {
    const payload = `event: sync-update\ndata: ${JSON.stringify({ sourceDeviceId, seq })}\n\n`;
    for (const client of sseClients) {
      if (client.deviceId !== sourceDeviceId) {
        try {
          client.write(payload);
        } catch {
          sseClients.delete(client);
        }
      }
    }
  }

  const startedAtMs = Date.now();
  const backupsDir = path.join(dataDir, 'blobs', 'db-backups');

  // Automated daily SQLite backup into /data/blobs/db-backups (lands directly on TrueNAS mount!)
  const dailyBackupTimer = setInterval(() => {
    try {
      syncDb.createSqliteBackup(backupsDir, 10);
    } catch {
      // Non-fatal if backupsDir is read-only
    }
  }, 24 * 60 * 60 * 1000);

  app.get('/api/health', async () => {
    const stats = syncDb.getStats();
    return {
      ok: true,
      app: 'planaday',
      legacyApp: 'dayplana',
      version: '3.0.0',
      dataDir,
      ...stats,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/api/storage/info', async () => {
    const stats = syncDb.getStats();
    const blobsDir = path.join(dataDir, 'blobs');
    let blobCount = 0;
    let blobTotalBytes = 0;
    try {
      if (fs.existsSync(blobsDir)) {
        for (const entry of fs.readdirSync(blobsDir)) {
          if (entry === 'db-backups' || entry.endsWith('.json')) continue;
          const st = fs.statSync(path.join(blobsDir, entry));
          if (st.isFile()) {
            blobCount++;
            blobTotalBytes += st.size;
          }
        }
      }
    } catch {
      // ignore
    }
    const backups: Array<{ name: string; sizeBytes: number; modifiedAt: string }> = [];
    try {
      if (fs.existsSync(backupsDir)) {
        for (const f of fs.readdirSync(backupsDir).filter((x) => x.endsWith('.sqlite'))) {
          const st = fs.statSync(path.join(backupsDir, f));
          backups.push({ name: f, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() });
        }
        backups.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      }
    } catch {
      // ignore
    }
    return {
      ok: true,
      app: 'planaday',
      dataDir,
      sqlitePath: syncDb.dbPath,
      sqliteSizeBytes: syncDb.getSqliteSizeBytes(),
      blobsDir,
      blobCount,
      blobTotalBytes,
      ...stats,
      sseClientCount: sseClients.size,
      uptimeSec: Math.round((Date.now() - startedAtMs) / 1000),
      backupsDir,
      backups,
    };
  });

  app.post('/api/storage/backup', async (_req, reply) => {
    try {
      const res = syncDb.createSqliteBackup(backupsDir, 10);
      return reply.send({ ok: true, ...res });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err instanceof Error ? err.message : 'Backup failed' });
    }
  });

  app.post<{ Body: { deviceId: string; operations: IncomingOp[] } }>('/api/sync/push', async (req) => {
    const { deviceId, operations } = req.body ?? { deviceId: 'unknown', operations: [] };
    const result = syncDb.applyOperations(deviceId, Array.isArray(operations) ? operations : []);
    if (result.acceptedOpIds.length > 0) {
      broadcastSyncUpdate(deviceId, result.seq);
    }
    return result;
  });

  app.get<{ Querystring: { since?: string } }>('/api/sync/pull', async (req) => {
    const since = Number(req.query?.since ?? 0);
    return syncDb.pullSince(Number.isFinite(since) ? since : 0);
  });

  app.get<{ Querystring: { deviceId?: string } }>('/api/sync/events', (req, reply) => {
    const deviceId = req.query?.deviceId ?? 'unknown';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ seq: syncDb.getCurrentSeq() })}\n\n`);

    const client = {
      deviceId,
      write: (msg: string) => reply.raw.write(msg),
    };
    sseClients.add(client);

    const ping = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        clearInterval(ping);
        sseClients.delete(client);
      }
    }, 25000);

    req.raw.on('close', () => {
      clearInterval(ping);
      sseClients.delete(client);
    });
  });

  app.put<{ Params: { hash: string } }>('/api/blobs/:hash', async (req, reply) => {
    const { hash } = req.params;
    const rawBody = req.body;
    const buf = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody)
        : Buffer.from(JSON.stringify(rawBody ?? ''));
    const mimeType = String(req.headers['content-type'] || 'application/octet-stream');
    const name = decodeURIComponent(String(req.headers['x-blob-name'] || 'attachment'));
    try {
      const meta = blobStore.putBlob(hash, buf, mimeType, name);
      return reply.code(200).send({ ok: true, meta });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid blob' });
    }
  });

  app.get<{ Params: { hash: string } }>('/api/blobs/:hash', async (req, reply) => {
    try {
      const found = blobStore.getBlob(req.params.hash);
      if (!found) return reply.code(404).send({ error: 'Blob not found' });
      reply.header('Content-Type', found.meta.mimeType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(found.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid blob hash' });
    }
  });

  app.post<{ Body: { url: string } }>('/api/proxy/recipe', async (req, reply) => {
    try {
      const url = req.body?.url;
      if (!url) return reply.code(400).send({ error: 'Missing url' });
      const draft = await fetchAndParseRecipeUrl(url);
      return reply.send({ ok: true, draft });
    } catch (err) {
      return reply.code(502).send({ ok: false, error: err instanceof Error ? err.message : 'Recipe import failed' });
    }
  });

  app.post<{ Body: { url: string } }>('/api/proxy/ics', async (req, reply) => {
    try {
      const url = req.body?.url;
      if (!url) return reply.code(400).send({ error: 'Missing url' });
      const icsText = await fetchRemoteIcs(url);
      return reply.send({ ok: true, icsText });
    } catch (err) {
      return reply.code(502).send({ ok: false, error: err instanceof Error ? err.message : 'ICS fetch failed' });
    }
  });

  app.get<{ Params: { code: string } }>('/api/proxy/barcode/:code', async (req) => {
    return lookupBarcodeOpenFoodFacts(req.params.code);
  });

  app.get('/api/push-config', async () => alarmScheduler.getConfig());

  app.post<{
    Body: {
      ntfyPushUrl?: string;
      timeZone?: string;
      notifyTimers?: boolean;
      notifyAlarms?: boolean;
      notifyEvents?: boolean;
      eventLeadMinutes?: number;
      notifyChores?: boolean;
      choreReminderTime?: string;
    };
  }>('/api/push-config', async (req) => {
    const updated = alarmScheduler.setConfig(req.body ?? {});
    return { ok: true, config: updated };
  });

  app.post('/api/push-config/test', async () => {
    const cfg = alarmScheduler.getConfig();
    if (!cfg.ntfyPushUrl) return { ok: false, error: 'Configure an ntfy push URL first.' };
    const res = await fetch(cfg.ntfyPushUrl, {
      method: 'POST',
      headers: { Title: 'Dayplana Push Test', Priority: 'high', Tags: 'white_check_mark' },
      body: 'Background alarms & timers from your Dayplana Docker server are connected!',
    });
    return { ok: res.ok, status: res.status };
  });

  // Serve built Vite PWA statically when dist/ exists
  if (fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'API route not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    clearInterval(dailyBackupTimer);
    alarmScheduler.stop();
    syncDb.close();
  });

  return { app, syncDb, blobStore };
}

// Direct CLI boot
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  buildDayplanaServer()
    .then(({ app }) => app.listen({ port, host }))
    .then((address) => {
      console.log(`Planaday Sync Server running at ${address}`);
    })
    .catch((err) => {
      console.error('Failed to start Dayplana server:', err);
      process.exit(1);
    });
}
