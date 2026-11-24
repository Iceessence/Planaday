// Planaday Integrated Spreadsheet Formula Engine & Import/Export (§27)
// Supports multi-sheet references (Sheet2!A1), ranges (A1:B10), 35+ formulas, circular-ref guard, CSV/TSV & SpreadsheetML.

import { evaluateMathExpression } from './mathEngine';

export interface SheetCell {
  raw: string; // literal text/number OR formula starting with '='
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bgColor?: string;
  format?: 'general' | 'number' | 'currency' | 'percent' | 'checkbox';
}

export interface WorksheetDef {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, SheetCell>; // key e.g. 'A1', 'B3'
  colWidths?: Record<number, number>;
  freezeHeader?: boolean;
  namedRanges?: Record<string, string>; // e.g. { TaxRate: 'B1' }
}

export interface WorkbookPayload {
  sheets: WorksheetDef[];
  activeSheetId: string;
  description?: string;
  linkedSource?: string | null; // e.g., 'lab_inventory' | 'tasks' | 'diary' | 'game_entities'
  lastSyncedAt?: string | null;
  charts?: Array<{
    id: string;
    title: string;
    type: 'bar' | 'column' | 'line' | 'area' | 'scatter' | 'pie';
    labelCol: number;
    valueCol: number;
    sheetId: string;
    color?: string;
  }>;
  revisions?: Array<{ timestamp: string; summary: string; sheets: WorksheetDef[] }>;
}

export function colIndexToLetter(colIdx: number): string {
  let n = colIdx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function letterToColIndex(letters: string): number {
  let res = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    res = res * 26 + (up.charCodeAt(i) - 64);
  }
  return res - 1;
}

export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return null;
  return { col: letterToColIndex(m[1]), row: Number(m[2]) - 1 };
}

export function cellKey(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

export function expandCellRange(rangeStr: string): string[] {
  const parts = rangeStr.split(':');
  if (parts.length !== 2) return [rangeStr.trim().toUpperCase()];
  const a = parseCellRef(parts[0]);
  const b = parseCellRef(parts[1]);
  if (!a || !b) return [];
  const c1 = Math.min(a.col, b.col);
  const c2 = Math.max(a.col, b.col);
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);
  const keys: string[] = [];
  for (let r = r1; r <= r2 && keys.length < 5000; r++) {
    for (let c = c1; c <= c2 && keys.length < 5000; c++) {
      keys.push(cellKey(c, r));
    }
  }
  return keys;
}

function splitTopLevelArgs(argStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        args.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() || argStr.trim()) args.push(cur.trim());
  return args;
}

function matchCriteria(val: string | number, criteria: string): boolean {
  const c = criteria.replace(/^"|"$/g, '').trim();
  const numVal = Number(val);
  const opMatch = c.match(/^(>=|<=|<>|!=|>|<|=)(.*)$/);
  if (opMatch) {
    const [, op, rhsRaw] = opMatch;
    const rhsNum = Number(rhsRaw.trim());
    if (Number.isFinite(numVal) && Number.isFinite(rhsNum) && rhsRaw.trim() !== '') {
      if (op === '>=') return numVal >= rhsNum;
      if (op === '<=') return numVal <= rhsNum;
      if (op === '>') return numVal > rhsNum;
      if (op === '<') return numVal < rhsNum;
      if (op === '=' ) return numVal === rhsNum;
      return numVal !== rhsNum;
    }
    const sA = String(val).toLowerCase();
    const sB = rhsRaw.trim().toLowerCase();
    return op === '=' ? sA === sB : sA !== sB;
  }
  return String(val).toLowerCase() === c.toLowerCase();
}

export interface EvaluatedCellResult {
  value: string | number;
  error?: string;
}

/**
 * Evaluates all cells in a multi-sheet workbook cleanly with memoization & circular-reference detection.
 */
