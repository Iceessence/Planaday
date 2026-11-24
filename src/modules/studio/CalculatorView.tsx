import React, { useMemo, useState } from 'react';
import {
  Beaker,
  Bookmark,
  Calculator,
  Copy,
  FilePlus,
  Globe,
  LineChart,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Sigma,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord } from '../../core/repository';
import {
  MATH_CONSTANTS,
  OFFLINE_FALLBACK_FX_RATES,
  UNIT_CATEGORIES,
  calcDilutionV1,
  calcPercentRecovery,
  calcRsdStats,
  complexOp,
  convertUnitValue,
  evaluateMathExpression,
  findNumericalRoots,
  formatSigFigs,
  matrixDeterminant,
  numericalDerivative,
  numericalIntegral,
  toEngineeringNotation,
  type AngleUnit,
} from '../../core/mathEngine';

type CalcTab = 'standard' | 'scientific' | 'graph' | 'currency' | 'units';

interface GraphSeries {
  id: string;
  label: string;
  mode: 'cartesian' | 'parametric' | 'polar' | 'ineq_gt' | 'ineq_lt';
  expr: string;
  exprY?: string;
  color: string;
  visible: boolean;
}

function toFractionApprox(val: number, maxDen = 1000): string {
  if (!Number.isFinite(val)) return '—';
  const sign = val < 0 ? '-' : '';
  const x = Math.abs(val);
  let bestN = Math.round(x);
  let bestD = 1;
  let bestErr = Math.abs(x - bestN);
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < bestErr - 1e-10) {
      bestErr = err;
      bestN = n;
      bestD = d;
      if (err < 1e-8) break;
    }
  }
  return bestD === 1 ? `${sign}${bestN}` : `${sign}${bestN}/${bestD}`;
}

