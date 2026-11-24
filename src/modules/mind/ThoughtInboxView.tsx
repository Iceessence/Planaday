import React, { useMemo, useRef, useState } from 'react';
import { Copy, FileOutput, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { fileThoughtPassage } from '../../core/mindActions';
import { DEFAULT_NOTEBOOKS } from '../../data/sampleData';
import type { LifeRecord, ThoughtPayload } from '../../core/types';

export const ThoughtInboxView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const [draft, setDraft] = useState('');
  const [viewMode, setViewMode] = useState<'entries' | 'one_doc'>('entries');
  const [activeThoughtId, setActiveThoughtId] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [fileMode, setFileMode] = useState<'move' | 'copy'>('move');
  const [fileTarget, setFileTarget] = useState<'note' | 'task' | 'event' | 'goal' | 'recipe'>('note');
  const [fileNotebook, setFileNotebook] = useState('nb_personal');
  const entryAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const thoughts = useMemo(
    () =>
      (records.filter((r) => r.type === 'thought') as Array<LifeRecord<ThoughtPayload>>).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [records]
  );

  const selectedThought = thoughts.find((t) => t.id === activeThoughtId) ?? thoughts[0] ?? null;

  const oneDocumentText = useMemo(
    () =>
      [...thoughts]
        .reverse()
        .map((t) => `## ${new Date(t.createdAt).toLocaleString()} — ${t.title}\n\n${t.payload.content}`)
        .join('\n\n---\n\n'),
    [thoughts]
  );

  const handleAddThought = async () => {
    const content = draft.trim();
    if (!content) return;
    const title = content.split(/\r?\n/)[0].slice(0, 64);
    const created = await createRecord<ThoughtPayload>('thought', title, {
      content,
      source: 'keyboard',
    });
    setDraft('');
    setActiveThoughtId(created.id);
    pushToast('Saved thought to Inbox', { canUndo: true });
  };

  const captureSelection = () => {
    const el = entryAreaRef.current;
    if (!el || !selectedThought) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end > start) {
      setSelectionRange({ start, end, text: (selectedThought.payload.content ?? '').slice(start, end) });
    } else {
      setSelectionRange(null);
    }
  };

  const handleFilePassage = async () => {
    if (!selectedThought || !selectionRange) return;
    const res = await fileThoughtPassage(selectedThought.id, selectionRange.start, selectionRange.end, {
      mode: fileMode,
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

      {/* Large Frictionless Brain Dump Draft */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <textarea
          className="dp-textarea"
          style={{ minHeight: 110, fontSize: '1rem' }}
          placeholder="Dump unorganized thoughts, ideas, errands, or recipe sparks here…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="dp-between">
          <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Unlimited length · Saved directly to IndexedDB</span>
          <button type="button" className="dp-btn dp-btn-primary" onClick={() => void handleAddThought()}>
            <Plus size={15} /> Capture Entry
          </button>
        </div>
      </div>

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

              <textarea
                ref={entryAreaRef}
                className="dp-textarea"
                style={{ minHeight: 200, lineHeight: 1.65 }}
                value={selectedThought.payload.content}
                onSelect={captureSelection}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                onChange={(e) =>
                  void updateRecord<ThoughtPayload>(
                    selectedThought.id,
                    (c) => ({ ...c, payload: { ...c.payload, content: e.target.value } }),
                    { skipUndo: true }
                  )
                }
              />

              {/* File a Passage Toolbar */}
              <div className="dp-card dp-stack" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
                <strong style={{ fontSize: '0.86rem' }}>
                  <FileOutput size={14} style={{ verticalAlign: '-2px' }} /> File a Selected Passage
                </strong>
                {selectionRange ? (
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
                          {DEFAULT_NOTEBOOKS.map((nb) => (
                            <option key={nb.id} value={nb.id}>{nb.name}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void handleFilePassage()}>
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
