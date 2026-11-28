import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { SyncDatabase, type IncomingOp } from './db.js';
import { ServerBlobStore } from './blobs.js';
import { fetchAndParseRecipeUrl } from './recipeProxy.js';
import { fetchRemoteIcs, lookupBarcodeOpenFoodFacts } from './icsProxy.js';
import { ServerAlarmScheduler } from './alarmScheduler.js';
import { ServerAuthStore, type AuthenticatedPrincipal } from './auth.js';
import { safeOutboundFetch } from './outboundPolicy.js';
import { GpuServiceBridge } from './gpuBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PLANADAY_SERVER_VERSION = '4.2.0';
export const PLANADAY_SYNC_PROTOCOL_VERSION = 2;

const ALLOWED_BLOB_MIME_RE =
  /^(application\/(octet-stream|pdf|json|zip)|image\/(png|jpeg|jpg|webp|gif|avif|svg\+xml)|audio\/(wav|x-wav|wave|webm|mpeg|mp3|ogg|mp4|aac|flac)|text\/(plain|csv|markdown))(\s*;.*)?$/i;

export interface BuildServerOptions {
  dataDir?: string;
  staticDir?: string;
  requireAuth?: boolean;
  gpuServiceUrl?: string;
  gpuInternalToken?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal | null;
  }
}

