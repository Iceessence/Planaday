import { useMinuteClock } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Download, ExternalLink, History, MessageSquareHeart, Sparkles } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { db } from '../../core/db';
import { computeChorePunctualityStats, timeToMinutes } from '../../core/planActions';
import { updateRecord } from '../../core/repository';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type {
  CalendarEventPayload,
  ChorePayload,
  EventRetrospective,
  LifeRecord,
  TaskPayload,
} from '../../core/types';

interface HistoryEntry {
  id: string;
  kind: 'task' | 'chore' | 'event' | 'timer';
  date: string;
  timestamp: string;
  title: string;
  badge: string;
  detail?: string;
  eventRecord?: LifeRecord<CalendarEventPayload>;
}

const OUTCOMES: Array<EventRetrospective['outcome']> = ['Great', 'Good', 'Okay', 'Tough'];

export const HistoryView: React.FC = () => {
  const { settings, records, logicalToday, openEventInCalendar, pushToast } = useApp();
  const [filterKind, setFilterKind] = useState<'all' | 'task' | 'chore' | 'event' | 'timer'>('all');
  const [search, setSearch] = useState('');
  const [retroEvent, setRetroEvent] = useState<LifeRecord<CalendarEventPayload> | null>(null);
  const [retroOutcome, setRetroOutcome] = useState<EventRetrospective['outcome']>('Good');
  const [retroRating, setRetroRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [retroNote, setRetroNote] = useState('');

  const timeLedger = useLiveQuery(() => db.timeLedger.orderBy('startedAt').reverse().filter(entry => entry.workspaceId === settings.activeWorkspaceId).limit(100).toArray(), [settings.activeWorkspaceId]) ?? [];

  const chores = useMemo(
    () => records.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>,
    [records]
  );
  const punctuality = useMemo(() => computeChorePunctualityStats(chores), [chores]);

  const events = useMemo(
    () => records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>,
    [records]
  );

  // Past events awaiting a "How did it go?" check-in
  const clock = useMinuteClock();
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const unreviewedPastEvents = useMemo(() => {
    return events
      .filter((ev) => {
        if (ev.payload.retrospective || ev.payload.eventStatus === 'canceled') return false;
        if ((ev.payload.endDate || ev.payload.startDate) < logicalToday) return true;
        if ((ev.payload.endDate || ev.payload.startDate) === logicalToday && !ev.payload.allDay && ev.payload.endTime) {
          return timeToMinutes(ev.payload.endTime) <= nowMin;
        }
        return false;
      })
      .sort((a, b) => b.payload.startDate.localeCompare(a.payload.startDate))
      .slice(0, 6);
  }, [events, logicalToday, nowMin]);

  const entries = useMemo<HistoryEntry[]>(() => {
    const list: HistoryEntry[] = [];

    // 1. Completed Tasks
    for (const t of records.filter((r) => r.type === 'task' && r.status === 'done') as Array<LifeRecord<TaskPayload>>) {
      const ts = t.payload.completedAt || t.updatedAt;
      list.push({
        id: `task-${t.id}`,
        kind: 'task',
        date: ts.slice(0, 10),
        timestamp: ts,
        title: t.title,
        badge: 'Completed Task',
        detail: t.category ? `Category: ${t.category}` : undefined,
      });
    }

    // 2. Chore Completion Ledger (with On-Time vs Late punctuality!)
    for (const c of chores) {
      for (const cmp of c.payload.completions ?? []) {
        const onTime =
          cmp.wasOnTime !== undefined
            ? cmp.wasOnTime
            : cmp.scheduledDueDate
              ? cmp.completedDate <= cmp.scheduledDueDate
              : true;
        const deltaStr =
          cmp.daysDelta !== undefined && cmp.daysDelta > 0
            ? `${cmp.daysDelta}d late`
            : 'On time ✓';
        list.push({
          id: `chore-${c.id}-${cmp.id}`,
          kind: 'chore',
          date: cmp.completedDate,
          timestamp: cmp.completedAt || `${cmp.completedDate}T12:00:00Z`,
          title: c.title,
          badge: onTime ? `Chore · On time ✓` : `Chore · ${deltaStr}`,
          detail: `${c.payload.room}${cmp.minutesSpent ? ` · ${cmp.minutesSpent}m` : ''}${cmp.scheduledDueDate ? ` · Due ${cmp.scheduledDueDate}` : ''}`,
        });
      }
    }

    // 3. Past / Reviewed Events
    for (const ev of events) {
      if (ev.payload.eventStatus === 'canceled' && !ev.payload.retrospective) continue;
      const isPast =
        (ev.payload.endDate || ev.payload.startDate) < logicalToday ||
        ((ev.payload.endDate || ev.payload.startDate) === logicalToday && !ev.payload.allDay && ev.payload.endTime && timeToMinutes(ev.payload.endTime) <= nowMin);
      if (!isPast && !ev.payload.retrospective) continue;
      const r = ev.payload.retrospective;
      list.push({
        id: `ev-${ev.id}`,
        kind: 'event',
        date: ev.payload.startDate,
        timestamp: r?.loggedAt || `${ev.payload.startDate}T${ev.payload.endTime || '23:59'}:00`,
        title: `${ev.payload.emoji ? `${ev.payload.emoji} ` : ''}${ev.title}`,
        badge: r ? `Event · ${r.outcome} (${'★'.repeat(r.rating)})` : 'Past Event · Unreviewed',
        detail: r?.note || (ev.payload.location ? `📍 ${ev.payload.location}` : undefined),
        eventRecord: ev,
      });
    }

    // 4. Time Ledger Sessions
    for (const tl of timeLedger) {
      list.push({
        id: `tl-${tl.id}`,
        kind: 'timer',
        date: tl.date,
        timestamp: tl.endedAt,
        title: tl.label,
        badge: `${tl.sourceType} · ${Math.max(1, Math.round(tl.activeSeconds / 60))}m (${tl.activeSeconds}s)`,
      });
    }

    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [records, chores, events, timeLedger, logicalToday, nowMin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterKind !== 'all' && e.kind !== filterKind) return false;
      if (q && !e.title.toLowerCase().includes(q) && !(e.detail || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, filterKind, search]);

  const openRetro = (ev: LifeRecord<CalendarEventPayload>) => {
    setRetroEvent(ev);
    setRetroOutcome(ev.payload.retrospective?.outcome ?? 'Good');
    setRetroRating(ev.payload.retrospective?.rating ?? 4);
    setRetroNote(ev.payload.retrospective?.note ?? '');
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <History size={20} style={{ verticalAlign: '-3px' }} /> Completion History, Chore Punctuality & Event Reviews
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Everything you completed, how often chores finish on time, and reflections on how events went.
          </p>
        </div>
        <button
          type="button"
          className="dp-btn dp-btn-sm"
          onClick={() => {
            const csv = recordsToCsv(
              ['Date', 'Type', 'Title', 'StatusOrRating', 'Details'],
              filtered.map((x) => [x.date, x.kind, x.title, x.badge, x.detail ?? ''])
            );
            triggerBrowserDownload(csv, `planaday-history-${logicalToday}.csv`, 'text/csv');
            pushToast('Exported Completion History CSV');
          }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="dp-kpi-grid" style={{ marginBottom: 0 }}>
        <div className="dp-kpi-card">
          <span className="dp-kpi-value">{entries.filter((e) => e.kind === 'task').length}</span>
          <span className="dp-kpi-label">Tasks Completed</span>
        </div>
        <div className="dp-kpi-card">
          <span className="dp-kpi-value" style={{ color: 'var(--dp-ok)' }}>
            {punctuality.onTimePct !== null ? `${punctuality.onTimePct}%` : '—'}
          </span>
          <span className="dp-kpi-label">
            Chores Done On Time ({punctuality.onTimeCount}/{punctuality.totalTracked})
          </span>
        </div>
        <div className="dp-kpi-card">
          <span className="dp-kpi-value">{events.filter((e) => e.payload.retrospective).length}</span>
          <span className="dp-kpi-label">Events Reviewed</span>
        </div>
        <div className="dp-kpi-card">
          <span className="dp-kpi-value">{timeLedger.length}</span>
          <span className="dp-kpi-label">Timed Focus Sessions</span>
        </div>
      </div>

      {/* Prompt to reflect on recent unreviewed events ("How did it go?") */}
      {unreviewedPastEvents.length > 0 && (
        <div className="dp-card dp-stack" style={{ padding: 14, background: 'var(--dp-surface-2)' }}>
          <strong style={{ fontSize: '0.92rem' }}>
            <MessageSquareHeart size={15} style={{ verticalAlign: '-2px' }} /> How did these recent events go?
          </strong>
          <div className="dp-row" style={{ gap: 8 }}>
            {unreviewedPastEvents.map((ev) => (
              <button key={ev.id} type="button" className="dp-btn dp-btn-sm" onClick={() => openRetro(ev)}>
                {ev.payload.emoji || '📌'} {ev.title} ({ev.payload.startDate}) — Review
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-Chore On-Time Punctuality Breakdown */}
      {punctuality.perChore.some((c) => c.total > 0) && (
        <div className="dp-card dp-stack" style={{ padding: 14 }}>
          <strong><Sparkles size={14} /> Chore On-Time Rate Breakdown</strong>
          <div className="dp-grid-2" style={{ gap: 10 }}>
            {punctuality.perChore
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.choreId} className="dp-stack" style={{ gap: 4 }}>
                  <div className="dp-between" style={{ fontSize: '0.85rem' }}>
                    <span>
                      <strong>{c.title}</strong> <span className="dp-muted">({c.room})</span>
                    </span>
                    <span className="dp-pill">
                      {c.onTimePct}% on time ({c.onTime}/{c.total})
                    </span>
                  </div>
                  <div className="dp-progress-track">
                    <div
                      className="dp-progress-fill"
                      style={{
                        width: `${c.onTimePct ?? 0}%`,
                        background: (c.onTimePct ?? 0) >= 75 ? 'var(--dp-ok)' : 'var(--dp-warn)',
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="dp-row">
        {(
          [
            ['all', 'All History'],
            ['task', 'Tasks'],
            ['chore', 'Chores'],
            ['event', 'Events'],
            ['timer', 'Timers'],
          ] as const
        ).map(([k, lbl]) => (
          <button key={k} type="button" className={`dp-btn dp-btn-sm ${filterKind === k ? 'dp-btn-primary' : ''}`} onClick={() => setFilterKind(k)}>
            {lbl}
          </button>
        ))}
        <input
          className="dp-input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Search history…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Reverse-Chronological Completed Feed */}
      {filtered.length === 0 ? (
        <div className="dp-empty">
          <CheckCircle2 size={22} />
          <strong>No matching history yet</strong>
          <span className="dp-muted">Check off tasks, finish chores, run timers, or review events to build your timeline.</span>
        </div>
      ) : (
        <div className="dp-stack" style={{ gap: 8 }}>
          {filtered.map((item) => (
            <div key={item.id} className="dp-card dp-between" style={{ padding: 12 }}>
              <div>
                <div className="dp-row" style={{ gap: 8 }}>
                  <strong>{item.title}</strong>
                  <span className="dp-pill">{item.badge}</span>
                </div>
                <div className="dp-muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                  {item.date}
                  {item.detail ? ` · ${item.detail}` : ''}
                </div>
              </div>
              {item.eventRecord && (
                <div className="dp-row">
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => openRetro(item.eventRecord!)}>
                    {item.eventRecord.payload.retrospective ? 'Edit Review' : 'How did it go?'}
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Open in Flow Calendar"
                    onClick={() => openEventInCalendar(item.eventRecord!.id, item.eventRecord!.payload.startDate)}
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalDialog open={Boolean(retroEvent)} onClose={() => setRetroEvent(null)} title={`How did "${retroEvent?.title || ''}" go?`}>
        {retroEvent && (
          <div className="dp-stack">
            <div className="dp-row">
              <span className="dp-muted">Outcome:</span>
              {OUTCOMES.map((o) => (
                <button key={o} type="button" className={`dp-btn dp-btn-sm ${retroOutcome === o ? 'dp-btn-primary' : ''}`} onClick={() => setRetroOutcome(o)}>
                  {o}
                </button>
              ))}
            </div>
            <div className="dp-row">
              <span className="dp-muted">Rating:</span>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button key={n} type="button" className={`dp-btn dp-btn-sm ${retroRating === n ? 'dp-btn-primary' : ''}`} onClick={() => setRetroRating(n)}>
                  {'★'.repeat(n)}
                </button>
              ))}
            </div>
            <textarea className="dp-textarea" placeholder="Reflections or next steps…" value={retroNote} onChange={(e) => setRetroNote(e.target.value)} />
            <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={async () => {
                  await updateRecord<CalendarEventPayload>(retroEvent.id, (c) => ({
                    ...c,
                    payload: {
                      ...c.payload,
                      retrospective: {
                        outcome: retroOutcome,
                        rating: retroRating,
                        note: retroNote.trim() || undefined,
                        loggedAt: new Date().toISOString(),
                      },
                    },
                  }));
                  setRetroEvent(null);
                  pushToast(`Saved reflection for "${retroEvent.title}"`);
                }}
              >
                Save Review
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
