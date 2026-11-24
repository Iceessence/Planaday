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

  app.get('/api/health', async () => {
    const stats = syncDb.getStats();
    return {
      ok: true,
      app: 'dayplana',
      edition: 2,
      dataDir,
      ...stats,
      timestamp: new Date().toISOString(),
    };
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
      console.log(`Dayplana Edition 2 Sync Server running at ${address}`);
    })
    .catch((err) => {
      console.error('Failed to start Dayplana server:', err);
      process.exit(1);
    });
}
