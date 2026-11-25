// Planaday Integrated Spreadsheet Formula Engine & RFC 4180 Import/Export (§27, PD-006, CONT-006, CONT-007)
// Supports multi-sheet references with explicit #REF! errors, composite formulas (=SUM(A1:A3)+1),
// zero-length LEFT/RIGHT semantics, circular-ref guard, and RFC 4180 quoted/multiline CSV/TSV round-trip.

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
  linkedSource?: string | null;
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

class SheetFormulaError extends Error {
  constructor(
    public readonly code: '#REF!' | '#DIV/0!' | '#VALUE!' | '#CIRC!' | '#N/A' | '#ERR!',
    message: string
  ) {
    super(message);
  }
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
      if (op === '=') return numVal === rhsNum;
      return numVal !== rhsNum;
    }
    const sA = String(val).toLowerCase();
    const sB = rhsRaw.trim().toLowerCase();
    return op === '=' ? sA === sB : sA !== sB;
  }
  return String(val).toLowerCase() === c.toLowerCase();
}

const SHEET_FN_NAMES = new Set([
  'SUM',
  'AVERAGE',
  'AVG',
  'COUNT',
  'COUNTA',
  'MIN',
  'MAX',
  'MEDIAN',
  'STDEV',
  'STDEV_S',
  'COUNTIF',
  'SUMIF',
  'IF',
  'AND',
  'OR',
  'XLOOKUP',
  'CONCAT',
  'CONCATENATE',
  'UPPER',
  'LOWER',
  'LEN',
  'LEFT',
  'RIGHT',
  'TODAY',
  'PMT',
  'NPV',
]);

function matchExactSingleTopLevelCall(expr: string): { fn: string; argsStr: string } | null {
  const m = expr.match(/^([A-Za-z0-9_]+)\(/);
  if (!m) return null;
  let depth = 0;
  let inQuote = false;
  for (let i = m[1].length; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          if (i === expr.length - 1) {
            return { fn: m[1].toUpperCase(), argsStr: expr.slice(m[1].length + 1, i) };
          }
          return null; // More expression follows after closing ')' (e.g. SUM(A1:A3)+1)
        }
      }
    }
  }
  return null;
}

export interface EvaluatedCellResult {
  value: string | number;
  error?: string;
}

/**
 * Evaluates all cells in a multi-sheet workbook cleanly with memoization,
 * explicit #REF! missing-sheet errors (CONT-006), composite expressions (CONT-007), & circular-ref detection.
 */
