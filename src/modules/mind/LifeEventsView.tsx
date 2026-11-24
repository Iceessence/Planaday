import React, { useMemo, useState } from 'react';
import { Cake, Gift, Hourglass, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { diffDaysIso, resolveAnnualFloatingDate } from '../../core/temporal';
import type { LifeRecord } from '../../core/types';

const OCCASION_CATEGORIES = [
  'Birthday',
  'Wedding Anniversary',
  'Dating Anniversary',
  'Memorial',
  'Work Milestone',
  'Holiday',
  'Family Gathering',
  'Graduation',
  'Other',
];

export const LifeEventsView: React.FC<{ initialTab?: 'occasions' | 'countdowns' }> = ({ initialTab = 'occasions' }) => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const [tab, setTab] = useState<'occasions' | 'countdowns'>(initialTab);
  const [catFilter, setCatFilter] = useState('All');

  // Occasion creator
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Birthday');
  const [month, setMonth] = useState(12);
  const [day, setDay] = useState(15);
  const [birthYear, setBirthYear] = useState('');
  const [feb29Policy, setFeb29Policy] = useState<'feb28' | 'mar1' | 'skip'>('feb28');
  const [giftIdeas, setGiftIdeas] = useState('');

  // Standalone countdown creator
  const [cdTitle, setCdTitle] = useState('');
  const [cdDate, setCdDate] = useState(logicalToday);

  const lifeEvents = useMemo(() => records.filter((r) => r.type === 'life_event'), [records]);
  const standaloneCountdowns = useMemo(() => records.filter((r) => r.type === 'countdown'), [records]);

  const currentYear = Number(logicalToday.slice(0, 4));

  const enrichedOccasions = useMemo(() => {
    return lifeEvents
      .map((ev) => {
        const p = ev.payload as {
          month: number;
          day: number;
          birthYear?: number | null;
          feb29Policy?: 'feb28' | 'mar1' | 'skip';
          muted?: boolean;
          giftIdeas?: string;
          rsvpCount?: number;
          budget?: number;
        };
        let nextIso = resolveAnnualFloatingDate(p.month || 1, p.day || 1, currentYear, p.feb29Policy ?? 'feb28');
        if (!nextIso || nextIso < logicalToday) {
          nextIso = resolveAnnualFloatingDate(p.month || 1, p.day || 1, currentYear + 1, p.feb29Policy ?? 'feb28');
        }
        const daysAway = nextIso ? diffDaysIso(logicalToday, nextIso) : 999;
        // Optional birth year — NEVER invent ages when birthYear is omitted! (Section 12.04)
        const turningAge =
          p.birthYear && nextIso ? Number(nextIso.slice(0, 4)) - p.birthYear : null;
        return { ev, p, nextIso, daysAway, turningAge };
      })
      .sort((a, b) => a.daysAway - b.daysAway);
  }, [lifeEvents, currentYear, logicalToday]);

  const nextBirthday = enrichedOccasions.find((x) => x.ev.category === 'Birthday' && !x.p.muted);

  // Derived Countdowns from Trips, Goals, Life Events + Standalone (Section 12.04)
  const derivedCountdowns = useMemo(() => {
    const out: Array<{ id: string; title: string; targetDate: string; source: string; standalone: boolean }> = [];
    for (const cd of standaloneCountdowns) {
      out.push({
        id: cd.id,
        title: cd.title,
        targetDate: String((cd.payload as { targetDate?: string }).targetDate ?? logicalToday),
        source: 'Countdown',
        standalone: true,
      });
    }
    for (const occ of enrichedOccasions) {
      if (occ.nextIso && !occ.p.muted) {
        out.push({ id: `der-${occ.ev.id}`, title: occ.ev.title, targetDate: occ.nextIso, source: occ.ev.category || 'Occasion', standalone: false });
      }
    }
    for (const g of records.filter((r) => r.type === 'goal' && r.status === 'active')) {
      const td = (g.payload as { targetDate?: string }).targetDate;
      if (td) out.push({ id: `der-${g.id}`, title: g.title, targetDate: td, source: 'Goal', standalone: false });
    }
    for (const tr of records.filter((r) => r.type === 'trip')) {
      const sd = (tr.payload as { startDate?: string }).startDate;
      if (sd) out.push({ id: `der-${tr.id}`, title: tr.title, targetDate: sd, source: 'Trip', standalone: false });
    }
    return out.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  }, [standaloneCountdowns, enrichedOccasions, records, logicalToday]);

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>Life Events, Birthdays, Anniversaries & Countdowns</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Timezone-independent floating local dates · Optional birth year (never invents ages)
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className={`dp-btn dp-btn-sm ${tab === 'occasions' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('occasions')}>
            <Cake size={14} /> Occasions
          </button>
          <button type="button" className={`dp-btn dp-btn-sm ${tab === 'countdowns' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('countdowns')}>
            <Hourglass size={14} /> Countdowns ({derivedCountdowns.length})
          </button>
        </div>
      </div>

      {tab === 'occasions' ? (
        <>
          {nextBirthday && (
            <div className="dp-card dp-between" style={{ background: 'var(--dp-highlight)', color: 'var(--dp-on-highlight)', padding: 14 }}>
              <div>
                <strong>🎂 Next Birthday Spotlight: {nextBirthday.ev.title}</strong>
                <div style={{ fontSize: '0.86rem' }}>
                  {nextBirthday.nextIso} ({nextBirthday.daysAway === 0 ? 'Today!' : `in ${nextBirthday.daysAway} days`})
                  {nextBirthday.turningAge !== null ? ` · Turning ${nextBirthday.turningAge}` : ''}
                </div>
              </div>
              {nextBirthday.p.giftIdeas && <span className="dp-pill">🎁 {nextBirthday.p.giftIdeas}</span>}
            </div>
          )}

          <form
            className="dp-card dp-stack"
            style={{ padding: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              await createRecord(
                'life_event',
                title.trim(),
                {
                  month,
                  day,
                  birthYear: birthYear.trim() ? Number(birthYear) : null,
                  feb29Policy,
                  giftIdeas: giftIdeas.trim() || undefined,
                  muted: false,
                },
                { category }
              );
              setTitle('');
              setBirthYear('');
              setGiftIdeas('');
              pushToast('Saved life event', { canUndo: true });
            }}
          >
            <div className="dp-row">
              <input className="dp-input" style={{ flex: 2 }} placeholder="Occasion (e.g., Maya's Birthday)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input list="dp-occasion-cats" aria-label="Category" className="dp-input" style={{ width: 155 }} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (pick or type)…" />
              <datalist id="dp-occasion-cats">
                {OCCASION_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Mo:</span>
                <input type="number" min={1} max={12} className="dp-input" style={{ width: 58 }} value={month} onChange={(e) => setMonth(Number(e.target.value) || 1)} title="Month (1-12)" />
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Day:</span>
                <input type="number" min={1} max={31} className="dp-input" style={{ width: 58 }} value={day} onChange={(e) => setDay(Number(e.target.value) || 1)} title="Day (1-31)" />
              </label>
              <button type="submit" className="dp-btn dp-btn-primary">
                <Plus size={14} /> Add
              </button>
            </div>
            <details className="dp-details">
              <summary>More options (Optional Birth Year, Feb 29 Policy, Gift Ideas)</summary>
              <div className="dp-row" style={{ marginTop: 8 }}>
                <input type="number" className="dp-input" style={{ width: 140 }} placeholder="Birth year (optional)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
                <select aria-label="Feb 29 policy" className="dp-select" style={{ width: 'auto' }} value={feb29Policy} onChange={(e) => setFeb29Policy(e.target.value as 'feb28' | 'mar1' | 'skip')}>
                  <option value="feb28">Feb 29 → Feb 28 on non-leap years</option>
                  <option value="mar1">Feb 29 → Mar 1 on non-leap years</option>
                  <option value="skip">Feb 29 → Skip non-leap years</option>
                </select>
                <input className="dp-input" style={{ flex: 1 }} placeholder="Gift ideas…" value={giftIdeas} onChange={(e) => setGiftIdeas(e.target.value)} />
              </div>
            </details>
          </form>

          <div className="dp-row">
            {['All', ...OCCASION_CATEGORIES].map((c) => (
              <button key={c} type="button" className={`dp-btn dp-btn-sm ${catFilter === c ? 'dp-btn-primary' : ''}`} onClick={() => setCatFilter(c)}>
                {c}
              </button>
            ))}
          </div>

          <div className="dp-stack">
            {enrichedOccasions
              .filter((x) => catFilter === 'All' || x.ev.category === catFilter)
              .map(({ ev, p, nextIso, daysAway, turningAge }) => (
                <div key={ev.id} className="dp-card dp-between" style={{ padding: 12, opacity: p.muted ? 0.55 : 1 }}>
                  <div>
                    <strong>{ev.title}</strong>
                    <div className="dp-row" style={{ marginTop: 4 }}>
                      <span className="dp-pill">{ev.category}</span>
                      <span className="dp-pill">{nextIso} ({daysAway}d)</span>
                      {turningAge !== null && <span className="dp-pill highlight">Age {turningAge}</span>}
                      {p.giftIdeas && <span className="dp-muted" style={{ fontSize: '0.82rem' }}><Gift size={12} /> {p.giftIdeas}</span>}
                    </div>
                  </div>
                  <div className="dp-row">
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => void updateRecord(ev.id, (c: LifeRecord) => ({ ...c, payload: { ...c.payload, muted: !p.muted } }))}
                    >
                      {p.muted ? 'Unmute' : 'Gentle Mute'}
                    </button>
                    <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(ev.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      ) : (
        <div className="dp-stack">
          <form
            className="dp-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cdTitle.trim()) return;
              await createRecord('countdown', cdTitle.trim(), { targetDate: cdDate });
              setCdTitle('');
              pushToast('Countdown created', { canUndo: true });
            }}
          >
            <input className="dp-input" style={{ flex: 2 }} placeholder="Standalone countdown title…" value={cdTitle} onChange={(e) => setCdTitle(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={cdDate} onChange={(e) => setCdDate(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary">Add Countdown</button>
          </form>

          <div className="dp-grid-3">
            {derivedCountdowns.map((c) => {
              const days = diffDaysIso(logicalToday, c.targetDate);
              return (
                <div key={c.id} className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
                  <div className="dp-between">
                    <span className="dp-pill">{c.source}</span>
                    {c.standalone && (
                      <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(c.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <strong>{c.title}</strong>
                  <div className="dp-kpi-value">
                    {days === 0 ? 'Today!' : days > 0 ? `${days} days` : `${Math.abs(days)}d ago`}
                  </div>
                  <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Target: {c.targetDate}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
