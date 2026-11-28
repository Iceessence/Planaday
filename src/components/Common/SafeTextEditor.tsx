import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../../core/db';

export type LocalSaveState = 'clean' | 'unsaved' | 'saving' | 'saved';

export interface UseBufferedTextOptions {
  recordKey: string; // e.g., `${recordId}:content` so switching records cleanly resets draft
  externalValue: string;
  debounceMs?: number;
  titleHint?: string;
  onCommit: (nextValue: string, meta: { manual: boolean; recordKey?: string }) => Promise<void> | void;
}

export interface UseBufferedTextResult {
  value: string;
  saveState: LocalSaveState;
  isComposing: boolean;
  setDraft: (next: string) => void;
  handleChange: (next: string) => void;
  handleCompositionStart: () => void;
  handleCompositionEnd: (finalValue: string) => void;
  handleBlur: () => void;
  flushNow: (manual?: boolean) => Promise<void>;
}

// Serialize writes per record/field, even when a user switches away and back.
// Each edit has a unique token so older saves cannot delete a newer recovery draft.
const commitQueues = new Map<string, Promise<void>>();
const latestEdits = new Map<string, symbol>();
interface TextSession {
  key: string;
  value: string;
  committed: string;
  dirty: boolean;
  composing: boolean;
  revision: symbol;
  pending: Map<symbol, Promise<void>>;
  commit: UseBufferedTextOptions['onCommit'];
  hint: string;
}
function newSession(key: string, value: string, commit: TextSession['commit'], hint = ''): TextSession {
  return { key, value, committed: value, dirty: false, composing: false,
    revision: Symbol(), pending: new Map(), commit, hint };
}
function persistDraft(session: TextSession, reason: 'unsaved' | 'interrupted' | 'error') {
  const { key, value, hint, revision } = session;
  if (!key || key.startsWith('none:') || latestEdits.get(key) !== revision) return;
  const [recordId, field = 'body'] = key.split(':');
  if (!recordId || recordId === 'none') return;
  // Dexie queues writes in invocation order. Never write an outdated snapshot on failure.
  void db.drafts.put({ key, recordId, field, titleHint: hint || recordId,
    content: value, updatedAt: new Date().toISOString(), reason }).catch(() => undefined);
}

