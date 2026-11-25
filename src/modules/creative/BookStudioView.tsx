import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Compass,
  Download,
  Feather,
  GitBranch,
  Plus,
  Printer,
  Trash2,
  Users,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { downloadFile } from '../../core/backup';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import type { LifeRecord } from '../../core/types';

type BookTab = 'manuscript' | 'characters' | 'arcs' | 'world' | 'continuity';

interface BookProjectPayload {
  seriesName: string;
  bookNumber: number;
  genre: string;
  targetWords: number;
  dailyGoalWords: number;
  synopsis: string;
}

interface BookChapterPayload {
  bookId: string;
  order: number;
  partName: string;
  povCharacter: string;
  status: 'outline' | 'draft' | 'revised' | 'final';
  summary: string;
  content: string;
}

interface BookEntityPayload {
  bookId: string;
  kind: 'character' | 'arc' | 'world';
  role?: string;
  age?: string;
  deathChapterOrder?: number | null; // used by non-destructive Continuity Checker (§32.6)
  resolved?: boolean; // for story arcs & foreshadowing
  details: string;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export const BookStudioView: React.FC = () => {
  const { records, pushToast } = useApp();
  const books = useMemo(
    () => records.filter((r) => r.type === 'book_project' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );
  const allChapters = useMemo(() => records.filter((r) => r.type === 'book_chapter' && !r.deletedAt), [records]);
  const allEntities = useMemo(() => records.filter((r) => r.type === 'book_entity' && !r.deletedAt), [records]);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const activeBook: LifeRecord | null = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );
  const bPayload = activeBook?.payload as BookProjectPayload | undefined;

  const chapters = useMemo(
    () =>
      allChapters
        .filter((c) => (c.payload as BookChapterPayload).bookId === activeBook?.id)
        .sort((a, b) => ((a.payload as BookChapterPayload).order ?? 0) - ((b.payload as BookChapterPayload).order ?? 0)),
    [allChapters, activeBook?.id]
  );

  const bookEntities = useMemo(
    () => allEntities.filter((e) => (e.payload as BookEntityPayload).bookId === activeBook?.id),
    [allEntities, activeBook?.id]
  );

  const [selectedChapId, setSelectedChapId] = useState<string | null>(null);
  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === selectedChapId) ?? chapters[0] ?? null,
    [chapters, selectedChapId]
  );
  const cPayload = activeChapter?.payload as BookChapterPayload | undefined;

  const [tab, setTab] = useState<BookTab>('manuscript');
  const [focusMode, setFocusMode] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [entTitle, setEntTitle] = useState('');
  const [entRole, setEntRole] = useState('');
  const [entAge, setEntAge] = useState('');
  const [entDeathChap, setEntDeathChap] = useState('');
  const [entDetails, setEntDetails] = useState('');

  const totalBookWords = useMemo(
    () => chapters.reduce((sum, ch) => sum + countWords((ch.payload as BookChapterPayload).content ?? ''), 0),
    [chapters]
  );

  // Non-destructive Story Continuity Checker (§32.6) — NEVER silently alters manuscript text!
  const continuityAlerts = useMemo(() => {
    const alerts: Array<{ severity: 'warn' | 'info'; message: string }> = [];
    const chars = bookEntities.filter((e) => (e.payload as BookEntityPayload).kind === 'character');
    const arcs = bookEntities.filter((e) => (e.payload as BookEntityPayload).kind === 'arc');

    for (const ch of chars) {
      const cp = ch.payload as BookEntityPayload;
      if (cp.deathChapterOrder && cp.deathChapterOrder > 0) {
        const nameLower = ch.title.toLowerCase();
        for (const chap of chapters) {
          const ord = (chap.payload as BookChapterPayload).order;
          const txt = ((chap.payload as BookChapterPayload).content ?? '').toLowerCase();
          if (ord > cp.deathChapterOrder && nameLower.length >= 2 && txt.includes(nameLower)) {
            alerts.push({
              severity: 'warn',
              message: `Character "${ch.title}" has death marked at Chapter ${cp.deathChapterOrder}, yet appears in Chapter ${ord} ("${chap.title}"). Verify if flashback or continuity error.`,
            });
          }
        }
      }
    }
    for (const arc of arcs) {
      const ap = arc.payload as BookEntityPayload;
      if (!ap.resolved) {
        alerts.push({
          severity: 'info',
          message: `Unresolved plot thread / foreshadowing: "${arc.title}" (${ap.role || 'Story Arc'}).`,
        });
      }
    }
    for (const chap of chapters) {
      const cp = chap.payload as BookChapterPayload;
      if (!cp.povCharacter.trim()) {
        alerts.push({ severity: 'info', message: `Chapter ${cp.order} ("${chap.title}") has no POV character assigned.` });
      }
      if (countWords(cp.content ?? '') === 0) {
        alerts.push({ severity: 'info', message: `Chapter ${cp.order} ("${chap.title}") currently has 0 words drafted.` });
      }
    }
    return alerts;
  }, [bookEntities, chapters]);

  const exportManuscript = (fmt: 'md' | 'txt' | 'doc') => {
    if (!activeBook) return;
    if (fmt === 'md' || fmt === 'txt') {
      const body = chapters
        .map((ch) => {
          const cp = ch.payload as BookChapterPayload;
          return fmt === 'md' ? `## Chapter ${cp.order}: ${ch.title}\n\n${cp.content}` : `CHAPTER ${cp.order}: ${ch.title}\n\n${cp.content}`;
        })
        .join('\n\n---\n\n');
      const full = fmt === 'md' ? `# ${activeBook.title}\n\n${body}` : `${activeBook.title.toUpperCase()}\n\n${body}`;
      downloadFile({ filename: `${activeBook.title}.${fmt}`, content: full, mimeType: fmt === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    } else {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(activeBook.title)}</title></head><body style="font-family:Georgia,serif;line-height:1.7;max-width:720px;margin:2rem auto"><h1>${esc(activeBook.title)}</h1>${chapters
        .map((ch) => `<h2>Chapter ${(ch.payload as BookChapterPayload).order}: ${esc(ch.title)}</h2><p>${esc((ch.payload as BookChapterPayload).content ?? '')}</p>`)
        .join('')}</body></html>`;
      // Honest HTML-formatted Word-compatible export (.doc) with verified filename & body order (PD-008)
      downloadFile({ filename: `${activeBook.title}.doc`, content: html, mimeType: 'application/msword;charset=utf-8' });
    }
    pushToast(`Exported "${activeBook.title}.${fmt}"`, { tone: 'ok' });
  };

  const reorderChapter = async (chapIdx: number, dir: -1 | 1) => {
    const swapIdx = chapIdx + dir;
    if (swapIdx < 0 || swapIdx >= chapters.length) return;
    const a = chapters[chapIdx];
    const b = chapters[swapIdx];
    const ordA = (a.payload as BookChapterPayload).order;
    const ordB = (b.payload as BookChapterPayload).order;
    await updateRecord<BookChapterPayload>(a.id, (c) => ({ ...c, payload: { ...c.payload, order: ordB } }));
    await updateRecord<BookChapterPayload>(b.id, (c) => ({ ...c, payload: { ...c.payload, order: ordA } }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <BookOpen size={20} /> Book Writing & Story Studio
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Series & Chapters, Distraction-Free Manuscript Editor, Character Appearances, Plot Arcs, Worldbuilding, Continuity Alerts & Manuscript Export.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dp-select" value={activeBook?.id ?? ''} onChange={(e) => { setSelectedBookId(e.target.value); setSelectedChapId(null); }}>
            {books.length === 0 && <option value="">No books yet</option>}
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <input className="dp-input" placeholder="Book title..." value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} style={{ width: 150 }} />
          <input className="dp-input" placeholder="Series (optional)" value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} style={{ width: 135 }} />
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={async () => {
              const title = newBookTitle.trim() || `Untitled Novel ${books.length + 1}`;
              const book = await createRecord<BookProjectPayload>('book_project', title, {
                seriesName: newSeriesName.trim(),
                bookNumber: books.length + 1,
                genre: 'Fiction',
                targetWords: 60000,
                dailyGoalWords: 1000,
                synopsis: '',
              });
              const ch1 = await createRecord<BookChapterPayload>('book_chapter', 'Opening Chapter', {
                bookId: book.id,
                order: 1,
                partName: 'Part I',
                povCharacter: '',
                status: 'draft',
                summary: '',
                content: '',
              });
              setNewBookTitle('');
              setNewSeriesName('');
              setSelectedBookId(book.id);
              setSelectedChapId(ch1.id);
              pushToast(`Created book "${title}"`, { tone: 'ok' });
            }}
          >
            <Plus size={14} /> New Book
          </button>
          {activeBook && (
            <>
              <button type="button" className="dp-btn" onClick={() => exportManuscript('md')}><Download size={13} /> .MD</button>
              <button type="button" className="dp-btn" onClick={() => exportManuscript('doc')}><Download size={13} /> .DOC</button>
              <button type="button" className="dp-btn" onClick={() => window.print()}><Printer size={13} /> PDF</button>
              <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activeBook.id); setSelectedBookId(null); }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {!activeBook || !bPayload ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Enter a book title above and click "+ New Book" to launch your manuscript, character bible, and story continuity workspace.</p>
        </div>
      ) : (
        <>
          <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.55rem 0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <button type="button" className={`dp-btn ${tab === 'manuscript' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('manuscript')}><Feather size={13} /> Manuscript</button>
              <button type="button" className={`dp-btn ${tab === 'characters' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('characters')}><Users size={13} /> Characters</button>
              <button type="button" className={`dp-btn ${tab === 'arcs' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('arcs')}><GitBranch size={13} /> Plot Arcs & Twists</button>
              <button type="button" className={`dp-btn ${tab === 'world' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('world')}><Compass size={13} /> Worldbuilding</button>
              <button type="button" className={`dp-btn ${tab === 'continuity' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('continuity')}>
                <AlertTriangle size={13} /> Continuity ({continuityAlerts.length})
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
              {bPayload.seriesName && <span className="dp-badge">Series: {bPayload.seriesName} #{bPayload.bookNumber}</span>}
              <span className="dp-badge">
                <strong>{totalBookWords.toLocaleString()}</strong> / {bPayload.targetWords.toLocaleString()} words ({Math.min(100, Math.round((totalBookWords / Math.max(1, bPayload.targetWords)) * 100))}%)
              </span>
            </div>
          </div>

          {tab === 'manuscript' && (
            <div className={focusMode ? undefined : 'dp-studio-split'} style={focusMode ? { display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem' } : undefined}>
              {!focusMode && (
                <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Chapters ({chapters.length})</strong>
                    <button
                      type="button"
                      className="dp-btn"
                      onClick={async () => {
                        const ch = await createRecord<BookChapterPayload>('book_chapter', `Chapter ${chapters.length + 1}`, {
                          bookId: activeBook.id,
                          order: chapters.length + 1,
                          partName: 'Part I',
                          povCharacter: '',
                          status: 'outline',
                          summary: '',
                          content: '',
                        });
                        setSelectedChapId(ch.id);
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  {chapters.map((ch, idx) => {
                    const cp = ch.payload as BookChapterPayload;
                    return (
                      <div
                        key={ch.id}
                        onClick={() => setSelectedChapId(ch.id)}
                        style={{
                          padding: '0.45rem 0.55rem',
                          borderRadius: 'var(--dp-radius)',
                          border: ch.id === activeChapter?.id ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{cp.order}. {ch.title}</div>
                        <div className="dp-muted" style={{ fontSize: '0.72rem' }}>
                          {countWords(cp.content ?? '')} words · {cp.status}
                        </div>
                        <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.25rem' }}>
                          <button type="button" className="dp-btn" style={{ padding: '1px 4px' }} disabled={idx === 0} onClick={(e) => { e.stopPropagation(); void reorderChapter(idx, -1); }}><ArrowUp size={11} /></button>
                          <button type="button" className="dp-btn" style={{ padding: '1px 4px' }} disabled={idx === chapters.length - 1} onClick={(e) => { e.stopPropagation(); void reorderChapter(idx, 1); }}><ArrowDown size={11} /></button>
                          <button type="button" className="dp-btn" style={{ padding: '1px 4px' }} onClick={(e) => { e.stopPropagation(); void softDeleteRecord(ch.id); }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeChapter && cPayload && (
                <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      className="dp-input"
                      value={activeChapter.title}
                      onChange={(e) => void updateRecord(activeChapter.id, { title: e.target.value })}
                      style={{ flex: 1, fontSize: '1.1rem', fontWeight: 700, minWidth: 180 }}
                    />
                    <input
                      className="dp-input"
                      placeholder="POV Character"
                      value={cPayload.povCharacter}
                      onChange={(e) => void updateRecord<BookChapterPayload>(activeChapter.id, (c) => ({ ...c, payload: { ...c.payload, povCharacter: e.target.value } }))}
                      style={{ width: 140 }}
                    />
                    <select
                      className="dp-select"
                      value={cPayload.status}
                      onChange={(e) => void updateRecord<BookChapterPayload>(activeChapter.id, (c) => ({ ...c, payload: { ...c.payload, status: e.target.value as BookChapterPayload['status'] } }))}
                    >
                      <option value="outline">Outline</option>
                      <option value="draft">Draft</option>
                      <option value="revised">Revised</option>
                      <option value="final">Final</option>
                    </select>
                    <button type="button" className={`dp-btn ${focusMode ? 'dp-btn-primary' : ''}`} onClick={() => setFocusMode((f) => !f)}>
                      {focusMode ? 'Exit Focus' : 'Distraction-Free'}
                    </button>
                  </div>
                  <input
                    className="dp-input"
                    placeholder="Chapter beat / scene summary..."
                    value={cPayload.summary}
                    onChange={(e) => void updateRecord<BookChapterPayload>(activeChapter.id, (c) => ({ ...c, payload: { ...c.payload, summary: e.target.value } }))}
                  />
                  <SafeTextarea
                    recordKey={`book-chap:${activeChapter.id}`}
                    externalValue={cPayload.content ?? ''}
                    onCommit={(next) => void updateRecord<BookChapterPayload>(activeChapter.id, (c) => ({ ...c, payload: { ...c.payload, content: next } }))}
                    className="dp-textarea"
                    rows={16}
                    style={{ fontFamily: 'Georgia, serif', fontSize: '1.03rem', lineHeight: 1.75 }}
                    placeholder="Write your chapter here (auto-saved cleanly without mobile cursor jump)..."
                  />
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    Chapter words: <strong>{countWords(cPayload.content ?? '').toLocaleString()}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {(['characters', 'arcs', 'world'] as BookTab[]).includes(tab) && (() => {
            const kind: BookEntityPayload['kind'] = tab === 'characters' ? 'character' : tab === 'arcs' ? 'arc' : 'world';
            const list = bookEntities.filter((e) => (e.payload as BookEntityPayload).kind === kind);
            return (
              <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <input className="dp-input" placeholder={kind === 'character' ? 'Character name' : kind === 'arc' ? 'Story arc / foreshadowing' : 'Location / Magic / Lore'} value={entTitle} onChange={(e) => setEntTitle(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                  <input className="dp-input" placeholder={kind === 'character' ? 'Role (Protagonist/Antagonist)' : 'Category / Era'} value={entRole} onChange={(e) => setEntRole(e.target.value)} style={{ width: 160 }} />
                  {kind === 'character' && (
                    <>
                      <input className="dp-input" placeholder="Age" value={entAge} onChange={(e) => setEntAge(e.target.value)} style={{ width: 70 }} />
                      <input className="dp-input" type="number" placeholder="Death Ch#" value={entDeathChap} onChange={(e) => setEntDeathChap(e.target.value)} style={{ width: 95 }} />
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input className="dp-input" placeholder="Traits, backstory, rules, or timeline notes..." value={entDetails} onChange={(e) => setEntDetails(e.target.value)} style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary"
                    onClick={async () => {
                      const title = entTitle.trim() || `New ${kind}`;
                      await createRecord<BookEntityPayload>('book_entity', title, {
                        bookId: activeBook.id,
                        kind,
                        role: entRole,
                        age: entAge,
                        deathChapterOrder: entDeathChap ? Number(entDeathChap) : null,
                        resolved: false,
                        details: entDetails,
                      });
                      setEntTitle('');
                      setEntRole('');
                      setEntAge('');
                      setEntDeathChap('');
                      setEntDetails('');
                    }}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
                  {list.map((ent) => {
                    const ep = ent.payload as BookEntityPayload;
                    const appearances =
                      kind === 'character'
                        ? chapters.filter((ch) => ((ch.payload as BookChapterPayload).content ?? '').toLowerCase().includes(ent.title.toLowerCase())).length
                        : 0;
                    return (
                      <div key={ent.id} style={{ padding: '0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{ent.title}</strong>
                          <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(ent.id)}><Trash2 size={12} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', fontSize: '0.73rem' }}>
                          {ep.role && <span className="dp-badge">{ep.role}</span>}
                          {ep.age && <span className="dp-badge">Age {ep.age}</span>}
                          {kind === 'character' && <span className="dp-badge">Appears in {appearances} ch</span>}
                          {ep.deathChapterOrder && <span className="dp-badge">Death: Ch {ep.deathChapterOrder}</span>}
                          {kind === 'arc' && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(ep.resolved)}
                                onChange={(e) => void updateRecord<BookEntityPayload>(ent.id, (c) => ({ ...c, payload: { ...c.payload, resolved: e.target.checked } }))}
                              />
                              Resolved
                            </label>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem' }}>{ep.details}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {tab === 'continuity' && (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Story Continuity Check (Read-Only Alerts — Never Modifies Your Text)</h4>
              {continuityAlerts.length === 0 ? (
                <div className="dp-badge" style={{ alignSelf: 'flex-start' }}>✓ No continuity warnings detected across {chapters.length} chapters!</div>
              ) : (
                continuityAlerts.map((a, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.55rem 0.7rem',
                      borderRadius: 'var(--dp-radius)',
                      border: `1px solid ${a.severity === 'warn' ? 'var(--dp-danger)' : 'var(--dp-border)'}`,
                      background: 'var(--dp-paper-alt)',
                      fontSize: '0.84rem',
                    }}
                  >
                    <strong>{a.severity === 'warn' ? '⚠ Potential Continuity Issue: ' : 'ℹ Check: '}</strong>
                    {a.message}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
