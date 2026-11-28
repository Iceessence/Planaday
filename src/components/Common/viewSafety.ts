import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { db } from '../../core/db';
import type { AppSettings, LifeRecord, RecordType } from '../../core/types';

/** Guard one form at a time, including rapid Enter presses before React rerenders. */
export function useViewFormGuard(report: (message: string) => void) {
  const busy = useRef(new Set<string>());
  return (key: string, handler: (event: FormEvent<HTMLFormElement>) => unknown) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try { await handler(event); }
    catch (error) { report(error instanceof Error ? error.message : 'Could not save. Please retry.'); }
    finally { busy.current.delete(key); }
  };
}

export function useViewActionGuard(report: (message: string) => void) {
  const busy = useRef(new Set<string>());
  return (key: string, handler: () => unknown) => async () => {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try { await handler(); }
    catch (error) { report(error instanceof Error ? error.message : 'Operation failed. Please retry.'); }
    finally { busy.current.delete(key); }
  };
}

/** Only rerender on a minute boundary; refresh immediately when returning to a tab. */
export function useMinuteClock(enabled = true): Date {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const refresh = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (document.hidden) return;
      setMinute(Math.floor(Date.now() / 60000));
      timer = window.setTimeout(refresh, 60000 - Date.now() % 60000 + 20);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => { if (timer !== undefined) window.clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [enabled]);
  return new Date(minute * 60000);
}

export type ViewScope = Pick<AppSettings, 'activeWorkspaceId' | 'activeProfileId'>;
const scopedWrites = new Map<string, Promise<unknown>>();
export function scopeKey(scope: ViewScope): string {
  return `${scope.activeWorkspaceId}:${scope.activeProfileId}`;
}
/** Serialize first-record creation within this JS runtime, then reread durable data instead of a stale render snapshot. */
export async function withScopedRecords<T>(scope: ViewScope, type: RecordType, work: (records: LifeRecord[]) => Promise<T>): Promise<T> {
  const key = `${scope.activeWorkspaceId}:${type}`;
  const prior = scopedWrites.get(key) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(async () => {
    const profile = scope.activeProfileId;
    const rows = await db.records.where('[workspaceId+type]').equals([scope.activeWorkspaceId, type]).toArray();
    return work(rows.filter(r => !r.deletedAt && (!profile || profile === 'all' || !r.ownerProfileId || r.ownerProfileId === profile || r.sharedWithAll || r.sharedWithProfileIds?.includes(profile) || r.assigneeId === profile)));
  });
  scopedWrites.set(key, next);
  try { return await next; } finally { if (scopedWrites.get(key) === next) scopedWrites.delete(key); }
}