/** IME-safe local input with debounced durable recovery and serialized commits. */
export function useBufferedText({ recordKey, externalValue, debounceMs = 650, titleHint, onCommit }: UseBufferedTextOptions): UseBufferedTextResult {
  const [value, setValue] = useState(externalValue);
  const [saveState, setSaveState] = useState<LocalSaveState>('clean');
  const [isComposing, setIsComposing] = useState(false);
  const sessionRef = useRef<TextSession>(null!);
  if (!sessionRef.current) sessionRef.current = newSession(recordKey, externalValue, onCommit, titleHint);
  const mounted = useRef(false);
  const externalRef = useRef(externalValue);
  const timer = useRef<number | undefined>(undefined);
  const draftTimer = useRef<number | undefined>(undefined);
  const clearTimers = useCallback(() => {
    window.clearTimeout(timer.current); timer.current = undefined;
    window.clearTimeout(draftTimer.current); draftTimer.current = undefined;
  }, []);
  const publish = useCallback((session: TextSession, state: LocalSaveState) => {
    if (mounted.current && sessionRef.current === session) setSaveState(state);
  }, []);
  const commitSession = useCallback((session: TextSession, manual = false): Promise<void> => {
    if ((!session.dirty && !manual) || session.composing) return Promise.resolve();
    const { key, value: content, revision, commit } = session;
    const existing = session.pending.get(revision);
    if (existing) return existing;
    // Explicit manual commits of clean content retain the original API contract.
    if (!session.dirty) latestEdits.set(key, revision);
    if (session.dirty) persistDraft(session, 'unsaved');
    publish(session, 'saving');
    const previous = commitQueues.get(key) ?? Promise.resolve();
    const work = previous.catch(() => undefined).then(async () => {
      try {
        await commit(content, { manual, recordKey: key });
        session.committed = content;
        if (latestEdits.get(key) === revision) {
          latestEdits.delete(key);
          if (key && !key.startsWith('none:')) void db.drafts.delete(key).catch(() => undefined);
        }
        if (session.revision === revision) {
          session.dirty = false;
          publish(session, 'saved');
        }
      } catch {
        if (session.revision === revision) {
          session.dirty = true;
          persistDraft(session, 'error');
          publish(session, 'unsaved');
        }
      }
    });
    session.pending.set(revision, work);
    commitQueues.set(key, work);
    void work.finally(() => {
      session.pending.delete(revision);
      if (commitQueues.get(key) === work) commitQueues.delete(key);
    });
    return work;
  }, [publish]);
  const flushNow = useCallback((manual = false) => {
    clearTimers();
    const session = sessionRef.current;
    if (session.composing) {
      if (session.dirty) persistDraft(session, 'interrupted');
      return Promise.resolve();
    }
    return commitSession(session, manual);
  }, [clearTimers, commitSession]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      const session = sessionRef.current;
      if (session.dirty) {
        persistDraft(session, 'interrupted');
        if (!session.composing) void commitSession(session);
      }
    };
  }, [clearTimers, commitSession]);

  // Capture the old sink before rebinding. Layout timing prevents a stale draft
  // being displayed or edited during a blurless record switch.
  useLayoutEffect(() => {
    const old = sessionRef.current;
    if (old.key !== recordKey) {
      clearTimers();
      if (old.dirty) {
        persistDraft(old, 'interrupted');
        if (!old.composing) void commitSession(old);
      }
      sessionRef.current = newSession(recordKey, externalValue, onCommit, titleHint);
      externalRef.current = externalValue;
      setValue(externalValue); setSaveState('clean'); setIsComposing(false);
    } else {
      old.commit = onCommit;
      old.hint = titleHint ?? '';
      const changed = externalRef.current !== externalValue;
      externalRef.current = externalValue;
      if (changed && !old.dirty && !old.composing && old.value !== externalValue) {
        old.value = externalValue; old.committed = externalValue;
        setValue(externalValue); setSaveState('clean');
      }
    }
  }, [recordKey, externalValue, onCommit, titleHint, clearTimers, commitSession]);

  useEffect(() => {
    const onHide = () => { if (document.hidden) void flushNow(); };
    const onPageHide = () => {
      const session = sessionRef.current;
      if (session.dirty) persistDraft(session, 'interrupted');
      void flushNow();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushNow]);

  const schedule = useCallback(() => {
    clearTimers();
    const session = sessionRef.current;
    // During IME composition retain a recovery draft but never publish partial text.
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = undefined;
      if (session.dirty) persistDraft(session, 'unsaved');
    }, 220);
    if (!session.composing) timer.current = window.setTimeout(() => { void flushNow(); }, Math.max(0, debounceMs));
  }, [clearTimers, debounceMs, flushNow]);
  const handleChange = useCallback((next: string) => {
    const session = sessionRef.current;
    if (next === session.value) return;
    session.value = next; session.dirty = true; session.revision = Symbol();
    latestEdits.set(session.key, session.revision);
    setValue(next); setSaveState('unsaved'); schedule();
  }, [schedule]);
  const handleCompositionStart = useCallback(() => {
    sessionRef.current.composing = true; setIsComposing(true); clearTimers();
    if (sessionRef.current.dirty) persistDraft(sessionRef.current, 'unsaved');
  }, [clearTimers]);
  const handleCompositionEnd = useCallback((finalValue: string) => {
    sessionRef.current.composing = false; setIsComposing(false);
    handleChange(finalValue);
    if (sessionRef.current.dirty) schedule();
  }, [handleChange, schedule]);
  const handleBlur = useCallback(() => { void flushNow(); }, [flushNow]);
  return { value, saveState, isComposing, setDraft: handleChange, handleChange, handleCompositionStart, handleCompositionEnd, handleBlur, flushNow };
}

interface SafeTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  recordKey: string;
  externalValue: string;
  onCommit: (nextValue: string, meta: { manual: boolean; recordKey?: string }) => Promise<void> | void;
  debounceMs?: number;
  titleHint?: string;
  autoGrow?: boolean;
  onSaveStateChange?: (state: LocalSaveState) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Drop-in IME-safe, cursor-preserving, auto-expanding textarea for Diary, Thought Inbox & Today.
 */
