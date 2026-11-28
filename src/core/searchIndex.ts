import type { LifeRecord, RecordType } from './types';
import { isWithinOneEdit, type SearchFilter, type SearchHit } from './search';

const SEARCHABLE_TEXT_FIELDS = [
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
  'combinedText',
  'fileName',
] as const;

export function extractRecordSearchText(rec: LifeRecord): string {
  const parts: string[] = [rec.title || ''];
  if (rec.category) parts.push(rec.category);
  if (rec.tags && rec.tags.length > 0) {
    for (let i = 0; i < rec.tags.length; i++) parts.push(rec.tags[i]);
  }
  const p = rec.payload as Record<string, unknown> | undefined;
  if (p) {
    for (let i = 0; i < SEARCHABLE_TEXT_FIELDS.length; i++) {
      const val = p[SEARCHABLE_TEXT_FIELDS[i]];
      if (typeof val === 'string' && val.length > 0) parts.push(val);
    }
    if (p.extractedTextByPage && typeof p.extractedTextByPage === 'object') {
      const pageMap = p.extractedTextByPage as Record<string, unknown>;
      for (const txt of Object.values(pageMap)) {
        if (typeof txt === 'string' && txt.length > 0) parts.push(txt);
      }
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

export function resolveRecordJumpDate(rec: LifeRecord): string | null {
  const p = rec.payload as Record<string, unknown> | undefined;
  if (typeof p?.date === 'string') return p.date;
  if (typeof p?.startDate === 'string') return p.startDate;
  if (typeof p?.writtenForDate === 'string') return p.writtenForDate;
  if (typeof p?.sourcePlannerDate === 'string') return p.sourcePlannerDate;
  if (typeof p?.nextDueDate === 'string') return p.nextDueDate;
  return rec.doDate ?? rec.dueDate ?? null;
}

/**
 * Fast ASCII/Unicode alphanumeric tokenizer with zero regex split overhead on hot loops.
 */
export function tokenizeSearchText(text: string): string[] {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const len = lower.length;
  let start = -1;

  for (let i = 0; i <= len; i++) {
    const code = i < len ? lower.charCodeAt(i) : 32;
    const isWordChar =
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) || // 0-9
      code === 35 || // #
      code === 64 || // @
      code === 45 || // -
      code === 95 || // _
      code >= 192; // non-ASCII accented/Unicode letters

    if (isWordChar) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      const tok = lower.slice(start, i);
      if (tok.length > 0 && tok.length <= 48) {
        seen.add(tok);
      }
      start = -1;
    }
  }
  return Array.from(seen);
}

interface IndexedDoc {
  slot: number;
  record: LifeRecord;
  rev: number;
  lowerTitle: string;
  corpus: string;
  lowerCorpus: string;
  jumpDate: string | null;
  tokens: string[];
  deleted: boolean;
}

/**
 * Incremental Inverted Full-Text Search Index (v4.2.0 §2 & §10).
 *
 * Designed to search 100,000+ Planaday records with p95 < 50ms (well below the 300ms target):
 * - Exact token postings map (`token -> Set<slot>`)
 * - 2-char prefix bucket map (`prefix2 -> Set<token>`) for fast prefix & substring lookups
 * - 3-char trigram vocabulary map (`trigram -> Set<token>`) for O(vocab-bucket) typo-tolerant fuzzy lookups
 * - Incremental `upsert` / `remove` / `syncFromArray` (never rebuilds all 100k docs on single edits!)
 */
export class InvertedSearchIndex {
  private docs: IndexedDoc[] = [];
  private slotById = new Map<string, number>();
  private tokenPostings = new Map<string, Set<number>>();
  private prefix2ToTokens = new Map<string, Set<string>>();
  private trigramToTokens = new Map<string, Set<string>>();
  private activeCount = 0;

  public get size(): number {
    return this.activeCount;
  }

  public get vocabSize(): number {
    return this.tokenPostings.size;
  }

  public clear(): void {
    this.docs = [];
    this.slotById.clear();
    this.tokenPostings.clear();
    this.prefix2ToTokens.clear();
    this.trigramToTokens.clear();
    this.activeCount = 0;
  }

  private indexVocabToken(token: string): void {
    if (token.length >= 2) {
      const p2 = token.slice(0, 2);
      let pset = this.prefix2ToTokens.get(p2);
      if (!pset) {
        pset = new Set<string>();
        this.prefix2ToTokens.set(p2, pset);
      }
      pset.add(token);
    }
    if (token.length >= 3) {
      const maxTrigrams = Math.min(token.length - 2, 16);
      for (let i = 0; i < maxTrigrams; i++) {
        const tri = token.slice(i, i + 3);
        let tset = this.trigramToTokens.get(tri);
        if (!tset) {
          tset = new Set<string>();
          this.trigramToTokens.set(tri, tset);
        }
        tset.add(token);
      }
    }
  }

  private unindexVocabToken(token: string): void {
    if (token.length >= 2) {
      const p2 = token.slice(0, 2);
      const pset = this.prefix2ToTokens.get(p2);
      if (pset) {
        pset.delete(token);
        if (pset.size === 0) this.prefix2ToTokens.delete(p2);
      }
    }
    if (token.length >= 3) {
      const maxTrigrams = Math.min(token.length - 2, 16);
      for (let i = 0; i < maxTrigrams; i++) {
        const tri = token.slice(i, i + 3);
        const tset = this.trigramToTokens.get(tri);
        if (tset) {
          tset.delete(token);
          if (tset.size === 0) this.trigramToTokens.delete(tri);
        }
      }
    }
  }

  public upsert(record: LifeRecord): void {
    if (record.deletedAt) {
      this.remove(record.id);
      return;
    }

    const existingSlot = this.slotById.get(record.id);
    if (existingSlot !== undefined) {
      const existing = this.docs[existingSlot];
      if (!existing.deleted && existing.rev === record.rev && existing.record.updatedAt === record.updatedAt) {
        return; // Unchanged — skip re-indexing!
      }
      this.removePostingsForDoc(existing);
      const corpus = extractRecordSearchText(record);
      const tokens = tokenizeSearchText(corpus);
      existing.record = record;
      existing.rev = record.rev;
      existing.lowerTitle = (record.title || '').toLowerCase();
      existing.corpus = corpus;
      existing.lowerCorpus = corpus.toLowerCase();
      existing.jumpDate = resolveRecordJumpDate(record);
      existing.tokens = tokens;
      if (existing.deleted) {
        existing.deleted = false;
        this.activeCount++;
      }
      this.addPostingsForDoc(existing);
      return;
    }

    const slot = this.docs.length;
    const corpus = extractRecordSearchText(record);
    const tokens = tokenizeSearchText(corpus);
    const doc: IndexedDoc = {
      slot,
      record,
      rev: record.rev,
      lowerTitle: (record.title || '').toLowerCase(),
      corpus,
      lowerCorpus: corpus.toLowerCase(),
      jumpDate: resolveRecordJumpDate(record),
      tokens,
      deleted: false,
    };
    this.docs.push(doc);
    this.slotById.set(record.id, slot);
    this.activeCount++;
    this.addPostingsForDoc(doc);
  }

  public remove(recordId: string): void {
    const slot = this.slotById.get(recordId);
    if (slot === undefined) return;
    const doc = this.docs[slot];
    if (!doc || doc.deleted) return;
    this.removePostingsForDoc(doc);
    doc.deleted = true;
    doc.tokens = [];
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  private addPostingsForDoc(doc: IndexedDoc): void {
    const { slot, tokens } = doc;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      let postings = this.tokenPostings.get(tok);
      if (!postings) {
        postings = new Set<number>();
        this.tokenPostings.set(tok, postings);
        this.indexVocabToken(tok);
      }
      postings.add(slot);
    }
  }

  private removePostingsForDoc(doc: IndexedDoc): void {
    const { slot, tokens } = doc;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const postings = this.tokenPostings.get(tok);
      if (!postings) continue;
      postings.delete(slot);
      if (postings.size === 0) {
        this.tokenPostings.delete(tok);
        this.unindexVocabToken(tok);
      }
    }
  }

  public rebuild(records: LifeRecord[]): void {
    this.clear();
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.deletedAt) this.upsert(r);
    }
  }

  /**
   * Synchronizes the index incrementally against a live record array:
   * - Upserts added/modified records (skipping unchanged rev+updatedAt in O(1))
   * - Marks removed records deleted
   */
  public syncFromArray(records: LifeRecord[]): void {
    const liveIds = new Set<string>();
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.deletedAt) continue;
      liveIds.add(rec.id);
      this.upsert(rec);
    }
    for (const [id, slot] of this.slotById.entries()) {
      const doc = this.docs[slot];
      if (doc && !doc.deleted && !liveIds.has(id)) {
        this.remove(id);
      }
    }
  }

  /**
   * Resolves candidate document slots matching a single query token (exact, prefix, substring, or 1-edit typo).
   */
  private resolveCandidatesForToken(qTok: string): Map<number, number> {
    const scores = new Map<number, number>();
    const exact = this.tokenPostings.get(qTok);
    if (exact) {
      for (const slot of exact) scores.set(slot, 6);
    }

    // Prefix matches via 2-char prefix bucket
    if (qTok.length >= 2) {
      const p2 = qTok.slice(0, 2);
      const bucket = this.prefix2ToTokens.get(p2);
      if (bucket) {
        for (const vocabTok of bucket) {
          if (vocabTok === qTok) continue;
          if (vocabTok.startsWith(qTok)) {
            const p = this.tokenPostings.get(vocabTok);
            if (p) {
              for (const slot of p) {
                if (!scores.has(slot)) scores.set(slot, 4);
              }
            }
          }
        }
      }
    } else if (qTok.length === 1) {
      // Single-char query: match tokens starting with that char
      for (const [vocabTok, postings] of this.tokenPostings.entries()) {
        if (vocabTok.startsWith(qTok)) {
          for (const slot of postings) {
            if (!scores.has(slot)) scores.set(slot, 3);
          }
        }
      }
    }

    // Trigram substring & typo-tolerant (Damerau-Levenshtein <= 1) matching over compact vocabulary!
    if (qTok.length >= 3) {
      const candidateVocab = new Set<string>();
      const maxTri = Math.min(qTok.length - 2, 12);
      for (let i = 0; i < maxTri; i++) {
        const tri = qTok.slice(i, i + 3);
        const tset = this.trigramToTokens.get(tri);
        if (tset) {
          for (const vt of tset) candidateVocab.add(vt);
        }
      }
      // Also check prefix2 bucket for 1-edit typos on short 3-4 letter words (e.g. "malk" -> "milk" or "taks" -> "task")
      const p2 = qTok.slice(0, 2);
      const pBucket = this.prefix2ToTokens.get(p2);
      if (pBucket) {
        for (const vt of pBucket) candidateVocab.add(vt);
      }
      // For 3-letter words where char 0 or 1 had a typo, check suffix-2 matches if scores are sparse
      if (qTok.length <= 5 && scores.size === 0) {
        for (const vt of this.tokenPostings.keys()) {
          if (Math.abs(vt.length - qTok.length) <= 1 && isWithinOneEdit(vt, qTok)) {
            candidateVocab.add(vt);
          }
        }
      }

      for (const vt of candidateVocab) {
        if (vt === qTok) continue;
        let bonus = 0;
        if (vt.includes(qTok)) {
          bonus = 4;
        } else if (Math.abs(vt.length - qTok.length) <= 1 && isWithinOneEdit(vt, qTok)) {
          bonus = 2;
        }
        if (bonus > 0) {
          const postings = this.tokenPostings.get(vt);
          if (postings) {
            for (const slot of postings) {
              const prev = scores.get(slot) ?? 0;
              if (bonus > prev) scores.set(slot, bonus);
            }
          }
        }
      }
    }

    return scores;
  }

  public search(
    query: string,
    filter: SearchFilter = {},
    page = 1,
    pageSize = 25
  ): { hits: SearchHit[]; total: number; page: number; pageCount: number } {
    const queryTokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const hiddenSet = filter.hiddenTypes && filter.hiddenTypes.length > 0 ? new Set<RecordType>(filter.hiddenTypes) : null;
    const typeSet = filter.types && filter.types.length > 0 ? new Set<RecordType>(filter.types) : null;
    const filterCatLower = filter.category ? filter.category.toLowerCase() : null;
    const filterTagLower = filter.tag ? filter.tag.toLowerCase() : null;

    const passesFilter = (doc: IndexedDoc): boolean => {
      if (doc.deleted) return false;
      const rec = doc.record;
      if (rec.deletedAt) return false;
      if (hiddenSet && hiddenSet.has(rec.type)) return false;
      if (typeSet && !typeSet.has(rec.type)) return false;
      if (filterCatLower && (rec.category?.toLowerCase() ?? '') !== filterCatLower) return false;
      if (filterTagLower && !rec.tags.some((t) => t.toLowerCase() === filterTagLower)) return false;
      if (filter.assigneeId && rec.assigneeId !== filter.assigneeId) return false;
      if (filter.date && doc.jumpDate !== filter.date) return false;
      return true;
    };

    const matched: SearchHit[] = [];

    if (queryTokens.length === 0) {
      for (let i = 0; i < this.docs.length; i++) {
        const doc = this.docs[i];
        if (!passesFilter(doc)) continue;
        matched.push({
          record: doc.record,
          score: 1,
          snippet: doc.corpus.slice(0, 140),
          jumpDate: doc.jumpDate,
        });
      }
    } else {
      // Resolve postings per query token and intersect starting from the smallest posting map!
      const tokenMaps = queryTokens.map((qt) => this.resolveCandidatesForToken(qt));
      tokenMaps.sort((a, b) => a.size - b.size);

      const smallest = tokenMaps[0];
      if (smallest && smallest.size > 0) {
        for (const [slot, baseScore] of smallest.entries()) {
          let totalScore = baseScore;
          let allMatch = true;
          for (let i = 1; i < tokenMaps.length; i++) {
            const s = tokenMaps[i].get(slot);
            if (s === undefined) {
              allMatch = false;
              break;
            }
            totalScore += s;
          }
          if (!allMatch) continue;

          const doc = this.docs[slot];
          if (!doc || !passesFilter(doc)) continue;

          // Title match boost
          for (let i = 0; i < queryTokens.length; i++) {
            if (doc.lowerTitle.includes(queryTokens[i])) totalScore += 10;
          }

          const firstIdx = doc.lowerCorpus.indexOf(queryTokens[0]);
          const start = firstIdx > 30 ? firstIdx - 30 : 0;
          const snippet = (start > 0 ? '…' : '') + doc.corpus.slice(start, start + 140).trim();
          matched.push({
            record: doc.record,
            score: totalScore,
            snippet,
            jumpDate: doc.jumpDate,
          });
        }
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
}

export const globalSearchIndex = new InvertedSearchIndex();