export const CalculatorView: React.FC = () => {
  const { records, pushToast, setActiveView, setSelectedNoteId } = useApp();
  const [tab, setTab] = useState<CalcTab>('standard');

  // --- Standard & Scientific Expression State ---
  const [expr, setExpr] = useState('2 * (14.5 + 3.25) / 5');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [memory, setMemory] = useState<number>(0);
  const [precision, setPrecision] = useState<number>(6);
  const [sigFigs, setSigFigs] = useState<number>(4);
  const [angleUnit, setAngleUnit] = useState<AngleUnit>('deg');
  const [history, setHistory] = useState<Array<{ expr: string; result: string; at: string }>>([]);

  // Custom Variables & User-Defined Functions
  const [customVars, setCustomVars] = useState<Record<string, number>>({ a: 2, b: 1, c1: 100 });
  const [newVarName, setNewVarName] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [userFns, setUserFns] = useState<Record<string, { param: string; expr: string }>>({
    f: { param: 'x', expr: 'x^2 + 2*x - 3' },
  });
  const [newFnName, setNewFnName] = useState('g');
  const [newFnExpr, setNewFnExpr] = useState('sin(x) * exp(-0.1*x)');

  // Complex & Matrix & Lab Tools
  const [cxA, setCxA] = useState({ re: 3, im: 4 });
  const [cxB, setCxB] = useState({ re: 1, im: -2 });
  const [cxOp, setCxOp] = useState<'+' | '-' | '*' | '/'>('*');
  const [matSize, setMatSize] = useState<2 | 3>(2);
  const [mat, setMat] = useState<number[][]>([
    [4, 2, 0],
    [1, 3, 0],
    [0, 0, 1],
  ]);

  // Lab analytical mode
  const [dilC1, setDilC1] = useState(1000);
  const [dilC2, setDilC2] = useState(25);
  const [dilV2, setDilV2] = useState(100);
  const [recSpiked, setRecSpiked] = useState(10.8);
  const [recUnspiked, setRecUnspiked] = useState(1.2);
  const [recSpikeAdded, setRecSpikeAdded] = useState(10.0);
  const [rsdInput, setRsdInput] = useState('12.41, 12.38, 12.45, 12.40, 12.43');

  // Save Calculation Form
  const [saveTitle, setSaveTitle] = useState('');
  const [saveCategory, setSaveCategory] = useState('General');
  const [saveNotes, setSaveNotes] = useState('');

  // --- Graphing State (2D + 3D) ---
  const [graphDim, setGraphDim] = useState<'2d' | '3d'>('2d');
  const [seriesList, setSeriesList] = useState<GraphSeries[]>([
    { id: 's1', label: 'f₁(x)', mode: 'cartesian', expr: 'a * sin(x) + b', color: '#3b6ea5', visible: true },
    { id: 's2', label: 'f₂(x)', mode: 'cartesian', expr: '0.2 * x^2 - 2', color: '#c96f53', visible: true },
  ]);
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [yMin, setYMin] = useState(-6);
  const [yMax, setYMax] = useState(6);
  const [sliderA, setSliderA] = useState(2);
  const [sliderB, setSliderB] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [xLabel, setXLabel] = useState('x');
  const [yLabel, setYLabel] = useState('y');
  const [scatterText, setScatterText] = useState('1,1.8; 2,3.1; 3,4.2; 4,5.9; 5,7.1');
  const [showScatter, setShowScatter] = useState(false);
  const [inspectX, setInspectX] = useState(1);
  const [intA, setIntA] = useState(0);
  const [intB, setIntB] = useState(3.14159);
  const [surfaceExpr, setSurfaceExpr] = useState('sin(sqrt(x^2 + y^2))');
  const [rotAz, setRotAz] = useState(38);
  const [rotEl, setRotEl] = useState(28);

  // --- Currency Converter State ---
  const [fxAmount, setFxAmount] = useState(100);
  const [fxFrom, setFxFrom] = useState('USD');
  const [fxTo, setFxTo] = useState('EUR');
  const [fxRates, setFxRates] = useState<Record<string, number>>(OFFLINE_FALLBACK_FX_RATES);
  const [fxSource, setFxSource] = useState<'offline-fallback' | 'live' | 'manual'>('offline-fallback');
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string>('Offline Reference Table');
  const [fxFeePct, setFxFeePct] = useState(0);
  const [fxManualRate, setFxManualRate] = useState('');
  const [fxLoading, setFxLoading] = useState(false);

  // --- Unit Converter State ---
  const [unitCat, setUnitCat] = useState<string>('length');
  const [unitFrom, setUnitFrom] = useState<string>('m');
  const [unitTo, setUnitTo] = useState<string>('ft');
  const [unitVal, setUnitVal] = useState<number>(1);
  const [customFactorLabel, setCustomFactorLabel] = useState('Custom Batch Units');
  const [customFactor, setCustomFactor] = useState(2.54);

  const savedCalcs = useMemo(
    () =>
      records
        .filter((r) => r.type === 'calc_saved' && !r.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const setExprTracked = (next: string) => {
    setUndoStack((prev) => [...prev.slice(-30), expr]);
    setRedoStack([]);
    setExpr(next);
  };

  const evalOutput = useMemo(() => {
    try {
      const val = evaluateMathExpression(expr, {
        angleUnit,
        vars: customVars,
        userFns,
      });
      if (!Number.isFinite(val)) return { ok: false as const, text: 'NaN / Infinity', value: NaN };
      const rounded = Number(val.toFixed(precision));
      return { ok: true as const, text: String(rounded), value: val };
    } catch (err) {
      return { ok: false as const, text: err instanceof Error ? err.message : 'Syntax error', value: NaN };
    }
  }, [expr, angleUnit, customVars, userFns, precision]);

  const commitHistory = () => {
    if (!evalOutput.ok) return;
    setHistory((prev) => [{ expr, result: evalOutput.text, at: new Date().toLocaleTimeString() }, ...prev.slice(0, 39)]);
  };

  const handleSaveCalculation = async () => {
    const title = saveTitle.trim() || `${expr} = ${evalOutput.text}`;
    await createRecord('calc_saved', title, {
      expr,
      result: evalOutput.text,
      mode: tab,
      angleUnit,
      category: saveCategory,
      notes: saveNotes,
    });
    setSaveTitle('');
    setSaveNotes('');
    pushToast(`Saved calculation "${title}"`, { tone: 'ok' });
  };

  const handleInsertIntoNote = async (title: string, markdown: string) => {
    const rec = await createRecord('note', title, {
      content: markdown,
      notebookId: 'nb_personal',
      writtenForDate: new Date().toISOString().slice(0, 10),
      pinned: false,
      citations: [],
      attachmentBlobIds: [],
      voiceMemoBlobIds: [],
      touchedDates: [new Date().toISOString().slice(0, 10)],
    });
    setSelectedNoteId(rec.id);
    setActiveView('notes');
    pushToast('Inserted math result into a new Planaday Note', { tone: 'ok' });
  };

  // --- Lab Computed Values ---
  const dilV1 = calcDilutionV1(dilC1, dilC2, dilV2);
  const pctRecovery = calcPercentRecovery(recSpiked, recUnspiked, recSpikeAdded);
  const rsdStats = useMemo(() => {
    const nums = rsdInput
      .split(/[\s,;]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    return calcRsdStats(nums);
  }, [rsdInput]);

  // --- Complex & Matrix ---
  const cxRes = useMemo(() => complexOp(cxA, cxB, cxOp), [cxA, cxB, cxOp]);
  const matDet = useMemo(() => {
    const sub = mat.slice(0, matSize).map((row) => row.slice(0, matSize));
    return matrixDeterminant(sub);
  }, [mat, matSize]);

  // --- 2D Graph Calculations ---
  const graphWidth = 620;
  const graphHeight = 360;
  const mapX = (x: number) => ((x - xMin) / (xMax - xMin)) * graphWidth;
  const mapY = (y: number) => graphHeight - ((y - yMin) / (yMax - yMin)) * graphHeight;

  const graphVars = useMemo(() => ({ ...customVars, a: sliderA, b: sliderB }), [customVars, sliderA, sliderB]);

  const scatterPoints = useMemo(() => {
    return scatterText
      .split(';')
      .map((pair) => pair.trim().split(',').map(Number))
      .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]) => ({ x, y }));
  }, [scatterText]);

  const regressionLine = useMemo(() => {
    if (scatterPoints.length < 2) return null;
    const n = scatterPoints.length;
    const mx = scatterPoints.reduce((s, p) => s + p.x, 0) / n;
    const my = scatterPoints.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of scatterPoints) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    const intercept = my - slope * mx;
    const ssTot = scatterPoints.reduce((s, p) => s + (p.y - my) ** 2, 0);
    const ssRes = scatterPoints.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2 };
  }, [scatterPoints]);

  const primarySeries = seriesList.find((s) => s.visible && s.mode === 'cartesian') ?? seriesList[0];
  const primaryAnalysis = useMemo(() => {
    if (!primarySeries || primarySeries.mode !== 'cartesian') return null;
    try {
      const ctx = { angleUnit: 'rad' as AngleUnit, vars: graphVars, userFns };
      const yAt = evaluateMathExpression(primarySeries.expr, { ...ctx, vars: { ...graphVars, x: inspectX } });
      const deriv = numericalDerivative(primarySeries.expr, inspectX, ctx);
      const integ = numericalIntegral(primarySeries.expr, intA, intB, ctx);
      const roots = findNumericalRoots(primarySeries.expr, xMin, xMax, ctx);
      let minVal = Infinity;
      let maxVal = -Infinity;
      let minX = xMin;
      let maxX = xMin;
      for (let i = 0; i <= 120; i++) {
        const xv = xMin + ((xMax - xMin) * i) / 120;
        const yv = evaluateMathExpression(primarySeries.expr, { ...ctx, vars: { ...graphVars, x: xv } });
        if (Number.isFinite(yv)) {
          if (yv < minVal) { minVal = yv; minX = xv; }
          if (yv > maxVal) { maxVal = yv; maxX = xv; }
        }
      }
      return { yAt, deriv, integ, roots, minVal, minX, maxVal, maxX };
    } catch {
      return null;
    }
  }, [primarySeries, graphVars, userFns, inspectX, intA, intB, xMin, xMax]);

  const graphPaths = useMemo(() => {
    const ctxBase = { angleUnit: 'rad' as AngleUnit, vars: graphVars, userFns };
    return seriesList
      .filter((s) => s.visible)
      .map((s) => {
        const pts: Array<{ sx: number; sy: number }> = [];
        try {
          if (s.mode === 'cartesian' || s.mode === 'ineq_gt' || s.mode === 'ineq_lt') {
            const steps = 240;
            for (let i = 0; i <= steps; i++) {
              const x = xMin + ((xMax - xMin) * i) / steps;
              const y = evaluateMathExpression(s.expr, { ...ctxBase, vars: { ...graphVars, x } });
              if (Number.isFinite(y) && Math.abs(y) < 1e4) {
                pts.push({ sx: mapX(x), sy: mapY(y) });
              }
            }
          } else if (s.mode === 'polar') {
            for (let i = 0; i <= 240; i++) {
              const t = (Math.PI * 2 * i) / 240;
              const r = evaluateMathExpression(s.expr, { ...ctxBase, vars: { ...graphVars, t, theta: t, x: t } });
              if (Number.isFinite(r)) {
                pts.push({ sx: mapX(r * Math.cos(t)), sy: mapY(r * Math.sin(t)) });
              }
            }
          } else if (s.mode === 'parametric') {
            for (let i = 0; i <= 200; i++) {
              const t = -Math.PI * 2 + (Math.PI * 4 * i) / 200;
              const x = evaluateMathExpression(s.expr, { ...ctxBase, vars: { ...graphVars, t } });
              const y = evaluateMathExpression(s.exprY || 'sin(t)', { ...ctxBase, vars: { ...graphVars, t } });
              if (Number.isFinite(x) && Number.isFinite(y)) {
                pts.push({ sx: mapX(x), sy: mapY(y) });
              }
            }
          }
        } catch {
          // ignore malformed curve while user types
        }
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
        let shadeD = '';
        if (pts.length >= 2 && (s.mode === 'ineq_gt' || s.mode === 'ineq_lt')) {
          const edgeY = s.mode === 'ineq_gt' ? 0 : graphHeight;
          shadeD = `${d} L${pts[pts.length - 1].sx.toFixed(1)},${edgeY} L${pts[0].sx.toFixed(1)},${edgeY} Z`;
        }
        return { series: s, d, shadeD };
      });
  }, [seriesList, xMin, xMax, yMin, yMax, graphVars, userFns]);

  // --- 3D Surface Wireframe Projection ---
  const surfaceLines = useMemo(() => {
    if (graphDim !== '3d') return [];
    const N = 16;
    const range = 4;
    const az = (rotAz * Math.PI) / 180;
    const el = (rotEl * Math.PI) / 180;
    const project = (x: number, y: number, z: number) => {
      const xr = x * Math.cos(az) - y * Math.sin(az);
      const yr = x * Math.sin(az) + y * Math.cos(az);
      const y2 = yr * Math.cos(el) - z * Math.sin(el);
      const scale = 36;
      return { sx: graphWidth / 2 + xr * scale, sy: graphHeight / 2 - y2 * scale };
    };
    const grid: Array<Array<{ sx: number; sy: number } | null>> = [];
    for (let i = 0; i <= N; i++) {
      const row: Array<{ sx: number; sy: number } | null> = [];
      const x = -range + (2 * range * i) / N;
      for (let j = 0; j <= N; j++) {
        const y = -range + (2 * range * j) / N;
        try {
          const z = evaluateMathExpression(surfaceExpr, {
            angleUnit: 'rad',
            vars: { ...graphVars, x, y },
            userFns,
          });
          row.push(Number.isFinite(z) ? project(x, y, Math.max(-5, Math.min(5, z))) : null);
        } catch {
          row.push(null);
        }
      }
      grid.push(row);
    }
    const paths: string[] = [];
    for (let i = 0; i <= N; i++) {
      let d = '';
      for (let j = 0; j <= N; j++) {
        const p = grid[i][j];
        if (p) d += `${d ? 'L' : 'M'}${p.sx.toFixed(1)},${p.sy.toFixed(1)} `;
      }
      if (d) paths.push(d);
    }
    for (let j = 0; j <= N; j++) {
      let d = '';
      for (let i = 0; i <= N; i++) {
        const p = grid[i][j];
        if (p) d += `${d ? 'L' : 'M'}${p.sx.toFixed(1)},${p.sy.toFixed(1)} `;
      }
      if (d) paths.push(d);
    }
    return paths;
  }, [graphDim, surfaceExpr, rotAz, rotEl, graphVars, userFns]);

  // --- Currency Refresh ---
  const fetchLiveFx = async () => {
    setFxLoading(true);
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=USD');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { date: string; rates: Record<string, number> };
      setFxRates({ USD: 1, ...data.rates });
      setFxSource('live');
      setFxUpdatedAt(`ECB via Frankfurter (${data.date})`);
      pushToast('Updated live currency exchange rates', { tone: 'ok' });
    } catch {
      pushToast('Offline or rate service unreachable — using cached/reference rates', { tone: 'info' });
    } finally {
      setFxLoading(false);
    }
  };

  const convertedFx = useMemo(() => {
    const manualNum = Number(fxManualRate);
    const feeMult = 1 - fxFeePct / 100;
    if (fxManualRate.trim() !== '' && Number.isFinite(manualNum) && manualNum > 0) {
      return fxAmount * manualNum * feeMult;
    }
    const rFrom = fxRates[fxFrom] || 1;
    const rTo = fxRates[fxTo] || 1;
    return (fxAmount / rFrom) * rTo * feeMult;
  }, [fxAmount, fxFrom, fxTo, fxRates, fxFeePct, fxManualRate]);

  // --- Unit Converter Sync ---
  const activeUnitCategory = UNIT_CATEGORIES[unitCat] ?? UNIT_CATEGORIES.length;
  const convertedUnit = useMemo(
    () => convertUnitValue(unitCat, unitFrom, unitTo, unitVal),
    [unitCat, unitFrom, unitTo, unitVal]
  );

  const selectUnitCategory = (catKey: string) => {
    setUnitCat(catKey);
    const u = UNIT_CATEGORIES[catKey]?.units ?? [];
    if (u.length >= 2) {
      setUnitFrom(u[0].id);
      setUnitTo(u[1].id);
    }
  };

  const stdButtons = [
    ['(', ')', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '^', '√('],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calculator size={20} /> Mathematical & Analytical Workspace
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Standard, Scientific, Laboratory Analytical, 2D & 3D Graphing, Currency & 23-Category Universal Unit Conversions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {(
            [
              ['standard', 'Standard', Calculator],
              ['scientific', 'Scientific & Lab', Sigma],
              ['graph', '2D / 3D Graph', LineChart],
              ['currency', 'Currency', Globe],
              ['units', 'Unit Converter', Ruler],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`dp-btn ${tab === id ? 'dp-btn-primary' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* === STANDARD & SCIENTIFIC EXPRESSION BAR === */}
      {(tab === 'standard' || tab === 'scientific') && (
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="dp-input"
              aria-label="Mathematical expression"
              value={expr}
              onChange={(e) => setExprTracked(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitHistory();
              }}
              style={{ flex: 1, minWidth: 220, fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 600 }}
              placeholder="Enter expression e.g. 2*(14.5 + sqrt(9)) + sin(30)"
            />
            <button type="button" className="dp-btn dp-btn-primary" onClick={commitHistory}>
              = Eval
            </button>
            <button
              type="button"
              className="dp-btn"
              title="Undo"
              disabled={undoStack.length === 0}
              onClick={() => {
                const prev = undoStack[undoStack.length - 1];
                setRedoStack((r) => [...r, expr]);
                setUndoStack((u) => u.slice(0, -1));
                setExpr(prev);
              }}
            >
              <RotateCcw size={14} />
            </button>
            <button type="button" className="dp-btn" onClick={() => setExprTracked('')}>
              C
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.6rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--dp-radius)',
              background: 'var(--dp-paper-alt)',
              border: '1px solid var(--dp-border)',
            }}
          >
            <div>
              <div className="dp-muted" style={{ fontSize: '0.74rem' }}>Live Result</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: evalOutput.ok ? 'var(--dp-ink)' : 'var(--dp-danger)' }}>
                {evalOutput.text}
              </div>
              {evalOutput.ok && (
                <div className="dp-muted" style={{ fontSize: '0.76rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>Fraction: <strong>{toFractionApprox(evalOutput.value)}</strong></span>
                  <span>Eng: <strong>{toEngineeringNotation(evalOutput.value)}</strong></span>
                  <span>{sigFigs} Sig Figs: <strong>{formatSigFigs(evalOutput.value, sigFigs)}</strong></span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: '0.76rem' }}>
                Dec:{' '}
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={precision}
                  onChange={(e) => setPrecision(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                  style={{ width: 48 }}
                  className="dp-input"
                />
              </label>
              <label style={{ fontSize: '0.76rem' }}>
                SF:{' '}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={sigFigs}
                  onChange={(e) => setSigFigs(Math.max(1, Math.min(12, Number(e.target.value) || 4)))}
                  style={{ width: 48 }}
                  className="dp-input"
                />
              </label>
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${expr} = ${evalOutput.text}`);
                  pushToast('Copied result to clipboard', { tone: 'ok' });
                }}
              >
                <Copy size={13} /> Copy
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={() =>
                  void handleInsertIntoNote(
                    `Calculation: ${saveTitle || expr.slice(0, 32)}`,
                    `# Calculation Record\n\n- **Expression:** \`${expr}\`\n- **Result:** **${evalOutput.text}**\n- **Fraction:** ${evalOutput.ok ? toFractionApprox(evalOutput.value) : '—'}\n- **Engineering:** ${evalOutput.ok ? toEngineeringNotation(evalOutput.value) : '—'}\n- **Angle Mode:** ${angleUnit.toUpperCase()}\n\n${saveNotes}`
                  )
                }
              >
                <FilePlus size={13} /> To Note
              </button>
            </div>
          </div>

          {/* Memory & Angle bar */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="dp-badge">Memory: {memory}</span>
            <button type="button" className="dp-btn" onClick={() => setMemory(0)}>MC</button>
            <button type="button" className="dp-btn" onClick={() => setExprTracked(`${expr}${memory}`)}>MR</button>
            <button type="button" className="dp-btn" onClick={() => evalOutput.ok && setMemory((m) => m + evalOutput.value)}>M+</button>
            <button type="button" className="dp-btn" onClick={() => evalOutput.ok && setMemory((m) => m - evalOutput.value)}>M-</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
              {(['deg', 'rad', 'grad'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`dp-btn ${angleUnit === u ? 'dp-btn-primary' : ''}`}
                  onClick={() => setAngleUnit(u)}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === STANDARD KEYPAD & HISTORY === */}
      {tab === 'standard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <h4 style={{ margin: '0 0 0.25rem' }}>Keypad</h4>
            {stdButtons.map((row, rIdx) => (
              <div key={rIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                {row.map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    className="dp-btn"
                    style={{ justifyContent: 'center', fontSize: '1rem', padding: '0.6rem' }}
                    onClick={() => setExprTracked(`${expr}${btn}`)}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Save Calculation & History</h4>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <input
                className="dp-input"
                placeholder="Calculation name (e.g. Monthly Mortgage)"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                style={{ flex: 1, minWidth: 160 }}
              />
              <input
                className="dp-input"
                placeholder="Category"
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value)}
                style={{ width: 110 }}
              />
            </div>
            <input
              className="dp-input"
              placeholder="Optional notes or units..."
              value={saveNotes}
              onChange={(e) => setSaveNotes(e.target.value)}
            />
            <button type="button" className="dp-btn dp-btn-primary" onClick={() => void handleSaveCalculation()}>
              <Bookmark size={14} /> Save to Planaday Library
            </button>

            <div style={{ maxHeight: 170, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.35rem' }}>
              {history.length === 0 ? (
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Press "= Eval" or Enter to record session history.</span>
              ) : (
                history.map((h, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="dp-btn"
                    style={{ justifyContent: 'space-between', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.8rem' }}
                    onClick={() => setExprTracked(h.expr)}
                  >
                    <span>{h.expr}</span>
                    <strong>= {h.result}</strong>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* === SCIENTIFIC + LABORATORY ANALYTICAL MODE === */}
      {tab === 'scientific' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.9rem' }}>
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Functions & Scientific Constants</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'ln(', 'log10(', 'log2(', 'exp(', 'sqrt(', 'cbrt(', 'abs(', '!', 'nPr(', 'nCr('].map((fn) => (
                <button key={fn} type="button" className="dp-btn" style={{ fontSize: '0.78rem' }} onClick={() => setExprTracked(`${expr}${fn}`)}>
                  {fn}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {Object.entries(MATH_CONSTANTS)
                .filter(([k]) => !['PI', 'E'].includes(k))
                .map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className="dp-btn"
                    style={{ fontSize: '0.75rem' }}
                    title={`${k} = ${v}`}
                    onClick={() => setExprTracked(`${expr}${k}`)}
                  >
                    {k}
                  </button>
                ))}
            </div>

            <h4 style={{ margin: '0.5rem 0 0.15rem' }}>Custom Variables & User Functions</h4>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {Object.entries(customVars).map(([k, v]) => (
                <span key={k} className="dp-badge" style={{ cursor: 'pointer' }} onClick={() => setExprTracked(`${expr}${k}`)}>
                  {k}={v}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input className="dp-input" placeholder="Var (e.g. k)" value={newVarName} onChange={(e) => setNewVarName(e.target.value)} style={{ width: 90 }} />
              <input className="dp-input" type="number" placeholder="Value" value={newVarVal} onChange={(e) => setNewVarVal(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  const n = Number(newVarVal);
                  if (newVarName.trim() && Number.isFinite(n)) {
                    setCustomVars((prev) => ({ ...prev, [newVarName.trim()]: n }));
                    setNewVarName('');
                    setNewVarVal('');
                  }
                }}
              >
                <Plus size={13} /> Var
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input className="dp-input" placeholder="Fn name" value={newFnName} onChange={(e) => setNewFnName(e.target.value)} style={{ width: 70 }} />
              <input className="dp-input" placeholder="f(x) = ..." value={newFnExpr} onChange={(e) => setNewFnExpr(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  if (newFnName.trim() && newFnExpr.trim()) {
                    setUserFns((prev) => ({ ...prev, [newFnName.trim()]: { param: 'x', expr: newFnExpr.trim() } }));
                    pushToast(`Defined ${newFnName}(x) = ${newFnExpr}`, { tone: 'ok' });
                  }
                }}
              >
                Define
              </button>
            </div>
          </div>

          {/* Complex Numbers & Matrix Determinant */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <h4 style={{ margin: 0 }}>Complex Numbers & Matrices</h4>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="dp-input" type="number" value={cxA.re} onChange={(e) => setCxA({ ...cxA, re: Number(e.target.value) })} style={{ width: 64 }} />
              <span>+</span>
              <input className="dp-input" type="number" value={cxA.im} onChange={(e) => setCxA({ ...cxA, im: Number(e.target.value) })} style={{ width: 64 }} />
              <span>i</span>
              <select className="dp-select" value={cxOp} onChange={(e) => setCxOp(e.target.value as '+' | '-' | '*' | '/')} style={{ width: 58 }}>
                <option value="+">+</option>
                <option value="-">-</option>
                <option value="*">×</option>
                <option value="/">÷</option>
              </select>
              <input className="dp-input" type="number" value={cxB.re} onChange={(e) => setCxB({ ...cxB, re: Number(e.target.value) })} style={{ width: 64 }} />
              <span>+</span>
              <input className="dp-input" type="number" value={cxB.im} onChange={(e) => setCxB({ ...cxB, im: Number(e.target.value) })} style={{ width: 64 }} />
              <span>i</span>
            </div>
            <div className="dp-badge" style={{ alignSelf: 'flex-start', fontFamily: 'monospace' }}>
              Result: {cxRes.re.toFixed(4)} {cxRes.im >= 0 ? '+' : '-'} {Math.abs(cxRes.im).toFixed(4)}i (|z| = {Math.hypot(cxRes.re, cxRes.im).toFixed(4)})
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
              <strong style={{ fontSize: '0.86rem' }}>Matrix Determinant</strong>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" className={`dp-btn ${matSize === 2 ? 'dp-btn-primary' : ''}`} onClick={() => setMatSize(2)}>2×2</button>
                <button type="button" className={`dp-btn ${matSize === 3 ? 'dp-btn-primary' : ''}`} onClick={() => setMatSize(3)}>3×3</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${matSize}, 1fr)`, gap: '0.3rem', maxWidth: 220 }}>
              {Array.from({ length: matSize }).map((_, r) =>
                Array.from({ length: matSize }).map((__, c) => (
                  <input
                    key={`${r}-${c}`}
                    type="number"
                    className="dp-input"
                    value={mat[r][c]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMat((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));
                    }}
                  />
                ))
              )}
            </div>
            <div className="dp-badge" style={{ alignSelf: 'flex-start', fontFamily: 'monospace' }}>det(M) = {matDet}</div>
          </div>

          {/* Analytical Laboratory Calculator Mode (§26.2) */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Beaker size={16} /> Analytical Laboratory Mode
            </h4>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Dilution Calculator (C₁V₁ = C₂V₂)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.74rem' }}>C₁ Stock<input className="dp-input" type="number" value={dilC1} onChange={(e) => setDilC1(Number(e.target.value))} /></label>
              <label style={{ fontSize: '0.74rem' }}>C₂ Target<input className="dp-input" type="number" value={dilC2} onChange={(e) => setDilC2(Number(e.target.value))} /></label>
              <label style={{ fontSize: '0.74rem' }}>V₂ Final (mL)<input className="dp-input" type="number" value={dilV2} onChange={(e) => setDilV2(Number(e.target.value))} /></label>
            </div>
            <div className="dp-badge" style={{ alignSelf: 'flex-start' }}>
              Pipette V₁ = <strong>{Number.isFinite(dilV1) ? dilV1.toFixed(4) : '—'} mL</strong> + {(dilV2 - (Number.isFinite(dilV1) ? dilV1 : 0)).toFixed(4)} mL diluent (DF = {dilC2 > 0 ? (dilC1 / dilC2).toFixed(2) : '—'}×)
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.25rem' }}>% Spike Recovery</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.74rem' }}>Spiked<input className="dp-input" type="number" value={recSpiked} onChange={(e) => setRecSpiked(Number(e.target.value))} /></label>
              <label style={{ fontSize: '0.74rem' }}>Unspiked<input className="dp-input" type="number" value={recUnspiked} onChange={(e) => setRecUnspiked(Number(e.target.value))} /></label>
              <label style={{ fontSize: '0.74rem' }}>Spike Added<input className="dp-input" type="number" value={recSpikeAdded} onChange={(e) => setRecSpikeAdded(Number(e.target.value))} /></label>
            </div>
            <div className="dp-badge" style={{ alignSelf: 'flex-start' }}>
              % Recovery = <strong>{Number.isFinite(pctRecovery) ? pctRecovery.toFixed(2) : '—'}%</strong>
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.25rem' }}>Replicate Precision (Mean, SD, %RSD)</div>
            <input className="dp-input" value={rsdInput} onChange={(e) => setRsdInput(e.target.value)} placeholder="Comma-separated replicates" />
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
              <span className="dp-badge">n = {rsdStats.n}</span>
              <span className="dp-badge">Mean = {Number.isFinite(rsdStats.mean) ? rsdStats.mean.toFixed(4) : '—'}</span>
              <span className="dp-badge">SD = {Number.isFinite(rsdStats.sd) ? rsdStats.sd.toFixed(4) : '—'}</span>
              <span className="dp-badge">%RSD = {Number.isFinite(rsdStats.rsdPct) ? `${rsdStats.rsdPct.toFixed(3)}%` : '—'}</span>
            </div>
            <button
              type="button"
              className="dp-btn"
              onClick={() =>
                void handleInsertIntoNote(
                  'Lab Analytical Calculation Sheet',
                  `# Analytical Lab Calculations\n\n- **Dilution:** C₁=${dilC1}, C₂=${dilC2}, V₂=${dilV2} mL → **V₁ = ${dilV1.toFixed(4)} mL**\n- **% Recovery:** Spiked=${recSpiked}, Unspiked=${recUnspiked}, Added=${recSpikeAdded} → **${pctRecovery.toFixed(2)}%**\n- **Replicates (${rsdStats.n}):** Mean=${rsdStats.mean.toFixed(4)}, SD=${rsdStats.sd.toFixed(4)}, **%RSD=${rsdStats.rsdPct.toFixed(3)}%**\n`
                )
              }
            >
              <FilePlus size={13} /> Save Lab Calc Sheet to Note
            </button>
          </div>
        </div>
      )}

      {/* === 2D & 3D GRAPHING CALCULATOR (§26.3) === */}
      {tab === 'graph' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '0.9rem' }}>
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button type="button" className={`dp-btn ${graphDim === '2d' ? 'dp-btn-primary' : ''}`} onClick={() => setGraphDim('2d')}>2D Graph</button>
                <button type="button" className={`dp-btn ${graphDim === '3d' ? 'dp-btn-primary' : ''}`} onClick={() => setGraphDim('3d')}>3D Surface</button>
              </div>
              {graphDim === '2d' && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button type="button" className="dp-btn" onClick={() => { setXMin(xMin * 0.7); setXMax(xMax * 0.7); setYMin(yMin * 0.7); setYMax(yMax * 0.7); }}>Zoom +</button>
                  <button type="button" className="dp-btn" onClick={() => { setXMin(xMin * 1.4); setXMax(xMax * 1.4); setYMin(yMin * 1.4); setYMax(yMax * 1.4); }}>Zoom −</button>
                  <button type="button" className="dp-btn" onClick={() => { setXMin(-10); setXMax(10); setYMin(-6); setYMax(6); }}>Reset</button>
                  <button type="button" className="dp-btn" onClick={() => setShowGrid((g) => !g)}>{showGrid ? 'Grid On' : 'Grid Off'}</button>
                </div>
              )}
            </div>

            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                style={{ width: '100%', height: 'auto', background: 'var(--dp-paper-alt)', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}
              >
                {graphDim === '2d' ? (
                  <>
                    {showGrid &&
                      Array.from({ length: 11 }).map((_, idx) => {
                        const gx = (graphWidth * idx) / 10;
                        const gy = (graphHeight * idx) / 10;
                        return (
                          <g key={idx} opacity={0.22}>
                            <line x1={gx} y1={0} x2={gx} y2={graphHeight} stroke="var(--dp-ink)" strokeWidth={0.7} />
                            <line x1={0} y1={gy} x2={graphWidth} y2={gy} stroke="var(--dp-ink)" strokeWidth={0.7} />
                          </g>
                        );
                      })}
                    {/* Axes */}
                    <line x1={0} y1={mapY(0)} x2={graphWidth} y2={mapY(0)} stroke="var(--dp-ink)" strokeWidth={1.3} opacity={0.65} />
                    <line x1={mapX(0)} y1={0} x2={mapX(0)} y2={graphHeight} stroke="var(--dp-ink)" strokeWidth={1.3} opacity={0.65} />
                    <text x={graphWidth - 18} y={Math.max(14, Math.min(graphHeight - 6, mapY(0) - 6))} fontSize={11} fill="var(--dp-ink)">{xLabel}</text>
                    <text x={Math.max(8, Math.min(graphWidth - 20, mapX(0) + 6))} y={14} fontSize={11} fill="var(--dp-ink)">{yLabel}</text>

                    {/* Curves & Shaded Inequalities */}
                    {graphPaths.map(({ series, d, shadeD }) => (
                      <g key={series.id}>
                        {shadeD && <path d={shadeD} fill={series.color} opacity={0.16} />}
                        {d && <path d={d} fill="none" stroke={series.color} strokeWidth={2.2} />}
                      </g>
                    ))}

                    {/* Scatter & Linear Regression */}
                    {showScatter && (
                      <>
                        {scatterPoints.map((p, i) => (
                          <circle key={i} cx={mapX(p.x)} cy={mapY(p.y)} r={4} fill="#8b3e2f" />
                        ))}
                        {regressionLine && (
                          <line
                            x1={mapX(xMin)}
                            y1={mapY(regressionLine.slope * xMin + regressionLine.intercept)}
                            x2={mapX(xMax)}
                            y2={mapY(regressionLine.slope * xMax + regressionLine.intercept)}
                            stroke="#8b3e2f"
                            strokeDasharray="5 4"
                            strokeWidth={1.8}
                          />
                        )}
                      </>
                    )}

                    {/* Inspect crosshair */}
                    {primaryAnalysis && Number.isFinite(primaryAnalysis.yAt) && (
                      <circle cx={mapX(inspectX)} cy={mapY(primaryAnalysis.yAt)} r={5} fill="#2f7a78" stroke="#fff" strokeWidth={1.5} />
                    )}
                  </>
                ) : (
                  <g>
                    {surfaceLines.map((d, i) => (
                      <path key={i} d={d} fill="none" stroke={i < 17 ? '#3b6ea5' : '#c96f53'} strokeWidth={1.1} opacity={0.85} />
                    ))}
                  </g>
                )}
              </svg>
            </div>

            {/* Interactive Parameter Sliders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.78rem' }}>
                Slider <strong>a = {sliderA}</strong>
                <input type="range" min={-5} max={5} step={0.1} value={sliderA} onChange={(e) => setSliderA(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
              <label style={{ fontSize: '0.78rem' }}>
                Slider <strong>b = {sliderB}</strong>
                <input type="range" min={-5} max={5} step={0.1} value={sliderB} onChange={(e) => setSliderB(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
            </div>

            {graphDim === '3d' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem' }}>
                  3D Surface z = f(x, y):
                  <input className="dp-input" value={surfaceExpr} onChange={(e) => setSurfaceExpr(e.target.value)} style={{ fontFamily: 'monospace' }} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.76rem' }}>Azimuth ({rotAz}°)<input type="range" min={0} max={360} value={rotAz} onChange={(e) => setRotAz(Number(e.target.value))} style={{ width: '100%' }} /></label>
                  <label style={{ fontSize: '0.76rem' }}>Elevation ({rotEl}°)<input type="range" min={-80} max={80} value={rotEl} onChange={(e) => setRotEl(Number(e.target.value))} style={{ width: '100%' }} /></label>
                </div>
              </div>
            )}
          </div>

          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Equations, Calculus & Regression</h4>
              <button
                type="button"
                className="dp-btn"
                onClick={() =>
                  setSeriesList((prev) => [
                    ...prev,
                    {
                      id: createId('eq'),
                      label: `f${prev.length + 1}`,
                      mode: 'cartesian',
                      expr: 'cos(x)',
                      color: '#4f7a65',
                      visible: true,
                    },
                  ])
                }
              >
                <Plus size={13} /> Add Curve
              </button>
            </div>

            {seriesList.map((s) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.45rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={s.visible} onChange={(e) => setSeriesList((p) => p.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)))} />
                  <input type="color" value={s.color} onChange={(e) => setSeriesList((p) => p.map((x) => (x.id === s.id ? { ...x, color: e.target.value } : x)))} style={{ width: 28, height: 24 }} />
                  <select
                    className="dp-select"
                    value={s.mode}
                    onChange={(e) => setSeriesList((p) => p.map((x) => (x.id === s.id ? { ...x, mode: e.target.value as GraphSeries['mode'] } : x)))}
                    style={{ width: 120 }}
                  >
                    <option value="cartesian">y = f(x)</option>
                    <option value="ineq_gt">y ≥ f(x)</option>
                    <option value="ineq_lt">y ≤ f(x)</option>
                    <option value="polar">Polar r(t)</option>
                    <option value="parametric">Parametric</option>
                  </select>
                  <input
                    className="dp-input"
                    value={s.expr}
                    onChange={(e) => setSeriesList((p) => p.map((x) => (x.id === s.id ? { ...x, expr: e.target.value } : x)))}
                    style={{ flex: 1, fontFamily: 'monospace' }}
                    placeholder={s.mode === 'parametric' ? 'x(t) = cos(t)' : 'Expression'}
                  />
                  {seriesList.length > 1 && (
                    <button type="button" className="dp-btn" onClick={() => setSeriesList((p) => p.filter((x) => x.id !== s.id))}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {s.mode === 'parametric' && (
                  <input
                    className="dp-input"
                    value={s.exprY ?? 'sin(t)'}
                    onChange={(e) => setSeriesList((p) => p.map((x) => (x.id === s.id ? { ...x, exprY: e.target.value } : x)))}
                    placeholder="y(t) = sin(t)"
                    style={{ fontFamily: 'monospace' }}
                  />
                )}
              </div>
            ))}

            {/* Calculus Inspector */}
            {primaryAnalysis && (
              <div style={{ padding: '0.55rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>Inspect x =</strong>
                  <input className="dp-input" type="number" step={0.5} value={inspectX} onChange={(e) => setInspectX(Number(e.target.value))} style={{ width: 72 }} />
                  <span>f(x) = <strong>{primaryAnalysis.yAt.toFixed(4)}</strong></span>
                  <span>f'(x) = <strong>{primaryAnalysis.deriv.toFixed(4)}</strong></span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>∫ from</strong>
                  <input className="dp-input" type="number" value={intA} onChange={(e) => setIntA(Number(e.target.value))} style={{ width: 64 }} />
                  <strong>to</strong>
                  <input className="dp-input" type="number" value={intB} onChange={(e) => setIntB(Number(e.target.value))} style={{ width: 64 }} />
                  <span>= <strong>{Number.isFinite(primaryAnalysis.integ) ? primaryAnalysis.integ.toFixed(4) : '—'}</strong></span>
                </div>
                <div>Roots in [{xMin}, {xMax}]: <strong>{primaryAnalysis.roots.length ? primaryAnalysis.roots.slice(0, 8).join(', ') : 'None found'}</strong></div>
                <div>Viewport Min: <strong>({primaryAnalysis.minX.toFixed(2)}, {primaryAnalysis.minVal.toFixed(3)})</strong> · Max: <strong>({primaryAnalysis.maxX.toFixed(2)}, {primaryAnalysis.maxVal.toFixed(3)})</strong></div>
              </div>
            )}

            {/* Scatter & Regression + Axis Labels */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={showScatter} onChange={(e) => setShowScatter(e.target.checked)} />
              Show Scatter Plot & Linear Regression (`x,y; x,y`)
            </label>
            {showScatter && (
              <>
                <input className="dp-input" value={scatterText} onChange={(e) => setScatterText(e.target.value)} />
                {regressionLine && (
                  <div className="dp-badge" style={{ alignSelf: 'flex-start' }}>
                    y = {regressionLine.slope.toFixed(4)}x + {regressionLine.intercept.toFixed(4)} (R² = {regressionLine.r2.toFixed(5)})
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <input className="dp-input" value={xLabel} onChange={(e) => setXLabel(e.target.value)} placeholder="X Axis Label" style={{ width: 100 }} />
              <input className="dp-input" value={yLabel} onChange={(e) => setYLabel(e.target.value)} placeholder="Y Axis Label" style={{ width: 100 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={() =>
                  void handleInsertIntoNote(
                    `Graph Summary (${graphDim.toUpperCase()})`,
                    `# Planaday Graph Summary\n\n${seriesList.map((s) => `- **${s.label}** (${s.mode}): \`${s.expr}\``).join('\n')}\n\n- Sliders: a=${sliderA}, b=${sliderB}\n${primaryAnalysis ? `- Roots: ${primaryAnalysis.roots.join(', ') || 'None'}\n- Integral [${intA}, ${intB}]: ${primaryAnalysis.integ.toFixed(4)}` : ''}`
                  )
                }
              >
                <FilePlus size={13} /> Save Graph Summary to Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === CURRENCY CONVERTER (§26.4) === */}
      {tab === 'currency' && (
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Currency Converter</h3>
              <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
                Status: <strong>{fxManualRate.trim() ? 'Manual Custom Rate' : fxSource === 'live' ? 'Live Rate' : 'Offline Fallback'}</strong> · Source: {fxUpdatedAt}
              </span>
            </div>
            <button type="button" className="dp-btn dp-btn-primary" disabled={fxLoading} onClick={() => void fetchLiveFx()}>
              <RefreshCw size={14} /> {fxLoading ? 'Refreshing...' : 'Fetch Live Rates'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem' }}>Amount<input className="dp-input" type="number" value={fxAmount} onChange={(e) => setFxAmount(Number(e.target.value))} /></label>
            <label style={{ fontSize: '0.78rem' }}>From
              <select className="dp-select" value={fxFrom} onChange={(e) => setFxFrom(e.target.value)}>
                {Object.keys(fxRates).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.78rem' }}>To
              <select className="dp-select" value={fxTo} onChange={(e) => setFxTo(e.target.value)}>
                {Object.keys(fxRates).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.78rem' }}>Bank / FX Fee (%)<input className="dp-input" type="number" step={0.1} value={fxFeePct} onChange={(e) => setFxFeePct(Number(e.target.value))} /></label>
            <label style={{ fontSize: '0.78rem' }}>Manual Rate Override<input className="dp-input" placeholder="Optional" value={fxManualRate} onChange={(e) => setFxManualRate(e.target.value)} /></label>
          </div>

          <div style={{ padding: '0.75rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)', fontSize: '1.3rem', fontWeight: 700 }}>
            {fxAmount.toLocaleString()} {fxFrom} = {convertedFx.toLocaleString(undefined, { maximumFractionDigits: 4 })} {fxTo}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '0.45rem' }}>
            {Object.entries(fxRates).map(([code, rate]) => {
              const val = (fxAmount / (fxRates[fxFrom] || 1)) * rate * (1 - fxFeePct / 100);
              return (
                <div key={code} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', fontSize: '0.8rem' }}>
                  <div className="dp-muted">{code}</div>
                  <strong>{val.toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === UNIVERSAL UNIT CONVERTER (§26.5) === */}
      {tab === 'units' && (
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: '0.78rem', minWidth: 200 }}>
              Category ({Object.keys(UNIT_CATEGORIES).length} categories)
              <select className="dp-select" value={unitCat} onChange={(e) => selectUnitCategory(e.target.value)}>
                {Object.entries(UNIT_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.78rem', width: 130 }}>
              Value
              <input className="dp-input" type="number" value={unitVal} onChange={(e) => setUnitVal(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: '0.78rem', minWidth: 160 }}>
              From
              <select className="dp-select" value={unitFrom} onChange={(e) => setUnitFrom(e.target.value)}>
                {activeUnitCategory.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </label>
            <button type="button" className="dp-btn" onClick={() => { const tmp = unitFrom; setUnitFrom(unitTo); setUnitTo(tmp); }}>⇄ Swap</button>
            <label style={{ fontSize: '0.78rem', minWidth: 160 }}>
              To
              <select className="dp-select" value={unitTo} onChange={(e) => setUnitTo(e.target.value)}>
                {activeUnitCategory.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </label>
          </div>

          <div style={{ padding: '0.75rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)', fontSize: '1.25rem', fontWeight: 700 }}>
            {unitVal} {unitFrom} = {Number.isFinite(convertedUnit) ? Number(convertedUnit.toPrecision(8)).toString() : '—'} {unitTo}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.45rem' }}>
            {activeUnitCategory.units.map((u) => {
              const v = convertUnitValue(unitCat, unitFrom, u.id, unitVal);
              return (
                <div key={u.id} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', fontSize: '0.8rem' }}>
                  <div className="dp-muted">{u.label}</div>
                  <strong>{Number.isFinite(v) ? Number(v.toPrecision(7)).toString() : '—'}</strong>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--dp-border)', paddingTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.82rem' }}>Custom Conversion Factor:</strong>
            <input className="dp-input" value={customFactorLabel} onChange={(e) => setCustomFactorLabel(e.target.value)} style={{ width: 170 }} />
            <span style={{ fontSize: '0.8rem' }}>×</span>
            <input className="dp-input" type="number" value={customFactor} onChange={(e) => setCustomFactor(Number(e.target.value))} style={{ width: 100 }} />
            <span className="dp-badge">{unitVal} → {(unitVal * customFactor).toFixed(4)} ({customFactorLabel})</span>
          </div>
        </div>
      )}

      {/* === SAVED CALCULATIONS LIBRARY === */}
      {savedCalcs.length > 0 && (
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <h4 style={{ margin: 0 }}>Saved Calculations ({savedCalcs.length})</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.45rem' }}>
            {savedCalcs.map((rec) => {
              const p = rec.payload as { expr?: string; result?: string; category?: string; notes?: string };
              return (
                <div key={rec.id} style={{ padding: '0.5rem 0.65rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', display: 'flex', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => { if (p.expr) { setExpr(p.expr); setTab('standard'); } }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rec.title}</div>
                    <div className="dp-muted" style={{ fontSize: '0.76rem', fontFamily: 'monospace' }}>{p.expr} = {p.result}</div>
                    {p.notes && <div className="dp-muted" style={{ fontSize: '0.74rem' }}>{p.notes}</div>}
                  </div>
                  <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(rec.id)} title="Delete saved calculation">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
