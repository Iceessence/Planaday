import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  BookmarkPlus,
  Calendar,
  Camera,
  CheckSquare,
  ExternalLink,
  FilePlus,
  History,
  Image as ImageIcon,
  Mic,
  Network,
  PenTool,
  Pin,
  Save,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import {
  createNamedNoteCheckpoint,
  createRecord,
  getNoteRevisions,
  softDeleteRecord,
  updateRecord,
} from '../../core/repository';
import {
  convertDailyNoteToTarget,
  DAILY_NOTE_CATEGORIES,
  isDailyArchiveNote,
  upsertCanonicalDailyNote,
  type DailyNoteCategory,
} from '../../core/dailyNotes';
import { db, getBlobObjectUrl, storeBlob } from '../../core/db';
import { DEFAULT_NOTEBOOKS } from '../../data/sampleData';
import { extractInlineEntities } from '../../core/mindActions';
import { ModalDialog } from '../../components/Common/ModalDialog';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { computeLineDiff, useBufferedText } from '../../components/Common/SafeTextEditor';
import type { FontPairing, LifeRecord, NotePayload, PaperMaterial, RevisionRecord, TaskPayload } from '../../core/types';

export const NotesView: React.FC = () => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    activeDate,
    setActiveDate,
    setActiveView,
    pushToast,
    selectedNoteId,
    setSelectedNoteId,
    notesInitialTab,
    setNotesInitialTab,
    syncState,
  } = useApp();

  const [notesTab, setNotesTab] = useState<'all' | 'daily' | 'graph'>(notesInitialTab);
  const [dailyCategoryFilter, setDailyCategoryFilter] = useState<'all' | DailyNoteCategory>('all');
  const [dailyDateFilter, setDailyDateFilter] = useState<string>('');
  const [dailyCalendarMonth, setDailyCalendarMonth] = useState<string>(() => (activeDate || logicalToday).slice(0, 7));

  useEffect(() => {
    if (notesInitialTab !== 'all') {
      setNotesTab(notesInitialTab);
      if (notesInitialTab === 'daily') {
        setDailyCalendarMonth((activeDate || logicalToday).slice(0, 7));
      }
      setNotesInitialTab('all');
    }
  }, [notesInitialTab, activeDate, logicalToday, setNotesInitialTab]);

  const [activeNotebook, setActiveNotebook] = useState<string>('all');
  const [noteSearch, setNoteSearch] = useState('');
  const [notePinFilter, setNotePinFilter] = useState<'all' | 'pinned'>('all');
  const [noteSortBy, setNoteSortBy] = useState<'updated' | 'created' | 'title' | 'words'>('updated');
  const [noteSortDir, setNoteSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'graph'>('edit');
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('editor');
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [diffRevId, setDiffRevId] = useState<string | null>(null);
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [sketchOpen, setSketchOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [notePageIdx, setNotePageIdx] = useState(0);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastRevisionAtRef = useRef<Record<string, number>>({});

  const customNotebooks = useMemo(
    () => records.filter((r) => r.type === 'notebook').map((r) => ({ id: r.id, name: r.title, emoji: '📒', color: r.color || '#a97434' })),
    [records]
  );
  const notebooks = useMemo(() => [...DEFAULT_NOTEBOOKS, ...customNotebooks], [customNotebooks]);

  const notes = useMemo(
    () =>
      (records.filter((r) => r.type === 'note') as Array<LifeRecord<NotePayload>>).sort(
        (a, b) => Number(Boolean(b.payload.pinned)) - Number(Boolean(a.payload.pinned)) || b.updatedAt.localeCompare(a.updatedAt)
      ),
    [records]
  );

  const dailyArchiveNotes = useMemo(
    () => notes.filter((n) => isDailyArchiveNote(n)),
    [notes]
  );

  const dailyNoteDatesMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of dailyArchiveNotes) {
      if (n.payload.archived && !showArchived) continue;
      const d = n.payload.sourcePlannerDate || n.payload.writtenForDate;
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return counts;
  }, [dailyArchiveNotes, showArchived]);

  const visibleNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const baseSource = notesTab === 'daily' ? dailyArchiveNotes : notes;
    const list = baseSource.filter((n) => {
      if (!showArchived && n.payload.archived) return false;
      if (activeNotebook !== 'all' && n.payload.notebookId !== activeNotebook) return false;
      if (notePinFilter === 'pinned' && !n.payload.pinned && !n.payload.favorite) return false;
      if (notesTab === 'daily') {
        if (dailyCategoryFilter !== 'all') {
          const cat = n.payload.dailyCategory ?? (n.payload.isDailyNote ? 'daily_specific' : 'uncategorized');
          if (cat !== dailyCategoryFilter) return false;
        }
        if (dailyDateFilter) {
          const d = n.payload.sourcePlannerDate || n.payload.writtenForDate;
          if (d !== dailyDateFilter) return false;
        }
      }
      if (q) {
        const hay = `${n.title} ${n.payload.description ?? ''} ${n.payload.content ?? ''} ${n.payload.writtenForDate ?? ''} ${(n.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = noteSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const pinDiff = Number(Boolean(b.payload.pinned)) - Number(Boolean(a.payload.pinned));
      if (pinDiff !== 0) return pinDiff;
      if (noteSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (noteSortBy === 'created') {
        const da = a.payload.sourcePlannerDate || a.payload.writtenForDate || a.createdAt;
        const dbDate = b.payload.sourcePlannerDate || b.payload.writtenForDate || b.createdAt;
        return da.localeCompare(dbDate) * dir;
      }
      if (noteSortBy === 'words') {
        const wa = (a.payload.content ?? '').trim().split(/\s+/).filter(Boolean).length;
        const wb = (b.payload.content ?? '').trim().split(/\s+/).filter(Boolean).length;
        return (wa - wb) * dir;
      }
      return a.updatedAt.localeCompare(b.updatedAt) * dir;
    });
  }, [
    notes,
    dailyArchiveNotes,
    notesTab,
    dailyCategoryFilter,
    dailyDateFilter,
    activeNotebook,
    noteSearch,
    notePinFilter,
    noteSortBy,
    noteSortDir,
    showArchived,
  ]);

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Array<LifeRecord<NotePayload>>>();
    const visibleIds = new Set(visibleNotes.map((n) => n.id));
    for (const n of visibleNotes) {
      const pid = n.payload.parentId && visibleIds.has(n.payload.parentId) ? n.payload.parentId : '__root__';
      const arr = map.get(pid) ?? [];
      arr.push(n);
      map.set(pid, arr);
    }
    return map;
  }, [visibleNotes]);

  const getDescendantIds = useCallback(
    (rootId: string): Set<string> => {
      const out = new Set<string>([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const n of notes) {
          if (n.payload.parentId === cur && !out.has(n.id)) {
            out.add(n.id);
            queue.push(n.id);
          }
        }
      }
      return out;
    },
    [notes]
  );

  const getBreadcrumbTrail = useCallback(
    (note: LifeRecord<NotePayload> | null): Array<LifeRecord<NotePayload>> => {
      if (!note) return [];
      const chain: Array<LifeRecord<NotePayload>> = [];
      const seen = new Set<string>();
      let cur: LifeRecord<NotePayload> | undefined = note;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur);
        cur = cur.payload.parentId ? noteById.get(cur.payload.parentId) : undefined;
      }
      return chain;
    },
    [noteById]
  );

  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? visibleNotes[0] ?? null,
    [notes, selectedNoteId, visibleNotes]
  );

  // Load object URLs via bounded LRU blobUrlCache (lifecycle managed centrally in blobCache.ts!)
  useEffect(() => {
    let active = true;
    const ids = [
      ...(activeNote?.payload.attachmentBlobIds ?? []),
      ...(activeNote?.payload.voiceMemoBlobIds ?? []),
      ...(activeNote?.payload.sketchBlobId ? [activeNote.payload.sketchBlobId] : []),
      ...(activeNote?.payload.ocrSourceBlobIds ?? []),
    ];
    (async () => {
      const next: Record<string, string> = {};
      for (const h of ids) {
        const u = await getBlobObjectUrl(h);
        if (u) {
          next[h] = u;
        }
      }
      if (active) {
        setBlobUrls(next);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    activeNote?.id,
    activeNote?.payload.attachmentBlobIds?.length,
    activeNote?.payload.voiceMemoBlobIds?.length,
    activeNote?.payload.sketchBlobId,
    activeNote?.payload.ocrSourceBlobIds?.length,
  ]);

  // IME-safe, cursor-preserving, RECORD-BOUND title & body commits (eliminates PD-016 cross-note overwrite!)
  const activeNoteId = activeNote?.id ?? null;

  const commitTitle = useCallback(
    async (nextTitle: string, meta?: { manual: boolean; recordKey?: string }) => {
      const targetId = meta?.recordKey ? meta.recordKey.split(':')[0] : activeNoteId;
      if (!targetId || targetId === 'none') return;
      await updateRecord(targetId, { title: nextTitle }, { skipUndo: true, skipRevision: true });
    },
    [activeNoteId]
  );

  const commitContent = useCallback(
    async (nextContent: string, meta: { manual: boolean; recordKey?: string }) => {
      const targetId = meta?.recordKey ? meta.recordKey.split(':')[0] : activeNoteId;
      if (!targetId || targetId === 'none') return;
      // PD-010: Skip expensive regex scan on huge 50k+ char buffers during background debounce; run on manual save or normal notes
      const entities =
        meta.manual || nextContent.length <= 40_000 ? extractInlineEntities(nextContent) : null;
      const nowMs = Date.now();
      const lastRevMs = lastRevisionAtRef.current[targetId] ?? 0;
      const shouldSnapshotRevision = meta.manual || nowMs - lastRevMs >= 60_000;
      if (shouldSnapshotRevision) {
        lastRevisionAtRef.current[targetId] = nowMs;
      }
      await updateRecord<NotePayload>(
        targetId,
        (cur) => ({
          ...cur,
          tags: entities ? entities.tags : cur.tags,
          payload: {
            ...cur.payload,
            content: nextContent,
            touchedDates: Array.from(new Set([...(cur.payload.touchedDates ?? []), logicalToday])),
          },
        }),
        { skipUndo: true, skipRevision: !shouldSnapshotRevision }
      );
    },
    [activeNoteId, logicalToday]
  );

  const titleBuffer = useBufferedText({
    recordKey: `${activeNoteId ?? 'none'}:title`,
    externalValue: activeNote?.title ?? '',
    titleHint: activeNote?.title ?? 'Untitled Note',
    debounceMs: 550,
    onCommit: commitTitle,
  });

  const bodyBuffer = useBufferedText({
    recordKey: `${activeNoteId ?? 'none'}:body`,
    externalValue: activeNote?.payload.content ?? '',
    titleHint: activeNote?.title ?? 'Untitled Note',
    debounceMs: 650,
    onCommit: commitContent,
  });

  // PF-55: Draft Recovery Inbox — surfaces any interrupted/failed local drafts bound to their original note ID
  const recoveredDrafts = useLiveQuery(
    async () => {
      const all = await db.drafts.toArray();
      return all.filter((d) => d.reason === 'interrupted' || d.reason === 'error');
    },
    [],
    []
  );

  const handleManualSave = useCallback(async () => {
    await Promise.all([titleBuffer.flushNow(true), bodyBuffer.flushNow(true)]);
    pushToast('Saved note locally (queued for sync)');
  }, [titleBuffer, bodyBuffer, pushToast]);

  // Ctrl+S / Cmd+S manual save inside Notes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleManualSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleManualSave]);

  const handleCreateNote = async (parentId: string | null = null) => {
    const parentNote = parentId ? noteById.get(parentId) : null;
    const nb = parentNote?.payload.notebookId ?? (activeNotebook === 'all' ? 'nb_personal' : activeNotebook);
    const created = await createRecord<NotePayload>('note', parentId ? 'Untitled Sub-Note' : 'Untitled Note', {
      notebookId: nb,
      parentId,
      writtenForDate: logicalToday,
      content: '',
      citations: [],
      attachmentBlobIds: [],
      voiceMemoBlobIds: [],
      touchedDates: [logicalToday],
    });
    if (parentId) {
      setCollapsedNodes((prev) => ({ ...prev, [parentId]: false }));
    }
    setSelectedNoteId(created.id);
    setViewMode('edit');
    setMobilePane('editor');
    pushToast(parentId ? 'Created nested sub-note' : 'Created new note', { canUndo: true });
  };

  const handleDuplicateSubtree = async (root: LifeRecord<NotePayload>) => {
    const cloneBranch = async (src: LifeRecord<NotePayload>, newParentId: string | null): Promise<LifeRecord<NotePayload>> => {
      const copy = await createRecord<NotePayload>('note', `${src.title}${newParentId === src.payload.parentId ? ' (Copy)' : ''}`, {
        ...src.payload,
        parentId: newParentId,
        writtenForDate: logicalToday,
        touchedDates: [logicalToday],
      });
      const kids = notes.filter((n) => n.payload.parentId === src.id);
      for (const k of kids) {
        await cloneBranch(k, copy.id);
      }
      return copy;
    };
    const rootCopy = await cloneBranch(root, root.payload.parentId ?? null);
    setSelectedNoteId(rootCopy.id);
    pushToast(`Duplicated "${root.title}" & all nested sub-notes`, { tone: 'ok' });
  };

  const handleContentChange = (nextContent: string) => {
    if (!activeNote) return;
    bodyBuffer.handleChange(nextContent);
    const m = nextContent.match(/\[\[([^[\]]*)$/);
    setAutocompleteQuery(m ? m[1] : null);
  };

  const insertSnippet = (snippet: string) => {
    if (!activeNote) return;
    const el = textareaRef.current;
    const content = bodyBuffer.value;
    if (!el) {
      handleContentChange(`${content}\n${snippet}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + snippet + content.slice(end);
    handleContentChange(next);
    // Preserve cursor position right after the inserted snippet!
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Backlinks panel + broken-link detection (Section 03.03 & 12.01)
  const backlinks = useMemo(() => {
    if (!activeNote) return [];
    const needle = `[[${activeNote.title.toLowerCase()}]]`;
    return notes
      .filter((n) => n.id !== activeNote.id && (n.payload.content ?? '').toLowerCase().includes(needle))
      .map((n) => {
        const idx = n.payload.content.toLowerCase().indexOf(needle);
        return {
          note: n,
          context: n.payload.content.slice(Math.max(0, idx - 35), idx + needle.length + 55),
        };
      });
  }, [activeNote, notes]);

  const outgoingWikiLinks = useMemo(() => {
    if (!activeNote) return [];
    const titles = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
    return extractInlineEntities(activeNote.payload.content ?? '').wikiLinks.map((name) => ({
      name,
      target: titles.get(name.toLowerCase()) ?? null,
    }));
  }, [activeNote, notes]);

  const openRevisions = async () => {
    if (!activeNote) return;
    const list = await getNoteRevisions(activeNote.id);
    setRevisions(list);
    setRevisionsOpen(true);
  };

  const handleAttachFile = async (file: File) => {
    if (!activeNote) return;
    const stored = await storeBlob(file, file.name);
    await updateRecord<NotePayload>(activeNote.id, (cur) => ({
      ...cur,
      payload: {
        ...cur.payload,
        attachmentBlobIds: Array.from(new Set([...(cur.payload.attachmentBlobIds ?? []), stored.hash])),
      },
    }));
    pushToast(`Attached "${file.name}" in local blob storage`);
  };

  const toggleVoiceRecording = async () => {
    if (!activeNote) return;
    if (recording && mediaRecRef.current) {
      mediaRecRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const stored = await storeBlob(blob, `voice-${Date.now()}.webm`);
        await updateRecord<NotePayload>(activeNote.id, (cur) => ({
          ...cur,
          payload: {
            ...cur.payload,
            voiceMemoBlobIds: [...(cur.payload.voiceMemoBlobIds ?? []), stored.hash],
          },
        }));
        pushToast('Saved local voice memo in IndexedDB blob store');
      };
      mediaRecRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      pushToast('Microphone permission unavailable in this environment.', { tone: 'warn' });
    }
  };

  const saveSketchBlob = async () => {
    const canvas = sketchCanvasRef.current;
    if (!canvas || !activeNote) return;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
    if (!blob) return;
    const stored = await storeBlob(blob, `sketch-${Date.now()}.png`);
    await updateRecord<NotePayload>(activeNote.id, (cur) => ({
      ...cur,
      payload: { ...cur.payload, sketchBlobId: stored.hash },
    }));
    setSketchOpen(false);
    pushToast('Saved stylus sketch block');
  };

  // PD-010: Defer word/char/paragraph counting so huge 25k–100k word pastes never block interactive input
  const deferredLiveText = useDeferredValue(bodyBuffer.value);
  const { wordCount, charCount, paragraphCount, readTimeMin } = useMemo(() => {
    if (!activeNote) return { wordCount: 0, charCount: 0, paragraphCount: 0, readTimeMin: 1 };
    const text = deferredLiveText;
    const len = text.length;
    if (len === 0) return { wordCount: 0, charCount: 0, paragraphCount: 0, readTimeMin: 1 };
    // Fast single-pass linear scan (avoids allocating giant regex split arrays on 100k-word notes!)
    let words = 0;
    let inWord = false;
    let paragraphs = 0;
    let lineHasText = false;
    let prevBlank = true;
    for (let i = 0; i < len; i++) {
      const code = text.charCodeAt(i);
      const isSpace = code === 32 || code === 9 || code === 10 || code === 13;
      if (isSpace) {
        inWord = false;
        if (code === 10) {
          if (lineHasText && prevBlank) paragraphs++;
          prevBlank = !lineHasText;
          lineHasText = false;
        }
      } else {
        if (!inWord) {
          words++;
          inWord = true;
        }
        lineHasText = true;
      }
    }
    if (lineHasText && prevBlank) paragraphs++;
    return {
      wordCount: words,
      charCount: len,
      paragraphCount: Math.max(paragraphs, words > 0 ? 1 : 0),
      readTimeMin: Math.max(1, Math.ceil(words / 220)),
    };
  }, [activeNote, deferredLiveText]);

  const combinedLocalSave =
    titleBuffer.saveState === 'saving' || bodyBuffer.saveState === 'saving'
      ? 'Saving locally…'
      : titleBuffer.saveState === 'unsaved' || bodyBuffer.saveState === 'unsaved'
        ? 'Unsaved changes'
        : 'Saved locally ✓';

  const combinedSyncLabel =
    settings.operatingMode !== 'docker-sync'
      ? 'Offline mode (on device)'
      : syncState.status === 'syncing'
        ? 'Synchronizing…'
        : syncState.status === 'error'
          ? 'Sync failed'
          : syncState.status === 'offline'
            ? `Waiting for sync (${syncState.pendingCount})`
            : syncState.pendingCount > 0
              ? `Waiting for sync (${syncState.pendingCount})`
              : 'Fully synchronized ✓';

  // Automatic bidirectional EntityLink connections (Tasks, Projects, Diary, PDFs, Scans!)
  const linkedRecords = useMemo(() => {
    if (!activeNote) return [];
    const byId = new Map(records.map((r) => [r.id, r]));
    const out = new Map<string, { record: LifeRecord; relation: string }>();
    for (const lnk of activeNote.links ?? []) {
      const rec = byId.get(lnk.targetId);
      if (rec) out.set(rec.id, { record: rec, relation: lnk.relation });
    }
    for (const r of records) {
      if (r.id === activeNote.id) continue;
      if ((r.links ?? []).some((l) => l.targetId === activeNote.id)) {
        out.set(r.id, { record: r, relation: 'backlink' });
      }
    }
    return Array.from(out.values());
  }, [activeNote, records]);

  // Month Calendar grid cells for Daily Notes Archive navigation (§4)
  const calendarMonthCells = useMemo(() => {
    const [yrStr, moStr] = dailyCalendarMonth.split('-');
    const year = Number(yrStr) || new Date().getFullYear();
    const month = (Number(moStr) || 1) - 1;
    const firstDay = new Date(year, month, 1);
    const startPad = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ iso: string | null; day: number | null; count: number }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ iso: null, day: null, count: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, day: d, count: dailyNoteDatesMap.get(iso) ?? 0 });
    }
    return { year, month, cells };
  }, [dailyCalendarMonth, dailyNoteDatesMap]);

  const shiftCalendarMonth = (delta: number) => {
    const d = new Date(calendarMonthCells.year, calendarMonthCells.month + delta, 1);
    setDailyCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-4)' }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2>Rich Block / Live-Markdown Notes, Daily Notes Archive &amp; Knowledge Graph</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Unlimited word count · Unified Daily Notes (zero duplication) · [[WikiLinks]] &amp; Backlinks · Blobs &amp; Voice Memos
          </p>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${notesTab === 'all' ? 'dp-btn-primary' : ''}`}
            onClick={() => {
              setNotesTab('all');
              if (viewMode === 'graph') setViewMode('edit');
            }}
          >
            All Notes ({notes.length})
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${notesTab === 'daily' ? 'dp-btn-primary' : ''}`}
            onClick={() => {
              setNotesTab('daily');
              if (viewMode === 'graph') setViewMode('edit');
            }}
          >
            <Calendar size={14} /> Daily Notes ({dailyArchiveNotes.length})
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${notesTab === 'graph' || viewMode === 'graph' ? 'dp-btn-primary' : ''}`}
            onClick={() => {
              const nextGraph = viewMode !== 'graph';
              setViewMode(nextGraph ? 'graph' : 'edit');
              setNotesTab(nextGraph ? 'graph' : 'all');
            }}
          >
            <Network size={14} /> Connection Graph
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('scanner')}>
            <Camera size={14} /> Scan Physical Note
          </button>
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void handleCreateNote()}>
            <FilePlus size={14} /> New Note
          </button>
        </div>
      </div>

      {/* §4 Dedicated Daily Notes Archive Bar: Calendar Navigator + Category Filters */}
      {notesTab === 'daily' && (
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 10, background: 'var(--dp-surface-2)' }}>
          <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <strong>📅 Daily Notes Archive</strong>
              <span className="dp-pill">References exact Today Spread notes (zero duplicates)</span>
              {dailyDateFilter && (
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setDailyDateFilter('')}>
                  Showing {dailyDateFilter} × Clear
                </button>
              )}
            </div>
            <div className="dp-row" style={{ gap: 6 }}>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={async () => {
                  const targetDate = dailyDateFilter || activeDate || logicalToday;
                  const created = await upsertCanonicalDailyNote(records, targetDate, '');
                  setSelectedNoteId(created.id);
                  setMobilePane('editor');
                  pushToast(`Opened canonical Daily Note for ${targetDate}`);
                }}
              >
                + Open / Create Daily Note ({dailyDateFilter || activeDate || logicalToday})
              </button>
            </div>
          </div>

          <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`dp-btn dp-btn-sm ${dailyCategoryFilter === 'all' ? 'dp-btn-primary' : ''}`}
              onClick={() => setDailyCategoryFilter('all')}
            >
              All Categories
            </button>
            {DAILY_NOTE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`dp-btn dp-btn-sm ${dailyCategoryFilter === cat.id ? 'dp-btn-primary' : ''}`}
                onClick={() => setDailyCategoryFilter(cat.id)}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>

          <details className="dp-details" open>
            <summary>
              Calendar Date Navigator ({calendarMonthCells.year}-{String(calendarMonthCells.month + 1).padStart(2, '0')}) — click any highlighted day to filter
            </summary>
            <div className="dp-stack" style={{ gap: 6, marginTop: 8 }}>
              <div className="dp-between">
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => shiftCalendarMonth(-1)}>← Prev Month</button>
                <strong>
                  {new Date(calendarMonthCells.year, calendarMonthCells.month, 1).toLocaleString(settings.locale || 'en-US', { month: 'long', year: 'numeric' })}
                </strong>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => shiftCalendarMonth(1)}>Next Month →</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, fontSize: '0.74rem' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
                  <div key={wd} className="dp-muted" style={{ textAlign: 'center', fontWeight: 600 }}>{wd}</div>
                ))}
                {calendarMonthCells.cells.map((cell, idx) =>
                  cell.iso ? (
                    <button
                      key={cell.iso}
                      type="button"
                      className={`dp-btn dp-btn-sm ${dailyDateFilter === cell.iso ? 'dp-btn-primary' : ''}`}
                      style={{
                        padding: '4px 2px',
                        justifyContent: 'center',
                        borderColor: cell.count > 0 ? 'var(--dp-accent)' : undefined,
                        fontWeight: cell.count > 0 ? 700 : 400,
                      }}
                      onClick={() => setDailyDateFilter((prev) => (prev === cell.iso ? '' : cell.iso!))}
                    >
                      {cell.day}
                      {cell.count > 0 ? ` · ${cell.count}` : ''}
                    </button>
                  ) : (
                    <div key={`pad-${idx}`} />
                  )
                )}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* PF-55: Draft Recovery Inbox — surfaces interrupted or failed note drafts without cross-note overwrite */}
      {recoveredDrafts && recoveredDrafts.length > 0 && (
        <div
          className="dp-card"
          role="region"
          aria-label="Draft Recovery Inbox"
          style={{ borderColor: 'var(--dp-warn)', background: 'var(--dp-paper-alt)', padding: '10px 12px' }}
        >
          <div className="dp-between" style={{ gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.86rem' }}>
              Draft Recovery Inbox ({recoveredDrafts.length} recoverable draft{recoveredDrafts.length === 1 ? '' : 's'})
            </strong>
            <span className="dp-muted" style={{ fontSize: '0.76rem' }}>
              Bound strictly to original note IDs — restore or discard safely.
            </span>
          </div>
          <div className="dp-stack" style={{ gap: 6, marginTop: 8 }}>
            {recoveredDrafts.map((d) => (
              <div key={d.key} className="dp-between" style={{ gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{d.titleHint}</strong> ({d.field} · {d.reason}) —{' '}
                  <span className="dp-muted">{d.content.slice(0, 72)}{d.content.length > 72 ? '…' : ''}</span>
                </div>
                <div className="dp-row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      if (d.field === 'title') {
                        await updateRecord(d.recordId, { title: d.content });
                      } else {
                        await updateRecord<NotePayload>(d.recordId, (cur) => ({
                          ...cur,
                          payload: { ...cur.payload, content: d.content },
                        }));
                      }
                      await db.drafts.delete(d.key);
                      setSelectedNoteId(d.recordId);
                      pushToast(`Restored draft into "${d.titleHint}"`, { tone: 'ok' });
                    }}
                  >
                    Restore to Original Note
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={async () => {
                      await db.drafts.delete(d.key);
                      pushToast('Discarded recovered draft', { tone: 'info' });
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-Tab Notes Typography & Paper Settings Drawer */}
      <TabSettingsDrawer title="Notes Editor Settings" subtitle="Adjust reading font, text size, line spacing & paper surface right here.">
        <div className="dp-grid-3" style={{ gap: 8, fontSize: '0.83rem' }}>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Paper Surface</span>
            <select
              className="dp-select"
              value={settings.paperMaterial}
              onChange={(e) => void patchSettings({ paperMaterial: e.target.value as PaperMaterial })}
            >
              <option value="plain">Plain</option>
              <option value="dot">Dot Grid</option>
              <option value="lined">Lined</option>
              <option value="grid">Grid</option>
              <option value="cornell">Cornell</option>
            </select>
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Font Pairing</span>
            <select
              className="dp-select"
              value={settings.fontPairing}
              onChange={(e) => void patchSettings({ fontPairing: e.target.value as FontPairing })}
            >
              <option value="editorial-serif">Editorial Serif</option>
              <option value="modern-sans">Modern Sans</option>
              <option value="mono-studio">Mono Studio</option>
              <option value="warm-humanist">Warm Humanist</option>
              <option value="dyslexia-friendly">Dyslexia-Friendly</option>
            </select>
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Font Size ({settings.fontSizePx}px) &amp; Line Height ({settings.lineHeight})</span>
            <div className="dp-row" style={{ gap: 6 }}>
              <input
                type="range"
                min={12}
                max={24}
                style={{ flex: 1 }}
                value={settings.fontSizePx}
                onChange={(e) => void patchSettings({ fontSizePx: Number(e.target.value) })}
              />
              <input
                type="range"
                min={1.3}
                max={1.9}
                step={0.05}
                style={{ flex: 1 }}
                value={settings.lineHeight}
                onChange={(e) => void patchSettings({ lineHeight: Number(e.target.value) })}
              />
            </div>
          </label>
        </div>
      </TabSettingsDrawer>

      {/* Subject Notebooks Bar (9 editable defaults + custom) */}
      <div className="dp-row" style={{ gap: 6 }}>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${activeNotebook === 'all' ? 'dp-btn-primary' : ''}`}
          onClick={() => setActiveNotebook('all')}
        >
          All ({notes.length})
        </button>
        {notebooks.map((nb) => (
          <button
            key={nb.id}
            type="button"
            className={`dp-btn dp-btn-sm ${activeNotebook === nb.id ? 'dp-btn-primary' : ''}`}
            onClick={() => setActiveNotebook(nb.id)}
          >
            {nb.emoji} {nb.name}
          </button>
        ))}
        <input
          className="dp-input"
          style={{ width: 150, padding: '3px 8px', fontSize: '0.8rem' }}
          placeholder="+ Custom notebook"
          value={newNotebookName}
          onChange={(e) => setNewNotebookName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && newNotebookName.trim()) {
              await createRecord('notebook', newNotebookName.trim(), {});
              setNewNotebookName('');
            }
          }}
        />
      </div>

      {/* Easy Sort & Filter Bar for Notes */}
      <SortFilterBar
        search={noteSearch}
        onSearchChange={setNoteSearch}
        searchPlaceholder="Search note titles, content, #tags…"
        sortBy={noteSortBy}
        onSortByChange={(v) => setNoteSortBy(v as typeof noteSortBy)}
        sortOptions={[
          { value: 'updated', label: 'Last Edited' },
          { value: 'created', label: 'Created Date' },
          { value: 'title', label: 'Title (A–Z)' },
          { value: 'words', label: 'Word Count' },
        ]}
        sortDir={noteSortDir}
        onSortDirToggle={() => setNoteSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={[
          { value: 'all', label: 'All Notes' },
          { value: 'pinned', label: '📌 Pinned Only' },
        ]}
        activeChip={notePinFilter}
        onChipChange={(v) => setNotePinFilter(v as typeof notePinFilter)}
        totalCount={notes.length}
        shownCount={visibleNotes.length}
        onReset={() => {
          setNoteSearch('');
          setNotePinFilter('all');
          setActiveNotebook('all');
        }}
      />

      {viewMode === 'graph' ? (
        <div className="dp-card dp-stack">
          <strong>Knowledge Graph ({notes.length} notes)</strong>
          <svg viewBox="0 0 760 360" style={{ width: '100%', height: 340, background: 'var(--dp-surface-2)', borderRadius: 10 }}>
            {notes.map((n, i) => {
              const angle = (i / Math.max(1, notes.length)) * Math.PI * 2;
              const cx = 380 + Math.cos(angle) * 145;
              const cy = 180 + Math.sin(angle) * 120;
              const links = extractInlineEntities(n.payload.content ?? '').wikiLinks;
              return (
                <g key={n.id}>
                  {links.map((targetTitle) => {
                    const targetIdx = notes.findIndex((x) => x.title.toLowerCase() === targetTitle.toLowerCase());
                    if (targetIdx < 0) return null;
                    const ta = (targetIdx / Math.max(1, notes.length)) * Math.PI * 2;
                    return (
                      <line
                        key={`${n.id}-${targetTitle}`}
                        x1={cx}
                        y1={cy}
                        x2={380 + Math.cos(ta) * 145}
                        y2={180 + Math.sin(ta) * 120}
                        stroke="var(--dp-accent)"
                        strokeOpacity={0.55}
                        strokeWidth={1.8}
                      />
                    );
                  })}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill={n.id === activeNote?.id ? 'var(--dp-accent)' : 'var(--dp-accent-2)'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedNoteId(n.id);
                      setViewMode('edit');
                    }}
                  />
                  <text x={cx + 15} y={cy + 4} fill="var(--dp-ink)" fontSize="11">
                    {n.title.slice(0, 26)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className={`dp-split-pane ${mobilePane === 'editor' ? 'mobile-show-detail' : 'mobile-show-list'}`}>
          {/* Unlimited Recursive Note Tree (§29) */}
          <div className="dp-split-list dp-stack" style={{ gap: 5, maxHeight: '66dvh', overflowY: 'auto' }}>
            <div className="dp-between" style={{ fontSize: '0.75rem', padding: '0 2px' }}>
              <span className="dp-muted">Nested Hierarchy ({visibleNotes.length})</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Archived
              </label>
            </div>
            {(() => {
              const renderTree = (parentKey: string, depth: number): React.ReactNode => {
                const items = childrenByParent.get(parentKey) ?? [];
                return items.map((n) => {
                  const kids = childrenByParent.get(n.id) ?? [];
                  const isCollapsed = Boolean(collapsedNodes[n.id]);
                  const indent = Math.min(depth, 8) * 14;
                  return (
                    <React.Fragment key={n.id}>
                      <div
                        className="dp-card"
                        style={{
                          marginLeft: indent,
                          padding: '8px 9px',
                          cursor: 'pointer',
                          borderColor: n.id === activeNote?.id ? 'var(--dp-accent)' : undefined,
                          borderWidth: n.id === activeNote?.id ? 2 : 1,
                          opacity: n.payload.archived ? 0.65 : 1,
                        }}
                        onClick={() => {
                          setSelectedNoteId(n.id);
                          setMobilePane('editor');
                        }}
                      >
                        <div className="dp-between" style={{ gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            {kids.length > 0 ? (
                              <button
                                type="button"
                                className="dp-btn"
                                style={{ padding: '0 4px', fontSize: '0.72rem', minHeight: 20 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollapsedNodes((prev) => ({ ...prev, [n.id]: !prev[n.id] }));
                                }}
                                aria-label="Toggle sub-notes"
                              >
                                {isCollapsed ? '▸' : '▾'}
                              </button>
                            ) : (
                              <span className="dp-muted" style={{ fontSize: '0.7rem', width: 12, textAlign: 'center' }}>•</span>
                            )}
                            <strong style={{ fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {n.payload.pinned ? '📌 ' : ''}
                              {n.payload.favorite ? '⭐ ' : ''}
                              {n.title}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {kids.length > 0 && <span className="dp-badge" style={{ fontSize: '0.68rem' }}>{kids.length}</span>}
                            <button
                              type="button"
                              className="dp-btn"
                              style={{ padding: '0 5px', fontSize: '0.72rem', minHeight: 20 }}
                              title="Add nested sub-note inside this note"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCreateNote(n.id);
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="dp-muted" style={{ fontSize: '0.72rem', marginTop: 2, paddingLeft: 16 }}>
                          {n.payload.writtenForDate}{n.payload.archived ? ' · Archived' : ''}
                        </div>
                      </div>
                      {!isCollapsed && kids.length > 0 && renderTree(n.id, depth + 1)}
                    </React.Fragment>
                  );
                });
              };
              return renderTree('__root__', 0);
            })()}
          </div>

          {/* Note Editor Canvas */}
          {activeNote ? (
            <div className="dp-split-detail dp-card dp-stack" style={{ padding: 14 }}>
              {/* Mobile-only Back to Notes List toggle + Save & Sync Status Strip */}
              <div className="dp-between" style={{ gap: 6, flexWrap: 'wrap' }}>
                <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm dp-mobile-only"
                    onClick={() => setMobilePane('list')}
                  >
                    <ArrowLeft size={14} /> All Notes ({visibleNotes.length})
                  </button>
                  <span
                    className="dp-pill"
                    style={{
                      borderColor: combinedLocalSave.includes('Unsaved') ? 'var(--dp-warn)' : 'var(--dp-ok)',
                      color: combinedLocalSave.includes('Unsaved') ? 'var(--dp-warn)' : undefined,
                    }}
                  >
                    {combinedLocalSave}
                  </span>
                  <span className="dp-pill">{combinedSyncLabel}</span>
                </div>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => void handleManualSave()}
                  title="Save immediately & create version snapshot (Ctrl+S)"
                >
                  <Save size={13} /> Save
                </button>
              </div>

              <div className="dp-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="dp-input"
                  style={{ fontSize: '1.15rem', fontFamily: 'var(--dp-font-heading)', fontWeight: 700, flex: '1 1 200px' }}
                  value={titleBuffer.value}
                  onChange={(e) => titleBuffer.handleChange(e.target.value)}
                  onCompositionStart={titleBuffer.handleCompositionStart}
                  onCompositionEnd={(e) => titleBuffer.handleCompositionEnd(e.currentTarget.value)}
                  onBlur={titleBuffer.handleBlur}
                  aria-label="Note title"
                />
                <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Pin note"
                    onClick={() =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, pinned: !c.payload.pinned },
                      }))
                    }
                  >
                    <Pin size={15} fill={activeNote.payload.pinned ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void openRevisions()}>
                    <History size={14} /> History
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')}
                  >
                    {viewMode === 'preview' ? 'Edit' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Move note to Trash"
                    onClick={async () => {
                      await softDeleteRecord(activeNote.id);
                      setSelectedNoteId(null);
                      pushToast('Note moved to Trash', { canUndo: true });
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Breadcrumb Trail + Unlimited Nesting Actions (§29) */}
              <div className="dp-between" style={{ gap: 6, flexWrap: 'wrap', padding: '4px 8px', borderRadius: 8, background: 'var(--dp-paper-alt, var(--dp-surface-2))', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span className="dp-muted">Path:</span>
                  {getBreadcrumbTrail(activeNote).map((crumb, idx, arr) => (
                    <React.Fragment key={crumb.id}>
                      {idx > 0 && <span className="dp-muted">›</span>}
                      <button
                        type="button"
                        className="dp-btn"
                        style={{ padding: '1px 6px', fontSize: '0.75rem', fontWeight: idx === arr.length - 1 ? 700 : 400 }}
                        onClick={() => setSelectedNoteId(crumb.id)}
                      >
                        {crumb.title}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleCreateNote(activeNote.id)}>
                    + Sub-Note
                  </button>
                  <select
                    aria-label="Parent note"
                    className="dp-select"
                    style={{ width: 'auto', maxWidth: 170, padding: '2px 6px', fontSize: '0.75rem' }}
                    value={activeNote.payload.parentId ?? ''}
                    onChange={(e) =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, parentId: e.target.value || null },
                      }))
                    }
                  >
                    <option value="">Parent: Top Level</option>
                    {(() => {
                      const forbidden = getDescendantIds(activeNote.id);
                      return notes
                        .filter((cand) => !forbidden.has(cand.id))
                        .map((cand) => (
                          <option key={cand.id} value={cand.id}>Under: {cand.title.slice(0, 28)}</option>
                        ));
                    })()}
                  </select>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleDuplicateSubtree(activeNote)}>
                    Duplicate Branch
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, favorite: !c.payload.favorite },
                      }))
                    }
                  >
                    {activeNote.payload.favorite ? '⭐ Fav' : '☆ Fav'}
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, archived: !c.payload.archived },
                      }))
                    }
                  >
                    {activeNote.payload.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>

              {/* Metadata row: Written-For Date vs Created + Notebook + Full Live Stats */}
              <div className="dp-row" style={{ fontSize: '0.8rem', flexWrap: 'wrap', gap: 8 }}>
                <select
                  aria-label="Subject notebook"
                  className="dp-select"
                  style={{ width: 'auto', padding: '4px 8px' }}
                  value={activeNote.payload.notebookId}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, notebookId: e.target.value },
                    }))
                  }
                >
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>{nb.emoji} {nb.name}</option>
                  ))}
                </select>
                <label className="dp-row" style={{ gap: 4 }}>
                  <span className="dp-muted">Written-For:</span>
                  <input
                    type="date"
                    className="dp-input"
                    style={{ width: 'auto', padding: '3px 6px' }}
                    value={activeNote.payload.writtenForDate}
                    onChange={(e) =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, writtenForDate: e.target.value },
                      }))
                    }
                  />
                </label>
                <select
                  aria-label="Daily note category"
                  className="dp-select"
                  style={{ width: 'auto', padding: '4px 8px' }}
                  value={activeNote.payload.dailyCategory ?? (activeNote.payload.isDailyNote ? 'daily_specific' : 'uncategorized')}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, dailyCategory: e.target.value as DailyNoteCategory },
                    }), { skipRevision: true })
                  }
                >
                  {DAILY_NOTE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
                  ))}
                </select>
                {(activeNote.payload.sourcePlannerDate || activeNote.payload.writtenForDate) && (
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      const d = activeNote.payload.sourcePlannerDate || activeNote.payload.writtenForDate;
                      if (d) setActiveDate(d);
                      setActiveView('today');
                    }}
                  >
                    <ExternalLink size={12} /> Open Daily Planner ({activeNote.payload.sourcePlannerDate || activeNote.payload.writtenForDate})
                  </button>
                )}
                <span className="dp-muted">
                  Created: {new Date(activeNote.createdAt).toLocaleDateString()} · Modified: {new Date(activeNote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  <strong>{wordCount.toLocaleString()}</strong> words · {charCount.toLocaleString()} chars · {paragraphCount} ¶ · ~{readTimeMin}m read
                </span>
              </div>

              {/* §4 1-Click Daily Note Conversion & Promotion Bar (with automatic bidirectional backlinks) */}
              <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap', fontSize: '0.76rem' }}>
                <span className="dp-muted">Convert / Promote:</span>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={async () => {
                    const res = await convertDailyNoteToTarget(activeNote, 'task', records);
                    pushToast(res.summary, { canUndo: true });
                  }}
                >
                  → Task
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={async () => {
                    const res = await convertDailyNoteToTarget(activeNote, 'project', records);
                    pushToast(res.summary, { canUndo: true });
                  }}
                >
                  → Project
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={async () => {
                    const res = await convertDailyNoteToTarget(activeNote, 'diary', records);
                    pushToast(res.summary, { canUndo: true });
                  }}
                >
                  → Diary Reflection
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={async () => {
                    const res = await convertDailyNoteToTarget(activeNote, 'permanent_knowledge', records);
                    pushToast(res.summary, { tone: 'ok' });
                  }}
                >
                  <Sparkles size={12} /> {activeNote.payload.promotedToKnowledgeAt ? 'Permanent Knowledge ✓' : 'Promote to Permanent Knowledge'}
                </button>
              </div>

              {/* Rich Block Toolbar */}
              <div className="dp-row" style={{ gap: 5, borderBottom: '1px dashed var(--dp-border)', paddingBottom: 8 }}>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n## Heading\n')}>H2</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('**bold**')}>B</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('_italic_')}>I</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('==highlight==')}>Mark</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n- [ ] Action item\n')}>
                  <CheckSquare size={13} /> Checklist
                </button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('**bold**')}><strong>B</strong></button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('*italic*')}><em>I</em></button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('<u>underline</u>')}><u>U</u></button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('~~strike~~')}><s>S</s></button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('==highlight==')}>🖍 Hi-Lite</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n---\n')}>— Divider</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n1. First item\n2. Second item\n')}>1. List</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n> [!NOTE] Callout\n> ')}>Callout</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n| Column A | Column B |\n| --- | --- |\n| Value | Value |\n')}>Table</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('\n```ts\n// code block\n```\n')}>Code</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertSnippet('[[')}>[[WikiLink]]</button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={13} /> Attach
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,audio/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachFile(f);
                    e.target.value = '';
                  }}
                />
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setSketchOpen(true)}>
                  <PenTool size={13} /> Sketch
                </button>
                <button
                  type="button"
                  className={`dp-btn dp-btn-sm ${recording ? 'dp-btn-primary' : ''}`}
                  onClick={() => void toggleVoiceRecording()}
                >
                  {recording ? <Square size={13} /> : <Mic size={13} />} {recording ? 'Stop Audio' : 'Voice'}
                </button>
              </div>

              {/* Per-Note Rich Typography, Paper & Presentation Mode Bar (Sections 4.1 & 4.2) */}
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.78rem', padding: '6px 8px', background: 'var(--dp-surface-2)', borderRadius: 8 }}>
                <select
                  aria-label="Note presentation mode"
                  className="dp-select"
                  style={{ width: 'auto', padding: '2px 6px' }}
                  value={activeNote.payload.presentationMode ?? 'scroll'}
                  onChange={(e) => {
                    setNotePageIdx(0);
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, presentationMode: e.target.value as NotePayload['presentationMode'] },
                    }), { skipRevision: true });
                  }}
                >
                  <option value="scroll">Mode: Continuous Scroll</option>
                  <option value="pages">Mode: Individual Pages</option>
                  <option value="spread">Mode: 2-Page Book Spread</option>
                  <option value="notebook">Mode: Traditional Notebook</option>
                  <option value="planner">Mode: Planner Layout</option>
                </select>
                <select
                  aria-label="Note paper style"
                  className="dp-select"
                  style={{ width: 'auto', padding: '2px 6px' }}
                  value={activeNote.payload.paperStyle ?? 'blank'}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, paperStyle: e.target.value as NotePayload['paperStyle'] },
                    }), { skipRevision: true })
                  }
                >
                  <option value="blank">Paper: Blank</option>
                  <option value="lined">Paper: Lined</option>
                  <option value="grid">Paper: Grid</option>
                  <option value="dot">Paper: Dot-Grid</option>
                </select>
                <select
                  aria-label="Note font family"
                  className="dp-select"
                  style={{ width: 'auto', padding: '2px 6px' }}
                  value={activeNote.payload.fontFamily ?? 'inherit'}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, fontFamily: e.target.value as NotePayload['fontFamily'] },
                    }), { skipRevision: true })
                  }
                >
                  <option value="inherit">Font: Theme</option>
                  <option value="serif">Serif</option>
                  <option value="sans">Sans-Serif</option>
                  <option value="mono">Monospace</option>
                  <option value="handwriting">Handwriting</option>
                </select>
                <select
                  aria-label="Note font size"
                  className="dp-select"
                  style={{ width: 'auto', padding: '2px 6px' }}
                  value={activeNote.payload.fontSizePx ?? 16}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, fontSizePx: Number(e.target.value) || 16 },
                    }), { skipRevision: true })
                  }
                >
                  {[13, 14, 16, 18, 20, 22, 26].map((sz) => <option key={sz} value={sz}>{sz}px</option>)}
                </select>
                <select
                  aria-label="Note alignment"
                  className="dp-select"
                  style={{ width: 'auto', padding: '2px 6px' }}
                  value={activeNote.payload.textAlign ?? 'left'}
                  onChange={(e) =>
                    void updateRecord<NotePayload>(activeNote.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, textAlign: e.target.value as NotePayload['textAlign'] },
                    }), { skipRevision: true })
                  }
                >
                  <option value="left">Align Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <label className="dp-row" style={{ gap: 3 }}>
                  <span className="dp-muted">Text:</span>
                  <input
                    type="color"
                    aria-label="Note text color"
                    value={activeNote.payload.textColor || '#2a241d'}
                    onChange={(e) =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, textColor: e.target.value },
                      }), { skipRevision: true })
                    }
                    style={{ width: 22, height: 22, padding: 0, border: 'none' }}
                  />
                </label>
                <label className="dp-row" style={{ gap: 3 }}>
                  <span className="dp-muted">Bg:</span>
                  <input
                    type="color"
                    aria-label="Note background tint"
                    value={activeNote.payload.bgColor || '#fcf9f2'}
                    onChange={(e) =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, bgColor: e.target.value },
                      }), { skipRevision: true })
                    }
                    style={{ width: 22, height: 22, padding: 0, border: 'none' }}
                  />
                </label>
                {(activeNote.payload.textColor || activeNote.payload.bgColor) && (
                  <button
                    type="button"
                    className="dp-btn dp-btn-ghost dp-btn-sm"
                    style={{ padding: '1px 5px', fontSize: '0.72rem' }}
                    onClick={() =>
                      void updateRecord<NotePayload>(activeNote.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, textColor: undefined, bgColor: undefined },
                      }), { skipRevision: true })
                    }
                  >
                    Reset Colors
                  </button>
                )}
              </div>

              {/* [[WikiLink]] Autocomplete Bar */}
              {autocompleteQuery !== null && (
                <div className="dp-row" style={{ padding: 6, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                  <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Link note:</span>
                  {notes
                    .filter((n) => n.id !== activeNote.id && n.title.toLowerCase().includes(autocompleteQuery.toLowerCase()))
                    .slice(0, 6)
                    .map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={() => {
                          const next = (activeNote.payload.content ?? '').replace(/\[\[([^[\]]*)$/, `[[${n.title}]] `);
                          handleContentChange(next);
                          setAutocompleteQuery(null);
                        }}
                      >
                        {n.title}
                      </button>
                    ))}
                </div>
              )}

              {(() => {
                const fontMap: Record<string, string> = {
                  inherit: 'var(--dp-font-body)',
                  serif: 'Georgia, "Times New Roman", serif',
                  sans: 'system-ui, -apple-system, sans-serif',
                  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  handwriting: '"Segoe Script", "Bradley Hand", cursive',
                };
                const paperBg =
                  activeNote.payload.paperStyle === 'lined'
                    ? 'repeating-linear-gradient(to bottom, transparent 0 27px, color-mix(in oklch, var(--dp-border) 65%, transparent) 27px 28px)'
                    : activeNote.payload.paperStyle === 'grid'
                      ? 'linear-gradient(to right, color-mix(in oklch, var(--dp-border) 50%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--dp-border) 50%, transparent) 1px, transparent 1px)'
                      : activeNote.payload.paperStyle === 'dot'
                        ? 'radial-gradient(color-mix(in oklch, var(--dp-muted) 45%, transparent) 1px, transparent 1px)'
                        : undefined;
                const noteStyle: React.CSSProperties = {
                  minHeight: 320,
                  fontFamily: fontMap[activeNote.payload.fontFamily ?? 'inherit'],
                  lineHeight: activeNote.payload.lineSpacing ?? 1.75,
                  fontSize: `max(16px, ${activeNote.payload.fontSizePx ?? 16}px)`,
                  textAlign: activeNote.payload.textAlign ?? 'left',
                  color: activeNote.payload.textColor || undefined,
                  backgroundColor: activeNote.payload.bgColor || undefined,
                  backgroundImage: paperBg,
                  backgroundSize: activeNote.payload.paperStyle === 'grid' || activeNote.payload.paperStyle === 'dot' ? '22px 22px' : undefined,
                  paddingInline: activeNote.payload.presentationMode === 'notebook' ? 28 : undefined,
                  borderInlineStart: activeNote.payload.presentationMode === 'notebook' ? '3px double #d97c7c' : undefined,
                };
                const pres = activeNote.payload.presentationMode ?? 'scroll';

                if (viewMode === 'edit') {
                  return (
                    <textarea
                      ref={textareaRef}
                      className="dp-textarea"
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck={true}
                      style={noteStyle}
                      placeholder="Write freely in Markdown with [[WikiLinks]], @mentions, #tags, checklists (- [ ]), --- page breaks…"
                      value={bodyBuffer.value}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onCompositionStart={bodyBuffer.handleCompositionStart}
                      onCompositionEnd={(e) => bodyBuffer.handleCompositionEnd(e.currentTarget.value)}
                      onBlur={bodyBuffer.handleBlur}
                    />
                  );
                }

                // Paginated / Spread / Continuous Rich Preview
                const rawPages =
                  pres === 'pages' || pres === 'spread'
                    ? bodyBuffer.value.split(/\r?\n---\r?\n/)
                    : [bodyBuffer.value];
                const safePageIdx = Math.min(notePageIdx, Math.max(0, rawPages.length - 1));
                const pagesToShow =
                  pres === 'spread'
                    ? [rawPages[safePageIdx] ?? '', rawPages[safePageIdx + 1] ?? '']
                    : [rawPages[safePageIdx] ?? ''];

                return (
                  <div className="dp-stack" style={{ gap: 8 }}>
                    {(pres === 'pages' || pres === 'spread') && (
                      <div className="dp-between" style={{ fontSize: '0.8rem' }}>
                        <button
                          type="button"
                          className="dp-btn dp-btn-sm"
                          disabled={safePageIdx === 0}
                          onClick={() => setNotePageIdx((i) => Math.max(0, i - (pres === 'spread' ? 2 : 1)))}
                        >
                          ← Prev Page
                        </button>
                        <span className="dp-pill">
                          Page {safePageIdx + 1}{pres === 'spread' && rawPages[safePageIdx + 1] !== undefined ? `–${safePageIdx + 2}` : ''} of {rawPages.length} (add <code>---</code> for manual page breaks)
                        </span>
                        <button
                          type="button"
                          className="dp-btn dp-btn-sm"
                          disabled={safePageIdx + (pres === 'spread' ? 2 : 1) >= rawPages.length}
                          onClick={() => setNotePageIdx((i) => Math.min(rawPages.length - 1, i + (pres === 'spread' ? 2 : 1)))}
                        >
                          Next Page →
                        </button>
                      </div>
                    )}
                    <div className={pres === 'spread' ? 'dp-grid-2' : 'dp-stack'} style={{ gap: 12 }}>
                      {pagesToShow.map((pageText, pIdx) => (
                        <div key={pIdx} className="dp-card dp-stack" style={{ ...noteStyle, padding: 14, minHeight: 300 }}>
                          {pageText.split(/\r?\n/).map((line, idx) => {
                            const checkMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)$/);
                            if (checkMatch) {
                              const checked = checkMatch[2].toLowerCase() === 'x';
                              const label = checkMatch[3];
                              return (
                                <div key={idx} className="dp-between" style={{ marginInlineStart: checkMatch[1].length * 8 }}>
                                  <label className="dp-row" style={{ cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const lines = bodyBuffer.value.split(/\r?\n/);
                                        const globalIdx = lines.indexOf(line);
                                        if (globalIdx >= 0) {
                                          lines[globalIdx] = `${checkMatch[1]}- [${checked ? ' ' : 'x'}] ${label}`;
                                          handleContentChange(lines.join('\n'));
                                        }
                                      }}
                                    />
                                    <span style={{ textDecoration: checked ? 'line-through' : undefined }}>{label}</span>
                                  </label>
                                  <button
                                    type="button"
                                    className="dp-btn dp-btn-ghost dp-btn-sm"
                                    onClick={async () => {
                                      await createRecord<TaskPayload>(
                                        'task',
                                        label,
                                        { subtasks: [], boardColumn: 'next', sourceProvenance: `note:${activeNote.id}` },
                                        { doDate: logicalToday, links: [{ targetId: activeNote.id, targetType: 'note', relation: 'attached_note' }] }
                                      );
                                      pushToast(`Linked "${label}" as real Task`, { canUndo: true });
                                    }}
                                  >
                                    Link as Task
                                  </button>
                                </div>
                              );
                            }
                            if (line.startsWith('# ')) return <h2 key={idx} style={{ margin: '4px 0' }}>{line.slice(2)}</h2>;
                            if (line.startsWith('## ')) return <h3 key={idx} style={{ margin: '4px 0' }}>{line.slice(3)}</h3>;
                            if (line.startsWith('> ')) return <blockquote key={idx} style={{ margin: 0, paddingInlineStart: 12, borderInlineStart: '3px solid var(--dp-accent)' }}>{line.slice(2)}</blockquote>;
                            if (line.trim() === '---') return <hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--dp-border)', margin: '8px 0' }} />;
                            return <p key={idx} style={{ margin: '2px 0' }}>{line || '\u00A0'}</p>;
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Inline Attachments, Sketch & Voice Memos */}
              {(activeNote.payload.attachmentBlobIds?.length || activeNote.payload.sketchBlobId || activeNote.payload.voiceMemoBlobIds?.length) ? (
                <div className="dp-stack" style={{ gap: 8 }}>
                  <div className="dp-row">
                    {[...(activeNote.payload.attachmentBlobIds ?? []), ...(activeNote.payload.sketchBlobId ? [activeNote.payload.sketchBlobId] : [])].map((hash) =>
                      blobUrls[hash] ? (
                        <img
                          key={hash}
                          src={blobUrls[hash]}
                          alt="Note attachment"
                          style={{ height: 86, borderRadius: 8, border: '1px solid var(--dp-border)', cursor: 'pointer' }}
                          onClick={() => setLightboxUrl(blobUrls[hash])}
                        />
                      ) : null
                    )}
                  </div>
                  {(activeNote.payload.voiceMemoBlobIds ?? []).map((hash) =>
                    blobUrls[hash] ? (
                      <audio key={hash} controls src={blobUrls[hash]} style={{ maxWidth: 320 }} />
                    ) : null
                  )}
                </div>
              ) : null}

              {/* Outgoing WikiLinks (with broken-link recovery!) & Backlinks Panel */}
              <div className="dp-grid-2" style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 10 }}>
                <div className="dp-stack" style={{ gap: 6 }}>
                  <strong style={{ fontSize: '0.84rem' }}>Outgoing [[WikiLinks]] ({outgoingWikiLinks.length})</strong>
                  {outgoingWikiLinks.map(({ name, target }) =>
                    target ? (
                      <button key={name} type="button" className="dp-btn dp-btn-sm" onClick={() => setSelectedNoteId(target.id)}>
                        → {target.title}
                      </button>
                    ) : (
                      <button
                        key={name}
                        type="button"
                        className="dp-btn dp-btn-sm"
                        style={{ borderStyle: 'dashed', color: 'var(--dp-warn)' }}
                        onClick={async () => {
                          const created = await createRecord<NotePayload>('note', name, {
                            notebookId: activeNote.payload.notebookId,
                            writtenForDate: logicalToday,
                            content: `# ${name}\n`,
                            touchedDates: [logicalToday],
                          });
                          setSelectedNoteId(created.id);
                        }}
                      >
                        ⚠ Broken/Missing [[{name}]] — Click to Create
                      </button>
                    )
                  )}
                </div>
                <div className="dp-stack" style={{ gap: 6 }}>
                  <strong style={{ fontSize: '0.84rem' }}>Backlinks &amp; Linked Records ({backlinks.length + linkedRecords.length})</strong>
                  {backlinks.length === 0 && linkedRecords.length === 0 ? (
                    <span className="dp-muted" style={{ fontSize: '0.8rem' }}>No notes or records link here yet.</span>
                  ) : (
                    <>
                      {backlinks.map(({ note, context }) => (
                        <button key={note.id} type="button" className="dp-card" style={{ padding: 8, textAlign: 'start', cursor: 'pointer' }} onClick={() => setSelectedNoteId(note.id)}>
                          <strong style={{ fontSize: '0.84rem' }}>{note.title}</strong>
                          <div className="dp-muted" style={{ fontSize: '0.76rem' }}>…{context}…</div>
                        </button>
                      ))}
                      {linkedRecords.map(({ record, relation }) => (
                        <div key={record.id} className="dp-card dp-between" style={{ padding: 8, fontSize: '0.8rem' }}>
                          <div>
                            <strong>{record.title}</strong>{' '}
                            <span className="dp-pill">{record.type}</span>{' '}
                            <span className="dp-muted">({relation})</span>
                          </div>
                          <button
                            type="button"
                            className="dp-btn dp-btn-sm"
                            onClick={() => {
                              if (record.type === 'note') setSelectedNoteId(record.id);
                              else if (record.type === 'task') setActiveView('tasks');
                              else if (record.type === 'project') setActiveView('projects');
                              else if (record.type === 'diary') setActiveView('diary');
                              else if (record.type === 'pdf_doc') setActiveView('pdf_studio');
                            }}
                          >
                            Open
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="dp-empty">
              <strong>Select or create a note</strong>
            </div>
          )}
        </div>
      )}

      {/* Version History, Named Checkpoints & Line-by-Line Diff Modal */}
      <ModalDialog open={revisionsOpen} onClose={() => setRevisionsOpen(false)} title={`Version History (${revisions.length} saved)`} wide>
        {activeNote && (
          <div className="dp-card dp-row" style={{ padding: 10, background: 'var(--dp-surface-2)', gap: 8 }}>
            <input
              className="dp-input"
              style={{ flex: 1 }}
              placeholder="Name this checkpoint (e.g., Draft 1, Before Lab Review)…"
              value={checkpointLabel}
              onChange={(e) => setCheckpointLabel(e.target.value)}
            />
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={async () => {
                await handleManualSave();
                await createNamedNoteCheckpoint(activeNote.id, checkpointLabel);
                setCheckpointLabel('');
                setRevisions(await getNoteRevisions(activeNote.id));
                pushToast('Saved named checkpoint!');
              }}
            >
              <BookmarkPlus size={14} /> Save Checkpoint
            </button>
          </div>
        )}

        {revisions.length === 0 ? (
          <p className="dp-muted">No prior versions recorded yet. Click Save Checkpoint above to record a named snapshot.</p>
        ) : (
          <div className="dp-stack">
            {revisions.map((rev, idx) => {
              const prevRev = revisions[idx + 1];
              const diff = computeLineDiff(prevRev?.content ?? '', rev.content);
              const showDiff = diffRevId === rev.id;
              return (
                <div key={rev.id} className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
                  <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <strong>{new Date(rev.timestamp).toLocaleString()}</strong>
                      {rev.label && <span className="dp-pill highlight">🔖 {rev.label}</span>}
                      <span className="dp-pill" style={{ color: 'var(--dp-ok)' }}>+{diff.addedCount}</span>
                      <span className="dp-pill" style={{ color: 'var(--dp-danger)' }}>−{diff.removedCount}</span>
                    </div>
                    <div className="dp-row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={() => setDiffRevId(showDiff ? null : rev.id)}
                      >
                        {showDiff ? 'Hide Diff' : 'View Changes'}
                      </button>
                      <button
                        type="button"
                        className="dp-btn dp-btn-primary dp-btn-sm"
                        onClick={async () => {
                          if (!activeNote) return;
                          await updateRecord<NotePayload>(
                            activeNote.id,
                            (c) => ({ ...c, title: rev.title, payload: { ...c.payload, content: rev.content } }),
                            { undoLabel: 'Restored note revision' }
                          );
                          setRevisionsOpen(false);
                          pushToast('Restored note revision', { canUndo: true });
                        }}
                      >
                        Restore
                      </button>
                    </div>
                  </div>

                  {showDiff ? (
                    <div
                      style={{
                        fontFamily: 'var(--dp-font-mono)',
                        fontSize: '0.78rem',
                        maxHeight: 220,
                        overflow: 'auto',
                        background: 'var(--dp-surface-2)',
                        padding: 8,
                        borderRadius: 6,
                      }}
                    >
                      {diff.lines.slice(0, 120).map((ln, li) => (
                        <div
                          key={li}
                          style={{
                            padding: '1px 6px',
                            background:
                              ln.type === 'added'
                                ? 'color-mix(in oklch, var(--dp-ok) 18%, transparent)'
                                : ln.type === 'removed'
                                  ? 'color-mix(in oklch, var(--dp-danger) 18%, transparent)'
                                  : 'transparent',
                            color: ln.type === 'removed' ? 'var(--dp-danger)' : undefined,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {ln.type === 'added' ? '+ ' : ln.type === 'removed' ? '- ' : '  '}
                          {ln.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', maxHeight: 110, overflow: 'auto' }}>
                      {rev.content.slice(0, 400)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ModalDialog>

      {/* Stylus / Mouse Sketch Pad Modal */}
      <ModalDialog open={sketchOpen} onClose={() => setSketchOpen(false)} title="Stylus / Mouse Sketch Block">
        <canvas
          ref={sketchCanvasRef}
          width={560}
          height={280}
          style={{ width: '100%', background: '#ffffff', border: '1px solid var(--dp-border)', borderRadius: 8, touchAction: 'none' }}
          onPointerDown={(e) => {
            drawingRef.current = true;
            const ctx = e.currentTarget.getContext('2d');
            const rect = e.currentTarget.getBoundingClientRect();
            if (!ctx) return;
            ctx.strokeStyle = '#2a241d';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(((e.clientX - rect.left) / rect.width) * 560, ((e.clientY - rect.top) / rect.height) * 280);
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current) return;
            const ctx = e.currentTarget.getContext('2d');
            const rect = e.currentTarget.getBoundingClientRect();
            if (!ctx) return;
            ctx.lineTo(((e.clientX - rect.left) / rect.width) * 560, ((e.clientY - rect.top) / rect.height) * 280);
            ctx.stroke();
          }}
          onPointerUp={() => { drawingRef.current = false; }}
        />
        <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="dp-btn" onClick={() => setSketchOpen(false)}>Cancel</button>
          <button type="button" className="dp-btn dp-btn-primary" onClick={() => void saveSketchBlob()}>Save Sketch to Note</button>
        </div>
      </ModalDialog>

      {/* Image Lightbox */}
      <ModalDialog open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} title="Attachment Preview" wide>
        {lightboxUrl && <img src={lightboxUrl} alt="Full attachment" style={{ maxWidth: '100%', borderRadius: 8 }} />}
      </ModalDialog>
    </div>
  );
};
