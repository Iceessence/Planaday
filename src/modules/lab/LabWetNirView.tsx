import React, { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { computeWetNirComparison, type WetNirPairRecord } from '../../core/labStats';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import type { LifeRecord } from '../../core/types';

function fmtNum(v: number | null, decimals = 3): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(decimals);
}

/**
 * Wet Chemistry vs. NIR Analytical Comparison Workspace (Section 19.14):
 * - Replicate support, outlier exclusion tracking, unit consistency guard
 * - Bias, SD/SEP (n-1), RMSE, Pearson r, OLS slope/intercept, R²
 * - Interactive SVG Scatter Plot (1:1 + OLS line), Residual Plot (±2 SD), & Bias Trend Chart
 */
export const LabWetNirView: React.FC = () => {
  const { records, logicalToday, pushToast } = useApp();

  const [sampleId, setSampleId] = useState('');
  const [commodity, setCommodity] = useState('Corn');
  const [analysis, setAnalysis] = useState('Moisture');
  const [wetMethod, setWetMethod] = useState('AOAC 930.15');
  const [wetVal, setWetVal] = useState('');
  const [nirVal, setNirVal] = useState('');
  const [unit, setUnit] = useState('%');
  const [instrumentId, setInstrumentId] = useState('FOSS DS2500 #1');
  const [calModel, setCalModel] = useState('Corn-2026-v3');
  const [dateTested, setDateTested] = useState(logicalToday);
  const [analyst, setAnalyst] = useState('');
  const [notes, setNotes] = useState('');

  // Filters
  const [fCommodity, setFCommodity] = useState('all');
  const [fAnalysis, setFAnalysis] = useState('all');
  const [fInstrument, setFInstrument] = useState('all');
  const [fModel, setFModel] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const rawRecords = useMemo(
    () =>
      (records.filter((r) => r.type === 'lab_wet_nir') as Array<LifeRecord<Omit<WetNirPairRecord, 'id'>>>).sort((a, b) =>
        (b.payload.dateTested || '').localeCompare(a.payload.dateTested || '')
      ),
    [records]
  );

  const pairs: WetNirPairRecord[] = useMemo(
    () => rawRecords.map((r) => ({ id: r.id, ...r.payload })),
    [rawRecords]
  );

  const filteredPairs = useMemo(
    () =>
      pairs.filter((p) => {
        if (fCommodity !== 'all' && p.commodity !== fCommodity) return false;
        if (fAnalysis !== 'all' && p.analysis !== fAnalysis) return false;
        if (fInstrument !== 'all' && p.instrumentId !== fInstrument) return false;
        if (fModel !== 'all' && p.calibrationModel !== fModel) return false;
        if (fFrom && p.dateTested < fFrom) return false;
        if (fTo && p.dateTested > fTo) return false;
        return true;
      }),
    [pairs, fCommodity, fAnalysis, fInstrument, fModel, fFrom, fTo]
  );

  const stats = useMemo(() => computeWetNirComparison(filteredPairs), [filteredPairs]);

  const parseReplicates = (raw: string): { mean: number; reps: number[] } | null => {
    const nums = raw
      .split(/[,\s;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    return { mean: nums.reduce((a, b) => a + b, 0) / nums.length, reps: nums };
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseReplicates(wetVal);
    const n = parseReplicates(nirVal);
    if (!sampleId.trim() || !w || !n) {
      pushToast('Enter Sample ID plus numeric Wet Chemistry & NIR values (comma-separated replicates supported).', { tone: 'warn' });
      return;
    }
    await createRecord('lab_wet_nir', `${sampleId.trim()} — ${commodity} ${analysis}`, {
      sampleId: sampleId.trim(),
      commodity: commodity.trim() || 'General',
      analysis: analysis.trim() || 'Moisture',
      wetMethod: wetMethod.trim(),
      wetResult: w.mean,
      wetReplicates: w.reps.length > 1 ? w.reps : undefined,
      nirResult: n.mean,
      nirReplicates: n.reps.length > 1 ? n.reps : undefined,
      unit: unit.trim() || '%',
      instrumentId: instrumentId.trim() || 'NIR-1',
      calibrationModel: calModel.trim() || 'Default',
      dateTested: dateTested || logicalToday,
      analyst: analyst.trim() || 'Manager',
      excluded: false,
      notes: notes.trim() || undefined,
    });
    setSampleId('');
    setWetVal('');
    setNirVal('');
    setNotes('');
    pushToast('Recorded Wet Chemistry vs. NIR pair!');
  };

  const handleExportCsv = () => {
    const csv = recordsToCsv(
      ['SampleID', 'Date', 'Commodity', 'Analysis', 'WetMethod', 'WetMean', 'NIRMean', 'Unit', 'SignedDiff', 'AbsDiff', 'PctDiff', 'Instrument', 'CalModel', 'Analyst', 'Excluded', 'Notes'],
      [...stats.points, ...stats.excludedPoints].map((pt) => [
        pt.record.sampleId,
        pt.record.dateTested,
        pt.record.commodity,
        pt.record.analysis,
        pt.record.wetMethod,
        pt.wetMean.toFixed(4),
        pt.nirMean.toFixed(4),
        pt.record.unit,
        pt.signedDiff.toFixed(4),
        pt.absDiff.toFixed(4),
        pt.pctDiff !== null ? pt.pctDiff.toFixed(2) : '',
        pt.record.instrumentId,
        pt.record.calibrationModel,
        pt.record.analyst,
        pt.record.excluded ? 'YES' : 'NO',
        pt.record.notes || '',
      ])
    );
    triggerBrowserDownload(csv, `planaday-wet-vs-nir-${logicalToday}.csv`, 'text/csv');
    pushToast('Exported Wet Chem vs. NIR dataset CSV');
  };

  const uniqueOf = (fn: (p: WetNirPairRecord) => string) => Array.from(new Set(pairs.map(fn).filter(Boolean))).sort();

  return (
    <div className="dp-stack" style={{ gap: 14 }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Wet Chemistry vs. NIR Calibration Comparison</h3>
          <p className="dp-muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
            Compare wet-chemistry reference results against NIR predictions (enter single values or comma-separated replicates e.g. <code>14.2, 14.4</code>).
          </p>
        </div>
        <button type="button" className="dp-btn dp-btn-sm" onClick={handleExportCsv} disabled={filteredPairs.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Add Pair Form */}
      <form className="dp-card dp-stack" style={{ padding: 12, gap: 8 }} onSubmit={handleAdd}>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="dp-input" style={{ width: 130 }} placeholder="Sample ID *" value={sampleId} onChange={(e) => setSampleId(e.target.value)} />
          <input className="dp-input" style={{ width: 120 }} placeholder="Commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)} />
          <input className="dp-input" style={{ width: 120 }} placeholder="Analysis" value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
          <input className="dp-input" style={{ width: 130 }} placeholder="Wet Method" value={wetMethod} onChange={(e) => setWetMethod(e.target.value)} />
          <input className="dp-input" style={{ width: 130 }} placeholder="Wet Result(s) *" value={wetVal} onChange={(e) => setWetVal(e.target.value)} />
          <input className="dp-input" style={{ width: 130 }} placeholder="NIR Result(s) *" value={nirVal} onChange={(e) => setNirVal(e.target.value)} />
          <input className="dp-input" style={{ width: 64 }} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="dp-input" style={{ width: 145 }} placeholder="NIR Instrument ID" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} />
          <input className="dp-input" style={{ width: 145 }} placeholder="NIR Cal / Model ID" value={calModel} onChange={(e) => setCalModel(e.target.value)} />
          <input type="date" className="dp-input" style={{ width: 'auto' }} value={dateTested} onChange={(e) => setDateTested(e.target.value)} />
          <input className="dp-input" style={{ width: 120 }} placeholder="Analyst" value={analyst} onChange={(e) => setAnalyst(e.target.value)} />
          <input className="dp-input" style={{ flex: 1, minWidth: 150 }} placeholder="Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
            <Plus size={14} /> Add Pair
          </button>
        </div>
      </form>

      {/* Filter Bar */}
      <div className="dp-card dp-row" style={{ padding: 10, flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
        <select aria-label="Filter commodity" className="dp-select" style={{ width: 'auto' }} value={fCommodity} onChange={(e) => setFCommodity(e.target.value)}>
          <option value="all">All Commodities</option>
          {uniqueOf((p) => p.commodity).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="Filter analysis" className="dp-select" style={{ width: 'auto' }} value={fAnalysis} onChange={(e) => setFAnalysis(e.target.value)}>
          <option value="all">All Analyses</option>
          {uniqueOf((p) => p.analysis).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="Filter instrument" className="dp-select" style={{ width: 'auto' }} value={fInstrument} onChange={(e) => setFInstrument(e.target.value)}>
          <option value="all">All Instruments</option>
          {uniqueOf((p) => p.instrumentId).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="Filter calibration model" className="dp-select" style={{ width: 'auto' }} value={fModel} onChange={(e) => setFModel(e.target.value)}>
          <option value="all">All Cal Models</option>
          {uniqueOf((p) => p.calibrationModel).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input type="date" className="dp-input" style={{ width: 'auto' }} value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
        <span>to</span>
        <input type="date" className="dp-input" style={{ width: 'auto' }} value={fTo} onChange={(e) => setFTo(e.target.value)} />
      </div>

      {stats.mixedUnitsWarning && (
        <div className="dp-banner danger" style={{ margin: 0 }}>
          Mixed units detected ({stats.units.join(', ')}) — filter to one analysis/unit for meaningful Bias/RMSE statistics!
        </div>
      )}

      {/* Statistical KPI Summary Cards */}
      <div className="dp-grid-4" style={{ gap: 8 }}>
        <div className="dp-card dp-stack" style={{ padding: 10, gap: 2 }}>
          <span className="dp-muted" style={{ fontSize: '0.74rem' }}>Sample Size (Included / Excluded)</span>
          <strong>n = {stats.nIncluded} <span className="dp-muted">({stats.nExcluded} excl.)</span></strong>
        </div>
        <div className="dp-card dp-stack" style={{ padding: 10, gap: 2 }}>
          <span className="dp-muted" style={{ fontSize: '0.74rem' }}>Average Bias (NIR − Wet)</span>
          <strong>{fmtNum(stats.bias)} {stats.units[0] ?? ''}</strong>
        </div>
        <div className="dp-card dp-stack" style={{ padding: 10, gap: 2 }}>
          <span className="dp-muted" style={{ fontSize: '0.74rem' }}>SD of Diff (SEP) / RMSE</span>
          <strong>{fmtNum(stats.sdDiff)} / {fmtNum(stats.rmse)}</strong>
        </div>
        <div className="dp-card dp-stack" style={{ padding: 10, gap: 2 }}>
          <span className="dp-muted" style={{ fontSize: '0.74rem' }}>Correlation r / R²</span>
          <strong>r = {fmtNum(stats.pearsonR, 4)} · R² = {fmtNum(stats.rSquared, 4)}</strong>
        </div>
      </div>

      {stats.slope !== null && stats.intercept !== null && (
        <div className="dp-card" style={{ padding: 10, fontSize: '0.8rem' }}>
          <strong>OLS Regression:</strong>{' '}
          <code>NIR = {stats.slope.toFixed(4)} × Wet {stats.intercept >= 0 ? '+' : '−'} {Math.abs(stats.intercept).toFixed(4)}</code>{' '}
          · Mean Abs Diff: <strong>{fmtNum(stats.meanAbsDiff)}</strong> · Mean |% Diff|: <strong>{fmtNum(stats.meanAbsPctDiff, 2)}%</strong>
          <div className="dp-muted" style={{ marginTop: 4, fontSize: '0.74rem' }}>{stats.methodNotes}</div>
        </div>
      )}

      {/* Scatter Plot + Residual Plot + Bias Trend SVG Charts */}
      {stats.points.length >= 2 && (() => {
        const allVals = stats.points.flatMap((p) => [p.wetMean, p.nirMean]);
        const minV = Math.min(...allVals);
        const maxV = Math.max(...allVals);
        const span = Math.max(0.001, maxV - minV);
        const pad = span * 0.1;
        const lo = minV - pad;
        const hi = maxV + pad;
        const mapX = (v: number) => 36 + ((v - lo) / (hi - lo)) * 244;
        const mapY = (v: number) => 174 - ((v - lo) / (hi - lo)) * 154;

        const maxAbsRes = Math.max(0.01, ...stats.points.map((p) => Math.abs(p.signedDiff)), (stats.sdDiff ?? 0) * 2.2);
        const mapResY = (d: number) => 95 - (d / maxAbsRes) * 75;
        const sortedByDate = [...stats.points].sort((a, b) => a.record.dateTested.localeCompare(b.record.dateTested));

        return (
          <div className="dp-grid-3" style={{ gap: 10 }}>
            {/* 1. Scatter Plot */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 4 }}>
              <strong style={{ fontSize: '0.82rem' }}>Wet Chem vs. NIR Scatter (1:1 dashed + OLS)</strong>
              <svg viewBox="0 0 300 200" style={{ width: '100%', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <line x1={36} y1={174} x2={280} y2={174} stroke="var(--dp-border)" />
                <line x1={36} y1={20} x2={36} y2={174} stroke="var(--dp-border)" />
                {/* 1:1 Identity line */}
                <line x1={mapX(lo)} y1={mapY(lo)} x2={mapX(hi)} y2={mapY(hi)} stroke="#888" strokeDasharray="4 4" strokeWidth={1.2} />
                {/* OLS regression line */}
                {stats.slope !== null && stats.intercept !== null && (
                  <line
                    x1={mapX(lo)}
                    y1={mapY(stats.slope * lo + stats.intercept)}
                    x2={mapX(hi)}
                    y2={mapY(stats.slope * hi + stats.intercept)}
                    stroke="#3b6ea5"
                    strokeWidth={2}
                  />
                )}
                {stats.points.map((pt) => (
                  <circle key={pt.record.id} cx={mapX(pt.wetMean)} cy={mapY(pt.nirMean)} r={4} fill="#a97434">
                    <title>{`${pt.record.sampleId}: Wet=${pt.wetMean.toFixed(2)}, NIR=${pt.nirMean.toFixed(2)}`}</title>
                  </circle>
                ))}
                <text x="155" y="194" fontSize="9" textAnchor="middle" fill="var(--dp-muted)">Wet Chemistry ({stats.units[0] ?? ''})</text>
              </svg>
            </div>

            {/* 2. Residual Plot */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 4 }}>
              <strong style={{ fontSize: '0.82rem' }}>Residual Plot (NIR − Wet vs. Wet, ±2 SD bands)</strong>
              <svg viewBox="0 0 300 200" style={{ width: '100%', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <line x1={36} y1={95} x2={280} y2={95} stroke="#555" strokeWidth={1.2} />
                {stats.sdDiff !== null && stats.bias !== null && (
                  <>
                    <line x1={36} y1={mapResY(stats.bias + 2 * stats.sdDiff)} x2={280} y2={mapResY(stats.bias + 2 * stats.sdDiff)} stroke="#b5453a" strokeDasharray="3 3" />
                    <line x1={36} y1={mapResY(stats.bias - 2 * stats.sdDiff)} x2={280} y2={mapResY(stats.bias - 2 * stats.sdDiff)} stroke="#b5453a" strokeDasharray="3 3" />
                  </>
                )}
                {stats.points.map((pt) => (
                  <circle key={pt.record.id} cx={mapX(pt.wetMean)} cy={mapResY(pt.signedDiff)} r={4} fill="#2f7a78">
                    <title>{`${pt.record.sampleId}: Diff=${pt.signedDiff.toFixed(3)}`}</title>
                  </circle>
                ))}
                <text x="155" y="194" fontSize="9" textAnchor="middle" fill="var(--dp-muted)">Reference Value (0 = zero bias)</text>
              </svg>
            </div>

            {/* 3. Chronological Bias Trend */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 4 }}>
              <strong style={{ fontSize: '0.82rem' }}>Chronological Drift / Trend (NIR − Wet)</strong>
              <svg viewBox="0 0 300 200" style={{ width: '100%', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <line x1={36} y1={95} x2={280} y2={95} stroke="#555" strokeWidth={1.2} />
                <polyline
                  fill="none"
                  stroke="#6b5ca5"
                  strokeWidth={2}
                  points={sortedByDate
                    .map((pt, i) => `${36 + (i / Math.max(1, sortedByDate.length - 1)) * 244},${mapResY(pt.signedDiff)}`)
                    .join(' ')}
                />
                {sortedByDate.map((pt, i) => (
                  <circle
                    key={pt.record.id}
                    cx={36 + (i / Math.max(1, sortedByDate.length - 1)) * 244}
                    cy={mapResY(pt.signedDiff)}
                    r={3.5}
                    fill="#6b5ca5"
                  >
                    <title>{`${pt.record.dateTested} ${pt.record.sampleId}: ${pt.signedDiff.toFixed(3)}`}</title>
                  </circle>
                ))}
                <text x="155" y="194" fontSize="9" textAnchor="middle" fill="var(--dp-muted)">Date Sequence</text>
              </svg>
            </div>
          </div>
        );
      })()}

      {/* Data Table with Outlier Exclusion Toggle */}
      <div className="dp-card" style={{ padding: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--dp-border)', textAlign: 'left' }}>
              <th>Sample</th>
              <th>Date</th>
              <th>Commodity / Analysis</th>
              <th>Wet ({stats.units[0] ?? ''})</th>
              <th>NIR</th>
              <th>Diff (NIR−Wet)</th>
              <th>% Diff</th>
              <th>Instrument / Model</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...stats.points, ...stats.excludedPoints].map((pt) => (
              <tr key={pt.record.id} style={{ borderBottom: '1px dashed var(--dp-border)', opacity: pt.record.excluded ? 0.5 : 1 }}>
                <td><strong>{pt.record.sampleId}</strong></td>
                <td>{pt.record.dateTested}</td>
                <td>{pt.record.commodity} · {pt.record.analysis}</td>
                <td>{pt.wetMean.toFixed(3)}</td>
                <td>{pt.nirMean.toFixed(3)}</td>
                <td style={{ color: Math.abs(pt.signedDiff) > (stats.sdDiff ?? 999) * 2 ? 'var(--dp-danger)' : undefined }}>
                  {pt.signedDiff >= 0 ? '+' : ''}{pt.signedDiff.toFixed(3)} {pt.record.unit}
                </td>
                <td>{pt.pctDiff !== null ? `${pt.pctDiff.toFixed(1)}%` : '—'}</td>
                <td>{pt.record.instrumentId} / {pt.record.calibrationModel}</td>
                <td>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    style={{ padding: '1px 6px', fontSize: '0.72rem' }}
                    onClick={() =>
                      void updateRecord(pt.record.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, excluded: !pt.record.excluded },
                      }))
                    }
                  >
                    {pt.record.excluded ? 'Excluded (Include)' : 'Included (Exclude)'}
                  </button>
                </td>
                <td>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(pt.record.id)} aria-label="Trash comparison">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