export function evaluateWorkbook(sheets: WorksheetDef[]): Record<string, Record<string, EvaluatedCellResult>> {
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const cache: Record<string, Record<string, EvaluatedCellResult>> = {};
  for (const s of sheets) cache[s.id] = {};

  // CONT-006: Never silently fall back to active sheet when an explicit worksheet name does not exist!
  const resolveExplicitSheetId = (rawSheetName: string): string => {
    const clean = rawSheetName.replace(/^'|'$/g, '').trim().toLowerCase();
    const target = byName.get(clean);
    if (!target) {
      throw new SheetFormulaError('#REF!', `Unknown worksheet "${rawSheetName.replace(/^'|'$/g, '')}"`);
    }
    return target.id;
  };

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
      if (err instanceof SheetFormulaError) {
        const res: EvaluatedCellResult = { value: err.code, error: err.message };
        cache[sheetId][upKey] = res;
        return res;
      }
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

  const resolveSheetAndRange = (expr: string, curSheetId: string, visiting: Set<string>): Array<string | number> => {
    const trimmed = expr.trim();
    let targetSheetId = curSheetId;
    let rangePart = trimmed;
    const bangIdx = trimmed.indexOf('!');
    if (bangIdx > 0) {
      targetSheetId = resolveExplicitSheetId(trimmed.slice(0, bangIdx));
      rangePart = trimmed.slice(bangIdx + 1);
    }
    const keys = rangePart.includes(':') ? expandCellRange(rangePart) : [rangePart.toUpperCase()];
    return keys.map((k) => {
      const ev = evalCell(targetSheetId, k, visiting);
      if (ev.error && typeof ev.value === 'string' && ev.value.startsWith('#')) {
        throw new SheetFormulaError(ev.value as '#REF!', ev.error);
      }
      return ev.value;
    });
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
      const sid = bang > 0 ? resolveExplicitSheetId(t.slice(0, bang)) : sheetId;
      const cellId = bang > 0 ? t.slice(bang + 1) : t;
      const ev = evalCell(sid, cellId, visiting);
      if (ev.error && typeof ev.value === 'string' && ev.value.startsWith('#')) {
        throw new SheetFormulaError(ev.value as '#REF!', ev.error);
      }
      return ev.value;
    }
    const res = evalFormula(sheetId, t, visiting);
    if (res.error && typeof res.value === 'string' && res.value.startsWith('#')) {
      throw new SheetFormulaError(res.value as '#REF!', res.error);
    }
    return res.value;
  };

  const extractNumbers = (sheetId: string, args: string[], visiting: Set<string>): number[] => {
    const nums: number[] = [];
    for (const a of args) {
      const t = a.trim();
      if (t.includes(':')) {
        for (const v of resolveSheetAndRange(t, sheetId, visiting)) {
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

  const evalSheetFunction = (sheetId: string, fn: string, argsStr: string, visiting: Set<string>): EvaluatedCellResult | null => {
    if (!SHEET_FN_NAMES.has(fn)) return null;
    const args = splitTopLevelArgs(argsStr);

    if (fn === 'SUM') return { value: extractNumbers(sheetId, args, visiting).reduce((s, v) => s + v, 0) };
    if (fn === 'AVERAGE' || fn === 'AVG') {
      const ns = extractNumbers(sheetId, args, visiting);
      return ns.length ? { value: ns.reduce((s, v) => s + v, 0) / ns.length } : { value: '#DIV/0!', error: 'No numeric values' };
    }
    if (fn === 'COUNT') return { value: extractNumbers(sheetId, args, visiting).length };
    if (fn === 'COUNTA') {
      let cnt = 0;
      for (const a of args) {
        const vals = a.includes(':') ? resolveSheetAndRange(a, sheetId, visiting) : [evalArgAsValue(sheetId, a, visiting)];
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
      const vals = resolveSheetAndRange(args[0], sheetId, visiting);
      return { value: vals.filter((v) => matchCriteria(v, args[1])).length };
    }
    if (fn === 'SUMIF' && args.length >= 2) {
      const critVals = resolveSheetAndRange(args[0], sheetId, visiting);
      const sumVals = args[2] ? resolveSheetAndRange(args[2], sheetId, visiting) : critVals;
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
      const lookupVals = resolveSheetAndRange(args[1], sheetId, visiting);
      const returnVals = resolveSheetAndRange(args[2], sheetId, visiting);
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
    // CONT-007: Properly preserve zero-length semantics for LEFT(str, 0) & RIGHT(str, 0)!
    if (fn === 'LEFT') {
      const s = String(evalArgAsValue(sheetId, args[0], visiting));
      const rawN = args[1] !== undefined ? Number(evalArgAsValue(sheetId, args[1], visiting)) : 1;
      if (!Number.isFinite(rawN) || rawN < 0) return { value: '#VALUE!', error: 'Invalid LEFT length' };
      const n = Math.floor(rawN);
      return { value: n === 0 ? '' : s.slice(0, n) };
    }
    if (fn === 'RIGHT') {
      const s = String(evalArgAsValue(sheetId, args[0], visiting));
      const rawN = args[1] !== undefined ? Number(evalArgAsValue(sheetId, args[1], visiting)) : 1;
      if (!Number.isFinite(rawN) || rawN < 0) return { value: '#VALUE!', error: 'Invalid RIGHT length' };
      const n = Math.floor(rawN);
      return { value: n === 0 ? '' : s.slice(-n) };
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
    return null;
  };

  // CONT-007: Replace embedded sheet functions inside composite expressions like =SUM(A1:A3)+1 or =MAX(A1:A3)-MIN(A1:A3)
  const reduceEmbeddedSheetCalls = (sheetId: string, expr: string, visiting: Set<string>): string => {
    let out = expr;
    for (let guard = 0; guard < 32; guard++) {
      let replaced = false;
      let inQuote = false;
      for (let i = 0; i < out.length; i++) {
        const ch = out[i];
        if (ch === '"') {
          inQuote = !inQuote;
          continue;
        }
        if (inQuote) continue;
        if (/[A-Za-z_]/.test(ch)) {
          const prev = i > 0 ? out[i - 1] : '';
          if (/[A-Za-z0-9_!]/.test(prev)) continue;
          let endName = i;
          while (endName < out.length && /[A-Za-z0-9_]/.test(out[endName])) endName++;
          const fnName = out.slice(i, endName).toUpperCase();
          if (out[endName] === '(' && SHEET_FN_NAMES.has(fnName)) {
            let depth = 0;
            let q = false;
            let closeIdx = -1;
            for (let j = endName; j < out.length; j++) {
              if (out[j] === '"') q = !q;
              if (!q) {
                if (out[j] === '(') depth++;
                else if (out[j] === ')') {
                  depth--;
                  if (depth === 0) {
                    closeIdx = j;
                    break;
                  }
                }
              }
            }
            if (closeIdx > endName) {
              const argsStr = out.slice(endName + 1, closeIdx);
              const fnRes = evalSheetFunction(sheetId, fnName, argsStr, visiting);
              if (fnRes) {
                if (fnRes.error && typeof fnRes.value === 'string' && fnRes.value.startsWith('#')) {
                  throw new SheetFormulaError(fnRes.value as '#REF!', fnRes.error);
                }
                const replacement = typeof fnRes.value === 'number' ? `(${fnRes.value})` : JSON.stringify(String(fnRes.value));
                out = out.slice(0, i) + replacement + out.slice(closeIdx + 1);
                replaced = true;
                break;
              }
            }
          }
        }
      }
      if (!replaced) break;
    }
    return out;
  };

  const evalFormula = (sheetId: string, expr: string, visiting: Set<string>): EvaluatedCellResult => {
    const curSheet = byId.get(sheetId);
    let expanded = expr.trim();
    if (curSheet?.namedRanges) {
      for (const [nrName, nrRef] of Object.entries(curSheet.namedRanges)) {
        expanded = expanded.replace(new RegExp(`\\b${nrName}\\b`, 'gi'), nrRef);
      }
    }

    // 1. Exact single top-level Excel function call (preserves string/boolean return values cleanly)
    const exactCall = matchExactSingleTopLevelCall(expanded);
    if (exactCall && SHEET_FN_NAMES.has(exactCall.fn)) {
      const fnRes = evalSheetFunction(sheetId, exactCall.fn, exactCall.argsStr, visiting);
      if (fnRes) return fnRes;
    }

    // 2. Reduce any embedded sheet functions inside composite arithmetic expressions (=SUM(A1:A3)+1)
    expanded = reduceEmbeddedSheetCalls(sheetId, expanded, visiting);

    // 3. Substitute explicit cross-sheet ('My Sheet'!A1 or Sheet2!A1) & local cell references
    const substituted = expanded.replace(/((?:'[^']+'|[A-Za-z0-9_]+)!)?\b([A-Za-z]{1,3}[0-9]{1,5})\b/g, (full, sheetPrefix, ref) => {
      let sid = sheetId;
      if (sheetPrefix) {
        const sName = String(sheetPrefix).slice(0, -1);
        sid = resolveExplicitSheetId(sName);
      }
      const ev = evalCell(sid, ref, visiting);
      if (ev.error) {
        if (typeof ev.value === 'string' && ev.value.startsWith('#')) {
          throw new SheetFormulaError(ev.value as '#REF!', ev.error);
        }
        throw new Error(ev.error);
      }
      const n = Number(ev.value);
      return ev.value === '' ? '0' : Number.isFinite(n) ? `(${n})` : full;
    });

    const numVal = evaluateMathExpression(substituted);
    if (!Number.isFinite(numVal)) {
      return { value: '#DIV/0!', error: 'Division by zero or non-finite result' };
    }
    return { value: Math.round(numVal * 1e10) / 1e10 };
  };

  for (const s of sheets) {
    for (const k of Object.keys(s.cells)) {
      evalCell(s.id, k, new Set());
    }
  }
  return cache;
}

/**
 * PD-006: Full RFC 4180 CSV/TSV serializer with optional spreadsheet formula-injection guard.
 */
export function exportSheetToDelimited(
  sheet: WorksheetDef,
  evaluated: Record<string, EvaluatedCellResult>,
  sep = ',',
  opts: { neutralizeFormulas?: boolean } = {}
): string {
  // Determine actual used bounding box cleanly while keeping at least populated rows/cols
  let maxUsedRow = -1;
  let maxUsedCol = -1;
  for (const k of Object.keys(sheet.cells)) {
    const parsed = parseCellRef(k);
    if (!parsed) continue;
    const val = evaluated[k]?.value ?? sheet.cells[k]?.raw ?? '';
    if (String(val) !== '') {
      if (parsed.row > maxUsedRow) maxUsedRow = parsed.row;
      if (parsed.col > maxUsedCol) maxUsedCol = parsed.col;
    }
  }
  const rowLimit = maxUsedRow >= 0 ? maxUsedRow + 1 : Math.min(sheet.rows, 5);
  const colLimit = maxUsedCol >= 0 ? maxUsedCol + 1 : sheet.cols;

  const lines: string[] = [];
  for (let r = 0; r < rowLimit; r++) {
    const cols: string[] = [];
    for (let c = 0; c < colLimit; c++) {
      const k = cellKey(c, r);
      const val = evaluated[k]?.value ?? sheet.cells[k]?.raw ?? '';
      let str = String(val);
      if (opts.neutralizeFormulas && /^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      const needsQuote = str.includes(sep) || str.includes('"') || str.includes('\n') || str.includes('\r');
      cols.push(needsQuote ? `"${str.replace(/"/g, '""')}"` : str);
    }
    lines.push(cols.join(sep));
  }
  return lines.join('\r\n');
}

/**
 * PD-006: Complete RFC 4180 state-machine CSV/TSV parser supporting quoted commas,
 * escaped double quotes (""), embedded multiline cells, empty cells, UTF-8 BOM & CRLF/LF.
 */
export function parseDelimitedRecords(rawText: string, explicitDelimiter?: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text) return [];

  // Detect delimiter outside quotes if not explicitly specified
  let sep = explicitDelimiter;
  if (!sep) {
    let inQ = false;
    let commas = 0;
    let tabs = 0;
    for (let i = 0; i < Math.min(text.length, 4096); i++) {
      const ch = text[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ) {
        if (ch === ',') commas++;
        else if (ch === '\t') tabs++;
        else if (ch === '\n' && (commas > 0 || tabs > 0)) break;
      }
    }
    sep = tabs > commas ? '\t' : ',';
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"' && field.length === 0) {
        inQuotes = true;
      } else if (ch === sep) {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing completely empty line from final newline
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop();
  }
  return rows;
}

export function importDelimitedToSheet(text: string, name = 'Imported', delimiter?: string): WorksheetDef {
  const rows = parseDelimitedRecords(text, delimiter);
  const cells: Record<string, SheetCell> = {};
  let maxCols = 8;
  rows.forEach((parts, rIdx) => {
    maxCols = Math.max(maxCols, parts.length);
    parts.forEach((val, cIdx) => {
      if (val !== '') {
        cells[cellKey(cIdx, rIdx)] = { raw: val };
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
