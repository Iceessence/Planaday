import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso } from '../../core/temporal';
import { computeDurationAnalytics } from '../../core/taskScheduler';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import type { ChorePayload, DiaryPayload, FoodLogPayload, LifeRecord, TaskPayload } from '../../core/types';

type PeriodPreset = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

function computeDateRange(preset: PeriodPreset, todayIso: string, customStart: string, customEnd: string): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
} {
  if (preset === 'day') {
    return { start: todayIso, end: todayIso, prevStart: addDaysIso(todayIso, -1), prevEnd: addDaysIso(todayIso, -1), label: 'Today' };
  }
  if (preset === 'week') {
    return { start: addDaysIso(todayIso, -6), end: todayIso, prevStart: addDaysIso(todayIso, -13), prevEnd: addDaysIso(todayIso, -7), label: 'Last 7 Days' };
  }
  if (preset === 'month') {
    return { start: addDaysIso(todayIso, -29), end: todayIso, prevStart: addDaysIso(todayIso, -59), prevEnd: addDaysIso(todayIso, -30), label: 'Last 30 Days' };
  }
  if (preset === 'quarter') {
    return { start: addDaysIso(todayIso, -89), end: todayIso, prevStart: addDaysIso(todayIso, -179), prevEnd: addDaysIso(todayIso, -90), label: 'Last 90 Days' };
  }
  if (preset === 'year') {
    return { start: addDaysIso(todayIso, -364), end: todayIso, prevStart: addDaysIso(todayIso, -729), prevEnd: addDaysIso(todayIso, -365), label: 'Last 365 Days' };
  }
  if (preset === 'custom') {
    const s = customStart || addDaysIso(todayIso, -14);
    const e = customEnd || todayIso;
    const span = Math.max(1, Math.round((Date.parse(e) - Date.parse(s)) / 86400000) + 1);
    return { start: s, end: e, prevStart: addDaysIso(s, -span), prevEnd: addDaysIso(s, -1), label: `${s} → ${e}` };
  }
  return { start: '1970-01-01', end: '2999-12-31', prevStart: '1900-01-01', prevEnd: '1969-12-31', label: 'All Recorded History' };
}

/**
 * Comprehensive Statistics, Reports, Historical Analytics & Automatic Summaries (Section 20.1–20.4)
 */
