import { useViewActionGuard } from '../../components/Common/viewSafety';
import { ModalDialog } from '../../components/Common/ModalDialog';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Plus,
  Printer,
  RefreshCw,
  Sigma,
  Trash2,
  Upload,
} from 'lucide-react';
import { flushSync } from 'react-dom';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { downloadFile } from '../../core/backup';
import {
  SPREADSHEET_FORMULA_DOCS,
  cellKey,
  colIndexToLetter,
  parseCellRef,
  evaluateWorkbook,
  exportSheetToDelimited,
  importDelimitedToSheet,
  type SheetCell,
  type WorkbookPayload,
  type WorksheetDef,
} from '../../core/spreadsheetEngine';
import type { LifeRecord } from '../../core/types';

function makeSheetFromRows(name: string, rowsData: string[][], opts?: { formats?: Record<string, SheetCell['format']> }): WorksheetDef {
  const cells: Record<string, SheetCell> = {};
  rowsData.forEach((row, r) => {
    row.forEach((val, c) => {
      const k = cellKey(c, r);
      cells[k] = {
        raw: val,
        bold: r === 0,
        bgColor: r === 0 ? '#efe6d5' : undefined,
        format: opts?.formats?.[k] ?? 'general',
      };
    });
  });
  return {
    id: createId('sh'),
    name,
    rows: Math.max(18, rowsData.length + 6),
    cols: Math.max(8, (rowsData[0]?.length ?? 6) + 2),
    cells,
    freezeHeader: true,
    namedRanges: {},
  };
}

function buildTemplateWorkbook(templateKey: string): { title: string; payload: WorkbookPayload } {
  if (templateKey === 'personal_budget') {
    const sh = makeSheetFromRows('Budget', [
      ['Category', 'Budgeted', 'Actual', 'Variance', 'Status'],
      ['Housing', '1800', '1800', '=B2-C2', '=IF(D2>=0,"On Track","Over")'],
      ['Groceries', '650', '590', '=B3-C3', '=IF(D3>=0,"On Track","Over")'],
      ['Utilities', '260', '285', '=B4-C4', '=IF(D4>=0,"On Track","Over")'],
      ['Savings', '500', '550', '=B5-C5', '=IF(D5>=0,"On Track","Over")'],
      ['Total', '=SUM(B2:B5)', '=SUM(C2:C5)', '=SUM(D2:D5)', '=IF(D6>=0,"Surplus","Deficit")'],
    ]);
    return {
      title: 'Personal Monthly Budget',
      payload: {
        sheets: [sh],
        activeSheetId: sh.id,
        charts: [{ id: createId('ch'), title: 'Actual Spend by Category', type: 'column', labelCol: 0, valueCol: 2, sheetId: sh.id, color: '#3b6ea5' }],
        revisions: [],
      },
    };
  }
  if (templateKey === 'lab_budget') {
    const sh = makeSheetFromRows('Lab Spend', [
      ['Cost Center', 'Annual Budget', 'YTD Spent', 'Remaining', '% Used'],
      ['Reagents & Solvents', '24000', '14200', '=B2-C2', '=C2/B2'],
      ['Glassware & Consumables', '12000', '6800', '=B3-C3', '=C3/B3'],
      ['Calibration & Service', '18500', '12400', '=B4-C4', '=C4/B4'],
      ['Subcontracting', '15000', '8900', '=B5-C5', '=C5/B5'],
      ['Total', '=SUM(B2:B5)', '=SUM(C2:C5)', '=SUM(D2:D5)', '=C6/B6'],
    ]);
    return {
      title: 'Laboratory Budget & Spend',
      payload: { sheets: [sh], activeSheetId: sh.id, charts: [{ id: createId('ch'), title: 'YTD Spend by Cost Center', type: 'bar', labelCol: 0, valueCol: 2, sheetId: sh.id, color: '#2f7a78' }], revisions: [] },
    };
  }
  if (templateKey === 'client_pricing') {
    const sh = makeSheetFromRows('Pricing', [
      ['Assay / Service', 'Internal Cost', 'Client Price', 'Gross Margin', 'Margin %'],
      ['Wet Moisture (Oven)', '14', '45', '=C2-B2', '=D2/C2'],
      ['Crude Protein (Kjeldahl)', '22', '65', '=C3-B3', '=D3/C3'],
      ['NIR Rapid Scan', '6', '28', '=C4-B4', '=D4/C4'],
      ['Heavy Metals ICP', '48', '135', '=C5-B5', '=D5/C5'],
      ['Average', '=AVERAGE(B2:B5)', '=AVERAGE(C2:C5)', '=AVERAGE(D2:D5)', '=D6/C6'],
    ]);
    return { title: 'Client Pricing & Margins', payload: { sheets: [sh], activeSheetId: sh.id, charts: [], revisions: [] } };
  }
  if (templateKey === 'wet_nir') {
    const sh = makeSheetFromRows('Wet vs NIR', [
      ['Sample ID', 'Wet Chem %', 'NIR Pred %', 'Bias (NIR-Wet)', 'Abs Error'],
      ['S-101', '14.22', '14.15', '=C2-B2', '=ABS(D2)'],
      ['S-102', '13.85', '13.94', '=C3-B3', '=ABS(D3)'],
      ['S-103', '15.10', '15.02', '=C4-B4', '=ABS(D4)'],
      ['S-104', '14.64', '14.71', '=C5-B5', '=ABS(D5)'],
      ['Mean', '=AVERAGE(B2:B5)', '=AVERAGE(C2:C5)', '=AVERAGE(D2:D5)', '=AVERAGE(E2:E5)'],
      ['SD', '=STDEV(B2:B5)', '=STDEV(C2:C5)', '=STDEV(D2:D5)', '=STDEV(E2:E5)'],
    ]);
    return {
      title: 'Wet Chem vs NIR Comparison',
      payload: { sheets: [sh], activeSheetId: sh.id, charts: [{ id: createId('ch'), title: 'Wet vs NIR', type: 'line', labelCol: 0, valueCol: 1, sheetId: sh.id, color: '#4f7a65' }], revisions: [] },
    };
  }
  if (templateKey === 'game_balancing') {
    const sh = makeSheetFromRows('XP Curve', [
      ['Level', 'XP Required', 'Base HP', 'Base ATK', 'DPS Est'],
      ['1', '100', '120', '15', '=D2*1.15'],
      ['2', '=B2*1.45', '=C2+25', '=D2+4', '=D3*1.15'],
      ['3', '=B3*1.45', '=C3+28', '=D3+5', '=D4*1.15'],
      ['4', '=B4*1.45', '=C4+32', '=D4+6', '=D5*1.15'],
      ['5', '=B5*1.45', '=C5+38', '=D5+7', '=D6*1.15'],
      ['Total XP', '=SUM(B2:B6)', '=MAX(C2:C6)', '=MAX(D2:D6)', '=AVERAGE(E2:E6)'],
    ]);
    return {
      title: 'Game Balancing & XP Curve',
      payload: { sheets: [sh], activeSheetId: sh.id, charts: [{ id: createId('ch'), title: 'XP Progression Curve', type: 'area', labelCol: 0, valueCol: 1, sheetId: sh.id, color: '#6b5ca5' }], revisions: [] },
    };
  }
  const sh = makeSheetFromRows('Sheet1', [
    ['Item', 'Quantity', 'Unit Cost', 'Total'],
    ['Sample Row 1', '3', '12.5', '=B2*C2'],
    ['Sample Row 2', '5', '8.0', '=B3*C3'],
    ['Grand Total', '=SUM(B2:B3)', '', '=SUM(D2:D3)'],
  ]);
  return { title: 'New Workbook', payload: { sheets: [sh], activeSheetId: sh.id, charts: [], revisions: [] } };
}

