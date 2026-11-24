import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getOrInitSettings, updateSettings } from '../src/core/db';
import { createRecord, softDeleteRecord } from '../src/core/repository';
import { BUILTIN_STICKERS } from '../src/data/stickers';
import { OFFLINE_LEARNING_FACTS } from '../src/data/facts';
import { computeEffortScore } from '../src/modules/life/HouseholdHealthView';
import { sumByCurrency } from '../src/modules/life/FinanceView';
import { fuzzySearchRecords } from '../src/core/search';
import { evaluateAutomations, type AutomationRulePayload } from '../src/core/automations';
import { sanitizeSvgMarkup } from '../src/core/sanitizer';
import { mergeRecordsSafely, resolveConflict, runSyncCycle } from '../src/core/sync';
import { buildDayplanaServer } from '../server/index';
import type { DecorItemPayload, NotePayload } from '../src/core/types';

describe('Phase 4 — Decor, Optional Life-OS, Automations & Final Verification Gate', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.blobs.clear();
    await db.outbox.clear();
    await db.syncConflicts.clear();
    await db.settings.clear();
  });

  it('loads all 208 built-in stickers + 40 facts offline, stores normalized anchored decor coordinates, and sanitizes custom SVGs', async () => {
    expect(BUILTIN_STICKERS).toHaveLength(208);
    expect(OFFLINE_LEARNING_FACTS).toHaveLength(40);

    const sticker = await createRecord<DecorItemPayload>('decor_item', 'Birthday cake', {
      spreadKey: 'today:2026-11-23:right',
      kind: 'sticker',
      anchorId: 'today:2026-11-23:right',
      relX: 0.78,
      relY: 0.22,
      scale: 1.2,
      rotation: -8,
      opacity: 1,
      zIndex: 5,
      locked: false,
      stickerId: BUILTIN_STICKERS[0].id,
      emoji: BUILTIN_STICKERS[0].emoji,
    });
    expect(sticker.payload.relX).toBe(0.78);
    expect(sticker.payload.anchorId).toBe('today:2026-11-23:right');

    const dirtySvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="10" cy="10" r="8" onclick="evil()"/></svg>';
    const cleanSvg = await sanitizeSvgMarkup(dirtySvg);
    expect(cleanSvg).not.toContain('<script');
    expect(cleanSvg).not.toContain('onclick');
    expect(cleanSvg).toContain('<circle');
  });

  it('hiding a module removes it from search/navigation WITHOUT deleting underlying records', async () => {
    await updateSettings({ enabledModules: { ...(await getOrInitSettings()).enabledModules, home_assets: true } });
    const bin = await createRecord('storage_item', 'Holiday lights', { binLocation: 'Garage Bin #4' });

    // Typo-tolerant global search ("holidy lghts" — 1-edit-distance per word!) finds Garage Bin #4
    const allRecs = await db.records.toArray();
    const hitBefore = fuzzySearchRecords(allRecs, 'holidy lghts');
    expect(hitBefore.total).toBe(1);
    expect(hitBefore.hits[0].record.id).toBe(bin.id);

    // Toggle home_assets module OFF -> search excludes hidden types, yet record stays intact in DB!
    await updateSettings({ enabledModules: { ...(await getOrInitSettings()).enabledModules, home_assets: false } });
    const hitHidden = fuzzySearchRecords(allRecs, 'holiday', { hiddenTypes: ['storage_item'] });
    expect(hitHidden.total).toBe(0);
    expect(await db.records.get(bin.id)).toBeDefined();
  });

  it('computes Effort Fairness exact formula, strict multi-currency totals, Person delete cascade, and idempotent Automations', async () => {
    // Effort Fairness: minutes * (1 + difficulty*0.2 + energy*0.15)
    expect(computeEffortScore(20, 3, 'high')).toBe(41); // 20 * (1 + 0.6 + 0.45) = 41.0

    // Multi-currency NEVER sums USD and EUR together
    const totals = sumByCurrency([
      { amount: 50, currency: 'USD' },
      { amount: 25.5, currency: 'USD' },
      { amount: 40, currency: 'EUR' },
    ]);
    expect(totals).toEqual({ USD: 75.5, EUR: 40 });

    // Person delete cascade: unlink vs trash birthdays
    const person = await createRecord('person', 'Alex', { keepInTouchDays: 14 });
    const bday = await createRecord('life_event', "Alex's Birthday", { month: 5, day: 12, personId: person.id }, {
      category: 'Birthday',
      links: [{ targetId: person.id, targetType: 'person', relation: 'person' }],
    });
    await softDeleteRecord(person.id, { personBirthdayAction: 'unlink' });
    const bdayAfter = await db.records.get(bday.id);
    expect(bdayAfter?.deletedAt).toBeNull();
    expect((bdayAfter?.payload as { personId: string | null }).personId).toBeNull();

    // Local Automation Engine: dry-run, real execution, and idempotency guard
    await createRecord<AutomationRulePayload>('automation_rule', 'Low Med Refill', {
      enabled: true,
      trigger: 'med_low_stock',
      conditionThreshold: 7,
      action: 'create_refill_task',
    });

    const dry = await evaluateAutomations('med_low_stock', {
      subjectName: 'Vitamin D',
      numericValue: 5,
      todayIso: '2026-11-23',
      dryRun: true,
    });
    expect(dry[0].matched).toBe(true);
    expect(dry[0].dryRun).toBe(true);
    expect(await db.records.where('type').equals('task').count()).toBe(0);

    const real1 = await evaluateAutomations('med_low_stock', {
      subjectName: 'Vitamin D',
      numericValue: 5,
      todayIso: '2026-11-23',
      idempotencyKey: 'vitd-2026-11-23',
    });
    expect(real1[0].matched).toBe(true);
    expect(await db.records.where('type').equals('task').count()).toBe(1);

    // Same idempotencyKey must NOT create duplicate refill task
    const real2 = await evaluateAutomations('med_low_stock', {
      subjectName: 'Vitamin D',
      numericValue: 5,
      todayIso: '2026-11-23',
      idempotencyKey: 'vitd-2026-11-23',
    });
    expect(real2[0].matched).toBe(false);
    expect(await db.records.where('type').equals('task').count()).toBe(1);
  });

  it('syncs offline two-device edits via Docker server without silently discarding either device edit', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dayplana-p4-sync-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: address, deviceId: 'dev_phone' });
      const note = await createRecord<NotePayload>('note', 'Shared Journal', {
        notebookId: 'nb_personal',
        writtenForDate: '2026-11-23',
        content: 'Version written on phone offline',
      });
      await runSyncCycle();

      // Simulate Device B pushing an update to the same note directly to server
      await fetch(`${address}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev_desktop',
          operations: [
            {
              opId: 'op_desktop_1',
              recordId: note.id,
              operation: 'upsert',
              baseRev: 1,
              record: {
                ...note,
                rev: 2,
                deviceId: 'dev_desktop',
                updatedAt: new Date(Date.now() + 5000).toISOString(),
                payload: { ...note.payload, content: 'Version edited on desktop offline' },
              },
            },
          ],
        }),
      });

      // Phone edits offline while still at rev 1, then reconnects and syncs -> conflict saved safely!
      const phoneEdited = {
        ...note,
        rev: 2,
        deviceId: 'dev_phone',
        payload: { ...note.payload, content: 'Phone added another long paragraph offline' },
      };
      await db.records.put(phoneEdited);
      await db.outbox.put({
        opId: 'op_phone_conflict',
        recordId: note.id,
        operation: 'upsert',
        record: phoneEdited,
        baseRev: 1,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      const snap = await runSyncCycle();
      expect(snap.conflictCount).toBe(1);

      const conflicts = await db.syncConflicts.toArray();
      expect(conflicts).toHaveLength(1);
      // Resolve with "keep-both" -> original preserves desktop text, conflict copy preserves phone text!
      await resolveConflict(conflicts[0].id, 'keep-both');
      const allNotes = (await db.records.where('type').equals('note').toArray()) as Array<
        typeof note
      >;
      expect(allNotes).toHaveLength(2);
      expect(allNotes.some((n) => n.payload.content.includes('desktop'))).toBe(true);
      expect(allNotes.some((n) => n.payload.content.includes('Phone added'))).toBe(true);

      // Non-overlapping field edit merges cleanly with zero conflict
      const recA = { ...note, title: 'Renamed on Phone', deviceId: 'dev_phone', fieldUpdatedAt: { title: '2026-11-24T00:00:00Z' } };
      const recB = { ...note, priority: 'high' as const, deviceId: 'dev_desktop', fieldUpdatedAt: { priority: '2026-11-24T00:01:00Z' } };
      const autoMerge = mergeRecordsSafely(recA, recB);
      expect(autoMerge.hasConflict).toBe(false);
      expect(autoMerge.merged.title).toBe('Renamed on Phone');
      expect(autoMerge.merged.priority).toBe('high');
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
