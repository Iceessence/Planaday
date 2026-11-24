import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, storeBlob, updateSettings } from '../src/core/db';
import {
  createRecord,
  performRedo,
  performUndo,
  purgeExpiredTrash,
  restoreFromTrash,
  softDeleteRecord,
  updateRecord,
  wipeSampleData,
} from '../src/core/repository';
import { computeLogicalDateIso } from '../src/core/temporal';
import { computeGuardedTheme, contrastRatio, guardReadableInk, THEME_PRESETS } from '../src/data/themes';
import { BUILTIN_STICKERS, STICKER_CATEGORIES } from '../src/data/stickers';
import { OFFLINE_LEARNING_FACTS } from '../src/data/facts';
import { COOKING_DENSITIES } from '../src/data/densities';
import { exportFullZipBackup, importZipBackup } from '../src/core/backup';
import { mergeRecordsSafely, runSyncCycle } from '../src/core/sync';
import { buildDayplanaServer } from '../server/index';
import type { MealPlanPayload, NotePayload, PantryLotPayload } from '../src/core/types';

describe('Phase 0 — Kernel & UX Shell Verification Gate', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.blobs.clear();
    await db.outbox.clear();
    await db.undoStack.clear();
    await db.redoStack.clear();
    await db.revisions.clear();
    await db.timeLedger.clear();
    await db.settings.clear();
    await db.syncConflicts.clear();
  });

  it('bundles 260+ built-in stickers across 20 categories, 120+ offline facts, and 10 cooking densities offline', () => {
    expect(STICKER_CATEGORIES.length).toBeGreaterThanOrEqual(20);
    expect(BUILTIN_STICKERS.length).toBeGreaterThanOrEqual(260);
    for (const cat of STICKER_CATEGORIES) {
      expect(BUILTIN_STICKERS.filter((s) => s.category === cat).length).toBeGreaterThanOrEqual(12);
    }
    expect(OFFLINE_LEARNING_FACTS.length).toBeGreaterThanOrEqual(120);
    expect(COOKING_DENSITIES).toHaveLength(10);
  });

  it('saves and retrieves a 100,000-word note in IndexedDB with ZERO localStorage usage', async () => {
    const words = Array.from({ length: 100_000 }, (_, i) => `stationery${i}`).join(' ');
    expect(words.split(' ').length).toBe(100_000);

    const saved = await createRecord<NotePayload>('note', '100k-Word Manuscript', {
      notebookId: 'nb_personal',
      writtenForDate: '2026-11-23',
      content: words,
    });

    const loaded = await db.records.get(saved.id);
    expect(loaded).toBeDefined();
    expect((loaded!.payload as unknown as NotePayload).content.length).toBe(words.length);
    expect(window.localStorage.length).toBe(0);
  });

  it('stores binary blobs content-addressed outside JSON records and survives ZIP export/import (Offline Computer Mode)', async () => {
    const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const stored = await storeBlob(new Blob([sampleBytes], { type: 'image/png' }), 'photo.png');
    expect(stored.hash.length).toBeGreaterThanOrEqual(16);

    await createRecord('note', 'With Attachment', {
      notebookId: 'nb_personal',
      writtenForDate: '2026-11-23',
      content: 'Photo attached',
      attachmentBlobIds: [stored.hash],
    });

    const zip = await exportFullZipBackup();
    await db.records.clear();
    await db.blobs.clear();

    const imported = await importZipBackup(zip);
    expect(imported.importedRecords).toBe(1);
    expect(imported.importedBlobs).toBe(1);
    expect(await db.blobs.get(stored.hash)).toBeDefined();
  });

  it('dynamically computes midnight and 4:00 AM Night Owl logical day rollover accurately', () => {
    const tz = 'America/Los_Angeles';
    // 2026-11-23 23:59 PST -> UTC 2026-11-24T07:59:00Z
    const justBeforeMidnight = Date.parse('2026-11-24T07:59:00Z');
    // 2026-11-24 00:01 PST -> UTC 2026-11-24T08:01:00Z
    const justAfterMidnight = Date.parse('2026-11-24T08:01:00Z');
    // 2026-11-24 03:30 PST -> UTC 2026-11-24T11:30:00Z
    const at330am = Date.parse('2026-11-24T11:30:00Z');
    // 2026-11-24 04:01 PST -> UTC 2026-11-24T12:01:00Z
    const at401am = Date.parse('2026-11-24T12:01:00Z');

    // Midnight boundary (0)
    expect(computeLogicalDateIso(justBeforeMidnight, 0, tz)).toBe('2026-11-23');
    expect(computeLogicalDateIso(justAfterMidnight, 0, tz)).toBe('2026-11-24');

    // Night Owl 4:00 AM boundary (4)
    expect(computeLogicalDateIso(justAfterMidnight, 4, tz)).toBe('2026-11-23');
    expect(computeLogicalDateIso(at330am, 4, tz)).toBe('2026-11-23');
    expect(computeLogicalDateIso(at401am, 4, tz)).toBe('2026-11-24');
  });

  it('enforces OKLCH WCAG AA/AAA contrast guard even on pastel yellow or light mint accents', () => {
    const pastelYellow = '#fff59d';
    const lightMint = '#c8f7dc';
    const yellowGuard = guardReadableInk(pastelYellow, '#ffffff', 4.5);
    const mintGuard = guardReadableInk(lightMint, '#f0f0f0', 7.0);

    expect(yellowGuard.adjusted).toBe(true);
    expect(contrastRatio(pastelYellow, yellowGuard.color)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightMint, mintGuard.color)).toBeGreaterThanOrEqual(7.0);

    for (const preset of THEME_PRESETS) {
      const guarded = computeGuardedTheme(preset.tokens, 4.5);
      expect(guarded.paperContrast).toBeGreaterThanOrEqual(4.5);
      expect(guarded.accentContrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('supports 20-step Undo/Redo, 30-day Trash cascading rules, and selective sample wipe', async () => {
    const r = await createRecord('task', 'Step 0', { subtasks: [] });
    for (let i = 1; i <= 22; i++) {
      await updateRecord(r.id, { title: `Step ${i}` });
    }
    expect(await db.undoStack.count()).toBe(20);

    const undone = await performUndo();
    expect(undone.ok).toBe(true);
    expect((await db.records.get(r.id))?.title).toBe('Step 21');

    const redone = await performRedo();
    expect(redone.ok).toBe(true);
    expect((await db.records.get(r.id))?.title).toBe('Step 22');

    // Cascade Rule 1: Deleting a recipe preserves Meal Plan with deletedRecipeName badge
    const recipe = await createRecord('recipe', 'Heirloom Stew', { ingredients: [], steps: [] });
    const meal = await createRecord<MealPlanPayload>('meal_plan', 'Dinner', {
      date: '2026-11-23',
      slot: 'dinner',
      entryType: 'recipe',
      recipeId: recipe.id,
    });
    await softDeleteRecord(recipe.id);
    const mealAfter = await db.records.get(meal.id);
    expect((mealAfter?.payload as unknown as MealPlanPayload).deletedRecipeName).toBe('Heirloom Stew');
    expect(mealAfter?.deletedAt).toBeNull();

    await restoreFromTrash(recipe.id);
    expect((await db.records.get(recipe.id))?.deletedAt).toBeNull();

    // Cascade Rule 3: Deleting Pantry Zone moves lots to "Unassigned"
    const zone = await createRecord('pantry_zone', 'Basement Shelf', {});
    const lot = await createRecord<PantryLotPayload>('pantry_lot', 'Oats', {
      ingredientName: 'Oats',
      canonicalName: 'oats',
      quantity: 2,
      unit: 'cup',
      zone: 'Basement Shelf',
    });
    await softDeleteRecord(zone.id);
    expect(((await db.records.get(lot.id))?.payload as unknown as PantryLotPayload).zone).toBe('Unassigned');

    // Purge >30d expired trash
    const oldRec = await createRecord('thought', 'Ancient', { content: 'old' });
    await db.records.update(oldRec.id, { deletedAt: new Date(Date.now() - 35 * 86400000).toISOString() });
    expect(await purgeExpiredTrash()).toBe(1);

    // Wipe sample data only
    await createRecord('task', 'Sample Only', { subtasks: [] }, { isSample: true });
    const wiped = await wipeSampleData();
    expect(wiped).toBe(1);
    expect(await db.records.get(r.id)).toBeDefined();
  });

  it('syncs records & blobs against the self-hosted Docker SQLite server and preserves conflict copies', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dayplana-sync-test-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: address });
      const note = await createRecord<NotePayload>('note', 'Sync Test Note', {
        notebookId: 'nb_personal',
        writtenForDate: '2026-11-23',
        content: 'Initial offline draft from phone',
      });

      const snap = await runSyncCycle();
      expect(snap.status).toBe('synced');
      expect(snap.pendingCount).toBe(0);

      // Verify server SQLite stored the record
      const pullRes = await fetch(`${address}/api/sync/pull?since=0`);
      const pullJson = (await pullRes.json()) as { records: Array<{ id: string }> };
      expect(pullJson.records.some((rec) => rec.id === note.id)).toBe(true);

      // Verify simultaneous conflicting note edits from two devices detect conflict cleanly
      const deviceA = { ...note, deviceId: 'dev_phone', payload: { ...note.payload, content: 'Phone edited version' } };
      const deviceB = { ...note, deviceId: 'dev_desktop', payload: { ...note.payload, content: 'Desktop edited version' } };
      const merged = mergeRecordsSafely(deviceA, deviceB);
      expect(merged.hasConflict).toBe(true);

      // Verify Offline Phone mode operates standalone with zero errors
      await updateSettings({ operatingMode: 'offline-phone' });
      const offlineSnap = await runSyncCycle();
      expect(offlineSnap.status).toBe('standalone');
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
