/**
 * Bounded LRU ObjectURL Cache for Binary Blobs (v4.2.0 §2 Performance Overhaul).
 * Prevents unbounded URL.createObjectURL leaks and eliminates repeated IndexedDB blob
 * decoding across Notes, Diary, Photos, Document Scanner, and PDF Studio.
 */

interface CacheEntry {
  url: string;
  byteSize: number;
  createdAt: number;
}

export class BoundedBlobUrlCache {
  private map = new Map<string, CacheEntry>();
  private maxEntries: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxEntries = 64) {
    this.maxEntries = Math.max(4, maxEntries);
  }

  public setMaxEntries(limit: number): void {
    this.maxEntries = Math.max(4, limit);
    this.enforceLimit();
  }

  public get(key: string): string | null {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    // Refresh LRU order (delete & re-insert at tail)
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.url;
  }

  public set(key: string, url: string, byteSize = 0): string {
    const existing = this.map.get(key);
    if (existing) {
      if (existing.url !== url) {
        this.safeRevoke(existing.url);
      }
      this.map.delete(key);
    }
    this.map.set(key, { url, byteSize, createdAt: Date.now() });
    this.enforceLimit();
    return url;
  }

  public async getOrLoad(
    key: string,
    loader: () => Promise<{ blob: Blob; byteSize?: number } | null>
  ): Promise<string | null> {
    const cached = this.get(key);
    if (cached) return cached;
    const loaded = await loader();
    if (!loaded) return null;
    const url = URL.createObjectURL(loaded.blob);
    return this.set(key, url, loaded.byteSize ?? loaded.blob.size);
  }

  public invalidateHash(hash: string): void {
    for (const key of Array.from(this.map.keys())) {
      if (key === hash || key.startsWith(`${hash}:`)) {
        const entry = this.map.get(key);
        if (entry) this.safeRevoke(entry.url);
        this.map.delete(key);
      }
    }
  }

  public clear(): void {
    for (const entry of this.map.values()) {
      this.safeRevoke(entry.url);
    }
    this.map.clear();
  }

  public getStats(): { size: number; maxEntries: number; hits: number; misses: number; evictions: number } {
    return {
      size: this.map.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private enforceLimit(): void {
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.map.get(oldestKey);
      this.map.delete(oldestKey);
      if (oldest) this.safeRevoke(oldest.url);
      this.evictions++;
    }
  }

  private safeRevoke(url: string): void {
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    } catch {
      // Non-fatal in test/non-DOM environments
    }
  }
}

export const blobUrlCache = new BoundedBlobUrlCache(64);