export const ReportsView: React.FC = () => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const [period, setPeriod] = useState<PeriodPreset>('month');
  const [customStart, setCustomStart] = useState(() => addDaysIso(logicalToday, -14));
  const [customEnd, setCustomEnd] = useState(logicalToday);
  const [comparePrev, setComparePrev] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [digestType, setDigestType] = useState<'week' | 'month' | 'year'>('week');

  const range = useMemo(
    () => computeDateRange(period, logicalToday, customStart, customEnd),
    [period, logicalToday, customStart, customEnd]
  );

  const tasks = useMemo(() => records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>, [records]);
  const chores = useMemo(() => records.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>, [records]);
  const diaries = useMemo(() => records.filter((r) => r.type === 'diary') as Array<LifeRecord<DiaryPayload>>, [records]);
  const foods = useMemo(() => records.filter((r) => r.type === 'food_log') as Array<LifeRecord<FoodLogPayload>>, [records]);

  const computePeriodMetrics = (s: string, e: string) => {
    const inWin = (iso?: string | null) => Boolean(iso && iso.slice(0, 10) >= s && iso.slice(0, 10) <= e);
    const catTasks = categoryFilter === 'all' ? tasks : tasks.filter((t) => (t.category || t.payload.taskType || 'General') === categoryFilter);
    const created = catTasks.filter((t) => inWin(t.createdAt)).length;
    const completed = catTasks.filter((t) => t.status === 'done' && inWin(t.payload.completedAt || t.updatedAt)).length;
    const remaining = catTasks.filter((t) => t.status === 'active').length;
    const overdue = catTasks.filter((t) => t.status === 'active' && t.dueDate && t.dueDate < logicalToday).length;
    const completionPct = created + completed > 0 ? Math.round((completed / Math.max(1, completed + remaining)) * 100) : 0;

    let choresCompleted = 0;
    let choresOnTime = 0;
    for (const c of chores) {
      for (const comp of c.payload.completions ?? []) {
        if (comp.completedDate >= s && comp.completedDate <= e) {
          choresCompleted++;
          if (comp.wasOnTime !== false) choresOnTime++;
        }
      }
    }

    const dur = computeDurationAnalytics(catTasks, chores, { startDate: s, endDate: e });

    const byPriority: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
    for (const t of catTasks) {
      if (t.status === 'done' && inWin(t.payload.completedAt || t.updatedAt)) {
        const p = t.priority || 'none';
        byPriority[p] = (byPriority[p] ?? 0) + 1;
      }
    }

    // Lab metrics
    const labSamples = records.filter((r) => r.type === 'lab_sample' && inWin(r.payload.dateReceived));
    const labCompletedSamples = labSamples.filter((x) => x.payload.testingStatus === 'completed');
    const avgTatDays =
      labCompletedSamples.length > 0
        ? Math.round((labCompletedSamples.reduce((sum, x) => sum + Number(x.payload.actualTatDays ?? 0), 0) / labCompletedSamples.length) * 10) / 10
        : null;
    const labSubDelayed = records.filter(
      (r) => r.type === 'lab_subcontract' && r.payload.resultStatus !== 'received' && r.payload.expectedDate < logicalToday
    ).length;
    const labHours = records
      .filter((r) => r.type === 'lab_work_hour' && inWin(r.payload.date))
      .reduce((sum, r) => sum + Number(r.payload.netHours ?? 0), 0);
    const labSpend = records
      .filter((r) => r.type === 'lab_order' && inWin(r.payload.purchaseDate))
      .reduce((sum, r) => sum + Number(r.payload.totalPrice ?? 0), 0);
    const labCalTotal = records.filter((r) => r.type === 'lab_calibration').length;
    const labCalPassed = records.filter((r) => r.type === 'lab_calibration' && r.payload.status === 'passed').length;

    const periodDiaries = diaries.filter((d) => d.payload.date >= s && d.payload.date <= e);
    const periodMeals = foods.filter((f) => f.payload.date >= s && f.payload.date <= e);

    return {
      created,
      completed,
      remaining,
      overdue,
      completionPct,
      choresCompleted,
      choresOnTime,
      dur,
      byPriority,
      labSamplesTotal: labSamples.length,
      labSamplesDone: labCompletedSamples.length,
      avgTatDays,
      labSubDelayed,
      labHours,
      labSpend,
      labCalTotal,
      labCalPassed,
      diaryEntries: periodDiaries.length,
      mealsLogged: periodMeals.length,
    };
  };

  const cur = useMemo(() => computePeriodMetrics(range.start, range.end), [range, tasks, chores, diaries, foods, records, categoryFilter, logicalToday]);
  const prev = useMemo(() => comparePrev ? computePeriodMetrics(range.prevStart, range.prevEnd) : cur, [comparePrev, cur, range, tasks, chores, diaries, foods, records, categoryFilter, logicalToday]);

  const deltaBadge = (a: number, b: number) => {
    if (!comparePrev || period === 'all') return null;
    const diff = a - b;
    return (
      <span className="dp-pill" style={{ fontSize: '0.72rem', color: diff >= 0 ? 'var(--dp-ok)' : 'var(--dp-warn)' }}>
        {diff >= 0 ? `+${diff}` : diff} vs prior
      </span>
    );
  };

  const exportReportCsv = () => {
    const csv = recordsToCsv(
      ['Metric', 'CurrentPeriod', 'PriorPeriod'],
      [
        ['Period', range.label, `${range.prevStart}..${range.prevEnd}`],
        ['Tasks Created', cur.created, prev.created],
        ['Tasks Completed', cur.completed, prev.completed],
        ['Tasks Remaining', cur.remaining, prev.remaining],
        ['Tasks Overdue', cur.overdue, prev.overdue],
        ['Chores Completed', cur.choresCompleted, prev.choresCompleted],
        ['Total Recorded Minutes', cur.dur.totalMinutes, prev.dur.totalMinutes],
        ['Avg Focused Minutes', cur.dur.avgUndistractedMin ?? '', prev.dur.avgUndistractedMin ?? ''],
        ['Avg Distracted Minutes', cur.dur.avgDistractedMin ?? '', prev.dur.avgDistractedMin ?? ''],
        ['Lab Samples Received', cur.labSamplesTotal, prev.labSamplesTotal],
        ['Lab Samples Completed', cur.labSamplesDone, prev.labSamplesDone],
        ['Lab Work Hours', cur.labHours.toFixed(2), prev.labHours.toFixed(2)],
        ['Lab Purchasing Spend ($)', cur.labSpend.toFixed(2), prev.labSpend.toFixed(2)],
      ]
    );
    triggerBrowserDownload(csv, `planaday-report-${period}-${logicalToday}.csv`, 'text/csv');
    pushToast('Exported comprehensive analytics CSV!');
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 16 }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>
            <BarChart3 size={20} style={{ verticalAlign: '-3px' }} /> Statistics, Reports &amp; Historical Analytics
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Personal productivity, distracted vs. focused duration comparisons, laboratory reports, and automatic digests.
          </p>
        </div>
        <div className="dp-row" style={{ gap: 6 }}>
          <button type="button" className="dp-btn dp-btn-sm" onClick={exportReportCsv}><Download size={13} /> Export CSV</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => window.print()}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      {/* Period & Filter Controls (Section 20.1) */}
      <div className="dp-card dp-row" style={{ padding: 12, flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
        {(['day', 'week', 'month', 'quarter', 'year', 'all', 'custom'] as PeriodPreset[]).map((p) => (
          <button key={p} type="button" className={`dp-btn dp-btn-sm ${period === p ? 'dp-btn-primary' : ''}`} onClick={() => setPeriod(p)} style={{ textTransform: 'capitalize' }}>
            {p}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span>to</span>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
        <select aria-label="Filter category" className="dp-select" style={{ width: 'auto' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories / Types</option>
          {Array.from(new Set(tasks.map((t) => t.category || t.payload.taskType || 'General'))).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="dp-row" style={{ gap: 5, cursor: 'pointer', marginInlineStart: 'auto' }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          <span>Compare vs. Previous Period</span>
        </label>
      </div>

      {/* Task & Chore KPI Grid (Section 20.2) */}
      <div className="dp-grid-4" style={{ gap: 10 }}>
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Tasks Completed / Created</span>
          <strong style={{ fontSize: '1.3rem' }}>{cur.completed} / {cur.created}</strong>
          {deltaBadge(cur.completed, prev.completed)}
        </div>
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Remaining / Hard Overdue</span>
          <strong style={{ fontSize: '1.3rem' }}>{cur.remaining} <span style={{ color: cur.overdue ? 'var(--dp-danger)' : undefined }}>({cur.overdue} late)</span></strong>
          <span className="dp-muted" style={{ fontSize: '0.75rem' }}>Completion rate: {cur.completionPct}%</span>
        </div>
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Chores Completed (On-Time)</span>
          <strong style={{ fontSize: '1.3rem' }}>{cur.choresCompleted} ({cur.choresOnTime})</strong>
          {deltaBadge(cur.choresCompleted, prev.choresCompleted)}
        </div>
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.76rem' }}>Total Recorded Time</span>
          <strong style={{ fontSize: '1.3rem' }}>{cur.dur.totalMinutes} min</strong>
          <span className="dp-muted" style={{ fontSize: '0.75rem' }}>Fastest {cur.dur.fastestMin ?? '—'}m · Longest {cur.dur.longestMin ?? '—'}m</span>
        </div>
      </div>

      {/* Distracted vs. Undistracted Duration Analytics (Sections 9.6 & 20.2) */}
      <div className="dp-grid-2" style={{ gap: 12 }}>
        <section className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
          <h4>🧠 Focused vs. Distracted Completion Times</h4>
          <div className="dp-grid-3" style={{ gap: 8, fontSize: '0.84rem' }}>
            <div><span className="dp-muted">All Avg:</span><br /><strong>{cur.dur.avgAllMin ?? '—'} min</strong></div>
            <div><span className="dp-muted">Undistracted ({cur.dur.undistractedCount}):</span><br /><strong style={{ color: 'var(--dp-ok)' }}>{cur.dur.avgUndistractedMin ?? '—'} min</strong></div>
            <div><span className="dp-muted">Distracted ({cur.dur.distractedCount}):</span><br /><strong style={{ color: 'var(--dp-warn)' }}>{cur.dur.avgDistractedMin ?? '—'} min</strong></div>
          </div>
          <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
            Estimated avg: <strong>{cur.dur.avgEstimatedMin ?? '—'} min</strong> · Total distraction logged: <strong>{cur.dur.totalDistractionMin} min</strong>
          </div>
          {cur.dur.byLabel.length > 0 && (
            <div className="dp-stack" style={{ gap: 4, borderTop: '1px dashed var(--dp-border)', paddingTop: 6, fontSize: '0.8rem' }}>
              <strong>Learned Averages by Task / Chore Type:</strong>
              {cur.dur.byLabel.slice(0, 6).map((b) => (
                <div key={b.label} className="dp-between">
                  <span>{b.label} ({b.count}×)</span>
                  <span>Avg {b.avgMin}m{b.undistractedAvgMin !== null ? ` · Focused ${b.undistractedAvgMin}m` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Laboratory Management Report (Section 20.3) */}
        <section className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
          <h4>🧪 Laboratory Operations Report ({range.label})</h4>
          <div className="dp-grid-2" style={{ gap: 8, fontSize: '0.84rem' }}>
            <div>Samples Received / Done: <strong>{cur.labSamplesTotal} / {cur.labSamplesDone}</strong></div>
            <div>Avg Turnaround (TAT): <strong>{cur.avgTatDays !== null ? `${cur.avgTatDays}d` : '—'}</strong></div>
            <div>Subcontract Delayed: <strong style={{ color: cur.labSubDelayed ? 'var(--dp-danger)' : undefined }}>{cur.labSubDelayed}</strong></div>
            <div>Analyst Work Hours: <strong>{cur.labHours.toFixed(1)} hrs</strong></div>
            <div>Purchasing Spend: <strong>${cur.labSpend.toFixed(2)}</strong></div>
            <div>Calibrations Passed: <strong>{cur.labCalPassed} / {cur.labCalTotal}</strong></div>
          </div>
        </section>
      </div>

      {/* Automatic Summaries Digest (Section 20.4) */}
      <section className="dp-card dp-stack" style={{ padding: 14, gap: 8, background: 'var(--dp-surface-2)' }}>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h4>✨ Automatic End-of-Period Summary Digest</h4>
          <div className="dp-row" style={{ gap: 4 }}>
            {(['week', 'month', 'year'] as const).map((dt) => (
              <button key={dt} type="button" className={`dp-btn dp-btn-sm ${digestType === dt ? 'dp-btn-primary' : ''}`} onClick={() => setDigestType(dt)}>
                End-of-{dt.charAt(0).toUpperCase() + dt.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const dRange = computeDateRange(digestType, logicalToday, customStart, customEnd);
          const dm = computePeriodMetrics(dRange.start, dRange.end);
          return (
            <div style={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
              During <strong>{dRange.label}</strong> ({dRange.start} to {dRange.end}), you completed{' '}
              <strong>{dm.completed} task(s)</strong> and <strong>{dm.choresCompleted} chore(s)</strong> (logging{' '}
              <strong>{dm.dur.totalMinutes} minutes</strong> of tracked focus time), wrote{' '}
              <strong>{dm.diaryEntries} diary entry(ies)</strong>, logged <strong>{dm.mealsLogged} meal(s)</strong>, and processed{' '}
              <strong>{dm.labSamplesDone}/{dm.labSamplesTotal} laboratory sample(s)</strong> ({dm.labHours.toFixed(1)} lab work hours, ${dm.labSpend.toFixed(2)} lab spend).{' '}
              {dm.remaining > 0 ? `Currently ${dm.remaining} active task(s) remain open (${dm.overdue} past hard deadline).` : 'Every tracked task is complete!'}
            </div>
          );
        })()}
      </section>
    </div>
  );
};
