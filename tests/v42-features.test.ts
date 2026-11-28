import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, getOrInitSettings, updateSettings } from '../src/core/db';
import { createRecord } from '../src/core/repository';
import {
  evaluateSyncPolicy,
  markUserActivity,
  resetSyncActivityState,
  runSyncCycle,
  setSyncEnvironmentOverrides,
} from '../src/core/sync';
import {
  convertDailyNoteToTarget,
  findCanonicalDailyNote,
  upsertCanonicalDailyNote,
} from '../src/core/dailyNotes';
import {
  analyzeOcrConfidence,
  computeHomographyMatrix,
  detectDocumentBounds,
  enhanceDocumentScanRgba,
  extractTableFromOcrText,
  saveScanToPlanadayTarget,
  warpPerspectiveRgba,
} from '../src/core/documentScanner';
import {
  addBlankPdfPage,
  applyPdfAnnotationsAndRedactions,
  cropPdfPage,
  deletePdfPage,
  duplicatePdfPage,
  fillPdfFormFields,
  inspectPdfBytes,
  mergePdfDocuments,
  reorderPdfPages,
  rotatePdfPage,
  splitPdfDocument,
} from '../src/core/pdfEngine';
import { InvertedSearchIndex } from '../src/core/searchIndex';
import { buildDayplanaServer } from '../server/index';
import type { LifeRecord, NotePayload, PdfDocPayload, ScannedDocPayload } from '../src/core/types';

async function resetLocalDb() {
  await db.records.clear();
  await db.blobs.clear();
  await db.outbox.clear();
  await db.syncConflicts.clear();
  await db.revisions.clear();
  await db.settings.clear();
  resetSyncActivityState();
  await getOrInitSettings();
}

