import { describe, expect, it } from 'vitest';
import {
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
} from '../src/core/mathEngine';
import {
  evaluateWorkbook,
  exportSheetToDelimited,
  importDelimitedToSheet,
  type WorksheetDef,
} from '../src/core/spreadsheetEngine';
import { runSandboxedJs, stripSimpleTypeScript } from '../src/core/sandboxRunner';
import { createRecord, updateRecord } from '../src/core/repository';
import { db } from '../src/core/db';
import type { NotePayload } from '../src/core/types';

describe('Planaday v4.0.0 — §26 Mathematical, Scientific, Graphing, Lab & Unit Engine', () => {
  it('evaluates standard, implicit multiplication, trig angle units, factorials, nPr/nCr & user functions without eval', () => {
    expect(evaluateMathExpression('2(3 + 4) * 5')).toBe(70);
    expect(evaluateMathExpression('5!')).toBe(120);
    expect(evaluateMathExpression('nPr(5, 2)')).toBe(20);
    expect(evaluateMathExpression('nCr(5, 2)')).toBe(10);
    expect(evaluateMathExpression('sin(30)', { angleUnit: 'deg' })).toBeCloseTo(0.5, 6);
    expect(evaluateMathExpression('sin(pi / 6)', { angleUnit: 'rad' })).toBeCloseTo(0.5, 6);
    expect(evaluateMathExpression('sin(100)', { angleUnit: 'grad' })).toBeCloseTo(1, 6);
    expect(
      evaluateMathExpression('f(4) + k', {
        vars: { k: 3 },
        userFns: { f: { param: 'x', expr: 'x^2 + 1' } },
      })
    ).toBe(20);
    expect(formatSigFigs(1234.567, 4)).toBe('1235');
    expect(toEngineeringNotation(45000, 1)).toBe('45.0×10^3');
  });

  it('computes numerical derivatives, Simpson integrals, roots, complex ops, matrices & analytical lab formulas', () => {
    expect(numericalDerivative('x^3', 2)).toBeCloseTo(12, 3);
    expect(numericalIntegral('x^2', 0, 3)).toBeCloseTo(9, 4);
    const roots = findNumericalRoots('x^2 - 4', -5, 5);
    expect(roots.length).toBe(2);
    expect(roots[0]).toBeCloseTo(-2, 3);
    expect(roots[1]).toBeCloseTo(2, 3);

    const cx = complexOp({ re: 3, im: 4 }, { re: 1, im: -2 }, '*');
    expect(cx).toEqual({ re: 11, im: -2 });
    expect(matrixDeterminant([[4, 2], [1, 3]])).toBe(10);
    expect(
      matrixDeterminant([
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ])
    ).toBe(-306);

    // Analytical Lab Calculations (§26.2)
    expect(calcDilutionV1(1000, 25, 100)).toBeCloseTo(2.5, 6);
    expect(calcPercentRecovery(10.8, 1.2, 10.0)).toBeCloseTo(96, 4);
    const stats = calcRsdStats([10.0, 10.2, 9.8, 10.0]);
    expect(stats.n).toBe(4);
    expect(stats.mean).toBeCloseTo(10.0, 5);
    expect(stats.rsdPct).toBeCloseTo(1.63299, 3);
  });

  it('converts accurately across 23 unit categories including temperature & lab concentration', () => {
    expect(Object.keys(UNIT_CATEGORIES).length).toBeGreaterThanOrEqual(23);
    expect(convertUnitValue('temperature', 'C', 'F', 0)).toBeCloseTo(32, 6);
    expect(convertUnitValue('temperature', 'F', 'C', 212)).toBeCloseTo(100, 6);
    expect(convertUnitValue('length', 'km', 'm', 1.5)).toBeCloseTo(1500, 6);
    expect(convertUnitValue('concentration', 'pct', 'ppm', 1)).toBeCloseTo(10000, 6);
    expect(convertUnitValue('volume', 'gal', 'L', 1)).toBeCloseTo(3.785411784, 5);
  });
});

