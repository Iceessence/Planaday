import { useViewActionGuard } from '../../components/Common/viewSafety';
import { db } from '../../core/db';
import React, { useMemo, useRef, useState } from 'react';
import { Copy, FileOutput, Plus, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { fileThoughtPassage } from '../../core/mindActions';
import { DEFAULT_NOTEBOOKS } from '../../data/sampleData';
import { getThoughtPromptCategories, THOUGHT_PROMPTS } from '../../data/prompts';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import type { LifeRecord, ThoughtPayload } from '../../core/types';

export const ThoughtInboxView: React.FC = () => {
  const { settings, patchSettings, records, logicalToday, pushToast } = useApp();
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'warn' }));
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [tagFilter, setTagFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'title' | 'length'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [promptCategory, setPromptCategory] = useState('All');
  const [promptIdx, setPromptIdx] = useState(0);
  const [customThoughtPrompt, setCustomThoughtPrompt] = useState('');
  const [viewMode, setViewMode] = useState<'entries' | 'one_doc'>('entries');
  const [activeThoughtId, setActiveThoughtId] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ thoughtId: string; start: number; end: number; text: string; fullText: string } | null>(null);
  const [fileMode, setFileMode] = useState<'move' | 'copy'>('move');
  const [fileTarget, setFileTarget] = useState<'note' | 'task' | 'event' | 'goal' | 'recipe'>('note');
  const [fileNotebook, setFileNotebook] = useState('nb_personal');
  const entryAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const allNotebooks = useMemo(() => {
    const custom = records
      .filter((r) => r.type === 'notebook')
      .map((r) => ({ id: r.id, name: r.title }));
    return [...DEFAULT_NOTEBOOKS, ...custom];
  }, [records]);

  const allThoughts = useMemo(
    () =>
      (records.filter((r) => r.type === 'thought') as Array<LifeRecord<ThoughtPayload>>).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [records]
  );

  const availableTags = useMemo(() => {
    const set = new Set<string>(['idea', 'errand', 'home', 'work', 'recipe', 'quote']);
    for (const t of allThoughts) {
      for (const tg of t.tags ?? []) set.add(tg);
    }
    return ['All', ...Array.from(set)];
  }, [allThoughts]);

  const thoughtPromptCategories = useMemo(
    () => getThoughtPromptCategories(settings.customThoughtPrompts),
    [settings.customThoughtPrompts]
  );

  const filteredThoughtPrompts = useMemo(() => {
    const customWrapped = (settings.customThoughtPrompts ?? []).map((text) => ({ category: 'My Prompts', text }));
    const combined = [...THOUGHT_PROMPTS, ...customWrapped];
    if (promptCategory === 'All') return combined;
    const subset = combined.filter((p) => p.category === promptCategory);
    return subset.length > 0 ? subset : combined;
  }, [settings.customThoughtPrompts, promptCategory]);

  const activeThoughtPrompt = filteredThoughtPrompts[promptIdx % filteredThoughtPrompts.length] ?? THOUGHT_PROMPTS[0];

  const thoughts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allThoughts.filter((t) => {
      if (tagFilter !== 'All' && !(t.tags ?? []).includes(tagFilter)) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.payload.content ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (sortBy === 'length') return ((a.payload.content?.length ?? 0) - (b.payload.content?.length ?? 0)) * dir;
      return a.createdAt.localeCompare(b.createdAt) * dir;
    });
  }, [allThoughts, tagFilter, searchQuery, sortBy, sortDir]);

  const selectedThought = thoughts.find((t) => t.id === activeThoughtId) ?? thoughts[0] ?? null;

  const oneDocumentText = useMemo(
    () =>
      viewMode !== 'one_doc' ? '' : [...thoughts]
        .reverse()
        .map((t) => `## ${new Date(t.createdAt).toLocaleString()} — ${t.title}\n\n${t.payload.content}`)
        .join('\n\n---\n\n'),
    [thoughts, viewMode]
  );

  const handleAddThought = async () => {
    const content = draft.trim();
    if (!content) return;
    const title = content.split(/\r?\n/)[0].slice(0, 64);
    const parsedTags = draftTag
      .split(/[,\s#]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const created = await createRecord<ThoughtPayload>(
      'thought',
      title,
      {
        content,
        source: 'keyboard',
      },
      { tags: parsedTags }
    );
    setDraft('');
    setDraftTag('');
    setActiveThoughtId(created.id);
    pushToast('Saved thought to Inbox', { canUndo: true });
  };

  const captureSelection = () => {
    const el = entryAreaRef.current;
    if (!el || !selectedThought) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end > start) {
      setSelectionRange({ thoughtId: selectedThought.id, start, end, text: el.value.slice(start, end), fullText: el.value });
    } else {
      setSelectionRange(null);
    }
  };

  const handleFilePassage = async () => {
    if (!selectedThought || !selectionRange || selectionRange.thoughtId !== selectedThought.id) return;
    const latest = await db.records.get(selectedThought.id);
    if (!latest || latest.deletedAt || latest.payload.content !== selectionRange.fullText || entryAreaRef.current?.value !== selectionRange.fullText) {
      pushToast('Text changed or is still saving. Wait for the local save, then select the passage again.', { tone: 'warn' });
      setSelectionRange(null); return;
    }
    const res = await fileThoughtPassage(selectedThought.id, selectionRange.start, selectionRange.end, {
      mode: fileMode,
      expectedContent: selectionRange.fullText,
      targetType: fileTarget,
      notebookId: fileNotebook,
      dateIso: logicalToday,
    });
    if (res) {
      setSelectionRange(null);
      pushToast(
        `${fileMode === 'move' ? 'Moved' : 'Copied'} passage into ${fileTarget} ("${res.createdRecord.title}") — remaining text & timestamp preserved!`,
        { canUndo: true }
      );
    }
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>Thought Inbox & Selected-Passage Filing</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Frictionless brain dump. Highlight any sentence or paragraph to move or copy it into a Notebook, Task, Event, Goal, or Recipe.
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'entries' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('entries')}>
            Entries ({thoughts.length})
          </button>
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'one_doc' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('one_doc')}>
            One Document View
          </button>
        </div>
      </div>

      {/* Categorized Brain-Dump Thought Prompts (35+ Prompts + Custom) */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 8, background: 'var(--dp-surface-2)' }}>
        <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.82rem' }}>
            <Sparkles size={14} style={{ verticalAlign: '-2px' }} /> Thought Prompts ({filteredThoughtPrompts.length}):
          </strong>
          {thoughtPromptCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className="dp-chip"
              data-active={promptCategory === cat}
              onClick={() => {
                setPromptCategory(cat);
                setPromptIdx(0);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '0.9rem', flex: '1 1 220px' }}>
            <span className="dp-pill" style={{ marginInlineEnd: 6 }}>{activeThoughtPrompt.category}</span>
            <em>{activeThoughtPrompt.text}</em>
          </span>
          <div className="dp-row" style={{ gap: 6 }}>
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => {
                setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${activeThoughtPrompt.text}\n- ` : `${activeThoughtPrompt.text}\n- `));
              }}
            >
              + Use Prompt
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => setPromptIdx(Math.floor(Math.random() * filteredThoughtPrompts.length))}
            >
              <Shuffle size={13} /> Shuffle
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setPromptIdx((n) => n + 1)}>
              Next →
            </button>
          </div>
        </div>
        <div className="dp-row">
          <input
            className="dp-input"
            style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }}
            placeholder="Save your own custom brain-dump prompt…"
            value={customThoughtPrompt}
            onChange={(e) => setCustomThoughtPrompt(e.target.value)}
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              const p = customThoughtPrompt.trim();
              if (!p) return;
              void patchSettings({ customThoughtPrompts: [...(settings.customThoughtPrompts ?? []), p] });
              setCustomThoughtPrompt('');
              setPromptCategory('My Prompts');
              setPromptIdx((settings.customThoughtPrompts ?? []).length);
              pushToast('Saved custom thought prompt');
            }}
          >
            + Save Prompt
          </button>
        </div>
      </div>

      {/* Large Frictionless Brain Dump Draft */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <textarea
          className="dp-textarea"
          style={{ minHeight: 110, fontSize: '1rem' }}
          placeholder="Dump unorganized thoughts, ideas, errands, or recipe sparks here…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <input
              aria-label="Thought tags"
              className="dp-input"
              list="thought-tag-list"
              style={{ width: 170 }}
              placeholder="Tags (idea, errand...)"
              value={draftTag}
              onChange={(e) => setDraftTag(e.target.value)}
            />
            <datalist id="thought-tag-list">
              {availableTags.filter((t) => t !== 'All').map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {['idea', 'errand', 'home', 'work'].map((preset) => (
              <button
                key={preset}
                type="button"
                className="dp-chip"
                onClick={() =>
                  setDraftTag((prev) => {
                    const parts = prev.split(/[,\s#]+/).filter(Boolean);
                    return parts.includes(preset) ? prev : [...parts, preset].join(', ');
                  })
                }
              >
                #{preset}
              </button>
            ))}
          </div>
          <button type="button" className="dp-btn dp-btn-primary" onClick={guardAction('action-1', () => handleAddThought())}>
            <Plus size={15} /> Capture Entry
          </button>
        </div>
      </div>

      {/* Easy Sort & Filter Bar */}
      <SortFilterBar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search thoughts…"
        sortBy={sortBy}
        onSortByChange={(v) => setSortBy(v as typeof sortBy)}
        sortOptions={[
          { value: 'created', label: 'Date Captured' },
          { value: 'title', label: 'Title (A–Z)' },
          { value: 'length', label: 'Length' },
        ]}
        sortDir={sortDir}
        onSortDirToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={availableTags.slice(0, 10).map((tg) => ({
          value: tg,
          label: tg === 'All' ? `All` : `#${tg}`,
        }))}
        activeChip={tagFilter}
        onChipChange={setTagFilter}
        totalCount={allThoughts.length}
        shownCount={thoughts.length}
        onReset={() => {
          setSearchQuery('');
          setTagFilter('All');
        }}
      />

      {viewMode === 'one_doc' ? (
        <div className="dp-card dp-stack">
          <div className="dp-between">
            <strong>Chronological One-Document Stream</strong>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(oneDocumentText);
                pushToast('Copied entire Thought Inbox document to clipboard');
              }}
            >
              <Copy size={14} /> Copy All
            </button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--dp-font-body)', lineHeight: 1.65 }}>
            {oneDocumentText || 'No thoughts yet.'}
          </pre>
        </div>
      ) : (
        <div className="dp-grid-2">
          <div className="dp-stack" style={{ gap: 8 }}>
            {thoughts.map((t) => (
              <button
                key={t.id}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  padding: 12,
                  cursor: 'pointer',
                  borderColor: t.id === selectedThought?.id ? 'var(--dp-accent)' : undefined,
                  borderWidth: t.id === selectedThought?.id ? 2 : 1,
                }}
                onClick={() => {
                  setActiveThoughtId(t.id);
                  setSelectionRange(null);
                }}
              >
                <div className="dp-between">
                  <strong>{t.title}</strong>
                  <span className="dp-muted" style={{ fontSize: '0.75rem' }}>
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="dp-muted" style={{ margin: '6px 0 0', fontSize: '0.84rem' }}>
                  {t.payload.content.slice(0, 120)}
                </p>
              </button>
            ))}
          </div>

          {selectedThought && (
            <div className="dp-card dp-stack" style={{ padding: 14 }}>
              <div className="dp-between">
                <div>
                  <strong>{selectedThought.title}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    Original timestamp: {new Date(selectedThought.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="dp-icon-btn"
                  title="Move thought to Trash"
                  onClick={async () => {
                    await softDeleteRecord(selectedThought.id);
                    setActiveThoughtId(null);
                    pushToast('Thought moved to Trash', { canUndo: true });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <SafeTextarea
                textareaRef={entryAreaRef}
                recordKey={`thought:${selectedThought.id}`}
                externalValue={selectedThought.payload.content}
                onCommit={async (val) => {
                  await updateRecord<ThoughtPayload>(
                    selectedThought.id,
                    (c) => ({ ...c, payload: { ...c.payload, content: val } }),
                    { skipUndo: true }
                  );
                }}
                className="dp-textarea"
                style={{ minHeight: 200, lineHeight: 1.65 }}
                onSelect={captureSelection}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
              />

              {/* File a Passage Toolbar */}
              <div className="dp-card dp-stack" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
                <strong style={{ fontSize: '0.86rem' }}>
                  <FileOutput size={14} style={{ verticalAlign: '-2px' }} /> File a Selected Passage
                </strong>
                {selectionRange?.thoughtId === selectedThought.id ? (
                  <>
                    <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                      Selected ({selectionRange.text.length} chars): "{selectionRange.text.slice(0, 90)}"
                    </div>
                    <div className="dp-row">
                      <select aria-label="Move or copy" className="dp-select" style={{ width: 'auto' }} value={fileMode} onChange={(e) => setFileMode(e.target.value as 'move' | 'copy')}>
                        <option value="move">Move (cut from thought)</option>
                        <option value="copy">Copy (keep in thought)</option>
                      </select>
                      <select aria-label="Target record type" className="dp-select" style={{ width: 'auto' }} value={fileTarget} onChange={(e) => setFileTarget(e.target.value as typeof fileTarget)}>
                        <option value="note">Subject Notebook</option>
                        <option value="task">Task</option>
                        <option value="event">Calendar Event</option>
                        <option value="goal">Goal</option>
                        <option value="recipe">Recipe Draft</option>
                      </select>
                      {fileTarget === 'note' && (
                        <select aria-label="Target notebook" className="dp-select" style={{ width: 'auto' }} value={fileNotebook} onChange={(e) => setFileNotebook(e.target.value)}>
                          {allNotebooks.map((nb) => (
                            <option key={nb.id} value={nb.id}>{nb.name}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={guardAction('action-2', () => handleFilePassage())}>
                        File Passage
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="dp-muted" style={{ fontSize: '0.82rem' }}>
                    Highlight any sentence or paragraph inside the text box above to file it cleanly.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