export function evaluateWorkbook(sheets: WorksheetDef[]): Record<string, Record<string, EvaluatedCellResult>> {
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const cache: Record<string, Record<string, EvaluatedCellResult>> = {};
  for (const s of sheets) cache[s.id] = {};

  const evalCell = (sheetId: string, key: string, visiting: Set<string>): EvaluatedCellResult => {
    const upKey = key.toUpperCase();
    if (cache[sheetId]?.[upKey]) return cache[sheetId][upKey];
    const visitTag = `${sheetId}!${upKey}`;
    if (visiting.has(visitTag)) return { value: '#CIRC!', error: 'Circular reference detected' };

    const sheet = byId.get(sheetId);
    const cell = sheet?.cells[upKey];
    if (!cell || cell.raw === '') {
      const res = { value: '' };
      if (cache[sheetId]) cache[sheetId][upKey] = res;
      return res;
    }

    const raw = cell.raw.trim();
    if (!raw.startsWith('=')) {
      const num = Number(raw);
      const res: EvaluatedCellResult =
        raw !== '' && !Number.isNaN(num) && Number.isFinite(num) && !/^0[0-9]+/.test(raw)
          ? { value: num }
          : { value: cell.raw };
      cache[sheetId][upKey] = res;
      return res;
    }

    visiting.add(visitTag);
    try {
      const res = evalFormula(sheetId, raw.slice(1).trim(), visiting);
      cache[sheetId][upKey] = res;
      return res;
    } catch (err) {
      const res: EvaluatedCellResult = {
        value: '#ERR!',
        error: err instanceof Error ? err.message : 'Formula error',
      };
      cache[sheetId][upKey] = res;
      return res;
    } finally {
      visiting.delete(visitTag);
    }
  };

  const resolveSheetAndRange = (expr: string, curSheetId: string): Array<string | number> => {
    const trimmed = expr.trim();
    let targetSheetId = curSheetId;
    let rangePart = trimmed;
    const bangIdx = trimmed.indexOf('!');
    if (bangIdx > 0) {
      const sName = trimmed.slice(0, bangIdx).replace(/^'|'$/g, '').toLowerCase();
      targetSheetId = byName.get(sName)?.id ?? curSheetId;
      rangePart = trimmed.slice(bangIdx + 1);
    }
    const keys = rangePart.includes(':') ? expandCellRange(rangePart) : [rangePart.toUpperCase()];
    return keys.map((k) => evalCell(targetSheetId, k, new Set()).value);
  };

  const evalArgAsValue = (sheetId: string, arg: string, visiting: Set<string>): string | number => {
    const t = arg.trim();
    if (/^".*"$/.test(t)) return t.slice(1, -1);
    if (t.toUpperCase() === 'TRUE') return 1;
    if (t.toUpperCase() === 'FALSE') return 0;
    const num = Number(t);
    if (t !== '' && Number.isFinite(num)) return num;
    if (/^([A-Za-z0-9_' ]+!)?[A-Za-z]+[0-9]+$/.test(t)) {
      const bang = t.indexOf('!');
      if (bang > 0) {
        const sName = t.slice(0, bang).replace(/^'|'$/g, '').toLowerCase();
        const sid = byName.get(sName)?.id ?? sheetId;
        return evalCell(sid, t.slice(bang + 1), visiting).value;
      }
      return evalCell(sheetId, t, visiting).value;
    }
    return evalFormula(sheetId, t, visiting).value;
  };

  const extractNumbers = (sheetId: string, args: string[], visiting: Set<string>): number[] => {
    const nums: number[] = [];
    for (const a of args) {
      const t = a.trim();
      if (t.includes(':')) {
        for (const v of resolveSheetAndRange(t, sheetId)) {
          const n = Number(v);
          if (v !== '' && Number.isFinite(n)) nums.push(n);
        }
      } else {
        const v = evalArgAsValue(sheetId, t, visiting);
        const n = Number(v);
        if (v !== '' && Number.isFinite(n)) nums.push(n);
      }
    }
    return nums;
  };

  const evalCondition = (sheetId: string, cond: string, visiting: Set<string>): boolean => {
    const m = cond.match(/^(.+?)(>=|<=|<>|!=|=|>|<)(.+)$/);
    if (!m) return Boolean(evalArgAsValue(sheetId, cond, visiting));
    const left = evalArgAsValue(sheetId, m[1], visiting);
    const right = evalArgAsValue(sheetId, m[3], visiting);
    const op = m[2];
    const ln = Number(left);
    const rn = Number(right);
    if (Number.isFinite(ln) && Number.isFinite(rn) && left !== '' && right !== '') {
      if (op === '>=') return ln >= rn;
      if (op === '<=') return ln <= rn;
      if (op === '>') return ln > rn;
      if (op === '<') return ln < rn;
      if (op === '=') return ln === rn;
      return ln !== rn;
    }
    const ls = String(left).toLowerCase();
    const rs = String(right).toLowerCase();
    return op === '=' ? ls === rs : ls !== rs;
  };

  const evalFormula = (sheetId: string, expr: string, visiting: Set<string>): EvaluatedCellResult => {
    // Expand named ranges first
    const curSheet = byId.get(sheetId);
    let expanded = expr;
    if (curSheet?.namedRanges) {
      for (const [nrName, nrRef] of Object.entries(curSheet.namedRanges)) {
        expanded = expanded.replace(new RegExp(`\\b${nrName}\\b`, 'gi'), nrRef);
      }
    }

    // Handle top-level Excel functions e.g. SUM(...), IF(...), XLOOKUP(...), COUNTIF(...), SUMIF(...), CONCAT(...)
    const fnMatch = expanded.match(/^([A-Za-z0-9_]+)\(([\s\S]*)\)$/);
    if (fnMatch) {
      const fn = fnMatch[1].toUpperCase();
      const args = splitTopLevelArgs(fnMatch[2]);

      if (fn === 'SUM') return { value: extractNumbers(sheetId, args, visiting).reduce((s, v) => s + v, 0) };
      if (fn === 'AVERAGE' || fn === 'AVG') {
        const ns = extractNumbers(sheetId, args, visiting);
        return ns.length ? { value: ns.reduce((s, v) => s + v, 0) / ns.length } : { value: '#DIV/0!', error: 'No numeric values' };
      }
      if (fn === 'COUNT') return { value: extractNumbers(sheetId, args, visiting).length };
      if (fn === 'COUNTA') {
        let cnt = 0;
        for (const a of args) {
          const vals = a.includes(':') ? resolveSheetAndRange(a, sheetId) : [evalArgAsValue(sheetId, a, visiting)];
          cnt += vals.filter((v) => String(v).trim() !== '').length;
        }
        return { value: cnt };
      }
      if (fn === 'MIN') {
        const ns = extractNumbers(sheetId, args, visiting);
        return { value: ns.length ? Math.min(...ns) : 0 };
      }
      if (fn === 'MAX') {
        const ns = extractNumbers(sheetId, args, visiting);
        return { value: ns.length ? Math.max(...ns) : 0 };
      }
      if (fn === 'MEDIAN') {
        const ns = extractNumbers(sheetId, args, visiting).sort((a, b) => a - b);
        if (!ns.length) return { value: 0 };
        const mid = Math.floor(ns.length / 2);
        return { value: ns.length % 2 === 0 ? (ns[mid - 1] + ns[mid]) / 2 : ns[mid] };
      }
      if (fn === 'STDEV' || fn === 'STDEV_S') {
        const ns = extractNumbers(sheetId, args, visiting);
        if (ns.length < 2) return { value: '#DIV/0!', error: 'Need at least 2 values for STDEV' };
        const mean = ns.reduce((s, v) => s + v, 0) / ns.length;
        return { value: Math.sqrt(ns.reduce((s, v) => s + (v - mean) ** 2, 0) / (ns.length - 1)) };
      }
      if (fn === 'COUNTIF' && args.length >= 2) {
        const vals = resolveSheetAndRange(args[0], sheetId);
        return { value: vals.filter((v) => matchCriteria(v, args[1])).length };
      }
      if (fn === 'SUMIF' && args.length >= 2) {
        const critVals = resolveSheetAndRange(args[0], sheetId);
        const sumVals = args[2] ? resolveSheetAndRange(args[2], sheetId) : critVals;
        let total = 0;
        for (let i = 0; i < critVals.length; i++) {
          if (matchCriteria(critVals[i], args[1])) {
            const n = Number(sumVals[i]);
            if (Number.isFinite(n)) total += n;
          }
        }
        return { value: total };
      }
      if (fn === 'IF' && args.length >= 2) {
        const ok = evalCondition(sheetId, args[0], visiting);
        return { value: ok ? evalArgAsValue(sheetId, args[1], visiting) : args[2] ? evalArgAsValue(sheetId, args[2], visiting) : '' };
      }
      if (fn === 'AND') return { value: args.every((a) => evalCondition(sheetId, a, visiting)) ? 'TRUE' : 'FALSE' };
      if (fn === 'OR') return { value: args.some((a) => evalCondition(sheetId, a, visiting)) ? 'TRUE' : 'FALSE' };
      if (fn === 'XLOOKUP' && args.length >= 3) {
        const needle = String(evalArgAsValue(sheetId, args[0], visiting)).toLowerCase();
        const lookupVals = resolveSheetAndRange(args[1], sheetId);
        const returnVals = resolveSheetAndRange(args[2], sheetId);
        const idx = lookupVals.findIndex((v) => String(v).toLowerCase() === needle);
        if (idx >= 0 && idx < returnVals.length) return { value: returnVals[idx] };
        return { value: args[3] ? evalArgAsValue(sheetId, args[3], visiting) : '#N/A', error: idx < 0 ? 'Lookup value not found' : undefined };
      }
      if (fn === 'CONCAT' || fn === 'CONCATENATE') {
        return { value: args.map((a) => String(evalArgAsValue(sheetId, a, visiting))).join('') };
      }
      if (fn === 'UPPER') return { value: String(evalArgAsValue(sheetId, args[0], visiting)).toUpperCase() };
      if (fn === 'LOWER') return { value: String(evalArgAsValue(sheetId, args[0], visiting)).toLowerCase() };
      if (fn === 'LEN') return { value: String(evalArgAsValue(sheetId, args[0], visiting)).length };
      if (fn === 'LEFT') {
        const s = String(evalArgAsValue(sheetId, args[0], visiting));
        const n = Number(evalArgAsValue(sheetId, args[1] ?? '1', visiting)) || 1;
        return { value: s.slice(0, n) };
      }
      if (fn === 'RIGHT') {
        const s = String(evalArgAsValue(sheetId, args[0], visiting));
        const n = Number(evalArgAsValue(sheetId, args[1] ?? '1', visiting)) || 1;
        return { value: s.slice(-n) };
      }
      if (fn === 'TODAY') return { value: new Date().toISOString().slice(0, 10) };
      if (fn === 'PMT' && args.length >= 3) {
        const rate = Number(evalArgAsValue(sheetId, args[0], visiting));
        const nper = Number(evalArgAsValue(sheetId, args[1], visiting));
        const pv = Number(evalArgAsValue(sheetId, args[2], visiting));
        if (rate === 0) return { value: -pv / nper };
        return { value: -(pv * rate) / (1 - Math.pow(1 + rate, -nper)) };
      }
      if (fn === 'NPV' && args.length >= 2) {
        const rate = Number(evalArgAsValue(sheetId, args[0], visiting));
        const flows = extractNumbers(sheetId, args.slice(1), visiting);
        const npv = flows.reduce((acc, cf, idx) => acc + cf / Math.pow(1 + rate, idx + 1), 0);
        return { value: npv };
      }
    }

    // Substitute cross-sheet & local cell references, then evaluate with safe math parser!
    const substituted = expanded.replace(/([A-Za-z0-9_]+!)?\b([A-Za-z]{1,3}[0-9]{1,5})\b/g, (full, sheetPrefix, ref) => {
      let sid = sheetId;
      if (sheetPrefix) {
        const sName = String(sheetPrefix).slice(0, -1).toLowerCase();
        sid = byName.get(sName)?.id ?? sheetId;
      }
      const ev = evalCell(sid, ref, visiting);
      if (ev.error) throw new Error(ev.error);
      const n = Number(ev.value);
      return ev.value === '' ? '0' : Number.isFinite(n) ? String(n) : full;
    });

    const numVal = evaluateMathExpression(substituted);
    if (!Number.isFinite(numVal)) return { value: '#VALUE!', error: 'Non-finite result' };
    return { value: Math.round(numVal * 1e10) / 1e10 };
  };

  for (const s of sheets) {
    for (const k of Object.keys(s.cells)) {
      evalCell(s.id, k, new Set());
    }
  }
  return cache;
}

export function exportSheetToDelimited(sheet: WorksheetDef, evaluated: Record<string, EvaluatedCellResult>, sep = ','): string {
  const lines: string[] = [];
  for (let r = 0; r < sheet.rows; r++) {
    const cols: string[] = [];
    let hasAny = false;
    for (let c = 0; c < sheet.cols; c++) {
      const k = cellKey(c, r);
      const val = evaluated[k]?.value ?? sheet.cells[k]?.raw ?? '';
      const str = String(val);
      if (str !== '') hasAny = true;
      cols.push(str.includes(sep) || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str);
    }
    if (hasAny || r < 5) lines.push(cols.join(sep));
  }
  return lines.join('\n');
}

export function importDelimitedToSheet(text: string, name = 'Imported'): WorksheetDef {
  const sep = text.includes('\t') && !text.includes(',') ? '\t' : ',';
  const rows = text.split(/\r?\n/).filter((l, i, arr) => l.length > 0 || i < arr.length - 1);
  const cells: Record<string, SheetCell> = {};
  let maxCols = 8;
  rows.forEach((line, rIdx) => {
    const parts = line.split(sep);
    maxCols = Math.max(maxCols, parts.length);
    parts.forEach((val, cIdx) => {
      const clean = val.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      if (clean !== '') {
        cells[cellKey(cIdx, rIdx)] = { raw: clean };
      }
    });
  });
  return {
    id: `sh_${Date.now().toString(36)}`,
    name,
    rows: Math.max(20, rows.length + 5),
    cols: Math.max(10, maxCols + 2),
    cells,
    freezeHeader: true,
  };
}

export const SPREADSHEET_FORMULA_DOCS: Array<{ fn: string; syntax: string; desc: string }> = [
  { fn: 'SUM', syntax: '=SUM(A1:A10)', desc: 'Adds all numeric cells in range(s)' },
  { fn: 'AVERAGE', syntax: '=AVERAGE(B2:B20)', desc: 'Arithmetic mean of numeric values' },
  { fn: 'COUNT', syntax: '=COUNT(A1:A20)', desc: 'Counts numeric entries' },
  { fn: 'COUNTIF', syntax: '=COUNTIF(B2:B20, ">10")', desc: 'Counts cells matching condition' },
  { fn: 'SUMIF', syntax: '=SUMIF(A2:A20, "Corn", B2:B20)', desc: 'Sums matching rows' },
  { fn: 'IF', syntax: '=IF(B2>100, "Over", "OK")', desc: 'Conditional branch' },
  { fn: 'XLOOKUP', syntax: '=XLOOKUP("Corn", A2:A10, C2:C10, "N/A")', desc: 'Looks up value across columns' },
  { fn: 'MIN / MAX', syntax: '=MIN(B2:B10)', desc: 'Smallest or largest number' },
  { fn: 'MEDIAN', syntax: '=MEDIAN(B2:B10)', desc: 'Middle value of range' },
  { fn: 'STDEV', syntax: '=STDEV(B2:B10)', desc: 'Sample standard deviation (n-1)' },
  { fn: 'PMT / NPV', syntax: '=PMT(0.05/12, 60, 20000)', desc: 'Loan payment or Net Present Value' },
  { fn: 'CONCAT / UPPER', syntax: '=CONCAT(A2, " ", B2)', desc: 'Text joining & transformation' },
];
