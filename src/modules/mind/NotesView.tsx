import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  FilePlus,
  History,
  Image as ImageIcon,
  Mic,
  Network,
  PenTool,
  Pin,
  Square,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, getNoteRevisions, softDeleteRecord, updateRecord } from '../../core/repository';
import { getBlobObjectUrl, storeBlob } from '../../core/db';
import { DEFAULT_NOTEBOOKS } from '../../data/sampleData';
import { extractInlineEntities } from '../../core/mindActions';
import { ModalDialog } from '../../components/Common/ModalDialog';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import type { FontPairing, LifeRecord, NotePayload, PaperMaterial, RevisionRecord, TaskPayload } from '../../core/types';

export const NotesView: React.FC = () => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    pushToast,
    selectedNoteId,
    setSelectedNoteId,
  } = useApp();

  const [activeNotebook, setActiveNotebook] = useState<string>('all');
  const [noteSearch, setNoteSearch] = useState('');
  const [notePinFilter, setNotePinFilter] = useState<'all' | 'pinned'>('all');
  const [noteSortBy, setNoteSortBy] = useState<'updated' | 'created' | 'title' | 'words'>('updated');
  const [noteSortDir, setNoteSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'graph'>('edit');
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [newNotebookName, setNewNotebookName] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const visibleNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const list = notes.filter((n) => {
      if (activeNotebook !== 'all' && n.payload.notebookId !== activeNotebook) return false;
      if (notePinFilter === 'pinned' && !n.payload.pinned) return false;
      if (q) {
        const hay = `${n.title} ${n.payload.content ?? ''} ${(n.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = noteSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const pinDiff = Number(Boolean(b.payload.pinned)) - Number(Boolean(a.payload.pinned));
      if (pinDiff !== 0) return pinDiff;
      if (noteSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (noteSortBy === 'created') return a.createdAt.localeCompare(b.createdAt) * dir;
      if (noteSortBy === 'words') {
        const wa = (a.payload.content ?? '').trim().split(/\s+/).filter(Boolean).length;
        const wb = (b.payload.content ?? '').trim().split(/\s+/).filter(Boolean).length;
        return (wa - wb) * dir;
      }
      return a.updatedAt.localeCompare(b.updatedAt) * dir;
    });
  }, [notes, activeNotebook, noteSearch, notePinFilter, noteSortBy, noteSortDir]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? visibleNotes[0] ?? null,
    [notes, selectedNoteId, visibleNotes]
  );

  // Load object URLs for inline image/PDF/voice attachments
  useEffect(() => {
    let active = true;
    const ids = [
      ...(activeNote?.payload.attachmentBlobIds ?? []),
      ...(activeNote?.payload.voiceMemoBlobIds ?? []),
      ...(activeNote?.payload.sketchBlobId ? [activeNote.payload.sketchBlobId] : []),
    ];
    (async () => {
      const next: Record<string, string> = {};
      for (const h of ids) {
        const u = await getBlobObjectUrl(h);
        if (u) next[h] = u;
      }
      if (active) setBlobUrls(next);
    })();
    return () => {
      active = false;
      Object.values(blobUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id, activeNote?.payload.attachmentBlobIds?.length, activeNote?.payload.voiceMemoBlobIds?.length, activeNote?.payload.sketchBlobId]);

  const handleCreateNote = async () => {
    const nb = activeNotebook === 'all' ? 'nb_personal' : activeNotebook;
    const created = await createRecord<NotePayload>('note', 'Untitled Note', {
      notebookId: nb,
      writtenForDate: logicalToday,
      content: '',
      citations: [],
      attachmentBlobIds: [],
      voiceMemoBlobIds: [],
      touchedDates: [logicalToday],
    });
    setSelectedNoteId(created.id);
    setViewMode('edit');
    pushToast('Created new note', { canUndo: true });
  };

  const handleContentChange = (nextContent: string) => {
    if (!activeNote) return;
    // Detect [[ autocomplete trigger
    const m = nextContent.match(/\[\[([^[\]]*)$/);
    setAutocompleteQuery(m ? m[1] : null);

    const entities = extractInlineEntities(nextContent);
    const touched = Array.from(new Set([...(activeNote.payload.touchedDates ?? []), logicalToday]));
    void updateRecord<NotePayload>(
      activeNote.id,
      (cur) => ({
        ...cur,
        tags: entities.tags,
        payload: { ...cur.payload, content: nextContent, touchedDates: touched },
      }),
      { skipUndo: true }
    );
  };

  const insertSnippet = (snippet: string) => {
    if (!activeNote) return;
    const el = textareaRef.current;
    const content = activeNote.payload.content ?? '';
    if (!el) {
      handleContentChange(`${content}\n${snippet}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + snippet + content.slice(end);
    handleContentChange(next);
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

  const wordCount = activeNote
    ? (activeNote.payload.content ?? '').trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-4)' }}>
      <div className="dp-between">
        <div>
          <h2>Rich Block / Live-Markdown Notes & Knowledge Graph</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Unlimited word count · 20+ revisions with restore · [[WikiLinks]] & Backlinks · Blobs & Voice Memos
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void handleCreateNote()}>
            <FilePlus size={14} /> New Note
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${viewMode === 'graph' ? 'dp-btn-primary' : ''}`}
            onClick={() => setViewMode(viewMode === 'graph' ? 'edit' : 'graph')}
          >
            <Network size={14} /> {viewMode === 'graph' ? 'Back to Editor' : 'Connection Graph'}
          </button>
        </div>
      </div>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', gap: 14 }}>
          {/* Note List */}
          <div className="dp-stack" style={{ gap: 6, maxHeight: '66dvh', overflowY: 'auto' }}>
            {visibleNotes.map((n) => (
              <button
                key={n.id}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  padding: 10,
                  cursor: 'pointer',
                  borderColor: n.id === activeNote?.id ? 'var(--dp-accent)' : undefined,
                  borderWidth: n.id === activeNote?.id ? 2 : 1,
                }}
                onClick={() => setSelectedNoteId(n.id)}
              >
                <div className="dp-between">
                  <strong style={{ fontSize: '0.9rem' }}>
                    {n.payload.pinned ? '📌 ' : ''}
                    {n.title}
                  </strong>
                </div>
                <div className="dp-muted" style={{ fontSize: '0.75rem', marginTop: 3 }}>
                  Written for {n.payload.writtenForDate}
                </div>
              </button>
            ))}
          </div>

          {/* Note Editor Canvas */}
          {activeNote ? (
            <div className="dp-card dp-stack" style={{ padding: 16 }}>
              <div className="dp-between">
                <input
                  className="dp-input"
                  style={{ fontSize: '1.2rem', fontFamily: 'var(--dp-font-heading)', fontWeight: 700, flex: 1 }}
                  value={activeNote.title}
                  onChange={(e) => void updateRecord(activeNote.id, { title: e.target.value }, { skipUndo: true })}
                />
                <div className="dp-row">
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
                    <History size={14} /> Revisions
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

              {/* Metadata row: Written-For Date vs Created + Notebook + Word count */}
              <div className="dp-row" style={{ fontSize: '0.8rem' }}>
                <select
                  aria-label="Subject notebook"
                  className="dp-select"
                  style={{ width: 'auto', padding: '3px 8px' }}
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
                <span className="dp-muted">Created: {activeNote.createdAt.slice(0, 10)} · {wordCount.toLocaleString()} words (no limit)</span>
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

              {viewMode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  className="dp-textarea"
                  style={{ minHeight: 310, fontFamily: 'var(--dp-font-body)', lineHeight: 1.65 }}
                  placeholder="Write freely in Markdown with [[WikiLinks]], @mentions, #tags, checklists (- [ ])…"
                  value={activeNote.payload.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                />
              ) : (
                <div className="dp-stack" style={{ minHeight: 310, padding: 10 }}>
                  {(activeNote.payload.content ?? '').split(/\r?\n/).map((line, idx) => {
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
                                const lines = activeNote.payload.content.split(/\r?\n/);
                                lines[idx] = `${checkMatch[1]}- [${checked ? ' ' : 'x'}] ${label}`;
                                handleContentChange(lines.join('\n'));
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
                    if (line.startsWith('# ')) return <h2 key={idx}>{line.slice(2)}</h2>;
                    if (line.startsWith('## ')) return <h3 key={idx}>{line.slice(3)}</h3>;
                    if (line.startsWith('> ')) return <blockquote key={idx} style={{ margin: 0, paddingInlineStart: 12, borderInlineStart: '3px solid var(--dp-accent)' }}>{line.slice(2)}</blockquote>;
                    return <p key={idx} style={{ margin: '2px 0' }}>{line || '\u00A0'}</p>;
                  })}
                </div>
              )}

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
                  <strong style={{ fontSize: '0.84rem' }}>Backlinks ({backlinks.length})</strong>
                  {backlinks.length === 0 ? (
                    <span className="dp-muted" style={{ fontSize: '0.8rem' }}>No notes link here yet.</span>
                  ) : (
                    backlinks.map(({ note, context }) => (
                      <button key={note.id} type="button" className="dp-card" style={{ padding: 8, textAlign: 'start', cursor: 'pointer' }} onClick={() => setSelectedNoteId(note.id)}>
                        <strong style={{ fontSize: '0.84rem' }}>{note.title}</strong>
                        <div className="dp-muted" style={{ fontSize: '0.76rem' }}>…{context}…</div>
                      </button>
                    ))
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

      {/* 20+ Revisions History & Restore Modal */}
      <ModalDialog open={revisionsOpen} onClose={() => setRevisionsOpen(false)} title={`Revisions (${revisions.length} saved)`} wide>
        {revisions.length === 0 ? (
          <p className="dp-muted">No prior revisions recorded yet.</p>
        ) : (
          <div className="dp-stack">
            {revisions.map((rev) => (
              <div key={rev.id} className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
                <div className="dp-between">
                  <strong>{new Date(rev.timestamp).toLocaleString()}</strong>
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
                    Restore This Revision
                  </button>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', maxHeight: 110, overflow: 'auto' }}>
                  {rev.content.slice(0, 400)}
                </pre>
              </div>
            ))}
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