export const SafeTextarea: React.FC<SafeTextareaProps> = ({
  recordKey,
  externalValue,
  onCommit,
  debounceMs = 650,
  titleHint,
  autoGrow = true,
  onSaveStateChange,
  textareaRef,
  style,
  ...rest
}) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const refToUse = textareaRef ?? innerRef;

  const buf = useBufferedText({
    recordKey,
    externalValue,
    debounceMs,
    titleHint,
    onCommit,
  });

  useEffect(() => {
    onSaveStateChange?.(buf.saveState);
  }, [buf.saveState, onSaveStateChange]);

  useEffect(() => {
    if (!autoGrow) return;
    const el = refToUse.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      if (buf.value.length > 12_000) {
        el.style.height = '420px'; el.style.overflowY = 'auto'; return;
      }
      const prevScroll = window.scrollY;
      el.style.overflowY = 'hidden';
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight + 4, 88)}px`;
      if (window.scrollY !== prevScroll) window.scrollTo({ top: prevScroll });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [buf.value, autoGrow, refToUse]);

  return (
    <textarea
      {...rest}
      ref={refToUse}
      value={buf.value}
      onChange={(e) => buf.handleChange(e.target.value)}
      onCompositionStart={(e) => { buf.handleCompositionStart(); rest.onCompositionStart?.(e); }}
      onCompositionEnd={(e) => { buf.handleCompositionEnd(e.currentTarget.value); rest.onCompositionEnd?.(e); }}
      onBlur={(e) => {
        buf.handleBlur();
        rest.onBlur?.(e);
      }}
      style={{
        overflowY: autoGrow ? 'hidden' : 'auto',
        ...style,
      }}
    />
  );
};

interface SafeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  recordKey: string;
  externalValue: string;
  onCommit: (nextValue: string, meta: { manual: boolean }) => Promise<void> | void;
  debounceMs?: number;
}

export const SafeInput: React.FC<SafeInputProps> = ({
  recordKey,
  externalValue,
  onCommit,
  debounceMs = 550,
  ...rest
}) => {
  const buf = useBufferedText({
    recordKey,
    externalValue,
    debounceMs,
    onCommit,
  });

  return (
    <input
      {...rest}
      value={buf.value}
      onChange={(e) => buf.handleChange(e.target.value)}
      onCompositionStart={(e) => { buf.handleCompositionStart(); rest.onCompositionStart?.(e); }}
      onCompositionEnd={(e) => { buf.handleCompositionEnd(e.currentTarget.value); rest.onCompositionEnd?.(e); }}
      onBlur={(e) => {
        buf.handleBlur();
        rest.onBlur?.(e);
      }}
    />
  );
};

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Simple, deterministic line-level diff for Notes Version History comparison.
 */
export function computeLineDiff(oldText: string, newText: string): {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
} {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);

  // Guard huge 10k-line documents with fast prefix/suffix trimming + bounded LCS
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const lines: DiffLine[] = [];
  let addedCount = 0;
  let removedCount = 0;

  for (let i = 0; i < start; i++) lines.push({ type: 'same', text: a[i] });

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  if (midA.length > 0 && midB.length > 0 && midA.length * midB.length <= 40_000) {
    // Exact LCS diff for normal-sized edits
    const m = midA.length;
    const n = midB.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        lines.push({ type: 'same', text: midA[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({ type: 'removed', text: midA[i] });
        removedCount++;
        i++;
      } else {
        lines.push({ type: 'added', text: midB[j] });
        addedCount++;
        j++;
      }
    }
    while (i < m) {
      lines.push({ type: 'removed', text: midA[i++] });
      removedCount++;
    }
    while (j < n) {
      lines.push({ type: 'added', text: midB[j++] });
      addedCount++;
    }
  } else {
    for (const ln of midA) {
      lines.push({ type: 'removed', text: ln });
      removedCount++;
    }
    for (const ln of midB) {
      lines.push({ type: 'added', text: ln });
      addedCount++;
    }
  }

  for (let i = endA + 1; i < a.length; i++) lines.push({ type: 'same', text: a[i] });
  return { lines, addedCount, removedCount };
}