describe('Planaday v4.2.0 Acceptance Suite (§3–§7)', () => {
  beforeEach(async () => {
    await resetLocalDb();
  });

  afterEach(() => {
    resetSyncActivityState();
  });

  // --- §3: True Offline-First & Activity-Aware Intelligent Sync ---
  it('§3: defers automatic sync during active typing, fires after inactivity, enforces maxDelaySec cap, and honors manual/wifi/charging/selective policies', async () => {
    const t0 = 1_700_000_000_000;

    // 1. Smart mode: active typing within 10s defers sync
    const dActive = evaluateSyncPolicy(
      { mode: 'smart', inactivityDelaySec: 10, maxDelaySec: 120 },
      { manual: false, operatingMode: 'docker-sync', nowMs: t0 + 3000, lastUserActivityMs: t0, firstPendingMs: t0 }
    );
    expect(dActive.allowed).toBe(false);
    expect(dActive.reason).toMatch(/actively working/i);

    // 2. Smart mode: once 10s of inactivity elapses, sync is allowed!
    const dIdle = evaluateSyncPolicy(
      { mode: 'smart', inactivityDelaySec: 10, maxDelaySec: 120 },
      { manual: false, operatingMode: 'docker-sync', nowMs: t0 + 11_000, lastUserActivityMs: t0, firstPendingMs: t0 }
    );
    expect(dIdle.allowed).toBe(true);

    // 3. Smart mode: even during continuous typing, maxDelaySec cap (120s) forces sync so edits are never postponed forever!
    const dCap = evaluateSyncPolicy(
      { mode: 'smart', inactivityDelaySec: 10, maxDelaySec: 120 },
      {
        manual: false,
        operatingMode: 'docker-sync',
        nowMs: t0 + 125_000,
        lastUserActivityMs: t0 + 124_000,
        firstPendingMs: t0,
      }
    );
    expect(dCap.allowed).toBe(true);

    // 4. Manual mode blocks background sync, permits explicit manual sync
    expect(
      evaluateSyncPolicy({ mode: 'manual' }, { manual: false, operatingMode: 'docker-sync', nowMs: t0 }).allowed
    ).toBe(false);
    expect(
      evaluateSyncPolicy({ mode: 'manual' }, { manual: true, operatingMode: 'docker-sync', nowMs: t0 }).allowed
    ).toBe(true);

    // 5. Offline mode always blocks sync
    expect(
      evaluateSyncPolicy({ mode: 'offline' }, { manual: true, operatingMode: 'docker-sync', nowMs: t0 }).allowed
    ).toBe(false);

    // 6. Wi-Fi only & Charging only policies
    expect(
      evaluateSyncPolicy(
        { mode: 'continuous', wifiOnly: true },
        { manual: false, operatingMode: 'docker-sync', connectionType: 'cellular', nowMs: t0 }
      ).allowed
    ).toBe(false);
    expect(
      evaluateSyncPolicy(
        { mode: 'continuous', wifiOnly: true },
        { manual: false, operatingMode: 'docker-sync', connectionType: 'wifi', nowMs: t0 }
      ).allowed
    ).toBe(true);
    expect(
      evaluateSyncPolicy(
        { mode: 'continuous', chargingOnly: true },
        { manual: false, operatingMode: 'docker-sync', charging: false, nowMs: t0 }
      ).allowed
    ).toBe(false);

    // 7. Live runSyncCycle with Selective Workspace Sync only pushes selected workspace ops!
    await updateSettings({
      operatingMode: 'docker-sync',
      syncServerUrl: 'http://sync.local:3000',
      syncPolicy: {
        mode: 'smart',
        inactivityDelaySec: 10,
        maxDelaySec: 120,
        scheduledIntervalMin: 15,
        wifiOnly: false,
        chargingOnly: false,
        selectiveWorkspaceIds: ['ws_lab'],
      },
    });
    await createRecord('note', 'Personal Private Note', { notebookId: 'nb_personal', writtenForDate: '2026-11-27', content: 'private' }, { workspaceId: 'ws_personal' });
    await createRecord('note', 'Lab Synced Note', { notebookId: 'nb_work', writtenForDate: '2026-11-27', content: 'lab' }, { workspaceId: 'ws_lab' });

    // Background sync while user just typed -> deferred with ZERO fetch calls!
    let fetchCalls = 0;
    const pushedWorkspaces: string[] = [];
    const mockFetch = (async (url: string, init?: RequestInit) => {
      fetchCalls++;
      if (String(url).includes('/api/sync/push')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { operations: Array<{ opId: string; record?: LifeRecord }> };
        for (const op of body.operations) {
          if (op.record?.workspaceId) pushedWorkspaces.push(op.record.workspaceId);
        }
        return new Response(
          JSON.stringify({ acceptedOpIds: body.operations.map((o) => o.opId), conflicts: [], seq: 1, serverId: 'srv_1', syncEpoch: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ seq: 1, records: [], serverId: 'srv_1', syncEpoch: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    markUserActivity(t0);
    const deferredSnap = await runSyncCycle(mockFetch, { manual: false, nowMs: t0 + 2000 });
    expect(deferredSnap.status).toBe('deferred');
    expect(fetchCalls).toBe(0);

    // Explicit manual sync runs immediately & ONLY pushes ws_lab!
    setSyncEnvironmentOverrides(null);
    const syncedSnap = await runSyncCycle(mockFetch, { manual: true, nowMs: t0 + 2500 });
    expect(syncedSnap.status).toBe('synced');
    expect(pushedWorkspaces).toEqual(['ws_lab']);
  });

  // --- §4: Unified Daily Notes Archive (Zero Duplication + Bidirectional Backlinks) ---
  it('§4: unifies Today Spread & Daily Notes Archive onto one canonical note record with zero duplication and bidirectional conversions', async () => {
    const dateIso = '2026-11-27';
    let all = await db.records.toArray();
    const first = await upsertCanonicalDailyNote(all, dateIso, 'Initial scratchpad thought');
    all = await db.records.toArray();
    const second = await upsertCanonicalDailyNote(all, dateIso, 'Updated scratchpad with meeting notes');

    // Exact same record ID — ZERO duplicate notes!
    expect(second.id).toBe(first.id);
    all = await db.records.toArray();
    const allNotes = all.filter((r) => r.type === 'note' && !r.deletedAt) as Array<LifeRecord<NotePayload>>;
    expect(allNotes.length).toBe(1);
    expect(findCanonicalDailyNote(all, dateIso)?.id).toBe(first.id);
    expect(allNotes[0].payload.content).toBe('Updated scratchpad with meeting notes');

    // Convert to Task & Project -> verify automatic bidirectional links!
    const taskConv = await convertDailyNoteToTarget(allNotes[0], 'task', all);
    expect(taskConv.createdOrUpdated.type).toBe('task');
    expect(taskConv.createdOrUpdated.links.some((l) => l.targetId === first.id && l.relation === 'daily_source')).toBe(true);

    all = await db.records.toArray();
    const refreshedNote = (await db.records.get(first.id)) as LifeRecord<NotePayload>;
    expect(refreshedNote.links.some((l) => l.targetId === taskConv.createdOrUpdated.id && l.relation === 'converted_to')).toBe(true);

    // Promote to Permanent Knowledge Note in place (still 1 note record, preserves sourcePlannerDate!)
    const promo = await convertDailyNoteToTarget(refreshedNote, 'permanent_knowledge', all);
    expect(promo.createdOrUpdated.id).toBe(first.id);
    const promotedNote = (await db.records.get(first.id)) as LifeRecord<NotePayload>;
    expect(promotedNote.payload.dailyCategory).toBe('general_knowledge');
    expect(promotedNote.payload.sourcePlannerDate).toBe(dateIso);
    expect(promotedNote.payload.promotedToKnowledgeAt).toBeTruthy();
  });

  // --- §5: Physical Note Scanner, Homography, Shadow Reduction, Table CSV & Manual Lab Review Gate ---
  it('§5: detects document edges, warps perspective, removes shadows, parses tables, and enforces Lab manual review gate', async () => {
    // Synthesize a 64x64 dark desk image with a bright tilted white page in the center
    const w = 64;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const inPage = x >= 12 && x <= 52 && y >= 10 && y <= 54;
        // Apply uneven shadow across the bright page (left side darker than right side)
        const shadow = inPage ? Math.round(130 + ((x - 12) / 40) * 100) : 24;
        rgba[idx] = shadow;
        rgba[idx + 1] = shadow;
        rgba[idx + 2] = shadow;
        rgba[idx + 3] = 255;
      }
    }

    const quad = detectDocumentBounds(rgba, w, h);
    expect(quad.length).toBe(4);
    expect(quad[0][0]).toBeGreaterThan(0.1);
    expect(quad[0][0]).toBeLessThan(0.3);
    expect(quad[2][0]).toBeGreaterThan(0.7);

    const H = computeHomographyMatrix(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]
    );
    expect(H[0]).toBeCloseTo(1, 5);
    expect(H[4]).toBeCloseTo(1, 5);

    const warped = warpPerspectiveRgba(rgba, w, h, quad, 40, 40);
    expect(warped.length).toBe(40 * 40 * 4);
    // Center of warped page should be bright page pixels, not dark desk border
    const centerIdx = (20 * 40 + 20) * 4;
    expect(warped[centerIdx]).toBeGreaterThan(120);

    // Enhance with shadow reduction -> left side of page should brighten substantially!
    const enhanced = enhanceDocumentScanRgba(warped, 40, 40, {
      contrastBoost: 30,
      shadowReduction: true,
      bwMode: false,
    });
    const leftPageIdx = (20 * 40 + 6) * 4;
    expect(enhanced[leftPageIdx]).toBeGreaterThan(warped[leftPageIdx]);

    // Table extraction -> CSV
    const tbl = extractTableFromOcrText('SampleID | Moisture% | Protein%\nS-101 | 11.4 | 18.2\nS-102 | 12.1 | 17.9');
    expect(tbl).not.toBeNull();
    expect(tbl?.headers).toEqual(['SampleID', 'Moisture%', 'Protein%']);
    expect(tbl?.rows.length).toBe(2);
    expect(tbl?.csv).toContain('S-101,11.4,18.2');

    // Confidence analysis flags < 70% words & enforces Lab manual review safety gate!
    const conf = analyzeOcrConfidence([
      { text: 'Moisture', confidence: 96 },
      { text: '11.4%', confidence: 62 },
    ]);
    expect(conf.requiresManualReview).toBe(true);
    expect(conf.uncertainWords.map((w) => w.text)).toEqual(['11.4%']);

    const scanRec = await createRecord<ScannedDocPayload>('scanned_doc', 'Bench Sheet #4', {
      pages: [
        {
          id: 'spg_1',
          pageNumber: 1,
          originalBlobHash: 'abcdef1234567890abcdef1234567890',
          corners: quad,
          rotationDeg: 0,
          contrastBoost: 30,
          shadowReduction: true,
          bwMode: false,
          extractedText: 'Moisture 11.4%',
          confidence: 79,
          uncertainWords: conf.uncertainWords,
          engineUsed: 'tesseract-local',
        },
      ],
      combinedText: 'Moisture 11.4%',
      avgConfidence: 79,
      engineUsed: 'tesseract-local',
      language: 'eng',
      requiresManualReview: true,
      manualReviewConfirmed: false,
    });

    // Must reject saving to Laboratory Research before manualReviewConfirmed is true!
    await expect(
      saveScanToPlanadayTarget(scanRec, 'lab_research', {
        editedText: 'Moisture 11.4%',
        logicalToday: '2026-11-27',
      })
    ).rejects.toThrow(/Manual review confirmation is required/i);

    // Confirm manual review -> succeeds & preserves scan link!
    const confirmedScan: LifeRecord<ScannedDocPayload> = {
      ...scanRec,
      payload: { ...scanRec.payload, manualReviewConfirmed: true },
    };
    const savedLab = await saveScanToPlanadayTarget(confirmedScan, 'lab_research', {
      editedText: 'Moisture 11.4%',
      logicalToday: '2026-11-27',
    });
    expect(savedLab.created.type).toBe('lab_research');
    expect(savedLab.created.links.some((l) => l.targetId === scanRec.id)).toBe(true);
  });

  // --- §7: Integrated PDF Engine (Structural Edits, Forms, Merge/Split, True Irreversible Secure Redaction & Search) ---
  it('§7: performs true pdf-lib structural edits, AcroForm fill, merge/split, irreversible redaction removing secret bytes, and indexes PDF in Global Search', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.setTitle('Confidential Lab Report');
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const p1 = doc.addPage([612, 792]);
    p1.drawText('TOP-SECRET-SSN-999-88-7777', { x: 50, y: 700, size: 14, font });
    const form = doc.getForm();
    const nameField = form.createTextField('AnalystName');
    nameField.setText('Pending');
    nameField.addToPage(p1, { x: 50, y: 600, width: 200, height: 24 });

    const p2 = doc.addPage([612, 792]);
    p2.drawText('PUBLIC-SUMMARY-SPECTROMETRY-OK', { x: 50, y: 700, size: 14, font });

    const origBytes = await doc.save({ useObjectStreams: false });

    // 1. Metadata & AcroForm inspection
    const meta = await inspectPdfBytes(origBytes);
    expect(meta.pageCount).toBe(2);
    expect(meta.title).toBe('Confidential Lab Report');
    expect(meta.formFields.some((f) => f.name === 'AnalystName')).toBe(true);

    // 2. AcroForm filling
    const filledBytes = await fillPdfFormFields(origBytes, { AnalystName: 'Dr. Rivera' });
    const filledMeta = await inspectPdfBytes(filledBytes);
    expect(filledMeta.formFields.find((f) => f.name === 'AnalystName')?.value).toBe('Dr. Rivera');

    // 3. Structural page edits: rotate, crop, duplicate, add blank, reorder, delete, split, merge
    const rotated = await rotatePdfPage(origBytes, 0, 90);
    expect((await inspectPdfBytes(rotated)).pageSizes[0].rotation).toBe(90);

    const cropped = await cropPdfPage(origBytes, 0, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    expect((await inspectPdfBytes(cropped)).pageCount).toBe(2);

    const duped = await duplicatePdfPage(origBytes, 0);
    expect((await inspectPdfBytes(duped)).pageCount).toBe(3);

    const withBlank = await addBlankPdfPage(duped, 1);
    expect((await inspectPdfBytes(withBlank)).pageCount).toBe(4);

    const deleted = await deletePdfPage(withBlank, 1);
    expect((await inspectPdfBytes(deleted)).pageCount).toBe(3);

    const reordered = await reorderPdfPages(origBytes, [1, 0]);
    expect((await inspectPdfBytes(reordered)).pageCount).toBe(2);

    const splitPage2 = await splitPdfDocument(origBytes, [1]);
    expect((await inspectPdfBytes(splitPage2)).pageCount).toBe(1);

    const merged = await mergePdfDocuments([origBytes, splitPage2]);
    expect((await inspectPdfBytes(merged)).pageCount).toBe(3);

    // 4. TRUE IRREVERSIBLE SECURE REDACTION on page 1:
    // Helper that inflates ALL FlateDecode PDF streams + raw PDF bytes to prove zero secret bytes survive!
    const dumpAllPdfTextContent = (pdfBytes: Uint8Array): string => {
      const buf = Buffer.from(pdfBytes);
      const raw = buf.toString('latin1');
      const parts = [raw];
      let cursor = 0;
      while (true) {
        const sIdx = buf.indexOf('stream', cursor, 'latin1');
        if (sIdx === -1) break;
        let dataStart = sIdx + 6;
        if (buf[dataStart] === 13 && buf[dataStart + 1] === 10) dataStart += 2;
        else if (buf[dataStart] === 10) dataStart += 1;
        const eIdx = buf.indexOf('endstream', dataStart, 'latin1');
        if (eIdx === -1) break;
        const chunk = buf.subarray(dataStart, eIdx);
        try {
          const inflated = zlib.inflateSync(chunk).toString('latin1');
          parts.push(inflated);
          // Also decode PDF hex-encoded Tj text strings (e.g. <544F50...> -> "TOP...")
          for (const m of inflated.matchAll(/<([0-9A-Fa-f]{8,})>/g)) {
            parts.push(Buffer.from(m[1], 'hex').toString('latin1'));
          }
        } catch {
          // Non-flate or padded stream
        }
        cursor = eIdx + 9;
      }
      return parts.join('\n');
    };

    // Original PDF streams contain the secret; redacted PDF streams MUST NOT contain it anywhere!
    const origAllContent = dumpAllPdfTextContent(origBytes);
    expect(origAllContent).toContain('TOP-SECRET-SSN-999-88-7777');
    expect(origAllContent).toContain('PUBLIC-SUMMARY-SPECTROMETRY-OK');

    const redacted = await applyPdfAnnotationsAndRedactions(
      origBytes,
      [
        {
          id: 'ann_1',
          pageIndex: 1,
          kind: 'highlight',
          x: 0.08,
          y: 0.1,
          width: 0.4,
          height: 0.04,
          color: '#e6b800',
          createdAt: '2026-11-27T00:00:00Z',
        },
        {
          id: 'ann_2',
          pageIndex: 1,
          kind: 'stamp',
          x: 0.6,
          y: 0.1,
          color: '#2f7a78',
          text: 'VERIFIED',
          createdAt: '2026-11-27T00:00:00Z',
        },
      ],
      [
        {
          id: 'red_1',
          pageIndex: 0,
          x: 0.05,
          y: 0.08,
          width: 0.6,
          height: 0.08,
        },
      ]
    );

    expect(redacted.structuralEdit).toBe(true);
    expect(redacted.redactedPagesCount).toBe(1);
    expect(redacted.redactionMode).toBe('stream-stripped');

    const redactedAllContent = dumpAllPdfTextContent(redacted.bytes);
    expect(redactedAllContent).not.toContain('TOP-SECRET-SSN-999-88-7777');
    // Unredacted page 2 remains intact & readable!
    expect(redactedAllContent).toContain('PUBLIC-SUMMARY-SPECTROMETRY-OK');

    // 5. Global Search indexes `pdf_doc` extracted text!
    const pdfRecord = await createRecord<PdfDocPayload>('pdf_doc', 'Spectrometry SOP Manual', {
      fileName: 'sop-manual.pdf',
      originalBlobHash: '1111222233334444',
      activeBlobHash: '1111222233334444',
      pageCount: 2,
      currentPage: 1,
      zoom: 1,
      viewMode: 'single',
      readingProgressPct: 50,
      bookmarks: [],
      annotations: [],
      pendingRedactions: [],
      extractedTextByPage: { 1: 'Calibration protocol for NIR spectrometer wavelength drift' },
    });
    const idx = new InvertedSearchIndex();
    idx.upsert(pdfRecord);
    const searchRes = idx.search('wavelength drift');
    expect(searchRes.total).toBe(1);
    expect(searchRes.hits[0].record.id).toBe(pdfRecord.id);
  });

  // --- §6: Optional Self-Hosted GPU Bridge (Auth Enforcement, Graceful Local Fallback & Live Mock GPU Worker) ---
  it('§6: enforces server auth on /api/gpu/*, returns graceful offline fallback when unconfigured, and round-trips live GPU worker jobs', async () => {
    const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-gpu-off-'));
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-gpu-on-'));
    let mockGpuServer: http.Server | null = null;

    try {
      // 1. Server with requireAuth=true and NO GPU configured -> 401 unauth, graceful fallback when authed
      const s1 = await buildDayplanaServer({ dataDir: tmpDir1, requireAuth: true, gpuServiceUrl: '' });
      const unauth = await s1.app.inject({ method: 'GET', url: '/api/gpu/status' });
      expect(unauth.statusCode).toBe(401);

      const setup = await s1.app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { passphrase: 'super-secret-passphrase', deviceId: 'dev_owner' },
      });
      const token = (setup.json() as { token: string }).token;

      const offlineStatus = await s1.app.inject({
        method: 'GET',
        url: '/api/gpu/status',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(offlineStatus.statusCode).toBe(200);
      expect(offlineStatus.json()).toMatchObject({ ok: true, available: false, fallback: 'local' });
      await s1.app.close();

      // 2. Spin up local mock GPU HTTP worker verifying internal bearer token
      let receivedInternalAuth = '';
      mockGpuServer = http.createServer((req, res) => {
        receivedInternalAuth = String(req.headers.authorization || '');
        if (receivedInternalAuth !== 'Bearer internal-rtx-secret') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Forbidden' }));
          return;
        }
        if (req.url === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              available: true,
              cudaAvailable: true,
              deviceName: 'NVIDIA GeForce RTX 5050',
              vramTotalMb: 8192,
              vramUsedMb: 1200,
              memoryLimitMb: 6144,
              activeJobs: 0,
              queuedJobs: 0,
            })
          );
          return;
        }
        if (req.url === '/ocr') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              available: true,
              jobId: 'gpu_job_42',
              text: 'Handwritten Sample #42: 14.8% Moisture',
              words: [
                { text: 'Handwritten', confidence: 94 },
                { text: '14.8%', confidence: 91 },
              ],
              engine: 'gpu-paddleocr',
              deviceUsed: 'NVIDIA GeForce RTX 5050',
              durationMs: 42.5,
            })
          );
          return;
        }
        if (req.url === '/jobs/gpu_job_42/cancel') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, jobId: 'gpu_job_42', status: 'canceled' }));
          return;
        }
        if (req.url === '/benchmark') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              deviceName: 'NVIDIA GeForce RTX 5050',
              cudaAvailable: true,
              cpuMs: 88.4,
              gpuMs: 4.2,
              speedupFactor: 21.05,
            })
          );
          return;
        }
        res.writeHead(404);
        res.end('{}');
      });

      await new Promise<void>((resolve) => mockGpuServer!.listen(0, '127.0.0.1', resolve));
      const addr = mockGpuServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      const s2 = await buildDayplanaServer({
        dataDir: tmpDir2,
        requireAuth: false,
        gpuServiceUrl: `http://127.0.0.1:${port}`,
        gpuInternalToken: 'internal-rtx-secret',
      });

      const statusRes = await s2.app.inject({ method: 'GET', url: '/api/gpu/status' });
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.json()).toMatchObject({
        ok: true,
        available: true,
        deviceName: 'NVIDIA GeForce RTX 5050',
        vramTotalMb: 8192,
      });

      const ocrRes = await s2.app.inject({
        method: 'POST',
        url: '/api/gpu/ocr',
        payload: { imageBase64: Buffer.from('fake-img').toString('base64'), language: 'eng' },
      });
      expect(ocrRes.statusCode).toBe(200);
      expect(ocrRes.json()).toMatchObject({
        ok: true,
        engine: 'gpu-paddleocr',
        text: 'Handwritten Sample #42: 14.8% Moisture',
      });

      const cancelRes = await s2.app.inject({ method: 'POST', url: '/api/gpu/jobs/gpu_job_42/cancel' });
      expect(cancelRes.json()).toMatchObject({ ok: true, status: 'canceled' });

      const benchRes = await s2.app.inject({ method: 'POST', url: '/api/gpu/benchmark' });
      expect(benchRes.json()).toMatchObject({ ok: true, speedupFactor: 21.05 });

      await s2.app.close();
    } finally {
      if (mockGpuServer) {
        await new Promise<void>((resolve) => mockGpuServer!.close(() => resolve()));
      }
      for (const dir of [tmpDir1, tmpDir2]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        } catch {
          // Windows SQLite WAL handle cleanup non-fatal in temp dir
        }
      }
    }
  });
});
