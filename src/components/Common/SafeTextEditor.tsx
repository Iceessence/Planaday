import React, { useCallback, useEffect, useRef, useState } from 'react';

export type LocalSaveState = 'clean' | 'unsaved' | 'saving' | 'saved';

export interface UseBufferedTextOptions {
  recordKey: string; // e.g., `${recordId}:content` so switching records cleanly resets draft
  externalValue: string;
  debounceMs?: number;
  onCommit: (nextValue: string, meta: { manual: boolean }) => Promise<void> | void;
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
  const onCommitRef = useRef(onCommit);
  const recordKeyRef = useRef(recordKey);

  onCommitRef.current = onCommit;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flushNow = useCallback(async (manual = false) => {
    clearTimer();
    if (composingRef.current && !manual) return;
    const current = valueRef.current;
    if (!dirtyRef.current && !manual) return;
    if (current === lastCommittedRef.current && !manual) {
      dirtyRef.current = false;
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    try {
      await onCommitRef.current(current, { manual });
      lastCommittedRef.current = current;
      // Only mark clean/saved if user didn't type more while the async commit was running!
      if (valueRef.current === current) {
        dirtyRef.current = false;
        setSaveState('saved');
      }
    } catch {
      setSaveState('unsaved');
    }
  }, []);

  // When switching to a different record, flush the old record first, then hydrate the new one
  useEffect(() => {
    if (recordKeyRef.current !== recordKey) {
      if (dirtyRef.current && valueRef.current !== lastCommittedRef.current) {
        void onCommitRef.current(valueRef.current, { manual: false });
      }
      clearTimer();
      recordKeyRef.current = recordKey;
      valueRef.current = externalValue;
      lastCommittedRef.current = externalValue;
      dirtyRef.current = false;
      composingRef.current = false;
      setIsComposing(false);
      setValue(externalValue);
      setSaveState('clean');
    }
  }, [recordKey, externalValue]);

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
        void flushNow(false);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      clearTimer();
      if (dirtyRef.current && valueRef.current !== lastCommittedRef.current) {
        void onCommitRef.current(valueRef.current, { manual: false });
      }
    };
  }, [flushNow]);

  const scheduleCommit = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushNow(false);
    }, debounceMs);
  }, [debounceMs, flushNow]);

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
  onCommit: (nextValue: string, meta: { manual: boolean }) => Promise<void> | void;
  debounceMs?: number;
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
    onCommit,
  });

  useEffect(() => {
    onSaveStateChange?.(buf.saveState);
  }, [buf.saveState, onSaveStateChange]);

  useEffect(() => {
    if (!autoGrow) return;
    const el = refToUse.current;
    if (!el) return;
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
