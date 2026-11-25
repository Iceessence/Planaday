import React, { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * IME-safe, cursor-preserving local text buffer for Notes, Diary, Thought Inbox & Today Spread.
 *
 * Prevents BOTH root causes of mobile editing bugs:
 * 1. Cursor jumping to bottom: React textarea receives synchronous local state updates rather
 *    than delayed async IndexedDB/Dexie live-query emissions overwriting `textarea.value`.
 * 2. Autocorrect duplication (Gboard / Samsung Keyboard): Suppresses commits and external
 *    overwrites while `isComposingRef.current === true`, flushing cleanly on compositionEnd
 *    and after a quiet debounce window (default 650ms).
 */
export function useBufferedText({
  recordKey,
  externalValue,
  debounceMs = 650,
  titleHint,
  onCommit,
}: UseBufferedTextOptions): UseBufferedTextResult {
  const [value, setValue] = useState(externalValue);
  const [saveState, setSaveState] = useState<LocalSaveState>('clean');
  const [isComposing, setIsComposing] = useState(false);

  const valueRef = useRef(externalValue);
  const lastCommittedRef = useRef(externalValue);
  const dirtyRef = useRef(false);
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);

  // CRITICAL PD-016 INVARIANT:
  // boundKeyRef & boundCommitRef ALWAYS point to the SAME originating recordKey!
  // Never overwrite boundCommitRef during a render where recordKey has already switched
  // to the next record (e.g. blurless Alpha -> Beta click), so pending Alpha drafts
  // ALWAYS flush into Alpha's captured commit sink!
  const recordKeyRef = useRef(recordKey);
  const boundCommitRef = useRef(onCommit);
  const boundTitleHintRef = useRef(titleHint);
  if (recordKeyRef.current === recordKey) {
    boundCommitRef.current = onCommit;
    boundTitleHintRef.current = titleHint;
  }

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearDraftTimer = () => {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  };

  const persistDurableDraft = useCallback(
    (key: string, content: string, reason: 'unsaved' | 'interrupted' | 'error' = 'unsaved', hint = '') => {
      if (!key || key.startsWith('none:')) return;
      const [recordId, field = 'body'] = key.split(':');
      if (!recordId || recordId === 'none') return;
      void db.drafts
        .put({
          key,
          recordId,
          field,
          titleHint: hint || recordId,
          content,
          updatedAt: new Date().toISOString(),
          reason,
        })
        .catch(() => undefined);
    },
    []
  );

  const clearDurableDraft = useCallback((key: string) => {
    if (!key || key.startsWith('none:')) return;
    void db.drafts.delete(key).catch(() => undefined);
  }, []);

  const commitCapturedSession = useCallback(
    async (
      targetKey: string,
      targetCommit: UseBufferedTextOptions['onCommit'],
      targetContent: string,
      manual: boolean,
      hint: string
    ) => {
      try {
        await targetCommit(targetContent, { manual, recordKey: targetKey });
        clearDurableDraft(targetKey);
        if (recordKeyRef.current === targetKey) {
          lastCommittedRef.current = targetContent;
          if (valueRef.current === targetContent) {
            dirtyRef.current = false;
            setSaveState('saved');
          }
        }
      } catch {
        // Keep recoverable draft in PF-55 Draft Recovery Inbox on failure
        persistDurableDraft(targetKey, targetContent, 'error', hint);
        if (recordKeyRef.current === targetKey) {
          setSaveState('unsaved');
        }
      }
    },
    [clearDurableDraft, persistDurableDraft]
  );

  const flushNow = useCallback(
    async (manual = false) => {
      clearTimer();
      clearDraftTimer();
      if (composingRef.current && !manual) return;
      const targetKey = recordKeyRef.current;
      const targetCommit = boundCommitRef.current;
      const targetHint = boundTitleHintRef.current ?? '';
      const current = valueRef.current;
      if (!dirtyRef.current && !manual) return;
      if (current === lastCommittedRef.current && !manual) {
        dirtyRef.current = false;
        clearDurableDraft(targetKey);
        setSaveState('saved');
        return;
      }
      setSaveState('saving');
      await commitCapturedSession(targetKey, targetCommit, current, manual, targetHint);
    },
    [clearDurableDraft, commitCapturedSession]
  );

  // When switching to a different record, flush the OLD record strictly via its OWN
  // bound commit sink BEFORE rebinding to the new record (eliminates PD-016 cross-note overwrite!).
  useEffect(() => {
    if (recordKeyRef.current !== recordKey) {
      const oldKey = recordKeyRef.current;
      const oldCommit = boundCommitRef.current;
      const oldHint = boundTitleHintRef.current ?? '';
      const oldVal = valueRef.current;
      const oldDirty = dirtyRef.current;
      const oldLastCommitted = lastCommittedRef.current;

      clearTimer();
      clearDraftTimer();

      // Rebind immediately to the newly selected record so subsequent events belong to the new record
      recordKeyRef.current = recordKey;
      boundCommitRef.current = onCommit;
      boundTitleHintRef.current = titleHint;
      valueRef.current = externalValue;
      lastCommittedRef.current = externalValue;
      dirtyRef.current = false;
      composingRef.current = false;
      setIsComposing(false);
      setValue(externalValue);
      setSaveState('clean');

      // Flush the previous record's pending edits strictly to the OLD record's commit callback!
      if (oldDirty && oldVal !== oldLastCommitted) {
        persistDurableDraft(oldKey, oldVal, 'interrupted', oldHint);
        void commitCapturedSession(oldKey, oldCommit, oldVal, false, oldHint);
      }
    }
  }, [recordKey, externalValue, onCommit, titleHint, commitCapturedSession, persistDurableDraft]);

  // Accept remote/external updates ONLY when local editor is NOT dirty and NOT mid-composition!
  useEffect(() => {
    if (recordKeyRef.current !== recordKey) return;
    if (!dirtyRef.current && !composingRef.current && externalValue !== valueRef.current) {
      valueRef.current = externalValue;
      lastCommittedRef.current = externalValue;
      setValue(externalValue);
    }
  }, [recordKey, externalValue]);

  // Flush pending edits safely on unmount, tab hide, or pagehide (prevents data loss!)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        void flushNow(false);
      }
    };
    const onPageHide = () => {
      if (dirtyRef.current) {
        persistDurableDraft(recordKeyRef.current, valueRef.current, 'interrupted', boundTitleHintRef.current ?? '');
        void flushNow(false);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      clearTimer();
      clearDraftTimer();
      if (dirtyRef.current && valueRef.current !== lastCommittedRef.current) {
        const k = recordKeyRef.current;
        const c = boundCommitRef.current;
        const v = valueRef.current;
        const h = boundTitleHintRef.current ?? '';
        persistDurableDraft(k, v, 'interrupted', h);
        void commitCapturedSession(k, c, v, false, h);
      }
    };
  }, [flushNow, commitCapturedSession, persistDurableDraft]);

  const scheduleCommit = useCallback(() => {
    clearTimer();
    clearDraftTimer();
    const k = recordKeyRef.current;
    const h = boundTitleHintRef.current ?? '';
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      if (dirtyRef.current && recordKeyRef.current === k) {
        persistDurableDraft(k, valueRef.current, 'unsaved', h);
      }
    }, 220);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushNow(false);
    }, debounceMs);
  }, [debounceMs, flushNow, persistDurableDraft]);

  const handleChange = useCallback(
    (next: string) => {
      valueRef.current = next;
      dirtyRef.current = true;
      setValue(next);
      setSaveState('unsaved');
      if (!composingRef.current) {
        scheduleCommit();
      }
    },
    [scheduleCommit]
  );

  const setDraft = useCallback(
    (next: string) => {
      handleChange(next);
    },
    [handleChange]
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    setIsComposing(true);
    clearTimer();
  }, []);

  const handleCompositionEnd = useCallback(
    (finalValue: string) => {
      composingRef.current = false;
      setIsComposing(false);
      valueRef.current = finalValue;
      dirtyRef.current = true;
      setValue(finalValue);
      setSaveState('unsaved');
      scheduleCommit();
    },
    [scheduleCommit]
  );

  const handleBlur = useCallback(() => {
    if (dirtyRef.current) {
      void flushNow(false);
    }
  }, [flushNow]);

  return {
    value,
    saveState,
    isComposing,
    setDraft,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    handleBlur,
    flushNow,
  };
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
    // PD-010: Skip expensive full scrollHeight forced layout reflow on huge 12k+ char pastes
    if (buf.value.length > 12_000) {
      el.style.height = '420px';
      el.style.overflowY = 'auto';
      return;
    }
    const prevScroll = window.scrollY;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight + 4, 88)}px`;
    if (window.scrollY !== prevScroll) {
      window.scrollTo({ top: prevScroll });
    }
  }, [buf.value, autoGrow, refToUse]);

  return (
    <textarea
      {...rest}
      ref={refToUse}
      value={buf.value}
      onChange={(e) => buf.handleChange(e.target.value)}
      onCompositionStart={buf.handleCompositionStart}
      onCompositionEnd={(e) => buf.handleCompositionEnd(e.currentTarget.value)}
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
      onCompositionStart={buf.handleCompositionStart}
      onCompositionEnd={(e) => buf.handleCompositionEnd(e.currentTarget.value)}
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

  if (midA.length * midB.length <= 40_000) {
    // Exact LCS diff for normal-sized edits
    const m = midA.length;
    const n = midB.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
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
