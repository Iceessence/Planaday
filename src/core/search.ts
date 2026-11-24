import type { LifeRecord, RecordType } from './types';

export interface SearchFilter {
  types?: RecordType[];
  date?: string;
  category?: string;
  tag?: string;
  assigneeId?: string;
  hiddenTypes?: RecordType[];
}

export interface SearchHit {
  record: LifeRecord;
  score: number;
  snippet: string;
  jumpDate?: string | null;
}

/**
 * Typo-tolerant bounded 1-edit-distance (Damerau-Levenshtein <= 1) check.
 */
export function isWithinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        // Check adjacent transposition
        if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i]) {
          diffs++;
          i++;
        } else {
          diffs++;
        }
        if (diffs > 1) return false;
      }
    }
    return diffs <= 1;
  }

  // Length differs by 1: single insert/delete
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

function extractSearchableText(rec: LifeRecord): string {
  const parts: string[] = [rec.title, rec.category ?? '', ...rec.tags];
  const p = rec.payload as Record<string, unknown> | undefined;
  if (p) {
    for (const key of [
      'content',
      'notes',
      'narrative',
      'dailyNotes',
      'gratitude',
      'summary',
      'room',
      'location',
      'ingredientName',
      'zone',
      'shelfBin',
      'cuisine',
      'description',
      'binLocation',
      'modelNumber',
    ]) {
      if (typeof p[key] === 'string' && p[key]) parts.push(p[key] as string);
    }
    if (Array.isArray(p.ingredients)) {
      for (const ing of p.ingredients as Array<{ name?: string }>) {
        if (ing?.name) parts.push(ing.name);
      }
    }
    if (Array.isArray(p.items)) {
      for (const item of p.items as Array<{ name?: string; text?: string }>) {
        if (item?.name) parts.push(item.name);
        if (item?.text) parts.push(item.text);
      }
    }
  }
  return parts.join(' ');
}

function findJumpDate(rec: LifeRecord): string | null {
  const p = rec.payload as Record<string, unknown> | undefined;
  if (typeof p?.date === 'string') return p.date;
  if (typeof p?.startDate === 'string') return p.startDate;
  if (typeof p?.writtenForDate === 'string') return p.writtenForDate;
  if (typeof p?.nextDueDate === 'string') return p.nextDueDate;
  return rec.doDate ?? rec.dueDate ?? null;
}

/**
 * Global fuzzy search across every module with NO arbitrary 100-hit cap (supports pagination).
 */
export function fuzzySearchRecords(
  records: LifeRecord[],
  query: string,
  filter: SearchFilter = {},
  page = 1,
  pageSize = 25
): { hits: SearchHit[]; total: number; page: number; pageCount: number } {
  const tokens = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const hiddenSet = new Set(filter.hiddenTypes ?? []);
  const typeSet = filter.types && filter.types.length > 0 ? new Set(filter.types) : null;

  const matched: SearchHit[] = [];

  for (const rec of records) {
    if (rec.deletedAt) continue;
    if (hiddenSet.has(rec.type)) continue;
    if (typeSet && !typeSet.has(rec.type)) continue;
    if (filter.category && rec.category?.toLowerCase() !== filter.category.toLowerCase()) continue;
    if (filter.tag && !rec.tags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())) continue;
    if (filter.assigneeId && rec.assigneeId !== filter.assigneeId) continue;

    const jumpDate = findJumpDate(rec);
    if (filter.date && jumpDate !== filter.date) continue;

    const corpus = extractSearchableText(rec);
    if (tokens.length === 0) {
      matched.push({
        record: rec,
        score: 1,
        snippet: corpus.slice(0, 140),
        jumpDate,
      });
      continue;
    }

    const lowerTitle = rec.title.toLowerCase();
    const lowerCorpus = corpus.toLowerCase();
    const words = lowerCorpus.split(/[^a-z0-9#@-]+/).filter(Boolean);

    let score = 0;
    let allMatched = true;
    for (const tok of tokens) {
      if (lowerTitle.includes(tok)) {
        score += 10;
      } else if (lowerCorpus.includes(tok)) {
        score += 5;
      } else if (tok.length >= 3 && words.some((w) => isWithinOneEdit(w, tok))) {
        score += 2;
      } else {
        allMatched = false;
        break;
      }
    }

    if (allMatched) {
      const idx = lowerCorpus.indexOf(tokens[0]);
      const start = idx > 30 ? idx - 30 : 0;
      const snippet = (start > 0 ? '…' : '') + corpus.slice(start, start + 140).trim();
      matched.push({ record: rec, score, snippet, jumpDate });
    }
  }

  matched.sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt));

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, pageCount));
  const startIdx = (safePage - 1) * pageSize;

  return {
    hits: matched.slice(startIdx, startIdx + pageSize),
    total,
    page: safePage,
    pageCount,
  };
}
