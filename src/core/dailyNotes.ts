import { createRecord, updateRecord } from './repository';
import type { DiaryPayload, EntityLink, LifeRecord, NotePayload, TaskPayload } from './types';

export type DailyNoteCategory = NonNullable<NotePayload['dailyCategory']>;

export const DAILY_NOTE_CATEGORIES: Array<{ id: DailyNoteCategory; label: string; emoji: string }> = [
  { id: 'daily_specific', label: 'Daily-Specific', emoji: '📅' },
  { id: 'general_knowledge', label: 'General Knowledge', emoji: '📚' },
  { id: 'ideas', label: 'Ideas', emoji: '💡' },
  { id: 'reminders', label: 'Reminders', emoji: '📌' },
  { id: 'research', label: 'Research', emoji: '🔬' },
  { id: 'uncategorized', label: 'Uncategorized', emoji: '📝' },
];

export function isDailyArchiveNote(rec: LifeRecord): rec is LifeRecord<NotePayload> {
  if (rec.type !== 'note' || rec.deletedAt) return false;
  const p = rec.payload as NotePayload | undefined;
  return Boolean(p?.isDailyNote || p?.sourcePlannerDate || p?.writtenForDate);
}

/**
 * Finds the single canonical Daily Note record for a given YYYY-MM-DD date.
 * Guarantees Today Spread and Notes → Daily Notes Archive reference the EXACT same record ID (zero duplication).
 */
