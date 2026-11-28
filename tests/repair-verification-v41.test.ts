import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { buildDayplanaServer } from '../server/index';
import { validateOutboundUrl } from '../server/outboundPolicy';
import {
  blobToArrayBuffer,
  db,
  getOrInitSettings,
  requestPersistentStorage,
  storeBlob,
  updateSettings,
} from '../src/core/db';
import { createRecord, updateRecord } from '../src/core/repository';
import { runSyncCycle } from '../src/core/sync';
import { downloadFile, exportFullZipBackup, importZipBackup, sanitizeDownloadFilename } from '../src/core/backup';
import { exportSheetToDelimited, importDelimitedToSheet } from '../src/core/spreadsheetEngine';
import { SANDBOX_ISOLATION_POLICY } from '../src/core/sandboxRunner';
import { SafeTextarea } from '../src/components/Common/SafeTextEditor';
import { PLANADAY_RELEASE } from '../src/core/releaseInfo';
import { buildPresentationHtmlDeck } from '../src/modules/studio/PresentationView';
import { AppProvider } from '../src/core/AppContext';
import { DigitalPlannerView } from '../src/modules/planner/DigitalPlannerView';
import { FileManagerView } from '../src/modules/studio/FileManagerView';
import { ProjectsView } from '../src/modules/creative/ProjectsView';
import { PhotoStudioView } from '../src/modules/studio/PhotoStudioView';
import { FlowCalendarView } from '../src/modules/plan/FlowCalendarView';

function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function bootTempServer(prefix: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `planaday-v41-${prefix}-`));
  const srv = await buildDayplanaServer({ dataDir: dir });
  const base = await srv.app.listen({ host: '127.0.0.1', port: 0 });
  return {
    ...srv,
    dir,
    base,
    stop: async () => {
      srv.app.server.closeAllConnections();
      await srv.app.close();
    },
  };
}