describe('Planaday v4.0.0 — §27 Multi-Sheet Spreadsheet Formula Engine', () => {
  it('evaluates cross-sheet refs, named ranges, aggregates, conditionals, XLOOKUP, PMT & circular-ref detection', () => {
    const sheets: WorksheetDef[] = [
      {
        id: 's1',
        name: 'Summary',
        rows: 10,
        cols: 6,
        namedRanges: { TaxRate: 'B1' },
        cells: {
          A1: { raw: 'Corn' },
          B1: { raw: '0.1' },
          A2: { raw: '10' },
          A3: { raw: '20' },
          A4: { raw: '30' },
          B2: { raw: '=SUM(A2:A4)' },
          B3: { raw: '=AVERAGE(A2:A4)' },
          B4: { raw: '=COUNTIF(A2:A4, ">15")' },
          B5: { raw: '=IF(B2>50, "High", "Low")' },
          B6: { raw: '=Sheet2!B2 * (1 + TaxRate)' },
          C1: { raw: '=XLOOKUP("Soy", Sheet2!A1:A3, Sheet2!B1:B3, "None")' },
          D1: { raw: '=E1 + 1' },
          E1: { raw: '=D1 + 1' },
        },
      },
      {
        id: 's2',
        name: 'Sheet2',
        rows: 5,
        cols: 4,
        cells: {
          A1: { raw: 'Wheat' },
          B1: { raw: '100' },
          A2: { raw: 'Soy' },
          B2: { raw: '200' },
          A3: { raw: 'Oats' },
          B3: { raw: '300' },
        },
      },
    ];

    const ev = evaluateWorkbook(sheets);
    expect(ev.s1.B2.value).toBe(60);
    expect(ev.s1.B3.value).toBe(20);
    expect(ev.s1.B4.value).toBe(2);
    expect(ev.s1.B5.value).toBe('High');
    expect(ev.s1.B6.value).toBeCloseTo(220, 6);
    expect(ev.s1.C1.value).toBe(200);
    expect(ev.s1.D1.error).toBeTruthy();

    // CSV round-trip
    const csv = exportSheetToDelimited(sheets[1], ev.s2, ',');
    const reimported = importDelimitedToSheet(csv, 'Reimported');
    expect(reimported.cells.A2.raw).toBe('Soy');
    expect(reimported.cells.B2.raw).toBe('200');
  });
});

describe('Planaday v4.0.0 — §35 Sandbox Runner & §29/§36/§38 Persistence', () => {
  it('strips simple TypeScript types cleanly and safely reports non-Worker fallback', async () => {
    const stripped = stripSimpleTypeScript('interface Pt { x: number; }\nfunction add(a: number, b: number): number { return a + b; }');
    expect(stripped).not.toContain('interface Pt');
    expect(stripped).toContain('function add(a, b)');
    const res = await runSandboxedJs('return 42;');
    expect(typeof res.durationMs).toBe('number');
  });

  it('persists 5-level deep unlimited nested Notes and non-destructive Photo versions in IndexedDB', async () => {
    let parentId: string | null = null;
    const ids: string[] = [];
    for (let depth = 0; depth < 5; depth++) {
      const createdId: string = (
        await createRecord<NotePayload>('note', `Level ${depth} Note`, {
          notebookId: 'nb_personal',
          parentId,
          writtenForDate: '2026-11-24',
          content: `Nested depth ${depth}`,
          citations: [],
          attachmentBlobIds: [],
          voiceMemoBlobIds: [],
          touchedDates: ['2026-11-24'],
        })
      ).id;
      ids.push(createdId);
      parentId = createdId;
    }

    const leaf = await db.records.get(ids[4]);
    expect((leaf?.payload as NotePayload).parentId).toBe(ids[3]);

    // Non-destructive photo versioning preserves originalBlobHash untouched
    const photo = await createRecord('photo_asset', 'Sample Photo', {
      originalBlobHash: 'sha256_original_001',
      album: 'Lab',
      caption: '',
      favorite: false,
      sizeBytes: 1024,
      editedVersions: [],
    });
    await updateRecord(photo.id, (c) => ({
      ...c,
      payload: {
        ...(c.payload as Record<string, unknown>),
        editedVersions: [{ id: 'v1', label: 'Edited Copy 1', blobHash: 'sha256_edit_002', createdAt: '2026-11-24T00:00:00Z' }],
      },
    }));
    const reloaded = await db.records.get(photo.id);
    const pl = reloaded?.payload as { originalBlobHash: string; editedVersions: Array<{ blobHash: string }> };
    expect(pl.originalBlobHash).toBe('sha256_original_001');
    expect(pl.editedVersions[0].blobHash).toBe('sha256_edit_002');
  });
});
