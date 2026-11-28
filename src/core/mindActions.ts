import { createId, db, getOrInitSettings } from './db';
import { batchApplyChanges } from './repository';
import type {
  CalendarEventPayload,
  GoalPayload,
  LifeRecord,
  NotePayload,
  RecipePayload,
  RecordType,
  TaskPayload,
  ThoughtPayload,
  UndoEntry,
} from './types';

export interface FilePassageResult {
  createdRecord: LifeRecord;
  updatedThought: LifeRecord<ThoughtPayload>;
  filedExcerpt: string;
}

/**
 * Signature Thought Inbox Selected-Passage Filing (Section 12.02):
 * Highlight any sentence or paragraph in a thought and move OR copy just that range into
 * a Subject Notebook, Task, Event, Goal, or Recipe draft while leaving the remaining text
 * and original timestamp strictly intact — with full atomic 20-step Undo!
 */
export async function fileThoughtPassage(
  thoughtId: string,
  startOffset: number,
  endOffset: number,
  options: {
    mode: 'move' | 'copy';
    targetType: 'note' | 'task' | 'event' | 'goal' | 'recipe';
    notebookId?: string;
    dateIso: string;
    titleOverride?: string;
    expectedContent?: string;
  }
): Promise<FilePassageResult | null> {
  const settings = await getOrInitSettings();
  const existing = (await db.records.get(thoughtId)) as LifeRecord<ThoughtPayload> | undefined;
  if (!existing || existing.deletedAt || existing.type !== 'thought' || !Number.isFinite(startOffset) || !Number.isFinite(endOffset)) return null;

  const fullText = existing.payload.content ?? '';
  if (options.expectedContent !== undefined && fullText !== options.expectedContent) throw new Error('Thought changed before filing. Select the passage again.');
  const safeStart = Math.max(0, Math.min(fullText.length, Math.min(startOffset, endOffset)));
  const safeEnd = Math.max(safeStart, Math.min(fullText.length, Math.max(startOffset, endOffset)));
  const excerpt = fullText.slice(safeStart, safeEnd).trim();
  if (!excerpt) return null;

  const now = new Date().toISOString();
  const title = options.titleOverride?.trim() || excerpt.split(/\r?\n/)[0].slice(0, 72) || 'Filed Passage';

  let createdRecord: LifeRecord;
  if (options.targetType === 'note') {
    const notePayload: NotePayload = {
      notebookId: options.notebookId || 'nb_personal',
      writtenForDate: options.dateIso,
      content: excerpt,
      touchedDates: [options.dateIso],
    };
    createdRecord = {
      id: createId('note'),
      workspaceId: existing.workspaceId,
      ownerProfileId: existing.ownerProfileId,
      sharedWithAll: existing.sharedWithAll,
      sharedWithProfileIds: existing.sharedWithProfileIds,
      type: 'note',
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tags: [...existing.tags],
      links: [{ targetId: existing.id, targetType: 'thought', relation: 'mentions', label: 'Filed from Thought Inbox' }],
      payload: notePayload,
      rev: 1,
      deviceId: settings.deviceId,
    };
  } else if (options.targetType === 'task') {
    const taskPayload: TaskPayload = {
      notes: excerpt,
      subtasks: [],
      boardColumn: 'next',
      sourceProvenance: `thought:${existing.id}`,
    };
    createdRecord = {
      id: createId('task'),
      workspaceId: existing.workspaceId,
      ownerProfileId: existing.ownerProfileId,
      sharedWithAll: existing.sharedWithAll,
      sharedWithProfileIds: existing.sharedWithProfileIds,
      type: 'task',
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      doDate: options.dateIso,
      tags: [...existing.tags],
      links: [{ targetId: existing.id, targetType: 'thought', relation: 'mentions' }],
      payload: taskPayload,
      rev: 1,
      deviceId: settings.deviceId,
    };
  } else if (options.targetType === 'event') {
    const evPayload: CalendarEventPayload = {
      startDate: options.dateIso,
      endDate: options.dateIso,
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      floating: false,
      timeZone: settings.defaultTimeZone,
      style: 'soft',
      eventStatus: 'confirmed',
      notes: excerpt,
    };
    createdRecord = {
      id: createId('ev'),
      workspaceId: existing.workspaceId,
      ownerProfileId: existing.ownerProfileId,
      sharedWithAll: existing.sharedWithAll,
      sharedWithProfileIds: existing.sharedWithProfileIds,
      type: 'event',
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tags: [...existing.tags],
      links: [{ targetId: existing.id, targetType: 'thought', relation: 'mentions' }],
      payload: evPayload,
      rev: 1,
      deviceId: settings.deviceId,
    };
  } else if (options.targetType === 'goal') {
    const goalPayload: GoalPayload = {
      description: excerpt,
      milestones: [],
    };
    createdRecord = {
      id: createId('goal'),
      workspaceId: existing.workspaceId,
      ownerProfileId: existing.ownerProfileId,
      sharedWithAll: existing.sharedWithAll,
      sharedWithProfileIds: existing.sharedWithProfileIds,
      type: 'goal',
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tags: [...existing.tags],
      links: [{ targetId: existing.id, targetType: 'thought', relation: 'mentions' }],
      payload: goalPayload,
      rev: 1,
      deviceId: settings.deviceId,
    };
  } else {
    const recipePayload: RecipePayload = {
      mealTypes: ['Dinner'],
      dietaryBadges: [],
      allergens: [],
      servings: 4,
      prepMin: 15,
      cookMin: 25,
      restMin: 0,
      difficulty: 'medium',
      rating: 0,
      madeCount: 0,
      equipment: [],
      ingredients: [],
      steps: excerpt
        .split(/\r?\n+/)
        .filter(Boolean)
        .map((line, i) => ({ id: createId('stp'), order: i + 1, text: line })),
    };
    createdRecord = {
      id: createId('rcp'),
      workspaceId: existing.workspaceId,
      ownerProfileId: existing.ownerProfileId,
      sharedWithAll: existing.sharedWithAll,
      sharedWithProfileIds: existing.sharedWithProfileIds,
      type: 'recipe',
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tags: [...existing.tags],
      links: [{ targetId: existing.id, targetType: 'thought', relation: 'mentions' }],
      payload: recipePayload,
      rev: 1,
      deviceId: settings.deviceId,
    };
  }

  // If mode === 'move', remove ONLY the highlighted range while leaving surrounding text & original createdAt intact!
  const remainingContent =
    options.mode === 'move'
      ? fullText.slice(0, safeStart) + fullText.slice(safeEnd)
      : fullText;

  const updatedThought: LifeRecord<ThoughtPayload> = {
    ...existing,
    createdAt: existing.createdAt, // Original timestamp preserved strictly!
    updatedAt: now,
    rev: existing.rev + 1,
    deviceId: settings.deviceId,
    payload: {
      ...existing.payload,
      content: remainingContent,
      filedRanges: [
        ...(existing.payload.filedRanges ?? []),
        {
          targetId: createdRecord.id,
          targetType: options.targetType as RecordType,
          excerpt,
          filedAt: now,
        },
      ],
    },
  };

  await batchApplyChanges(`Filed passage to ${options.targetType} (${options.mode})`, async () => {
    const changes: UndoEntry['changes'] = [
      { recordId: createdRecord.id, before: null, after: createdRecord },
      { recordId: existing.id, before: existing, after: updatedThought },
    ];
    return changes;
  });

  return { createdRecord, updatedThought, filedExcerpt: excerpt };
}

/**
 * Extracts [[WikiLink]] targets, @mentions, and #tags from Markdown note text.
 */
export function extractInlineEntities(markdown: string): {
  wikiLinks: string[];
  mentions: string[];
  tags: string[];
} {
  const wikiLinks: string[] = [];
  const mentions: string[] = [];
  const tags: string[] = [];

  for (const m of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
    wikiLinks.push(m[1].trim());
  }
  for (const m of markdown.matchAll(/(?:^|\s)@([A-Za-z0-9_.'-]+)/g)) {
    mentions.push(m[1].trim());
  }
  for (const m of markdown.matchAll(/(?:^|\s)#([A-Za-z0-9_-]+)/g)) {
    tags.push(m[1].trim().toLowerCase());
  }

  return {
    wikiLinks: Array.from(new Set(wikiLinks)),
    mentions: Array.from(new Set(mentions)),
    tags: Array.from(new Set(tags)),
  };
}