export async function buildDayplanaServer(options: BuildServerOptions = {}) {
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.resolve(process.cwd(), 'dayplana-data');
  const staticDir = options.staticDir ?? path.resolve(__dirname, '../dist');

  const syncDb = new SyncDatabase(dataDir);
  const blobStore = new ServerBlobStore(dataDir);
  const authStore = new ServerAuthStore(syncDb.getRawDb(), options.requireAuth ?? false);
  const gpuBridge = new GpuServiceBridge({
    gpuUrl: options.gpuServiceUrl,
    internalToken: options.gpuInternalToken,
  });
  const alarmScheduler = new ServerAlarmScheduler(syncDb);
  alarmScheduler.start();

  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 * 1024, // 64 MB for long notes / batch sync / binary blobs
  });

  const configuredOrigins = (process.env.PLANADAY_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: configuredOrigins.length > 0 ? configuredOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // CONT-003: Fastify v5 requires RegExp for wildcard MIME types (strings like 'image/*' do NOT match image/png!)
  app.addContentTypeParser(
    ALLOWED_BLOB_MIME_RE,
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Extract & verify Bearer token on protected routes (PD-004)
  function extractToken(req: FastifyRequest): string | null {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    const q = req.query as Record<string, unknown> | undefined;
    if (q && typeof q.token === 'string' && q.token.trim()) {
      return q.token.trim();
    }
    return null;
  }

  async function requireAuthGuard(req: FastifyRequest, reply: FastifyReply, ownerOnly = false): Promise<boolean> {
    if (!authStore.isAuthEnforced()) {
      req.principal = null;
      return true;
    }
    const token = extractToken(req);
    const principal = authStore.verifyBearerToken(token);
    if (!principal) {
      reply.code(401).send({
        ok: false,
        error: 'Authentication required. Sign in or pair this device with your Planaday server.',
        code: 'AUTH_REQUIRED',
      });
      return false;
    }
    if (ownerOnly && principal.role !== 'owner') {
      reply.code(403).send({
        ok: false,
        error: 'Owner role is required for this administrative operation.',
        code: 'FORBIDDEN_OWNER_ONLY',
      });
      return false;
    }
    req.principal = principal;
    return true;
  }

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

  // Public non-sensitive health endpoint (exposes release & server identity, never secrets or records)
  app.get('/api/health', async () => {
    const stats = syncDb.getStats();
    const identity = syncDb.getServerIdentity();
    return {
      ok: true,
      app: 'planaday',
      legacyApp: 'dayplana',
      version: PLANADAY_SERVER_VERSION,
      syncProtocolVersion: PLANADAY_SYNC_PROTOCOL_VERSION,
      serverId: identity.serverId,
      syncEpoch: identity.syncEpoch,
      authEnabled: authStore.isAuthEnforced(),
      setupRequired: !authStore.isOwnerInitialized(),
      recordCount: authStore.isAuthEnforced() ? undefined : stats.recordCount,
      seq: authStore.isAuthEnforced() ? undefined : stats.seq,
      timestamp: new Date().toISOString(),
    };
  });

  // --- Authentication & Device Pairing Routes (PD-004 / PF-04) ---
  app.get('/api/auth/status', async (req) => {
    const token = extractToken(req);
    const principal = authStore.verifyBearerToken(token);
    return {
      ok: true,
      authEnabled: authStore.isAuthEnforced(),
      ownerInitialized: authStore.isOwnerInitialized(),
      authenticated: Boolean(principal),
      principal: principal
        ? { tokenId: principal.tokenId, deviceId: principal.deviceId, label: principal.label, role: principal.role, allowedWorkspaces: principal.allowedWorkspaces }
        : null,
    };
  });

  app.post<{ Body: { ownerName?: string; passphrase: string; deviceId?: string; deviceLabel?: string } }>(
    '/api/auth/setup',
    async (req, reply) => {
      try {
        const { ownerName = 'Owner', passphrase, deviceId = 'owner-device', deviceLabel = 'Primary Device' } = req.body ?? {};
        const result = authStore.setupOwner(ownerName, passphrase, deviceId, deviceLabel);
        return reply.code(200).send({ ok: true, ...result });
      } catch (err) {
        return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : 'Setup failed' });
      }
    }
  );

  app.post<{ Body: { passphrase: string; deviceId?: string; deviceLabel?: string } }>('/api/auth/signin', async (req, reply) => {
    try {
      const { passphrase, deviceId = 'owner-device', deviceLabel = 'Signed-in Device' } = req.body ?? {};
      const result = authStore.signInOwner(passphrase, deviceId, deviceLabel);
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      return reply.code(401).send({ ok: false, error: err instanceof Error ? err.message : 'Sign-in failed' });
    }
  });

  app.post<{ Body: { label?: string; role?: 'owner' | 'member'; allowedWorkspaces?: string[] | null; ttlMinutes?: number } }>(
    '/api/auth/pair-code',
    async (req, reply) => {
      if (!(await requireAuthGuard(req, reply, true))) return;
      const { label = 'New Device', role = 'owner', allowedWorkspaces = null, ttlMinutes = 10 } = req.body ?? {};
      const res = authStore.createPairingCode(label, role, allowedWorkspaces, ttlMinutes);
      return reply.send({ ok: true, ...res });
    }
  );

  app.post<{ Body: { code: string; deviceId: string; deviceLabel?: string } }>('/api/auth/pair', async (req, reply) => {
    try {
      const { code, deviceId, deviceLabel } = req.body ?? {};
      if (!code || !deviceId) return reply.code(400).send({ ok: false, error: 'Missing pairing code or deviceId' });
      const res = authStore.redeemPairingCode(code, deviceId, deviceLabel);
      return reply.send({ ok: true, ...res });
    } catch (err) {
      return reply.code(401).send({ ok: false, error: err instanceof Error ? err.message : 'Pairing failed' });
    }
  });

  app.get('/api/auth/devices', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    return reply.send({ ok: true, devices: authStore.listDevices() });
  });

  app.post<{ Body: { tokenId: string } }>('/api/auth/revoke', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    const ok = authStore.revokeToken(req.body?.tokenId ?? '');
    return reply.send({ ok });
  });

  // --- Storage & Verified Backup Routes ---
  app.get('/api/storage/info', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    const stats = syncDb.getStats();
    const identity = syncDb.getServerIdentity();
    const blobsDir = path.join(dataDir, 'blobs');
    const blobs = blobStore.listBlobChecksums();
    const blobCount = blobs.length;
    const blobTotalBytes = blobs.reduce((acc, b) => acc + b.size, 0);

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
    return reply.send({
      ok: true,
      app: 'planaday',
      version: PLANADAY_SERVER_VERSION,
      serverId: identity.serverId,
      syncEpoch: identity.syncEpoch,
      authEnabled: authStore.isAuthEnforced(),
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
    });
  });

  app.post('/api/storage/backup', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    try {
      const res = syncDb.createSqliteBackup(backupsDir, 10);
      const sqliteBytes = fs.readFileSync(res.filePath);
      const sqliteSha256 = crypto.createHash('sha256').update(sqliteBytes).digest('hex');
      const blobManifest = blobStore.listBlobChecksums();
      const identity = syncDb.getServerIdentity();
      const manifest = {
        formatVersion: 2,
        appVersion: PLANADAY_SERVER_VERSION,
        serverId: identity.serverId,
        syncEpoch: identity.syncEpoch,
        createdAt: new Date().toISOString(),
        sqliteFile: res.name,
        sqliteSizeBytes: res.sizeBytes,
        sqliteSha256,
        stats: syncDb.getStats(),
        blobCount: blobManifest.length,
        blobs: blobManifest,
      };
      const manifestPath = `${res.filePath}.manifest.json`;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return reply.send({ ok: true, ...res, sqliteSha256, manifestPath, blobCount: blobManifest.length });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err instanceof Error ? err.message : 'Backup failed' });
    }
  });

  // --- Sync Routes (Workspace-Scoped Authorization + Server Identity) ---
  app.post<{ Body: { deviceId: string; operations: IncomingOp[] } }>('/api/sync/push', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    const { deviceId, operations } = req.body ?? { deviceId: 'unknown', operations: [] };
    const ops = Array.isArray(operations) ? operations : [];

    // Enforce workspace authorization for scoped non-owner tokens
    const allowed = req.principal?.allowedWorkspaces;
    if (allowed && allowed.length > 0) {
      for (const op of ops) {
        const ws = op.record?.workspaceId;
        if (ws && !allowed.includes(ws)) {
          return reply.code(403).send({
            ok: false,
            error: `Device token is not authorized to modify workspace "${ws}".`,
            code: 'WORKSPACE_FORBIDDEN',
          });
        }
      }
    }

    const result = syncDb.applyOperations(deviceId, ops);
    const identity = syncDb.getServerIdentity();
    if (result.acceptedOpIds.length > 0) {
      broadcastSyncUpdate(deviceId, result.seq);
    }
    return reply.send({ ...result, serverId: identity.serverId, syncEpoch: identity.syncEpoch });
  });

  app.get<{ Querystring: { since?: string } }>('/api/sync/pull', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    const since = Number(req.query?.since ?? 0);
    const pulled = syncDb.pullSince(Number.isFinite(since) ? since : 0);
    const allowed = req.principal?.allowedWorkspaces;
    const records =
      allowed && allowed.length > 0
        ? pulled.records.filter((r) => allowed.includes(r.workspaceId))
        : pulled.records;
    const identity = syncDb.getServerIdentity();
    return reply.send({
      seq: pulled.seq,
      records,
      recordCount: syncDb.getStats().recordCount,
      serverId: identity.serverId,
      syncEpoch: identity.syncEpoch,
    });
  });

  app.get<{ Querystring: { deviceId?: string; token?: string } }>('/api/sync/events', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    const deviceId = req.query?.deviceId ?? 'unknown';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const identity = syncDb.getServerIdentity();
    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ seq: syncDb.getCurrentSeq(), serverId: identity.serverId, syncEpoch: identity.syncEpoch })}\n\n`
    );

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

  // --- Verified Binary Blob Routes (CONT-003 + PD-015 + PD-004) ---
  app.put<{ Params: { hash: string } }>('/api/blobs/:hash', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    const { hash } = req.params;
    const mimeType = String(req.headers['content-type'] || 'application/octet-stream');
    if (!ALLOWED_BLOB_MIME_RE.test(mimeType)) {
      return reply.code(415).send({ ok: false, error: `Unsupported media type "${mimeType}".` });
    }
    const rawBody = req.body;
    const buf = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody)
        : Buffer.from(JSON.stringify(rawBody ?? ''));
    const name = decodeURIComponent(String(req.headers['x-blob-name'] || 'attachment'));
    try {
      const meta = blobStore.putBlob(hash, buf, mimeType, name);
      return reply.code(200).send({ ok: true, meta });
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : 'Invalid blob' });
    }
  });

  app.get<{ Params: { hash: string } }>('/api/blobs/:hash', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    try {
      const found = blobStore.getBlob(req.params.hash);
      if (!found) return reply.code(404).send({ ok: false, error: 'Blob not found' });
      reply.header('Content-Type', found.meta.mimeType);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');
      if (found.meta.mimeType.includes('svg')) {
        reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
      }
      return reply.send(found.data);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : 'Invalid blob hash' });
    }
  });

  // --- Outbound Proxy Routes (Protected by Auth + Centralized SSRF Policy PD-014) ---
  app.post<{ Body: { url: string } }>('/api/proxy/recipe', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    try {
      const url = req.body?.url;
      if (!url) return reply.code(400).send({ error: 'Missing url' });
      const draft = await fetchAndParseRecipeUrl(url);
      return reply.send({ ok: true, draft });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recipe import failed';
      const status = /blocked|prohibited|private|protocol/i.test(msg) ? 403 : 502;
      return reply.code(status).send({ ok: false, error: msg });
    }
  });

  app.post<{ Body: { url: string } }>('/api/proxy/ics', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    try {
      const url = req.body?.url;
      if (!url) return reply.code(400).send({ error: 'Missing url' });
      const icsText = await fetchRemoteIcs(url);
      return reply.send({ ok: true, icsText });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ICS fetch failed';
      const status = /blocked|prohibited|private|protocol/i.test(msg) ? 403 : 502;
      return reply.code(status).send({ ok: false, error: msg });
    }
  });

  app.get<{ Params: { code: string } }>('/api/proxy/barcode/:code', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    return reply.send(await lookupBarcodeOpenFoodFacts(req.params.code));
  });

  app.get('/api/push-config', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    return reply.send(alarmScheduler.getConfig());
  });

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
  }>('/api/push-config', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    const updated = alarmScheduler.setConfig(req.body ?? {});
    return reply.send({ ok: true, config: updated });
  });

  app.post('/api/push-config/test', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, true))) return;
    const cfg = alarmScheduler.getConfig();
    if (!cfg.ntfyPushUrl) return reply.send({ ok: false, error: 'Configure an ntfy push URL first.' });
    try {
      const res = await safeOutboundFetch(
        cfg.ntfyPushUrl,
        {
          method: 'POST',
          headers: { Title: 'Planaday Push Test', Priority: 'high', Tags: 'white_check_mark' },
          body: 'Background alarms & timers from your Planaday Docker server are connected!',
        },
        { purpose: 'ntfy-test', timeoutMs: 8000, maxResponseBytes: 64 * 1024 }
      );
      return reply.send({ ok: res.ok, status: res.status });
    } catch (err) {
      return reply.code(403).send({ ok: false, error: err instanceof Error ? err.message : 'Push test blocked by policy' });
    }
  });

  // --- Optional Self-Hosted NVIDIA GPU Acceleration Bridge Routes (v4.2.0 §6, Protected by Auth) ---
  app.get('/api/gpu/status', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    return reply.send(await gpuBridge.getStatus());
  });

  app.get('/api/gpu/jobs', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    return reply.send(await gpuBridge.listJobs());
  });

  app.post<{ Params: { id: string } }>('/api/gpu/jobs/:id/cancel', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    return reply.send(await gpuBridge.cancelJob(req.params.id));
  });

  app.post<{
    Body: { imageBase64: string; mimeType?: string; language?: string; model?: string; priority?: string };
  }>('/api/gpu/ocr', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    if (!req.body?.imageBase64) return reply.code(400).send({ ok: false, error: 'Missing imageBase64 payload' });
    return reply.send(await gpuBridge.runOcr(req.body));
  });

  app.post<{
    Body: { imageBase64: string; mimeType?: string; shadowReduction?: boolean; contrastBoost?: number; priority?: string };
  }>('/api/gpu/enhance', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    if (!req.body?.imageBase64) return reply.code(400).send({ ok: false, error: 'Missing imageBase64 payload' });
    return reply.send(await gpuBridge.runEnhance(req.body));
  });

  app.post<{ Body: { texts: string[]; priority?: string } }>('/api/gpu/embed', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    if (!Array.isArray(req.body?.texts)) return reply.code(400).send({ ok: false, error: 'Missing texts array' });
    return reply.send(await gpuBridge.runEmbed(req.body));
  });

  app.post('/api/gpu/benchmark', async (req, reply) => {
    if (!(await requireAuthGuard(req, reply, false))) return;
    return reply.send(await gpuBridge.runBenchmark());
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

  return { app, syncDb, blobStore, authStore };
}

// Direct CLI boot
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  buildDayplanaServer()
    .then(({ app }) => app.listen({ port, host }))
    .then((address) => {
      console.log(`Planaday Sync Server v${PLANADAY_SERVER_VERSION} running at ${address}`);
    })
    .catch((err) => {
      console.error('Failed to start Planaday server:', err);
      process.exit(1);
    });
}
