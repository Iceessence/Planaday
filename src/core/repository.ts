import { createId, db, getOrInitSettings } from './db';
import type {
  LifeRecord,
  MealPlanPayload,
  NotePayload,
  PantryLotPayload,
  RecordType,
  UndoEntry,
} from './types';

const MAX_UNDO_STEPS = 20;
const TRASH_RETENTION_DAYS = 30;
const MAX_NOTE_REVISIONS = 25;

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export function subscribeRepository(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export interface SaveOptions {
  undoLabel?: string;
  skipUndo?: boolean;
  skipOutbox?: boolean;
  skipRevision?: boolean;
  revisionLabel?: string;
}

async function pushUndoEntry(entry: UndoEntry): Promise<void> {
  await db.undoStack.put(entry);
  await db.redoStack.clear();
  const all = await db.undoStack.orderBy('timestamp').toArray();
  if (all.length > MAX_UNDO_STEPS) {
    const excess = all.slice(0, all.length - MAX_UNDO_STEPS).map((e) => e.id);
    await db.undoStack.bulkDelete(excess);
  }
}

/**
 * Coalesces pending sync operations per recordId so editing the same note 2,000 times
 * keeps ONLY 1 queued operation in IndexedDB (preserving the earliest baseRev for safe conflict detection).
 */
async function enqueueOutbox(record: LifeRecord, baseRev: number): Promise<void> {
  const existingOps = await db.outbox.where('recordId').equals(record.id).toArray();
  let effectiveBaseRev = baseRev;
  if (existingOps.length > 0) {
    // Keep the lowest/earliest baseRev across any pending ops for this record
    effectiveBaseRev = existingOps.reduce((min, op) => Math.min(min, op.baseRev), baseRev);
    await db.outbox.bulkDelete(existingOps.map((o) => o.opId));
  }
  await db.outbox.put({
    opId: createId('op'),
    recordId: record.id,
    operation: 'upsert',
    record,
    baseRev: effectiveBaseRev,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
}

/**
 * Compacts any pre-existing uncoalesced outbox backlog (e.g., from older builds before v2.1.0)
 * down to at most 1 operation per unique recordId without losing a single edit.
 */
export async function compactOutbox(): Promise<{ before: number; after: number; removed: number }> {
  const all = await db.outbox.orderBy('createdAt').toArray();
  if (all.length <= 1) return { before: all.length, after: all.length, removed: 0 };

  const byRec = new Map<string, typeof all>();
  for (const op of all) {
    const list = byRec.get(op.recordId) ?? [];
    list.push(op);
    byRec.set(op.recordId, list);
  }

  const deleteIds: string[] = [];
  const updates: typeof all = [];
  for (const list of byRec.values()) {
    if (list.length <= 1) continue;
    const earliestBaseRev = list.reduce((min, o) => Math.min(min, o.baseRev), list[0].baseRev);
    const newest = list[list.length - 1];
    for (let i = 0; i < list.length - 1; i++) {
      deleteIds.push(list[i].opId);
    }
    updates.push({ ...newest, baseRev: earliestBaseRev });
  }

  if (deleteIds.length > 0) {
    await db.outbox.bulkDelete(deleteIds);
    await db.outbox.bulkPut(updates);
  }

  return { before: all.length, after: all.length - deleteIds.length, removed: deleteIds.length };
}

export async function createRecord<P = Record<string, unknown>>(
  type: RecordType,
  title: string,
  payload: P,
  extra: Partial<Omit<LifeRecord<P>, 'id' | 'type' | 'title' | 'payload'>> = {},
  options: SaveOptions = {}
): Promise<LifeRecord<P>> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  const record: LifeRecord<P> = {
    id: createId(type.slice(0, 4)),
    workspaceId: extra.workspaceId ?? settings.activeWorkspaceId,
    type,
    title,
    status: extra.status ?? 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    isSample: extra.isSample ?? false,
    dueDate: extra.dueDate ?? null,
    doDate: extra.doDate ?? null,
    priority: extra.priority ?? 'none',
    estimateMin: extra.estimateMin ?? null,
    energy: extra.energy,
    category: extra.category,
    color: extra.color,
    assigneeId: extra.assigneeId ?? null,
    ownerProfileId:
      extra.ownerProfileId !== undefined
        ? extra.ownerProfileId
        : settings.activeProfileId && settings.activeProfileId !== 'all'
          ? settings.activeProfileId
          : null,
    sharedWithAll: extra.sharedWithAll ?? false,
    sharedWithProfileIds: extra.sharedWithProfileIds ?? [],
    isImportant: extra.isImportant ?? false,
    tags: extra.tags ?? [],
    links: extra.links ?? [],
    recurrence: extra.recurrence ?? null,
    payload,
    rev: 1,
    deviceId: settings.deviceId,
    fieldUpdatedAt: { title: now, status: now, payload: now },
  };

  await db.records.put(record as LifeRecord);
  if (!options.skipOutbox) await enqueueOutbox(record as LifeRecord, 0);
  if (!options.skipUndo) {
    await pushUndoEntry({
      id: createId('undo'),
      label: options.undoLabel ?? `Created ${title || type}`,
      timestamp: now,
      changes: [{ recordId: record.id, before: null, after: record as LifeRecord }],
    });
  }

  if (type === 'note') {
    await saveNoteRevision(record as unknown as LifeRecord<NotePayload>);
  }

  notify();
  return record;
}

export async function updateRecord<P = Record<string, unknown>>(
  id: string,
  patch: Partial<LifeRecord<P>> | ((current: LifeRecord<P>) => LifeRecord<P>),
  options: SaveOptions = {}
): Promise<LifeRecord<P> | null> {
  const existing = (await db.records.get(id)) as LifeRecord<P> | undefined;
  if (!existing) return null;

  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  const nextRaw = typeof patch === 'function' ? patch(structuredClone(existing)) : { ...existing, ...patch };

  const fieldUpdatedAt = { ...(existing.fieldUpdatedAt ?? {}) };
  for (const key of Object.keys(nextRaw) as Array<keyof LifeRecord<P>>) {
    if (key === 'rev' || key === 'updatedAt' || key === 'fieldUpdatedAt') continue;
    if (JSON.stringify(existing[key]) !== JSON.stringify(nextRaw[key])) {
      fieldUpdatedAt[String(key)] = now;
    }
  }

  const updated: LifeRecord<P> = {
    ...nextRaw,
    id: existing.id,
    updatedAt: now,
    rev: existing.rev + 1,
    deviceId: settings.deviceId,
    fieldUpdatedAt,
  };

  await db.records.put(updated as LifeRecord);
  if (!options.skipOutbox) await enqueueOutbox(updated as LifeRecord, existing.rev);
  if (!options.skipUndo) {
    await pushUndoEntry({
      id: createId('undo'),
      label: options.undoLabel ?? `Updated ${updated.title || updated.type}`,
      timestamp: now,
      changes: [{ recordId: existing.id, before: existing as LifeRecord, after: updated as LifeRecord }],
    });
  }

  if (updated.type === 'note' && !options.skipRevision) {
    const oldContent = (existing.payload as unknown as NotePayload)?.content ?? '';
    const newContent = (updated.payload as unknown as NotePayload)?.content ?? '';
    if (oldContent !== newContent || options.revisionLabel) {
      await saveNoteRevision(updated as unknown as LifeRecord<NotePayload>, options.revisionLabel);
    }
  }

  notify();
  return updated;
}

export async function batchApplyChanges(
  label: string,
  mutator: () => Promise<Array<{ recordId: string; before: LifeRecord | null; after: LifeRecord | null }>>,
  options: { skipUndo?: boolean; skipOutbox?: boolean } = {}
): Promise<void> {
  const changes = await mutator();
  if (changes.length === 0) return;

  const now = new Date().toISOString();
  for (const ch of changes) {
    if (ch.after) {
      await db.records.put(ch.after);
      if (!options.skipOutbox) {
        await enqueueOutbox(ch.after, ch.before?.rev ?? 0);
      }
    } else if (ch.before) {
      await db.records.delete(ch.recordId);
    }
  }

  if (!options.skipUndo) {
    await pushUndoEntry({
      id: createId('undo'),
      label,
      timestamp: now,
      changes,
    });
  }
  notify();
}

async function saveNoteRevision(note: LifeRecord<NotePayload>, label?: string): Promise<void> {
  const rev = {
    id: createId('nrev'),
    recordId: note.id,
    timestamp: new Date().toISOString(),
    title: note.title,
    content: note.payload?.content ?? '',
    label: label?.trim() || undefined,
  };
  await db.revisions.put(rev);
  const all = await db.revisions.where('recordId').equals(note.id).sortBy('timestamp');
  // Preserve named manual checkpoints preferentially when pruning oldest auto-revisions
  if (all.length > MAX_NOTE_REVISIONS) {
    const autoOnly = all.filter((r) => !r.label);
    const excessCount = all.length - MAX_NOTE_REVISIONS;
    const toDelete = (autoOnly.length >= excessCount ? autoOnly : all).slice(0, excessCount).map((r) => r.id);
    await db.revisions.bulkDelete(toDelete);
  }
}

export async function createNamedNoteCheckpoint(recordId: string, label: string): Promise<boolean> {
  const rec = (await db.records.get(recordId)) as LifeRecord<NotePayload> | undefined;
  if (!rec || rec.type !== 'note') return false;
  await saveNoteRevision(rec, label.trim() || `Checkpoint (${new Date().toLocaleTimeString()})`);
  return true;
}

export async function getNoteRevisions(recordId: string) {
  return (await db.revisions.where('recordId').equals(recordId).sortBy('timestamp')).reverse();
}

// --- 30-Day Trash with Explicit Cascading Rules (Section 15.05) ---

export interface DeleteCascadeOptions {
  personBirthdayAction?: 'unlink' | 'trash';
}

export async function softDeleteRecord(
  id: string,
  cascade: DeleteCascadeOptions = {}
): Promise<{ trashed: LifeRecord | null; affectedCount: number }> {
  const target = await db.records.get(id);
  if (!target || target.deletedAt) return { trashed: null, affectedCount: 0 };

  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  const changes: UndoEntry['changes'] = [];

  const trashed: LifeRecord = {
    ...target,
    deletedAt: now,
    updatedAt: now,
    rev: target.rev + 1,
    deviceId: settings.deviceId,
  };
  changes.push({ recordId: target.id, before: target, after: trashed });

  // Cascade Rule 1: Deleting a Recipe keeps historical Meal Plan logs intact with a "Deleted Recipe" badge
  if (target.type === 'recipe') {
    const meals = await db.records.where('type').equals('meal_plan').toArray();
    for (const m of meals) {
      const mp = m.payload as unknown as MealPlanPayload;
      if (mp.recipeId === target.id && !m.deletedAt) {
        const updatedMeal: LifeRecord = {
          ...m,
          updatedAt: now,
          rev: m.rev + 1,
          deviceId: settings.deviceId,
          payload: {
            ...mp,
            deletedRecipeName: target.title,
          },
        };
        changes.push({ recordId: m.id, before: m, after: updatedMeal });
      }
    }
  }

  // Cascade Rule 2: Deleting a Person offers to unlink or trash their Birthdays
  if (target.type === 'person') {
    const action = cascade.personBirthdayAction ?? 'unlink';
    const lifeEvents = await db.records.where('type').equals('life_event').toArray();
    for (const ev of lifeEvents) {
      if (ev.deletedAt) continue;
      const linkedToPerson =
        ev.links.some((l) => l.targetId === target.id) ||
        (ev.payload as Record<string, unknown>).personId === target.id;
      if (!linkedToPerson) continue;

      if (action === 'trash') {
        changes.push({
          recordId: ev.id,
          before: ev,
          after: { ...ev, deletedAt: now, updatedAt: now, rev: ev.rev + 1, deviceId: settings.deviceId },
        });
      } else {
        changes.push({
          recordId: ev.id,
          before: ev,
          after: {
            ...ev,
            links: ev.links.filter((l) => l.targetId !== target.id),
            payload: { ...(ev.payload as Record<string, unknown>), personId: null },
            updatedAt: now,
            rev: ev.rev + 1,
            deviceId: settings.deviceId,
          },
        });
      }
    }
  }

  // Cascade Rule 3: Deleting a Pantry Zone moves its Lots to "Unassigned" rather than destroying inventory
  if (target.type === 'pantry_zone') {
    const lots = await db.records.where('type').equals('pantry_lot').toArray();
    for (const lot of lots) {
      if (lot.deletedAt) continue;
      const lp = lot.payload as unknown as PantryLotPayload;
      if (lp.zone === target.title) {
        changes.push({
          recordId: lot.id,
          before: lot,
          after: {
            ...lot,
            payload: { ...lp, zone: 'Unassigned' },
            updatedAt: now,
            rev: lot.rev + 1,
            deviceId: settings.deviceId,
          },
        });
      }
    }
  }

  await batchApplyChanges(`Moved "${target.title}" to Trash`, async () => changes);
  return { trashed, affectedCount: changes.length };
}

export async function restoreFromTrash(id: string): Promise<LifeRecord | null> {
  const existing = await db.records.get(id);
  if (!existing || !existing.deletedAt) return null;
  return updateRecord(id, { deletedAt: null }, { undoLabel: `Restored "${existing.title}"` });
}

export async function permanentlyDeleteRecord(id: string): Promise<void> {
  await db.records.delete(id);
  await db.revisions.where('recordId').equals(id).delete();
  await runOrphanBlobGC();
  notify();
}

export async function purgeExpiredTrash(nowMs = Date.now()): Promise<number> {
  const cutoffMs = nowMs - TRASH_RETENTION_DAYS * 86400 * 1000;
  const all = await db.records.toArray();
  const expiredIds = all
    .filter((r) => r.deletedAt && Date.parse(r.deletedAt) < cutoffMs)
    .map((r) => r.id);

  if (expiredIds.length === 0) return 0;
  await db.records.bulkDelete(expiredIds);
  for (const id of expiredIds) {
    await db.revisions.where('recordId').equals(id).delete();
  }
  await runOrphanBlobGC();
  notify();
  return expiredIds.length;
}

/**
 * Runs orphan-blob garbage collection ONLY for blobs no longer referenced by ANY active OR trashed record (15.06).
 */
export async function runOrphanBlobGC(): Promise<number> {
  const allRecords = await db.records.toArray();
  const referenced = new Set<string>();

  const scan = (val: unknown) => {
    if (!val) return;
    if (typeof val === 'string') {
      if (/^[a-f0-9]{16,64}$/i.test(val)) referenced.add(val);
      return;
    }
    if (Array.isArray(val)) {
      for (const item of val) scan(item);
      return;
    }
    if (typeof val === 'object') {
      for (const v of Object.values(val as Record<string, unknown>)) scan(v);
    }
  };

  for (const rec of allRecords) scan(rec.payload);

  const blobs = await db.blobs.toArray();
  const orphanHashes = blobs.filter((b) => !referenced.has(b.hash)).map((b) => b.hash);
  if (orphanHashes.length > 0) {
    await db.blobs.bulkDelete(orphanHashes);
  }
  return orphanHashes.length;
}

// --- 20-Step Global Undo & Redo ---

export async function performUndo(): Promise<{ ok: boolean; label?: string }> {
  const stack = await db.undoStack.orderBy('timestamp').toArray();
  const latest = stack[stack.length - 1];
  if (!latest) return { ok: false };

  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  for (let i = latest.changes.length - 1; i >= 0; i--) {
    const ch = latest.changes[i];
    if (ch.before) {
      const restored: LifeRecord = {
        ...ch.before,
        updatedAt: now,
        rev: (ch.after?.rev ?? ch.before.rev) + 1,
        deviceId: settings.deviceId,
      };
      await db.records.put(restored);
      await enqueueOutbox(restored, ch.after?.rev ?? ch.before.rev);
    } else if (ch.after) {
      // Undo creation by soft-deleting cleanly
      const softRemoved: LifeRecord = {
        ...ch.after,
        deletedAt: now,
        updatedAt: now,
        rev: ch.after.rev + 1,
        deviceId: settings.deviceId,
      };
      await db.records.put(softRemoved);
      await enqueueOutbox(softRemoved, ch.after.rev);
    }
  }

  await db.undoStack.delete(latest.id);
  await db.redoStack.put(latest);
  notify();
  return { ok: true, label: latest.label };
}

export async function performRedo(): Promise<{ ok: boolean; label?: string }> {
  const stack = await db.redoStack.orderBy('timestamp').toArray();
  const latest = stack[stack.length - 1];
  if (!latest) return { ok: false };

  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  for (const ch of latest.changes) {
    if (ch.after) {
      const reapplied: LifeRecord = {
        ...ch.after,
        deletedAt: ch.after.deletedAt ?? null,
        updatedAt: now,
        rev: (ch.before?.rev ?? ch.after.rev) + 2,
        deviceId: settings.deviceId,
      };
      await db.records.put(reapplied);
      await enqueueOutbox(reapplied, ch.after.rev);
    }
  }

  await db.redoStack.delete(latest.id);
  await db.undoStack.put(latest);
  notify();
  return { ok: true, label: latest.label };
}

/**
 * Removes ONLY sample records (`isSample: true`) without touching any user-created records (14.05).
 */
export async function wipeSampleData(): Promise<number> {
  const all = await db.records.toArray();
  const sampleIds = all.filter((r) => r.isSample === true).map((r) => r.id);
  if (sampleIds.length > 0) {
    await db.records.bulkDelete(sampleIds);
    notify();
  }
  return sampleIds.length;
}
