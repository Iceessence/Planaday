import { useViewFormGuard, useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import { BookOpen, Compass, Film, Play, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { addDaysIso } from '../../core/temporal';

export const LearningMediaView: React.FC<{ mode: 'learning' | 'media' }> = ({ mode }) => {
  const { settings, records, logicalToday, pushToast, startCountdownTimer } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'danger' }));
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));


  // Spaced review card state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [dailyLimit, setDailyLimit] = useState(15);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Media Shelf state
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaKind, setMediaKind] = useState('Book');
  const [mediaStatus, setMediaStatus] = useState<'Want to Start' | 'In Progress' | 'Completed' | 'Paused'>('In Progress');

  // Hobby Project state
  const [hobbyTitle, setHobbyTitle] = useState('');
  const [hobbySupplies, setHobbySupplies] = useState('');

  const cards = useMemo(() => records.filter((r) => r.type === 'review_card'), [records]);
  const dueCards = useMemo(
    () =>
      cards
        .filter((c) => {
          const p = c.payload as { nextReviewDate?: string; dismissedUntil?: string };
          if (p.dismissedUntil && p.dismissedUntil > logicalToday) return false;
          return (p.nextReviewDate ?? logicalToday) <= logicalToday;
        })
        .sort((a, b) => String(a.payload.nextReviewDate ?? logicalToday).localeCompare(String(b.payload.nextReviewDate ?? logicalToday)) || a.createdAt.localeCompare(b.createdAt))
        .slice(0, Math.max(0, dailyLimit)),
    [cards, logicalToday, dailyLimit]
  );

  const mediaItems = useMemo(() => records.filter((r) => r.type === 'media_item'), [records]);
  const hobbies = useMemo(() => records.filter((r) => r.type === 'hobby_project'), [records]);

  if (mode === 'learning') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <div className="dp-between">
          <div>
            <h2>
              <Compass size={20} style={{ verticalAlign: '-3px' }} /> Spaced-Repetition Review Deck
            </h2>
            <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Turn note highlights into Q&A review cards · Again +1d / Good +3d / Easy +7d · 7-day gentle dismiss
            </p>
          </div>
          <label className="dp-row" style={{ fontSize: '0.84rem' }}>
            <span className="dp-muted">Daily limit:</span>
            <input type="number" min={1} max={100} className="dp-input" style={{ width: 68 }} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value) || 15)} />
            <span className="dp-muted">cards/day</span>
          </label>
        </div>

        <form
          className="dp-card dp-stack"
          style={{ padding: 12 }}
          onSubmit={guardForm('form-1', async (e) => {
            e.preventDefault();
            if (!question.trim() || !answer.trim()) return;
            await createRecord('review_card', question.trim(), {
              question: question.trim(),
              answer: answer.trim(),
              nextReviewDate: logicalToday,
              reviewsCount: 0,
            });
            setQuestion('');
            setAnswer('');
            pushToast('Added Q&A review card');
          })}
        >
          <input className="dp-input" placeholder="Question / Prompt…" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <textarea className="dp-textarea" style={{ minHeight: 68 }} placeholder="Answer / Key takeaway…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Review Card</button>
          </div>
        </form>

        <div className="dp-section-title">Due for Review Today ({dueCards.length})</div>
        {dueCards.length === 0 ? (
          <div className="dp-empty">
            <strong>All caught up for today!</strong>
            <span className="dp-muted">{cards.length} total cards in deck.</span>
          </div>
        ) : (
          <div className="dp-stack">
            {dueCards.map((c) => {
              const p = c.payload as { question: string; answer: string; reviewsCount?: number };
              const shown = revealedIds.has(c.id);
              const grade = async (days: number, label: string) => {
                await updateRecord(c.id, (cur) => ({
                  ...cur,
                  payload: {
                    ...cur.payload,
                    nextReviewDate: addDaysIso(logicalToday, days),
                    reviewsCount: (p.reviewsCount ?? 0) + 1,
                  },
                }));
                pushToast(`${label} — scheduled for ${addDaysIso(logicalToday, days)}`);
              };
              return (
                <div key={c.id} className="dp-card dp-stack" style={{ padding: 14 }}>
                  <div className="dp-between">
                    <strong>Q: {p.question}</strong>
                    <button
                      type="button"
                      className="dp-icon-btn"
                      title="Delete review card"
                      onClick={guardAction('action-1', async () => {
                        await softDeleteRecord(c.id);
                        pushToast('Moved review card to Trash', { canUndo: true });
                      })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {shown ? (
                    <>
                      <p style={{ margin: 0, padding: 10, background: 'var(--dp-surface-2)', borderRadius: 8 }}>A: {p.answer}</p>
                      <div className="dp-row">
                        <button type="button" className="dp-btn dp-btn-sm" onClick={() => void grade(1, 'Again (+1d)')}>Again (+1d)</button>
                        <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void grade(3, 'Good (+3d)')}>Good (+3d)</button>
                        <button type="button" className="dp-btn dp-btn-sm" onClick={() => void grade(7, 'Easy (+7d)')}>Easy (+7d)</button>
                        <button
                          type="button"
                          className="dp-btn dp-btn-ghost dp-btn-sm"
                          onClick={() =>
                            void updateRecord(c.id, (cur) => ({
                              ...cur,
                              payload: { ...cur.payload, dismissedUntil: addDaysIso(logicalToday, 7) },
                            }))
                          }
                        >
                          Dismiss 7d
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() => setRevealedIds((s) => new Set(s).add(c.id))}
                    >
                      Reveal Answer
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <h2>
        <Film size={20} style={{ verticalAlign: '-3px' }} /> Multi-Media Shelf & Hobby Projects
      </h2>

      {/* Media Shelf */}
      <div className="dp-card dp-stack">
        <h4><BookOpen size={15} /> Books, Audiobooks, Podcasts, Films, TV & Games</h4>
        <form
          className="dp-row"
          onSubmit={guardForm('form-2', async (e) => {
            e.preventDefault();
            if (!mediaTitle.trim()) return;
            await createRecord('media_item', mediaTitle.trim(), {
              kind: mediaKind,
              shelfStatus: mediaStatus,
              progressPct: mediaStatus === 'Completed' ? 100 : 0,
              rating: 0,
            });
            setMediaTitle('');
            pushToast('Added to Media Shelf');
          })}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Title…" value={mediaTitle} onChange={(e) => setMediaTitle(e.target.value)} />
          <input list="dp-media-kinds" aria-label="Media type" className="dp-input" style={{ width: 130 }} value={mediaKind} onChange={(e) => setMediaKind(e.target.value)} placeholder="Type (pick or type)…" />
          <datalist id="dp-media-kinds">
            {['Book', 'Audiobook', 'Podcast', 'Film', 'TV Show', 'Game', 'Course', 'Article'].map((k) => <option key={k} value={k} />)}
          </datalist>
          <select aria-label="Shelf status" className="dp-select" style={{ width: 'auto' }} value={mediaStatus} onChange={(e) => setMediaStatus(e.target.value as typeof mediaStatus)}>
            {(['Want to Start', 'In Progress', 'Completed', 'Paused'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add</button>
        </form>

        <div className="dp-grid-2">
          {mediaItems.map((m) => {
            const p = m.payload as { kind: string; shelfStatus: string; progressPct: number; rating: number };
            return (
              <div key={m.id} className="dp-card dp-stack" style={{ padding: 12, gap: 6 }}>
                <div className="dp-between">
                  <strong>{m.title}</strong>
                  <div className="dp-row" style={{ gap: 4 }}>
                    <span className="dp-pill">{p.kind} · {p.shelfStatus}</span>
                    <button type="button" className="dp-icon-btn" style={{ width: 24, height: 24 }} title="Delete media item" onClick={() => void softDeleteRecord(m.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <label className="dp-between" style={{ fontSize: '0.82rem' }}>
                  <span>Progress: {p.progressPct}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={p.progressPct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      void updateRecord(m.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, progressPct: val, shelfStatus: val === 100 ? 'Completed' : 'In Progress' },
                      }));
                    }}
                  />
                </label>
                <div className="dp-between">
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer(`Reading: ${m.title}`, 25 * 60, 'countdown', m.id)}>
                    <Play size={12} /> 25m Timer
                  </button>
                  <div className="dp-row" style={{ gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className="dp-btn dp-btn-ghost dp-btn-sm"
                        style={{ padding: '1px 3px', fontSize: '0.9rem' }}
                        onClick={() => void updateRecord(m.id, (c) => ({ ...c, payload: { ...c.payload, rating: star } }))}
                        aria-label={`Rate ${star} stars`}
                      >
                        {star <= (p.rating || 0) ? '★' : '☆'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hobby Project Tracker */}
      <div className="dp-card dp-stack">
        <h4>Hobby Project Tracker</h4>
        <form
          className="dp-row"
          onSubmit={guardForm('form-3', async (e) => {
            e.preventDefault();
            if (!hobbyTitle.trim()) return;
            await createRecord('hobby_project', hobbyTitle.trim(), {
              supplies: hobbySupplies.split(',').map((s) => s.trim()).filter(Boolean),
              hoursInvested: 0,
              cost: 0,
            });
            setHobbyTitle('');
            setHobbySupplies('');
            pushToast('Added hobby project');
          })}
        >
          <input className="dp-input" style={{ flex: 1 }} placeholder="Project (e.g., Watercolor Sketchbook)" value={hobbyTitle} onChange={(e) => setHobbyTitle(e.target.value)} />
          <input className="dp-input" style={{ flex: 1 }} placeholder="Supplies (comma separated)" value={hobbySupplies} onChange={(e) => setHobbySupplies(e.target.value)} />
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add Project</button>
        </form>
        {hobbies.map((h) => {
          const p = h.payload as { supplies?: string[]; hoursInvested?: number; cost?: number };
          return (
            <div key={h.id} className="dp-between" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
              <div>
                <strong>{h.title}</strong>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  Supplies: {(p.supplies ?? []).join(', ') || 'None'} · {p.hoursInvested ?? 0} hrs invested
                </div>
              </div>
              <div className="dp-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => void updateRecord(h.id, (c) => ({ ...c, payload: { ...c.payload, hoursInvested: (p.hoursInvested ?? 0) + 1 } }))}
                >
                  +1 hr
                </button>
                <button type="button" className="dp-icon-btn" title="Delete hobby project" onClick={() => void softDeleteRecord(h.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