export function findCanonicalDailyNote(
  records: LifeRecord[],
  dateIso: string
): LifeRecord<NotePayload> | undefined {
  const candidates = records.filter(
    (r): r is LifeRecord<NotePayload> =>
      r.type === 'note' &&
      !r.deletedAt &&
      Boolean(r.payload?.isDailyNote) &&
      (r.payload.sourcePlannerDate === dateIso || r.payload.writtenForDate === dateIso)
  );
  if (candidates.length === 0) return undefined;
  // Prefer the oldest/primary canonical daily scratchpad for that date
  return [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function getNotesForPlannerDate(records: LifeRecord[], dateIso: string): Array<LifeRecord<NotePayload>> {
  return records
    .filter(
      (r): r is LifeRecord<NotePayload> =>
        r.type === 'note' &&
        !r.deletedAt &&
        (r.payload?.sourcePlannerDate === dateIso ||
          r.payload?.writtenForDate === dateIso ||
          (Array.isArray(r.payload?.touchedDates) && r.payload.touchedDates.includes(dateIso)))
    )
    .sort((a, b) => Number(Boolean(b.payload.isDailyNote)) - Number(Boolean(a.payload.isDailyNote)) || b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Updates the existing canonical Daily Note for `dateIso` or creates it once — never duplicates records!
 */
export async function upsertCanonicalDailyNote(
  records: LifeRecord[],
  dateIso: string,
  content: string,
  opts?: {
    title?: string;
    dailyCategory?: DailyNoteCategory;
    notebookId?: string;
    diaryRecordId?: string | null;
    workspaceId?: string;
    ownerProfileId?: string | null;
  }
): Promise<LifeRecord<NotePayload>> {
  const existing = findCanonicalDailyNote(records, dateIso);
  if (existing) {
    const updated = await updateRecord<NotePayload>(
      existing.id,
      (cur) => {
        const nextLinks = [...(cur.links ?? [])];
        if (opts?.diaryRecordId && !nextLinks.some((l) => l.targetId === opts.diaryRecordId)) {
          nextLinks.push({
            targetId: opts.diaryRecordId,
            targetType: 'diary',
            relation: 'daily_source',
            label: `Daily Planner ${dateIso}`,
          });
        }
        return {
          ...cur,
          title: opts?.title ?? cur.title,
          links: nextLinks,
          payload: {
            ...cur.payload,
            content,
            isDailyNote: true,
            sourcePlannerDate: cur.payload.sourcePlannerDate || dateIso,
            writtenForDate: cur.payload.writtenForDate || dateIso,
            dailyCategory: opts?.dailyCategory ?? cur.payload.dailyCategory ?? 'daily_specific',
            notebookId: opts?.notebookId ?? cur.payload.notebookId ?? 'nb_personal',
            touchedDates: Array.from(new Set([...(cur.payload.touchedDates ?? []), dateIso])),
          },
        };
      },
      { skipUndo: true, skipRevision: true }
    );
    return updated ?? existing;
  }

  const initialLinks: EntityLink[] = opts?.diaryRecordId
    ? [{ targetId: opts.diaryRecordId, targetType: 'diary', relation: 'daily_source', label: `Daily Planner ${dateIso}` }]
    : [];

  return createRecord<NotePayload>(
    'note',
    opts?.title || `Daily Note — ${dateIso}`,
    {
      notebookId: opts?.notebookId || 'nb_personal',
      writtenForDate: dateIso,
      sourcePlannerDate: dateIso,
      isDailyNote: true,
      dailyCategory: opts?.dailyCategory ?? 'daily_specific',
      content,
      citations: [],
      attachmentBlobIds: [],
      voiceMemoBlobIds: [],
      touchedDates: [dateIso],
    },
    {
      category: 'Daily Notes',
      workspaceId: opts?.workspaceId,
      ownerProfileId: opts?.ownerProfileId,
      tags: ['daily-note'],
      links: initialLinks,
    },
    { skipUndo: true }
  );
}

/**
 * Converts or promotes a Daily Note into a Task, Project, Diary reflection, or Permanent Knowledge Note
 * while preserving the original note and creating automatic bidirectional EntityLink backlinks!
 */
export async function convertDailyNoteToTarget(
  note: LifeRecord<NotePayload>,
  target: 'task' | 'project' | 'diary' | 'permanent_knowledge',
  existingRecords: LifeRecord[],
  opts?: { notebookId?: string }
): Promise<{ createdOrUpdated: LifeRecord; summary: string }> {
  const dateIso = note.payload.sourcePlannerDate || note.payload.writtenForDate || new Date().toISOString().slice(0, 10);

  const appendBacklink = async (targetRec: LifeRecord, label: string) => {
    await updateRecord<NotePayload>(
      note.id,
      (cur) => {
        const links = [...(cur.links ?? [])];
        if (!links.some((l) => l.targetId === targetRec.id)) {
          links.push({
            targetId: targetRec.id,
            targetType: targetRec.type,
            relation: 'converted_to',
            label,
          });
        }
        return { ...cur, links };
      },
      { skipUndo: true, skipRevision: true }
    );
  };

  if (target === 'task') {
    const task = await createRecord<TaskPayload>(
      'task',
      note.title.replace(/^Daily Note\s+—\s+/, 'Follow-up: '),
      {
        notes: note.payload.content || '',
        subtasks: [],
        boardColumn: 'next',
        sourceProvenance: `daily_note:${note.id}`,
      },
      {
        doDate: dateIso,
        tags: Array.from(new Set([...(note.tags ?? []), 'from-daily-note'])),
        links: [{ targetId: note.id, targetType: 'note', relation: 'daily_source', label: note.title }],
      }
    );
    await appendBacklink(task, `Task: ${task.title}`);
    return { createdOrUpdated: task, summary: `Converted to Task "${task.title}" with automatic backlink` };
  }

  if (target === 'project') {
    const project = await createRecord<Record<string, unknown>>(
      'project',
      note.title.replace(/^Daily Note\s+—\s+/, 'Project: '),
      {
        description: note.payload.content || '',
        stage: 'planning',
        sourceDate: dateIso,
        sourceNoteId: note.id,
        milestones: [],
      },
      {
        category: 'Projects',
        tags: Array.from(new Set([...(note.tags ?? []), 'from-daily-note'])),
        links: [{ targetId: note.id, targetType: 'note', relation: 'daily_source', label: note.title }],
      }
    );
    await appendBacklink(project, `Project: ${project.title}`);
    return { createdOrUpdated: project, summary: `Created Project "${project.title}" with automatic backlink` };
  }

  if (target === 'diary') {
    const existingDiary = existingRecords.find(
      (r): r is LifeRecord<DiaryPayload> => r.type === 'diary' && !r.deletedAt && r.payload?.date === dateIso
    );
    const snippet = (note.payload.content || note.title).trim();
    if (existingDiary) {
      const updated = await updateRecord<DiaryPayload>(existingDiary.id, (cur) => {
        const prevNar = cur.payload.narrative ? `${cur.payload.narrative}\n\n` : '';
        const links = [...(cur.links ?? [])];
        if (!links.some((l) => l.targetId === note.id)) {
          links.push({ targetId: note.id, targetType: 'note', relation: 'daily_source', label: note.title });
        }
        return {
          ...cur,
          links,
          payload: {
            ...cur.payload,
            narrative: prevNar.includes(snippet) ? cur.payload.narrative : `${prevNar}${snippet}`,
          },
        };
      });
      const rec = updated ?? existingDiary;
      await appendBacklink(rec, `Diary ${dateIso}`);
      return { createdOrUpdated: rec, summary: `Linked into Diary for ${dateIso}` };
    }
    const diary = await createRecord<DiaryPayload>(
      'diary',
      `Daily Reflection — ${dateIso}`,
      { date: dateIso, narrative: snippet },
      {
        category: 'Diary',
        tags: ['reflection', 'from-daily-note'],
        links: [{ targetId: note.id, targetType: 'note', relation: 'daily_source', label: note.title }],
      }
    );
    await appendBacklink(diary, `Diary ${dateIso}`);
    return { createdOrUpdated: diary, summary: `Created Diary entry for ${dateIso} with automatic backlink` };
  }

  // Promote in-place to Permanent Knowledge Note — ZERO duplication!
  const nowIso = new Date().toISOString();
  const promoted = await updateRecord<NotePayload>(note.id, (cur) => ({
    ...cur,
    tags: Array.from(new Set([...(cur.tags ?? []), 'knowledge-base'])),
    payload: {
      ...cur.payload,
      dailyCategory: 'general_knowledge',
      promotedToKnowledgeAt: nowIso,
      notebookId: opts?.notebookId ?? cur.payload.notebookId,
      pinned: true,
    },
  }));
  return {
    createdOrUpdated: promoted ?? note,
    summary: `Promoted "${note.title}" to Permanent Knowledge Note (same record, original date ${dateIso} preserved)`,
  };
}