function formatCellDisplay(val: string | number, fmt?: SheetCell['format']): string {
  if (fmt === 'checkbox') return String(val).toUpperCase() === 'TRUE' || val === 1 ? '☑' : '☐';
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (fmt === 'currency') return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (fmt === 'percent') return `${(val * 100).toFixed(1)}%`;
    if (fmt === 'number') return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(val ?? '');
}

function exportWorkbookSpreadsheetMl(title: string, sheets: WorksheetDef[], evaluated: Record<string, Record<string, { value: string | number }>>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const wsXml = sheets
    .map((sh) => {
      const rowXml: string[] = [];
      for (let r = 0; r < sh.rows; r++) {
        const cellXml: string[] = [];
        for (let c = 0; c < sh.cols; c++) {
          const k = cellKey(c, r);
          const v = evaluated[sh.id]?.[k]?.value ?? '';
          const type = typeof v === 'number' && Number.isFinite(v) ? 'Number' : 'String';
          cellXml.push(`<Cell><Data ss:Type="${type}">${esc(String(v))}</Data></Cell>`);
        }
        rowXml.push(`<Row>${cellXml.join('')}</Row>`);
      }
      return `<Worksheet ss:Name="${esc(sh.name)}"><Table>${rowXml.join('')}</Table></Worksheet>`;
    })
    .join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <!-- Generated by Planaday Integrated Spreadsheet (${esc(title)}) -->
  ${wsXml}
</Workbook>`;
}

/** Clamp the visible grid to existing rows/columns, retaining absolute coordinates. */
export function getSheetGridWindow(size: number, page: number, pageSize: number, full = false) {
  const count = Math.max(0, Math.floor(Number.isFinite(size) ? size : 0));
  const step = Math.max(1, Math.floor(Number.isFinite(pageSize) ? pageSize : 1));
  const requested = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
  const start = full ? 0 : Math.min(requested * step, Math.max(0, Math.floor((count - 1) / step) * step));
  return { start, length: full ? count : Math.min(step, count - start) };
}

export const SpreadsheetView: React.FC = () => {
  const { records, pushToast } = useApp();
  
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));

  const workbooks = useMemo(
    () =>
      records
        .filter((r) => r.type === 'spreadsheet' && !r.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeRec: LifeRecord | null = useMemo(
    () => workbooks.find((w) => w.id === selectedId) ?? workbooks[0] ?? null,
    [workbooks, selectedId]
  );
  const payload = activeRec?.payload as WorkbookPayload | undefined;
  const activeSheet = useMemo(
    () => payload?.sheets?.find((s) => s.id === payload.activeSheetId) ?? payload?.sheets?.[0] ?? null,
    [payload]
  );

  const [selectedCell, setSelectedCell] = useState<string>('A1');
  const [gridPage, setGridPage] = useState({ row: 0, col: 0 });
  const [printFull, setPrintFull] = useState(false);
  const [confirmLargePrint, setConfirmLargePrint] = useState(false);
  const executeFullSheetPrint = () => {
    flushSync(() => setPrintFull(true));
    try {
      window.print();
    } catch (error) {
      setPrintFull(false);
      pushToast(String(error), { tone: 'danger' });
    }
  };
  useEffect(() => { const reset = () => setPrintFull(false); window.addEventListener('afterprint', reset); return () => window.removeEventListener('afterprint', reset); }, []);
  useEffect(() => { setGridPage({ row: 0, col: 0 }); setSelectedCell('A1'); }, [activeRec?.id, activeSheet?.id]);
  const rowWindow = getSheetGridWindow(activeSheet?.rows ?? 0, gridPage.row, 50, printFull);
  const rowStart = rowWindow.start;
  const colWindow = getSheetGridWindow(activeSheet?.cols ?? 0, gridPage.col, 20, printFull);
  const colStart = colWindow.start;
  const selectGridPage = (row: number, col: number) => {
    const r = Math.max(0, row), c = Math.max(0, col);
    setGridPage({ row: r, col: c });
    setSelectedCell(cellKey(c * 20, r * 50));
  };
  const [showFormulaDocs, setShowFormulaDocs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newRangeName, setNewRangeName] = useState('');
  const [newRangeRef, setNewRangeRef] = useState('');
  const [chartType, setChartType] = useState<'bar' | 'column' | 'line' | 'area' | 'scatter' | 'pie'>('column');
  const [chartLabelCol, setChartLabelCol] = useState(0);
  const [chartValueCol, setChartValueCol] = useState(1);
  const [chartTitle, setChartTitle] = useState('Chart 1');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const evaluated = useMemo(() => {
    if (!payload?.sheets) return {};
    return evaluateWorkbook(payload.sheets);
  }, [payload?.sheets]);

  const mutatePayload = async (updater: (p: WorkbookPayload) => WorkbookPayload) => {
    if (!activeRec) return;
    await updateRecord<WorkbookPayload>(activeRec.id, (cur) => ({
      ...cur,
      payload: updater(cur.payload),
    }));
  };

  const handleCreateTemplate = async (key: string) => {
    const tpl = buildTemplateWorkbook(key);
    const rec = await createRecord('spreadsheet', tpl.title, tpl.payload);
    setSelectedId(rec.id);
    setSelectedCell('A1');
    pushToast(`Created workbook "${tpl.title}"`, { tone: 'ok' });
  };

  const updateCell = async (key: string, patch: Partial<SheetCell>) => {
    if (!activeSheet) return;
    await mutatePayload((p) => ({
      ...p,
      sheets: p.sheets.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              cells: {
                ...s.cells,
                [key]: { ...s.cells[key], raw: patch.raw ?? s.cells[key]?.raw ?? '', ...patch },
              },
            }
          : s
      ),
    }));
  };

  const handlePullPlanadayData = async (source: 'tasks' | 'lab_inventory' | 'diary' | 'game_entities') => {
    let rows: string[][] = [];
    let sheetName = 'Live Data';
    if (source === 'tasks') {
      sheetName = 'Tasks Sync';
      rows = [
        ['Task', 'Status', 'Priority', 'Due Date', 'Est Min'],
        ...records
          .filter((r) => r.type === 'task' && !r.deletedAt)
          .slice(0, 60)
          .map((t) => [
            t.title,
            t.status,
            String((t.payload as { priority?: string }).priority ?? 'medium'),
            t.dueDate ?? '',
            String((t.payload as { estimateMin?: number }).estimateMin ?? 30),
          ]),
      ];
    } else if (source === 'lab_inventory') {
      sheetName = 'Lab Inventory';
      rows = [
        ['Item', 'Category', 'Quantity', 'Unit', 'Reorder At'],
        ...records
          .filter((r) => r.type === 'lab_inventory' && !r.deletedAt)
          .map((item) => {
            const p = item.payload as { category?: string; quantity?: number; unit?: string; reorderThreshold?: number };
            return [item.title, p.category ?? '', String(p.quantity ?? 0), p.unit ?? '', String(p.reorderThreshold ?? 0)];
          }),
      ];
    } else if (source === 'diary') {
      sheetName = 'Diary Ratings';
      rows = [
        ['Date / Title', 'Rating', 'Mood', 'Sleep Hrs'],
        ...records
          .filter((r) => r.type === 'diary' && !r.deletedAt)
          .slice(0, 60)
          .map((d) => {
            const p = d.payload as { rating?: number; mood?: string; sleepHours?: number };
            return [d.doDate ?? d.title, String(p.rating ?? ''), p.mood ?? '', String(p.sleepHours ?? '')];
          }),
      ];
    } else {
      sheetName = 'Game Entities';
      rows = [
        ['Entity', 'Category', 'HP / Power', 'Cost / Level'],
        ...records
          .filter((r) => r.type === 'game_entity' && !r.deletedAt)
          .map((g) => {
            const p = g.payload as { kind?: string; statPrimary?: number; statSecondary?: number };
            return [g.title, p.kind ?? 'unit', String(p.statPrimary ?? 0), String(p.statSecondary ?? 0)];
          }),
      ];
    }
    if (rows.length === 1) rows.push(['No records yet in this source', '0', '0', '', '']);
    const liveSheet = makeSheetFromRows(sheetName, rows);
    const nowIso = new Date().toISOString();
    if (!activeRec) {
      const rec = await createRecord('spreadsheet', `Planaday ${sheetName}`, {
        sheets: [liveSheet],
        activeSheetId: liveSheet.id,
        linkedSource: source,
        lastSyncedAt: nowIso,
        charts: [],
        revisions: [],
      } satisfies WorkbookPayload);
      setSelectedId(rec.id);
    } else {
      await mutatePayload((p) => ({
        ...p,
        linkedSource: source,
        lastSyncedAt: nowIso,
        sheets: [...p.sheets.filter((s) => s.name !== sheetName), liveSheet],
        activeSheetId: liveSheet.id,
      }));
    }
    pushToast(`Synced ${rows.length - 1} rows from ${sheetName}`, { tone: 'ok' });
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const sheet = importDelimitedToSheet(text, file.name.replace(/\.[^.]+$/, '').slice(0, 22));
    if (!activeRec) {
      const rec = await createRecord('spreadsheet', file.name, {
        sheets: [sheet],
        activeSheetId: sheet.id,
        charts: [],
        revisions: [],
      } satisfies WorkbookPayload);
      setSelectedId(rec.id);
    } else {
      await mutatePayload((p) => ({
        ...p,
        sheets: [...p.sheets, sheet],
        activeSheetId: sheet.id,
      }));
    }
    pushToast(`Imported "${file.name}"`, { tone: 'ok' });
  };

  const curCell = activeSheet?.cells[selectedCell];
  const curEval = activeSheet ? evaluated[activeSheet.id]?.[selectedCell] : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Top Workbook Header */}
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <FileSpreadsheet size={20} /> Integrated Spreadsheets
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Multi-sheet formulas (SUM, AVERAGE, COUNTIF, SUMIF, XLOOKUP, STDEV, PMT, cross-sheet refs), SVG charts, templates & Planaday live data pulls.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="dp-select"
            value={activeRec?.id ?? ''}
            onChange={(e) => { setSelectedId(e.target.value); setGridPage({ row: 0, col: 0 }); setSelectedCell('A1'); }}
            style={{ minWidth: 180 }}
          >
            {workbooks.length === 0 && <option value="">No workbooks yet</option>}
            {workbooks.map((w) => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
          <select
            className="dp-select"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                void handleCreateTemplate(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="">+ New from Template…</option>
            <option value="blank">Blank Workbook</option>
            <option value="personal_budget">Personal Budget</option>
            <option value="lab_budget">Lab Budget & Spend</option>
            <option value="client_pricing">Client Pricing & Margins</option>
            <option value="wet_nir">Wet Chemistry vs NIR</option>
            <option value="game_balancing">Game Balancing & XP Curve</option>
          </select>
          <button type="button" className="dp-btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Import CSV/TSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportCsv(f);
              e.target.value = '';
            }}
          />
          {activeRec && (
            <button
              type="button"
              className="dp-btn"
              onClick={guardAction('action-1', async () => {
                await softDeleteRecord(activeRec.id);
                setSelectedId(null);
                pushToast('Moved workbook to Trash', { tone: 'info' });
              })}
              title="Delete workbook"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Live Planaday Data Pull Bar */}
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', padding: '0.6rem 0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Database size={15} />
          <strong style={{ fontSize: '0.82rem' }}>Live Planaday Data Pull:</strong>
          <button type="button" className="dp-btn" onClick={() => void handlePullPlanadayData('tasks')}>Pull Tasks</button>
          <button type="button" className="dp-btn" onClick={() => void handlePullPlanadayData('lab_inventory')}>Pull Lab Inventory</button>
          <button type="button" className="dp-btn" onClick={() => void handlePullPlanadayData('diary')}>Pull Diary Ratings</button>
          <button type="button" className="dp-btn" onClick={() => void handlePullPlanadayData('game_entities')}>Pull Game Entities</button>
        </div>
        {payload?.linkedSource && (
          <span className="dp-badge">
            <RefreshCw size={11} /> Synced snapshot ({payload.linkedSource}) · {payload.lastSyncedAt ? new Date(payload.lastSyncedAt).toLocaleTimeString() : 'manual'}
          </span>
        )}
      </div>

      {!activeRec || !activeSheet || !payload ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Create a blank workbook, pick a built-in template, or pull live Planaday records above.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button type="button" className="dp-btn dp-btn-primary" onClick={guardAction('sheet-create', () => handleCreateTemplate('personal_budget'))}>
              Start with Personal Budget
            </button>
            <button type="button" className="dp-btn" onClick={guardAction('sheet-create', () => handleCreateTemplate('wet_nir'))}>
              Start with Wet vs NIR
            </button>
            <button type="button" className="dp-btn" onClick={guardAction('sheet-create', () => handleCreateTemplate('game_balancing'))}>
              Start with Game Balancing
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Formula Bar & Formatting Toolbar */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="dp-badge" style={{ fontFamily: 'monospace', minWidth: 44, textAlign: 'center' }}>{selectedCell}</span>
              <input
                className="dp-input"
                aria-label="Formula bar"
                value={curCell?.raw ?? ''}
                onChange={(e) => void updateCell(selectedCell, { raw: e.target.value })}
                placeholder="Enter value or formula starting with = (e.g. =SUM(B2:B5), =Sheet2!A1)"
                style={{ flex: 1, minWidth: 220, fontFamily: 'monospace' }}
              />
              {curEval?.error && <span className="dp-badge" style={{ color: 'var(--dp-danger)' }}>{curEval.error}</span>}
              <button type="button" className="dp-btn" onClick={() => setShowFormulaDocs((v) => !v)}>
                <Sigma size={13} /> Formulas
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  const snap = {
                    timestamp: new Date().toISOString(),
                    summary: `Snapshot (${payload.sheets.length} sheet(s))`,
                    sheets: JSON.parse(JSON.stringify(payload.sheets)) as WorksheetDef[],
                  };
                  await mutatePayload((p) => ({ ...p, revisions: [snap, ...(p.revisions ?? []).slice(0, 14)] }));
                  pushToast('Saved workbook version snapshot', { tone: 'ok' });
                }}
              >
                <History size={13} /> Snapshot
              </button>
              <button type="button" className="dp-btn" onClick={() => setShowHistory((v) => !v)}>
                Versions ({payload.revisions?.length ?? 0})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className={`dp-btn ${curCell?.bold ? 'dp-btn-primary' : ''}`} onClick={() => void updateCell(selectedCell, { bold: !curCell?.bold })}><strong>B</strong></button>
              <button type="button" className={`dp-btn ${curCell?.italic ? 'dp-btn-primary' : ''}`} onClick={() => void updateCell(selectedCell, { italic: !curCell?.italic })}><em>I</em></button>
              <select
                className="dp-select"
                value={curCell?.format ?? 'general'}
                onChange={(e) => void updateCell(selectedCell, { format: e.target.value as SheetCell['format'] })}
                style={{ width: 115 }}
              >
                <option value="general">General</option>
                <option value="number">Number</option>
                <option value="currency">Currency ($)</option>
                <option value="percent">Percent (%)</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <input
                type="color"
                title="Cell fill color"
                value={curCell?.bgColor || '#ffffff'}
                onChange={(e) => void updateCell(selectedCell, { bgColor: e.target.value })}
                style={{ width: 30, height: 28 }}
              />
              <button
                type="button"
                className="dp-btn"
                onClick={() => void mutatePayload((p) => ({ ...p, sheets: p.sheets.map((s) => (s.id === activeSheet.id ? { ...s, rows: s.rows + 5 } : s)) }))}
              >
                +5 Rows
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={() => void mutatePayload((p) => ({ ...p, sheets: p.sheets.map((s) => (s.id === activeSheet.id ? { ...s, cols: s.cols + 2 } : s)) }))}
              >
                +2 Cols
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  const csv = exportSheetToDelimited(activeSheet, evaluated[activeSheet.id] ?? {}, ',');
                  downloadFile({ filename: `${activeRec.title}-${activeSheet.name}.csv`, content: csv, mimeType: 'text/csv;charset=utf-8' });
                }}
              >
                <Download size={13} /> CSV
              </button>
              <button
                type="button"
                className="dp-btn"
                title="Exports Excel-compatible SpreadsheetML 2003 XML (.xls)"
                onClick={() => {
                  const xml = exportWorkbookSpreadsheetMl(activeRec.title, payload.sheets, evaluated);
                  downloadFile({ filename: `${activeRec.title}.xls`, content: xml, mimeType: 'application/vnd.ms-excel' });
                  pushToast('Exported SpreadsheetML (.xls) compatible with Excel & LibreOffice', { tone: 'ok' });
                }}
              >
                <Download size={13} /> Excel (.xls)
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  if (activeSheet.rows * activeSheet.cols > 100000) {
                    setConfirmLargePrint(true);
                    return;
                  }
                  executeFullSheetPrint();
                }}
              >
                <Printer size={13} /> Print / PDF
              </button>
            </div>

            {showFormulaDocs && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.35rem', padding: '0.5rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)' }}>
                {SPREADSHEET_FORMULA_DOCS.map((doc) => (
                  <button
                    key={doc.fn}
                    type="button"
                    className="dp-btn"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', padding: '0.4rem' }}
                    onClick={() => void updateCell(selectedCell, { raw: doc.syntax })}
                  >
                    <strong style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{doc.syntax}</strong>
                    <span className="dp-muted" style={{ fontSize: '0.72rem' }}>{doc.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {showHistory && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.45rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)' }}>
                {(payload.revisions ?? []).length === 0 ? (
                  <span className="dp-muted" style={{ fontSize: '0.8rem' }}>No snapshots saved yet.</span>
                ) : (
                  (payload.revisions ?? []).map((rev, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="dp-btn"
                      onClick={async () => {
                        await mutatePayload((p) => ({ ...p, sheets: rev.sheets, activeSheetId: rev.sheets[0]?.id ?? p.activeSheetId }));
                        pushToast('Restored workbook snapshot', { tone: 'ok' });
                      }}
                    >
                      Restore {new Date(rev.timestamp).toLocaleTimeString()} ({rev.summary})
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Named Ranges */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem' }}>
              <span className="dp-muted">Named Ranges:</span>
              {Object.entries(activeSheet.namedRanges ?? {}).map(([k, v]) => (
                <span key={k} className="dp-badge">{k} → {v}</span>
              ))}
              <input className="dp-input" placeholder="Name (e.g. TaxRate)" value={newRangeName} onChange={(e) => setNewRangeName(e.target.value)} style={{ width: 120 }} />
              <input className="dp-input" placeholder="Ref (e.g. B2:B5)" value={newRangeRef} onChange={(e) => setNewRangeRef(e.target.value)} style={{ width: 100 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  if (!newRangeName.trim() || !newRangeRef.trim()) return;
                  await mutatePayload((p) => ({
                    ...p,
                    sheets: p.sheets.map((s) =>
                      s.id === activeSheet.id ? { ...s, namedRanges: { ...(s.namedRanges ?? {}), [newRangeName.trim()]: newRangeRef.trim().toUpperCase() } } : s
                    ),
                  }));
                  setNewRangeName('');
                  setNewRangeRef('');
                }}
              >
                Add Range
              </button>
            </div>
          </div>

          {/* Interactive Spreadsheet Grid — bounded DOM, full workbook formulas */}
          <div className="dp-row dp-no-print" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="dp-btn dp-btn-sm" disabled={rowStart === 0} onClick={() => selectGridPage(rowStart / 50 - 1, colStart / 20)}>Previous rows</button>
            <button type="button" className="dp-btn dp-btn-sm" disabled={rowStart + 50 >= activeSheet.rows} onClick={() => selectGridPage(rowStart / 50 + 1, colStart / 20)}>Next rows</button>
            <button type="button" className="dp-btn dp-btn-sm" disabled={colStart === 0} onClick={() => selectGridPage(rowStart / 50, colStart / 20 - 1)}>Previous columns</button>
            <button type="button" className="dp-btn dp-btn-sm" disabled={colStart + 20 >= activeSheet.cols} onClick={() => selectGridPage(rowStart / 50, colStart / 20 + 1)}>Next columns</button>
            <span className="dp-muted" role="status">Rows {rowStart + 1}–{Math.min(rowStart + 50, activeSheet.rows)} of {activeSheet.rows}; columns {colIndexToLetter(colStart)}–{colIndexToLetter(Math.min(colStart + 19, activeSheet.cols - 1))}</span>
            <label>Go to cell <input className="dp-input" style={{ width: 85 }} placeholder="A1" onKeyDown={e => { if (e.key !== 'Enter') return; const ref = parseCellRef(e.currentTarget.value); if (ref && ref.row >= 0 && ref.col >= 0 && ref.row < activeSheet.rows && ref.col < activeSheet.cols) { setGridPage({ row: Math.floor(ref.row / 50), col: Math.floor(ref.col / 20) }); setSelectedCell(cellKey(ref.col, ref.row)); } }} /></label>
          </div>
          <div className="dp-card dp-sheet-grid" style={{ padding: 0, overflow: 'auto', maxHeight: 460 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: colWindow.length * 96, fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ width: 38, background: 'var(--dp-paper-alt)', border: '1px solid var(--dp-border)', position: 'sticky', left: 0, top: 0, zIndex: 3 }}>#</th>
                  {Array.from({ length: colWindow.length }, (_, i) => colStart + i).map((c) => (
                    <th
                      key={c}
                      style={{
                        minWidth: 96,
                        padding: '0.3rem',
                        background: 'var(--dp-paper-alt)',
                        border: '1px solid var(--dp-border)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      {colIndexToLetter(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowWindow.length }, (_, i) => rowStart + i).map((r) => (
                  <tr key={r}>
                    <td
                      style={{
                        textAlign: 'center',
                        background: 'var(--dp-paper-alt)',
                        border: '1px solid var(--dp-border)',
                        fontWeight: 600,
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      {r + 1}
                    </td>
                    {Array.from({ length: colWindow.length }, (_, i) => colStart + i).map((c) => {
                      const k = cellKey(c, r);
                      const cell = activeSheet.cells[k];
                      const ev = evaluated[activeSheet.id]?.[k];
                      const isSel = !printFull && selectedCell === k;
                      const displayVal = isSel ? cell?.raw ?? '' : formatCellDisplay(ev?.value ?? '', cell?.format);
                      return (
                        <td
                          key={k}
                          onClick={() => setSelectedCell(k)}
                          style={{
                            border: isSel ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                            padding: 0,
                            background: cell?.bgColor || 'var(--dp-paper)',
                          }}
                        >
                          {cell?.format === 'checkbox' ? (
                            <div style={{ textAlign: 'center', padding: '0.2rem' }}>
                              <input
                                type="checkbox"
                                checked={String(cell.raw).toUpperCase() === 'TRUE' || cell.raw === '1'}
                                onChange={(e) => void updateCell(k, { raw: e.target.checked ? 'TRUE' : 'FALSE' })}
                              />
                            </div>
                          ) : (
                            <input
                              value={displayVal}
                              onFocus={() => setSelectedCell(k)}
                              onChange={(e) => void updateCell(k, { raw: e.target.value })}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '0.32rem 0.42rem',
                                fontWeight: cell?.bold ? 700 : 400,
                                fontStyle: cell?.italic ? 'italic' : 'normal',
                                color: ev?.error ? 'var(--dp-danger)' : cell?.color || 'var(--dp-ink)',
                                textAlign: cell?.align ?? (typeof ev?.value === 'number' ? 'right' : 'left'),
                                outline: 'none',
                                fontSize: '0.82rem',
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Sheet Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {payload.sheets.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`dp-btn ${s.id === activeSheet.id ? 'dp-btn-primary' : ''}`}
                onClick={() => void mutatePayload((p) => ({ ...p, activeSheetId: s.id }))}
              >
                {s.name}
              </button>
            ))}
            <button
              type="button"
              className="dp-btn"
              onClick={async () => {
                const ns = makeSheetFromRows(`Sheet${payload.sheets.length + 1}`, [['Column A', 'Column B', 'Column C']]);
                await mutatePayload((p) => ({ ...p, sheets: [...p.sheets, ns], activeSheetId: ns.id }));
              }}
            >
              <Plus size={13} /> Add Sheet
            </button>
          </div>

          {/* Embedded SVG Chart Builder (§27.2) */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BarChart3 size={16} /> Charts & Visualizations
              </h4>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="dp-input" value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} style={{ width: 130 }} placeholder="Chart title" />
                <select className="dp-select" value={chartType} onChange={(e) => setChartType(e.target.value as typeof chartType)}>
                  <option value="column">Column</option>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="scatter">Scatter</option>
                  <option value="pie">Pie</option>
                </select>
                <label style={{ fontSize: '0.76rem' }}>
                  Labels Col:
                  <select className="dp-select" value={chartLabelCol} onChange={(e) => setChartLabelCol(Number(e.target.value))}>
                    {Array.from({ length: activeSheet.cols }).map((_, c) => <option key={c} value={c}>{colIndexToLetter(c)}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: '0.76rem' }}>
                  Values Col:
                  <select className="dp-select" value={chartValueCol} onChange={(e) => setChartValueCol(Number(e.target.value))}>
                    {Array.from({ length: activeSheet.cols }).map((_, c) => <option key={c} value={c}>{colIndexToLetter(c)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={() =>
                    void mutatePayload((p) => ({
                      ...p,
                      charts: [
                        ...(p.charts ?? []),
                        { id: createId('ch'), title: chartTitle || 'Chart', type: chartType, labelCol: chartLabelCol, valueCol: chartValueCol, sheetId: activeSheet.id, color: '#3b6ea5' },
                      ],
                    }))
                  }
                >
                  <Plus size={13} /> Add Chart
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '0.75rem' }}>
              {(payload.charts ?? []).map((ch) => {
                const sh = payload.sheets.find((s) => s.id === ch.sheetId) ?? activeSheet;
                const shEval = evaluated[sh.id] ?? {};
                const pts: Array<{ label: string; value: number }> = [];
                for (let r = 1; r < sh.rows; r++) {
                  const lbl = String(shEval[cellKey(ch.labelCol, r)]?.value ?? '').trim();
                  const val = Number(shEval[cellKey(ch.valueCol, r)]?.value);
                  if (lbl && Number.isFinite(val) && !/^total|mean|average|sd$/i.test(lbl)) {
                    pts.push({ label: lbl, value: val });
                  }
                }
                const maxV = pts.reduce((max, p) => Math.max(max, Math.abs(p.value)), 1);
                const sumV = Math.max(1, pts.reduce((s, p) => s + Math.max(0, p.value), 0));
                const palette = ['#3b6ea5', '#c96f53', '#4f7a65', '#6b5ca5', '#b47438', '#2f7a78'];

                return (
                  <div key={ch.id} style={{ padding: '0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{ch.title} ({ch.type})</strong>
                      <button
                        type="button"
                        className="dp-btn"
                        onClick={() => void mutatePayload((p) => ({ ...p, charts: (p.charts ?? []).filter((x) => x.id !== ch.id) }))}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {pts.length === 0 ? (
                      <div className="dp-muted" style={{ fontSize: '0.78rem' }}>No numeric data rows found in selected columns.</div>
                    ) : ch.type === 'pie' ? (
                      <svg viewBox="0 0 280 150" style={{ width: '100%', height: 150 }}>
                        {(() => {
                          let acc = 0;
                          return pts.map((p, i) => {
                            const frac = Math.max(0, p.value) / sumV;
                            const a0 = acc * Math.PI * 2;
                            acc += frac;
                            const a1 = acc * Math.PI * 2;
                            const r = 56;
                            const cx = 75;
                            const cy = 75;
                            const x0 = cx + r * Math.cos(a0);
                            const y0 = cy + r * Math.sin(a0);
                            const x1 = cx + r * Math.cos(a1);
                            const y1 = cy + r * Math.sin(a1);
                            const large = frac > 0.5 ? 1 : 0;
                            const col = palette[i % palette.length];
                            return (
                              <g key={i}>
                                <path d={`M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`} fill={col} />
                                <rect x={150} y={14 + i * 18} width={10} height={10} fill={col} />
                                <text x={165} y={23 + i * 18} fontSize={10} fill="var(--dp-ink)">{p.label.slice(0, 14)} ({(frac * 100).toFixed(0)}%)</text>
                              </g>
                            );
                          });
                        })()}
                      </svg>
                    ) : (
                      <svg viewBox="0 0 320 155" style={{ width: '100%', height: 155 }}>
                        {ch.type === 'bar'
                          ? pts.slice(0, 8).map((p, i) => (
                              <g key={i}>
                                <text x={4} y={20 + i * 18} fontSize={9} fill="var(--dp-ink)">{p.label.slice(0, 10)}</text>
                                <rect x={78} y={10 + i * 18} width={(Math.abs(p.value) / maxV) * 200} height={12} fill={palette[i % palette.length]} rx={2} />
                                <text x={82 + (Math.abs(p.value) / maxV) * 200} y={20 + i * 18} fontSize={9} fill="var(--dp-ink)">{p.value.toFixed(1)}</text>
                              </g>
                            ))
                          : ch.type === 'line' || ch.type === 'area' || ch.type === 'scatter'
                          ? (() => {
                              const coords = pts.map((p, i) => ({
                                x: 24 + (i / Math.max(1, pts.length - 1)) * 276,
                                y: 128 - (Math.max(0, p.value) / maxV) * 106,
                                label: p.label,
                              }));
                              const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
                              const areaD = `${lineD} L${coords[coords.length - 1].x},128 L${coords[0].x},128 Z`;
                              return (
                                <g>
                                  {ch.type === 'area' && <path d={areaD} fill={ch.color || '#3b6ea5'} opacity={0.22} />}
                                  {ch.type !== 'scatter' && <path d={lineD} fill="none" stroke={ch.color || '#3b6ea5'} strokeWidth={2.2} />}
                                  {coords.map((c, i) => (
                                    <g key={i}>
                                      <circle cx={c.x} cy={c.y} r={3.5} fill={ch.color || '#3b6ea5'} />
                                      <text x={c.x} y={145} fontSize={8} textAnchor="middle" fill="var(--dp-ink)">{c.label.slice(0, 7)}</text>
                                    </g>
                                  ))}
                                </g>
                              );
                            })()
                          : pts.slice(0, 10).map((p, i) => {
                              const bw = Math.min(36, 260 / pts.length - 6);
                              const bx = 22 + i * (276 / pts.length);
                              const bh = (Math.abs(p.value) / maxV) * 105;
                              return (
                                <g key={i}>
                                  <rect x={bx} y={125 - bh} width={bw} height={bh} fill={palette[i % palette.length]} rx={2} />
                                  <text x={bx + bw / 2} y={140} fontSize={8} textAnchor="middle" fill="var(--dp-ink)">{p.label.slice(0, 7)}</text>
                                </g>
                              );
                            })}
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <ModalDialog
        open={confirmLargePrint}
        onClose={() => setConfirmLargePrint(false)}
        title="Print Very Large Sheet?"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="dp-btn" onClick={() => setConfirmLargePrint(false)}>Cancel</button>
            <button
              type="button"
              className="dp-btn dp-btn-primary"
              onClick={() => {
                setConfirmLargePrint(false);
                executeFullSheetPrint();
              }}
            >
              Continue Printing
            </button>
          </div>
        }
      >
        <p style={{ margin: 0 }}>
          This sheet contains more than 100,000 cells ({activeSheet ? `${activeSheet.rows.toLocaleString()} × ${activeSheet.cols.toLocaleString()}` : ''}).
          Mounting the full grid for printing may take extra time and memory. Continue?
        </p>
      </ModalDialog>
    </div>
  );
};
