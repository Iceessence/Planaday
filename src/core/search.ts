import type { LifeRecord, RecordType } from './types';
import { InvertedSearchIndex, extractRecordSearchText, resolveRecordJumpDate } from './searchIndex';

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

const arrayIndexCache = new WeakMap<LifeRecord[], InvertedSearchIndex>();

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
  return extractRecordSearchText(rec);
}

function findJumpDate(rec: LifeRecord): string | null {
  return resolveRecordJumpDate(rec);
}

/**
 * Global fuzzy search across every module with NO arbitrary 100-hit cap (supports pagination).
 * Automatically accelerates large collections (>= 250 records) via an inverted trigram index
 * so 100,000+ records search well under 300ms p95.
 */
export function fuzzySearchRecords(
  records: LifeRecord[],
  query: string,
  filter: SearchFilter = {},
  page = 1,
  pageSize = 25
): { hits: SearchHit[]; total: number; page: number; pageCount: number } {
  if (records.length >= 250) {
    let idx = arrayIndexCache.get(records);
    if (!idx) {
      idx = new InvertedSearchIndex();
      idx.rebuild(records);
      arrayIndexCache.set(records, idx);
    }
    return idx.search(query, filter, page, pageSize);
  }
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