describe('Planaday v4.1.0 Repair Verification Suite (PD-001..PD-020, CONT-001..CONT-009, R-0005)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await getOrInitSettings();
  });

  afterEach(() => {
    delete process.env.PLANADAY_ALLOWED_OUTBOUND_HOSTS;
  });

  it('PD-001 + PF-01: serializes 1,000 overlapping disjoint updates atomically with strictly monotonic revisions and zero lost fields', async () => {
    const rec = await createRecord<{ alpha: number; beta: number }>('note', 'Concurrency Stress', {
      alpha: 0,
      beta: 0,
    });

    const ops: Array<Promise<unknown>> = [];
    for (let i = 0; i < 500; i++) {
      ops.push(
        updateRecord<{ alpha: number; beta: number }>(
          rec.id,
          (c) => ({ ...c, payload: { ...c.payload, alpha: c.payload.alpha + 1 } }),
          { skipUndo: true }
        )
      );
      ops.push(
        updateRecord<{ alpha: number; beta: number }>(
          rec.id,
          (c) => ({ ...c, payload: { ...c.payload, beta: c.payload.beta + 1 } }),
          { skipUndo: true }
        )
      );
    }
    await Promise.all(ops);

    const saved = await db.records.get(rec.id);
    expect(saved?.payload).toMatchObject({ alpha: 500, beta: 500 });
    expect(saved?.rev).toBe(1001);
    const queued = await db.outbox.where('recordId').equals(rec.id).toArray();
    expect(queued.length).toBe(1);
    expect(queued[0].record?.rev).toBe(1001);

    // Failed updater throws cleanly without leaving partial record mutation or extra outbox ops
    await expect(
      updateRecord(rec.id, () => {
        throw new Error('Injected updater crash');
      })
    ).rejects.toThrow('Injected updater crash');
    const afterCrash = await db.records.get(rec.id);
    expect(afterCrash?.rev).toBe(1001);
    expect(afterCrash?.payload).toMatchObject({ alpha: 500, beta: 500 });
  }, 30000);

  it('PD-016 + PF-55: blurless record switch flushes Alpha draft strictly to Alpha and never overwrites Beta, with durable db.drafts recovery', async () => {
    const commits: Array<{ target: string; value: string; recordKey?: string }> = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const Harness: React.FC<{ activeId: string; content: string }> = ({ activeId, content }) =>
      React.createElement(SafeTextarea, {
        recordKey: `${activeId}:content`,
        titleHint: `Note ${activeId}`,
        externalValue: content,
        debounceMs: 800,
        onCommit: (val: string, meta: { manual: boolean; recordKey?: string }) => {
          commits.push({ target: activeId, value: val, recordKey: meta?.recordKey });
        },
      });

    await act(async () => {
      root.render(React.createElement(Harness, { activeId: 'alpha', content: 'Alpha original' }));
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Alpha original');

    // Focus and edit Alpha WITHOUT blurring
    await act(async () => {
      textarea.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'Alpha dirty draft MUST stay Alpha');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Wait briefly so durable db.drafts entry is recorded
    await new Promise((r) => setTimeout(r, 300));
    const draftBeforeSwitch = await db.drafts.get('alpha:content');
    expect(draftBeforeSwitch?.content).toBe('Alpha dirty draft MUST stay Alpha');

    // Switch active note to Beta WITHOUT blurring textarea!
    await act(async () => {
      root.render(React.createElement(Harness, { activeId: 'beta', content: 'Beta original' }));
    });

    // Alpha's commit callback MUST have received Alpha's draft, and Beta MUST NEVER have received Alpha's draft!
    expect(commits.some((c) => c.target === 'alpha' && c.value === 'Alpha dirty draft MUST stay Alpha')).toBe(true);
    expect(commits.some((c) => c.target === 'beta' && c.value.includes('Alpha'))).toBe(false);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Beta original');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('PD-004 + PF-04: enforces 401/403 server auth, pairing codes, workspace isolation, verified SQLite backup manifest, and token revocation', async () => {
    const srv = await bootTempServer('auth');
    try {
      // 1. Setup owner passphrase
      const setupRes = await fetch(`${srv.base}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerName: 'Owner', passphrase: 'CorrectHorseBattery99!', deviceId: 'dev_owner', deviceLabel: 'Desktop' }),
      });
      expect(setupRes.status).toBe(200);
      const setupJson = (await setupRes.json()) as { token: string; tokenId: string };
      expect(setupJson.token).toBeTruthy();

      // 2. Unauthenticated requests to sync/blobs/storage/proxy MUST fail with 401
      expect((await fetch(`${srv.base}/api/sync/pull?since=0`)).status).toBe(401);
      expect(
        (
          await fetch(`${srv.base}/api/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: 'anon', operations: [] }),
          })
        ).status
      ).toBe(401);
      expect((await fetch(`${srv.base}/api/storage/info`)).status).toBe(401);
      expect((await fetch(`${srv.base}/api/storage/backup`, { method: 'POST' })).status).toBe(401);
      expect((await fetch(`${srv.base}/api/blobs/aaaaaaaaaaaaaaaa`)).status).toBe(401);

      // 3. Create workspace-scoped member pairing code & redeem it
      const pcRes = await fetch(`${srv.base}/api/auth/pair-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setupJson.token}` },
        body: JSON.stringify({ label: 'Phone Member', role: 'member', allowedWorkspaces: ['ws_personal'], ttlMinutes: 10 }),
      });
      const pcJson = (await pcRes.json()) as { code: string };
      expect(pcRes.status).toBe(200);

      const pairRes = await fetch(`${srv.base}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pcJson.code, deviceId: 'dev_phone', deviceLabel: 'Phone Member' }),
      });
      const pairJson = (await pairRes.json()) as { token: string; tokenId: string };
      expect(pairRes.status).toBe(200);

      // 4. Member CAN sync ws_personal, CANNOT push to ws_lab (403), CANNOT trigger admin backup (403)
      const now = new Date().toISOString();
      const pushOk = await fetch(`${srv.base}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairJson.token}` },
        body: JSON.stringify({
          deviceId: 'dev_phone',
          operations: [
            {
              opId: 'op_p1',
              recordId: 'rec_p1',
              operation: 'upsert',
              baseRev: 0,
              record: { id: 'rec_p1', workspaceId: 'ws_personal', type: 'note', title: 'Allowed', status: 'active', createdAt: now, updatedAt: now, deletedAt: null, tags: [], payload: {}, rev: 1, deviceId: 'dev_phone' },
            },
          ],
        }),
      });
      expect(pushOk.status).toBe(200);

      const pushForbidden = await fetch(`${srv.base}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairJson.token}` },
        body: JSON.stringify({
          deviceId: 'dev_phone',
          operations: [
            {
              opId: 'op_lab1',
              recordId: 'rec_lab1',
              operation: 'upsert',
              baseRev: 0,
              record: { id: 'rec_lab1', workspaceId: 'ws_lab', type: 'note', title: 'Forbidden', status: 'active', createdAt: now, updatedAt: now, deletedAt: null, tags: [], payload: {}, rev: 1, deviceId: 'dev_phone' },
            },
          ],
        }),
      });
      expect(pushForbidden.status).toBe(403);
      expect((await fetch(`${srv.base}/api/storage/backup`, { method: 'POST', headers: { Authorization: `Bearer ${pairJson.token}` } })).status).toBe(403);

      // 5. Owner triggers verified SQLite backup with companion SHA-256 manifest
      const bkRes = await fetch(`${srv.base}/api/storage/backup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${setupJson.token}` },
      });
      expect(bkRes.status).toBe(200);
      const bkJson = (await bkRes.json()) as { ok: boolean; sqliteSha256: string; manifestPath: string };
      expect(bkJson.ok).toBe(true);
      expect(bkJson.sqliteSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(existsSync(bkJson.manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(bkJson.manifestPath, 'utf8'));
      expect(manifest.sqliteSha256).toBe(bkJson.sqliteSha256);

      // 6. Owner revokes member device token -> immediate 401
      const revRes = await fetch(`${srv.base}/api/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setupJson.token}` },
        body: JSON.stringify({ tokenId: pairJson.tokenId }),
      });
      expect(revRes.status).toBe(200);
      expect((await fetch(`${srv.base}/api/sync/pull?since=0`, { headers: { Authorization: `Bearer ${pairJson.token}` } })).status).toBe(401);
    } finally {
      await srv.stop();
    }
  });

  it('PD-005: enforces null-origin sandboxed iframe isolation policy for Code Studio', () => {
    expect(SANDBOX_ISOLATION_POLICY.sandboxAttribute).toBe('allow-scripts');
    expect(SANDBOX_ISOLATION_POLICY.allowsSameOrigin).toBe(false);
    expect(SANDBOX_ISOLATION_POLICY.allowsNetwork).toBe(false);
    expect(SANDBOX_ISOLATION_POLICY.csp).toContain("default-src 'none'");
    expect(SANDBOX_ISOLATION_POLICY.csp).toContain("connect-src 'none'");
  });

  it('PD-014: blocks SSRF against loopback, RFC1918 LAN, cloud metadata, CGNAT/Tailscale, and non-HTTPS URLs unless explicitly allowlisted', async () => {
    const blockedUrls = [
      'http://127.0.0.1:3000/api/health',
      'http://localhost:3000/api/health',
      'http://192.168.88.31:3000/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/admin',
      'http://100.64.10.20:3000/',
      'file:///etc/passwd',
      'http://example.com/feed.ics',
    ];
    for (const u of blockedUrls) {
      await expect(validateOutboundUrl(u), `Expected SSRF block for ${u}`).rejects.toThrow();
    }

    // Explicit host allowlist permits intentional self-hosted relay when allowHttp is enabled
    process.env.PLANADAY_ALLOWED_OUTBOUND_HOSTS = '192.168.88.31';
    const allowedUrl = await validateOutboundUrl('http://192.168.88.31:8080/ntfy', { allowHttp: true });
    expect(allowedUrl.hostname).toBe('192.168.88.31');

    // Live server proxy route rejects private/metadata targets with HTTP 403
    const srv = await bootTempServer('ssrf');
    try {
      const r1 = await fetch(`${srv.base}/api/proxy/ics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }),
      });
      expect(r1.status).toBe(403);
      const r2 = await fetch(`${srv.base}/api/proxy/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:3000/api/health' }),
      });
      expect(r2.status).toBe(403);
    } finally {
      await srv.stop();
    }
  });

  it('CONT-003 + PD-015: accepts PNG, JPEG, WebP, WAV, PDF, SVG & octet-stream blob uploads, verifies SHA-256, and serves safe headers', async () => {
    const srv = await bootTempServer('blobs');
    try {
      const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xLZkAAAAASUVORK5CYII=', 'base64');
      const samples: Array<[string, Buffer]> = [
        ['image/png', pngBytes],
        ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])],
        ['image/webp', Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 ')],
        ['audio/wav', Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ')],
        ['application/pdf', Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')],
        ['image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>')],
        ['application/octet-stream', Buffer.from('binary-test-payload-v41')],
      ];

      for (const [mime, data] of samples) {
        const h = sha256(data);
        const putRes = await fetch(`${srv.base}/api/blobs/${h}`, {
          method: 'PUT',
          headers: { 'Content-Type': mime },
          body: new Uint8Array(data),
        });
        expect(putRes.status, `PUT failed for ${mime}`).toBe(200);

        const getRes = await fetch(`${srv.base}/api/blobs/${h}`);
        expect(getRes.status, `GET failed for ${mime}`).toBe(200);
        expect(getRes.headers.get('x-content-type-options')).toBe('nosniff');
        if (mime === 'image/svg+xml') {
          expect(getRes.headers.get('content-security-policy')).toContain('sandbox');
        }
        const got = Buffer.from(await getRes.arrayBuffer());
        expect(got.equals(data)).toBe(true);
      }

      // PD-015: mismatched SHA-256 hash MUST be rejected with HTTP 400
      const wrongHash = '0'.repeat(64);
      const badPut = await fetch(`${srv.base}/api/blobs/${wrongHash}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(pngBytes),
      });
      expect(badPut.status).toBe(400);
    } finally {
      await srv.stop();
    }
  });

  it('PD-002 + CONT-004 + PF-51: downloads verified PNG attachment bytes onto a clean second device and never reports synced on blob HTTP 503', async () => {
    const srv = await bootTempServer('blob-sync');
    try {
      const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xLZkAAAAASUVORK5CYII=', 'base64');
      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: srv.base, deviceId: 'dev_a', lastSyncSeq: 0 });
      const stored = await storeBlob(new Blob([pngBytes], { type: 'image/png' }), 'tiny.png');
      const note = await createRecord('note', 'Attachment Note', { content: 'See PNG', attachmentBlobIds: [stored.hash] });

      // CONT-004: Synthetic 503 on blob PUT must keep status !== 'synced' and pendingCount > 0
      const failState = await runSyncCycle(async (input, init) =>
        String(input).includes('/api/blobs/') ? new Response('Service Unavailable', { status: 503 }) : fetch(input, init)
      );
      expect(failState.status).toBe('error');
      expect(failState.failedBlobTransfers).toBeGreaterThanOrEqual(1);
      expect(failState.pendingCount).toBeGreaterThanOrEqual(1);

      // Normal sync uploads PNG + note cleanly
      const okState = await runSyncCycle(fetch);
      expect(okState.status).toBe('synced');
      expect(okState.pendingCount).toBe(0);

      // Clean Device B: wipe local IndexedDB completely, sync from server -> pulls note AND downloads verified PNG bytes!
      await Promise.all(db.tables.map((t) => t.clear()));
      await getOrInitSettings();
      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: srv.base, deviceId: 'dev_b', lastSyncSeq: 0 });

      const devBState = await runSyncCycle(fetch);
      expect(devBState.status).toBe('synced');
      const pulledNote = await db.records.get(note.id);
      expect(pulledNote?.title).toBe('Attachment Note');
      const pulledBlob = await db.blobs.get(stored.hash);
      expect(pulledBlob).toBeTruthy();
      expect(sha256(new Uint8Array(pulledBlob!.data))).toBe(stored.hash);
    } finally {
      await srv.stop();
    }
  });

  it('PD-003 + PF-03 + PF-42: ZIP v3 verified backup restores cleanly onto a fresh empty replacement server with different serverId', async () => {
    const srvA = await bootTempServer('replace-a');
    const srvB = await bootTempServer('replace-b');
    try {
      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: srvA.base, deviceId: 'dev_origin', lastSyncSeq: 0 });
      const blobBytes = Buffer.from('precious-photo-bytes-v41');
      const blobRec = await storeBlob(new Blob([blobBytes], { type: 'application/octet-stream' }), 'photo.bin');
      const note = await createRecord('note', 'Mission Critical Backup', { content: 'Do not lose me', attachmentBlobIds: [blobRec.hash] });

      const sA = await runSyncCycle(fetch);
      expect(sA.status).toBe('synced');
      const serverAId = sA.serverId;
      expect(serverAId).toBeTruthy();

      // Export ZIP v3 backup and verify manifest.json exists with checksums
      const zipBlob = await exportFullZipBackup();
      const zipBuf = await blobToArrayBuffer(zipBlob);
      const zipEntries = unzipSync(new Uint8Array(zipBuf));
      expect(zipEntries['manifest.json']).toBeTruthy();
      const manifest = JSON.parse(strFromU8(zipEntries['manifest.json']));
      expect(manifest.formatVersion).toBe(3);
      expect(manifest.blobChecksums[blobRec.hash]).toBeTruthy();

      // Wipe client completely, import ZIP, and point at fresh empty Replacement Server B!
      await Promise.all(db.tables.map((t) => t.clear()));
      await getOrInitSettings();
      const imported = await importZipBackup(zipBlob);
      expect(imported.importedRecords).toBeGreaterThanOrEqual(1);
      expect(imported.importedBlobs).toBe(1);

      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: srvB.base, deviceId: 'dev_restored' });
      const sB = await runSyncCycle(fetch);
      expect(sB.status).toBe('synced');
      expect(sB.serverId).toBeTruthy();
      expect(sB.serverId).not.toBe(serverAId);

      // Verify Replacement Server B received BOTH the restored record AND the binary blob bytes!
      const serverBRecords = srvB.syncDb.pullSince(0).records;
      expect(serverBRecords.some((r) => r.id === note.id && r.title === 'Mission Critical Backup')).toBe(true);
      const blobOnB = await fetch(`${srvB.base}/api/blobs/${blobRec.hash}`);
      expect(blobOnB.status).toBe(200);
      expect(Buffer.from(await blobOnB.arrayBuffer()).equals(blobBytes)).toBe(true);
    } finally {
      await srvA.stop();
      await srvB.stop();
    }
  });

  it('PD-006: parses RFC 4180 CSV with quoted commas, escaped quotes, and embedded newlines accurately across round-trip', () => {
    const csv = '"Hello, ""World""","Line 1\nLine 2",plain\n"A,B","C""D",42';
    const sheet = importDelimitedToSheet(csv, 'Imported');
    expect(sheet.cells.A1.raw).toBe('Hello, "World"');
    expect(sheet.cells.B1.raw).toBe('Line 1\nLine 2');
    expect(sheet.cells.C1.raw).toBe('plain');
    expect(sheet.cells.A2.raw).toBe('A,B');
    expect(sheet.cells.B2.raw).toBe('C"D');
    expect(sheet.cells.C2.raw).toBe('42');

    // Round-trip back through exportSheetToDelimited -> importDelimitedToSheet
    const exported = exportSheetToDelimited(sheet, {});
    const reparsed = importDelimitedToSheet(exported, 'Reparsed');
    expect(reparsed.cells.A1.raw).toBe('Hello, "World"');
    expect(reparsed.cells.B1.raw).toBe('Line 1\nLine 2');
    expect(reparsed.cells.B2.raw).toBe('C"D');
  });

  it('PD-008: typed downloadFile always assigns sanitized filename to anchor.download and payload to Blob body', async () => {
    expect(sanitizeDownloadFilename('My:Bad/Name?.md')).toBe('My_Bad_Name_.md');

    let capturedFilename = '';
    let capturedBlob: Blob | null = null;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = (b: Blob | MediaSource) => {
      capturedBlob = b as Blob;
      return 'blob:mock-v41';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      capturedFilename = this.download;
    };

    try {
      downloadFile({
        filename: 'Quarterly Report.md',
        content: '# Quarterly Report\n\nBody text',
        mimeType: 'text/markdown;charset=utf-8',
      });
      expect(capturedFilename).toBe('Quarterly Report.md');
      expect(capturedBlob).toBeTruthy();
      const bodyBuf = await blobToArrayBuffer(capturedBlob!);
      expect(strFromU8(new Uint8Array(bodyBuf))).toBe('# Quarterly Report\n\nBody text');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('CONT-008: requestPersistentStorage times out cleanly instead of hanging startup (Firefox compatibility)', async () => {
    const origStorage = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: () => new Promise<boolean>(() => {}), // never resolves (simulating Firefox prompt)
      },
    });
    try {
      const t0 = Date.now();
      const persisted = await requestPersistentStorage(60);
      const elapsed = Date.now() - t0;
      expect(persisted).toBe(false);
      expect(elapsed).toBeLessThan(500);
    } finally {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: origStorage });
    }
  });

  it('R-0005 + PD-017: serializes concurrent calendarPrefs updates cleanly and matches authoritative v4.1.0 release identity', async () => {
    const base = await getOrInitSettings();
    await Promise.all([
      updateSettings({ calendarPrefs: { ...base.calendarPrefs!, intervalMin: 1 } }),
      updateSettings({ calendarPrefs: { adaptiveText: false } as unknown as typeof base.calendarPrefs }),
    ]);
    const after = await getOrInitSettings();
    expect(after.calendarPrefs?.intervalMin).toBe(1);
    expect(after.calendarPrefs?.adaptiveText).toBe(false);
    expect(PLANADAY_RELEASE.version).toBe('4.2.0');
    expect(PLANADAY_RELEASE.indexedDbName).toBe('dayplana-v2');
  });

  it('PD-018: Presentation HTML export embeds inline base64 images, real HTML tables, rotation, opacity, aspect ratio, transitions, and speaker notes', () => {
    const html = buildPresentationHtmlDeck(
      'Quarterly Lab Review',
      {
        theme: 'paper',
        aspect: '4:3',
        slides: [
          {
            id: 'sl1',
            title: 'Metrics & Photo',
            background: '#fdfaf3',
            transition: 'slide',
            speakerNotes: 'Highlight calibration drift reduction.',
            elements: [
              { id: 'e1', kind: 'image', x: 5, y: 10, w: 40, h: 40, content: 'lab.png', blobHash: 'abc123', rotate: 15, opacity: 0.85 },
              { id: 'e2', kind: 'table', x: 50, y: 10, w: 45, h: 35, content: 'Metric,Value\nBias,0.02' },
              { id: 'e3', kind: 'code', x: 5, y: 60, w: 90, h: 25, content: 'const ok = true;' },
            ],
          },
        ],
      },
      { abc123: 'data:image/png;base64,iVBORw0KGgo=' }
    );
    expect(html).toContain('aspect-ratio:4 / 3');
    expect(html).toContain('data-transition="slide"');
    expect(html).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('transform:rotate(15deg)');
    expect(html).toContain('opacity:0.85');
    expect(html).toContain('<table');
    expect(html).toContain('>Bias</td>');
    expect(html).toContain('<code>const ok = true;</code>');
    expect(html).toContain('Highlight calibration drift reduction.');
  });

  it('PD-011 / PD-012 / PD-013 / PD-019 / CAL-002: responsive studio split classes, zero unnamed buttons in Physical Planner & Files, and synchronous Flow Calendar Adaptive Text toggle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mountView = async (Component: React.FC) => {
      await act(async () => {
        root.render(React.createElement(AppProvider, null, React.createElement(Component)));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
    };

    try {
      // 1. Physical Planner: ZERO unnamed buttons (PD-013)
      await mountView(DigitalPlannerView);
      const plannerButtons = Array.from(container.querySelectorAll('button'));
      const unnamedPlanner = plannerButtons.filter(
        (b) => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.title
      );
      expect(unnamedPlanner.length).toBe(0);

      // 2. Universal Files, Projects & Records, Camera & Photos: responsive .dp-studio-split class (PD-011/PD-012/PD-019)
      await mountView(FileManagerView);
      expect(container.querySelector('.dp-studio-split')).toBeTruthy();
      const unnamedFiles = Array.from(container.querySelectorAll('button')).filter(
        (b) => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.title
      );
      expect(unnamedFiles.length).toBe(0);

      await mountView(ProjectsView);
      expect(container.querySelector('.dp-studio-split')).toBeTruthy();

      await mountView(PhotoStudioView);
      expect(container.querySelector('.dp-studio-split')).toBeTruthy();

      // 3. Flow Calendar CAL-002 (R-0005): Adaptive Text checkbox toggles synchronously and persists in IndexedDB!
      await mountView(FlowCalendarView);
      const drawerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Calendar Zoom, Gridlines, Text Scaling')
      );
      expect(drawerBtn).toBeTruthy();
      await act(async () => {
        drawerBtn!.click();
      });

      const adaptiveLabel = Array.from(container.querySelectorAll('label')).find((l) =>
        l.textContent?.includes('Adaptive Text')
      );
      const adaptiveCheckbox = adaptiveLabel?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      expect(adaptiveCheckbox).toBeTruthy();
      expect(adaptiveCheckbox!.checked).toBe(true);

      // Click to uncheck — must flip SYNCHRONOUSLY without reverting!
      await act(async () => {
        adaptiveCheckbox!.click();
      });
      expect(adaptiveCheckbox!.checked).toBe(false);

      // Confirm persisted to IndexedDB
      await new Promise((r) => setTimeout(r, 80));
      const persisted = await getOrInitSettings();
      expect(persisted.calendarPrefs?.adaptiveText).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
