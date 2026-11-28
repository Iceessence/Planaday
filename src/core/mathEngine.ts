// Planaday Advanced Mathematical, Scientific, Graphing, Laboratory & Conversion Engine (§26)

export type AngleUnit = 'deg' | 'rad' | 'grad';

export interface EvalContext {
  angleUnit?: AngleUnit;
  vars?: Record<string, number>;
  userFns?: Record<string, { param: string; expr: string }>;
}

export const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  tau: Math.PI * 2,
  c: 299792458, // speed of light m/s
  h: 6.62607015e-34, // Planck J*s
  Na: 6.02214076e23, // Avogadro 1/mol
  R: 8.314462618, // Gas constant J/(mol*K)
  g: 9.80665, // Gravity m/s^2
  kB: 1.380649e-23, // Boltzmann J/K
};

export function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 170) return NaN;
  if (Math.floor(n) !== n) {
    // Lanczos gamma approximation for non-integer factorials
    const z = n + 1;
    const g = 7;
    const p = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7,
    ];
    let x = p[0];
    for (let i = 1; i < g + 2; i++) x += p[i] / (z - 1 + i);
    const t = z - 1 + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z - 0.5) * Math.exp(-t) * x;
  }
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

export function nPr(n: number, r: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || r < 0 || n < 0 || r > n) return NaN;
  let value = 1;
  for (let i = 0; i < r; i++) { value *= n - i; if (!Number.isFinite(value)) break; }
  return value;
}

export function nCr(n: number, r: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || r < 0 || n < 0 || r > n) return NaN;
  const k = Math.min(r, n - r);
  let value = 1;
  for (let i = 1; i <= k; i++) { value *= (n - k + i) / i; if (!Number.isFinite(value)) break; }
  return value <= Number.MAX_SAFE_INTEGER ? Math.round(value) : value;
}

export function formatSigFigs(value: number, sigFigs: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sf = Math.max(1, Math.min(15, Math.floor(sigFigs)));
  return value.toPrecision(sf);
}

export function toEngineeringNotation(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  decimals = Number.isFinite(decimals) ? Math.max(0, Math.min(15, Math.floor(decimals))) : 3;
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const engExp = Math.floor(exp / 3) * 3;
  const mantissa = value / Math.pow(10, engExp);
  return `${mantissa.toFixed(decimals)}×10^${engExp}`;
}

// --- Safe Recursive-Descent Math Expression Parser (Zero eval/Function!) ---
interface Token {
  type: 'num' | 'id' | 'op' | 'lparen' | 'rparen' | 'comma';
  val: string;
}

function tokenizeMath(expr: string): Token[] {
  const cleaned = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt');
  const tokens: Token[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let start = i;
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) i++;
      if (i < cleaned.length && (cleaned[i] === 'e' || cleaned[i] === 'E')) {
        const next = cleaned[i + 1];
        if (next && /[0-9+-]/.test(next)) {
          i++;
          if (cleaned[i] === '+' || cleaned[i] === '-') i++;
          while (i < cleaned.length && /[0-9]/.test(cleaned[i])) i++;
        }
      }
      tokens.push({ type: 'num', val: cleaned.slice(start, i) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let start = i;
      while (i < cleaned.length && /[a-zA-Z0-9_]/.test(cleaned[i])) i++;
      tokens.push({ type: 'id', val: cleaned.slice(start, i) });
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', val: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', val: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', val: ch });
      i++;
      continue;
    }
    if ('+-*/^%!'.includes(ch)) {
      tokens.push({ type: 'op', val: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}"`);
  }

  // Insert implicit multiplication (e.g. 2x, 2(x+1), (x)(y), 3pi)
  const out: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    const prev = out[out.length - 1];
    if (
      prev &&
      ((prev.type === 'num' && (cur.type === 'id' || cur.type === 'lparen')) ||
        (prev.type === 'rparen' && (cur.type === 'num' || cur.type === 'id' || cur.type === 'lparen')) ||
        (prev.type === 'op' && prev.val === '!' && (cur.type === 'num' || cur.type === 'id' || cur.type === 'lparen')))
    ) {
      out.push({ type: 'op', val: '*' });
    }
    out.push(cur);
  }
  return out;
}

const tokenCache = new Map<string, Token[]>();
export function evaluateMathExpression(expr: string, ctx: EvalContext = {}): number {
  return evaluateBounded(expr, ctx, { remaining: 100_000 }, 0);
}
function evaluateBounded(expr: string, ctx: EvalContext, budget: { remaining: number }, depth: number): number {
  if (depth > 32 || expr.length > 16_384) throw new Error('Expression complexity limit exceeded');
  const trimmed = expr.trim();
  if (!trimmed) return NaN;
  let tokens = tokenCache.get(trimmed);
  if (!tokens) {
    tokens = tokenizeMath(trimmed);
    if (tokens.length > 1024) throw new Error("Too many expression tokens");
    if (tokenCache.size >= 64) tokenCache.delete(tokenCache.keys().next().value!);
    tokenCache.set(trimmed, tokens);
  }
  budget.remaining -= tokens.length;
  if (budget.remaining < 0) throw new Error("Expression evaluation budget exceeded");
  let pos = 0;
  const angleUnit = ctx.angleUnit ?? 'rad';
  const toRad = (v: number) => (angleUnit === 'deg' ? (v * Math.PI) / 180 : angleUnit === 'grad' ? (v * Math.PI) / 200 : v);
  const fromRad = (v: number) => (angleUnit === 'deg' ? (v * 180) / Math.PI : angleUnit === 'grad' ? (v * 200) / Math.PI : v);

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const callFn = (name: string, args: number[]): number => {
    const a = args[0];
    const b = args[1];
    switch (name.toLowerCase()) {
      case 'sin': return Math.sin(toRad(a));
      case 'cos': return Math.cos(toRad(a));
      case 'tan': return Math.tan(toRad(a));
      case 'asin': return fromRad(Math.asin(a));
      case 'acos': return fromRad(Math.acos(a));
      case 'atan': return fromRad(Math.atan(a));
      case 'atan2': return fromRad(Math.atan2(a, b));
      case 'sinh': return Math.sinh(a);
      case 'cosh': return Math.cosh(a);
      case 'tanh': return Math.tanh(a);
      case 'asinh': return Math.asinh(a);
      case 'acosh': return Math.acosh(a);
      case 'atanh': return Math.atanh(a);
      case 'sqrt': return Math.sqrt(a);
      case 'cbrt': return Math.cbrt(a);
      case 'abs': return Math.abs(a);
      case 'ln': return Math.log(a);
      case 'log':
      case 'log10': return Math.log10(a);
      case 'log2': return Math.log2(a);
      case 'exp': return Math.exp(a);
      case 'pow': return Math.pow(a, b);
      case 'floor': return Math.floor(a);
      case 'ceil': return Math.ceil(a);
      case 'round': return b !== undefined ? Number(a.toFixed(b)) : Math.round(a);
      case 'min': return Math.min(...args);
      case 'max': return Math.max(...args);
      case 'mean':
      case 'avg': return args.reduce((s, v) => s + v, 0) / Math.max(1, args.length);
      case 'sum': return args.reduce((s, v) => s + v, 0);
      case 'fact':
      case 'factorial': return factorial(a);
      case 'npr': return nPr(a, b);
      case 'ncr': return nCr(a, b);
      case 'sign': return Math.sign(a);
      default: {
        const uf = ctx.userFns && (Object.prototype.hasOwnProperty.call(ctx.userFns, name) ? ctx.userFns[name] : Object.prototype.hasOwnProperty.call(ctx.userFns, name.toLowerCase()) ? ctx.userFns[name.toLowerCase()] : undefined);
        if (uf) {
          return evaluateBounded(uf.expr, {
            ...ctx,
            vars: { ...(ctx.vars ?? {}), [uf.param]: a },
          }, budget, depth + 1);
        }
        throw new Error(`Unknown function "${name}"`);
      }
    }
  };

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (peek()?.type === 'op' && (peek()!.val === '+' || peek()!.val === '-')) {
      const op = consume().val;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseMulDiv = (): number => {
    let left = parseUnary();
    while (peek()?.type === 'op' && (peek()!.val === '*' || peek()!.val === '/' || peek()!.val === '%')) {
      const op = consume().val;
      const right = parseUnary();
      if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left = left % right;
    }
    return left;
  };

  const parseUnary = (): number => {
    if (peek()?.type === 'op' && (peek()!.val === '+' || peek()!.val === '-')) {
      const op = consume().val;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePow();
  };

  const parsePow = (): number => {
    let base = parsePostfix();
    if (peek()?.type === 'op' && peek()!.val === '^') {
      consume();
      const exp = parseUnary();
      base = Math.pow(base, exp);
    }
    return base;
  };

  const parsePostfix = (): number => {
    let val = parsePrimary();
    while (peek()?.type === 'op' && peek()!.val === '!') {
      consume();
      val = factorial(val);
    }
    return val;
  };

  const parsePrimary = (): number => {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.type === 'num') {
      consume();
      const number = Number(t.val);
      if (Number.isNaN(number)) throw new Error(`Invalid number: ${t.val}`);
      return number;
    }
    if (t.type === 'lparen') {
      consume();
      const val = parseAddSub();
      if (peek()?.type !== 'rparen') throw new Error('Missing closing parenthesis');
      consume();
      return val;
    }
    if (t.type === 'id') {
      consume();
      if (peek()?.type === 'lparen') {
        consume();
        const args: number[] = [];
        if (peek()?.type !== 'rparen') {
          args.push(parseAddSub());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseAddSub());
          }
        }
        if (peek()?.type !== 'rparen') throw new Error(`Missing ')' in ${t.val}(...)`);
        consume();
        return callFn(t.val, args);
      }
      if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, t.val)) return ctx.vars[t.val];
      if (Object.prototype.hasOwnProperty.call(MATH_CONSTANTS, t.val)) return MATH_CONSTANTS[t.val];
      if (Object.prototype.hasOwnProperty.call(MATH_CONSTANTS, t.val.toLowerCase())) return MATH_CONSTANTS[t.val.toLowerCase()];
      throw new Error(`Unknown variable "${t.val}"`);
    }
    throw new Error(`Unexpected token "${t.val}"`);
  };

  const result = parseAddSub();
  if (pos < tokens.length) throw new Error(`Unexpected token "${tokens[pos].val}"`);
  return result;
}

// --- Numerical Calculus & Root/Intersection Solvers (§26.3) ---
export function numericalDerivative(expr: string, x: number, ctx: EvalContext = {}, h = 1e-5): number {
  const f1 = evaluateMathExpression(expr, { ...ctx, vars: { ...(ctx.vars ?? {}), x: x + h } });
  const f0 = evaluateMathExpression(expr, { ...ctx, vars: { ...(ctx.vars ?? {}), x: x - h } });
  return (f1 - f0) / (2 * h);
}

export function numericalIntegral(expr: string, a: number, b: number, ctx: EvalContext = {}, steps = 200): number {
  steps = Number.isFinite(steps) ? Math.max(2, Math.min(100_000, Math.floor(steps))) : 200;
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  const f = (x: number) => evaluateMathExpression(expr, { ...ctx, vars: { ...(ctx.vars ?? {}), x } });
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    const val = f(a + i * h);
    if (!Number.isFinite(val)) return NaN;
    sum += (i % 2 === 0 ? 2 : 4) * val;
  }
  return (h / 3) * sum;
}

/**
 * PD-007: Continuity-validated numerical root finder that:
 * 1. Rejects poles / vertical asymptotes (e.g. 1/(x - 0.123)) by validating finite residual & neighborhood continuity.
 * 2. Detects even-multiplicity / tangent roots (e.g. (x - 0.123)^2) via golden-section minimization on local |f(x)| minima.
 */
export function findNumericalRoots(
  expr: string,
  xMin: number,
  xMax: number,
  ctx: EvalContext = {},
  samples = 400
): number[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];
  const f = (x: number) => evaluateMathExpression(expr, { ...ctx, vars: { ...(ctx.vars ?? {}), x } });

  const isValidContinuousRoot = (x: number): boolean => {
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(y) > 1e-4) return false;
    // Reject poles / jump discontinuities by probing immediate left & right neighborhoods
    const eps = Math.min(1e-5, (xMax - xMin) * 1e-5);
    const yl = f(x - eps);
    const yr = f(x + eps);
    if (!Number.isFinite(yl) || !Number.isFinite(yr)) return false;
    // If |f(x ± eps)| explodes far above residual, this is a singularity/asymptote, not a root
    if (Math.max(Math.abs(yl), Math.abs(yr)) > 10) return false;
    return true;
  };

  const candidates: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  samples = Number.isFinite(samples) ? Math.max(2, Math.min(50_000, Math.floor(samples))) : 400;
  const dx = (xMax - xMin) / samples;
  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * dx;
    xs.push(x);
    ys.push(f(x));
  }

  for (let i = 0; i <= samples; i++) {
    const curX = xs[i];
    const curY = ys[i];

    // 1. Direct sample hit
    if (Number.isFinite(curY) && Math.abs(curY) < 1e-9 && isValidContinuousRoot(curX)) {
      candidates.push(curX);
    }

    // 2. Sign-change bisection + continuity/residual validation
    if (i > 0) {
      const prevX = xs[i - 1];
      const prevY = ys[i - 1];
      if (Number.isFinite(prevY) && Number.isFinite(curY) && prevY * curY < 0) {
        let lo = prevX;
        let hi = curX;
        let flo = prevY;
        for (let k = 0; k < 44; k++) {
          const mid = (lo + hi) / 2;
          const fmid = f(mid);
          if (!Number.isFinite(fmid)) break;
          if (Math.abs(fmid) < 1e-12) {
            lo = hi = mid;
            break;
          }
          if (flo * fmid <= 0) {
            hi = mid;
          } else {
            lo = mid;
            flo = fmid;
          }
        }
        const root = (lo + hi) / 2;
        if (isValidContinuousRoot(root)) {
          candidates.push(root);
        }
      }
    }

    // 3. Tangent / even-multiplicity root detection via golden-section search on local |f(x)| minima
    if (i > 0 && i < samples) {
      const yPrev = Math.abs(ys[i - 1]);
      const yCur = Math.abs(curY);
      const yNext = Math.abs(ys[i + 1]);
      if (Number.isFinite(yPrev) && Number.isFinite(yCur) && Number.isFinite(yNext) && yCur <= yPrev && yCur <= yNext) {
        const phi = (Math.sqrt(5) - 1) / 2;
        let a = xs[i - 1];
        let b = xs[i + 1];
        let c = b - phi * (b - a);
        let d = a + phi * (b - a);
        let fc = Math.abs(f(c));
        let fd = Math.abs(f(d));
        for (let iter = 0; iter < 48; iter++) {
          if (!Number.isFinite(fc) || !Number.isFinite(fd)) break;
          if (fc < fd) {
            b = d;
            d = c;
            fd = fc;
            c = b - phi * (b - a);
            fc = Math.abs(f(c));
          } else {
            a = c;
            c = d;
            fc = fd;
            d = a + phi * (b - a);
            fd = Math.abs(f(d));
          }
        }
        const bestX = (a + b) / 2;
        if (Math.abs(f(bestX)) < 1e-5 && isValidContinuousRoot(bestX)) {
          candidates.push(bestX);
        }
      }
    }
  }

  // Sort & deduplicate within tolerance
  candidates.sort((a, b) => a - b);
  const roots: number[] = [];
  for (const r of candidates) {
    const rounded = Object.is(Number(r.toFixed(6)), -0) ? 0 : Number(r.toFixed(6));
    if (roots.length === 0 || Math.abs(roots[roots.length - 1] - rounded) > 1e-3) {
      roots.push(rounded);
    }
  }
  return roots;
}

// --- Complex Numbers & 2x2 / 3x3 Matrix Helpers (§26.2) ---
export interface ComplexNum { re: number; im: number; }
export function complexOp(a: ComplexNum, b: ComplexNum, op: '+' | '-' | '*' | '/'): ComplexNum {
  if (op === '+') return { re: a.re + b.re, im: a.im + b.im };
  if (op === '-') return { re: a.re - b.re, im: a.im - b.im };
  if (op === '*') return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  const denom = b.re * b.re + b.im * b.im;
  return denom === 0
    ? { re: NaN, im: NaN }
    : { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}

export function matrixDeterminant(m: number[][]): number {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (n === 3) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }
  return NaN;
}

// --- Laboratory Analytical Calculations (§26.2) ---
export function calcDilutionV1(c1: number, c2: number, v2: number): number {
  return c1 > 0 ? (c2 * v2) / c1 : NaN;
}
export function calcPercentRecovery(spikedMeasured: number, unspikedMeasured: number, spikeAdded: number): number {
  return spikeAdded !== 0 ? ((spikedMeasured - unspikedMeasured) / spikeAdded) * 100 : NaN;
}
export function calcRsdStats(values: number[]): { n: number; mean: number; sd: number; rsdPct: number } {
  const valid = values.filter((v) => Number.isFinite(v));
  const n = valid.length;
  if (n === 0) return { n: 0, mean: NaN, sd: NaN, rsdPct: NaN };
  const mean = valid.reduce((s, v) => s + v, 0) / n;
  const sd = n >= 2 ? Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const rsdPct = mean !== 0 ? (sd / Math.abs(mean)) * 100 : NaN;
  return { n, mean, sd, rsdPct };
}

// --- Universal 25-Category Unit Converter (§26.5) ---
export interface UnitDef {
  id: string;
  label: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

const lin = (id: string, label: string, factor: number): UnitDef => ({
  id,
  label,
  toBase: (v) => v * factor,
  fromBase: (v) => v / factor,
});

export const UNIT_CATEGORIES: Record<string, { label: string; units: UnitDef[] }> = {
  length: {
    label: 'Length & Distance',
    units: [
      lin('m', 'Meter (m)', 1),
      lin('km', 'Kilometer (km)', 1000),
      lin('cm', 'Centimeter (cm)', 0.01),
      lin('mm', 'Millimeter (mm)', 0.001),
      lin('um', 'Micrometer (µm)', 1e-6),
      lin('nm', 'Nanometer (nm)', 1e-9),
      lin('in', 'Inch (in)', 0.0254),
      lin('ft', 'Foot (ft)', 0.3048),
      lin('yd', 'Yard (yd)', 0.9144),
      lin('mi', 'Mile (mi)', 1609.344),
      lin('nmi', 'Nautical Mile (nmi)', 1852),
    ],
  },
  mass: {
    label: 'Mass & Weight',
    units: [
      lin('kg', 'Kilogram (kg)', 1),
      lin('g', 'Gram (g)', 0.001),
      lin('mg', 'Milligram (mg)', 1e-6),
      lin('ug', 'Microgram (µg)', 1e-9),
      lin('lb', 'Pound (lb)', 0.45359237),
      lin('oz', 'Ounce (oz)', 0.028349523125),
      lin('t', 'Metric Tonne (t)', 1000),
      lin('ton_us', 'US Short Ton', 907.18474),
    ],
  },
  volume: {
    label: 'Volume, Cooking & Lab',
    units: [
      lin('L', 'Liter (L)', 1),
      lin('mL', 'Milliliter (mL)', 0.001),
      lin('uL', 'Microliter (µL)', 1e-6),
      lin('m3', 'Cubic Meter (m³)', 1000),
      lin('tsp', 'US Teaspoon (tsp)', 0.00492892),
      lin('tbsp', 'US Tablespoon (tbsp)', 0.0147868),
      lin('floz', 'US Fluid Ounce (fl oz)', 0.0295735),
      lin('cup', 'US Cup', 0.236588),
      lin('pt', 'US Pint (pt)', 0.473176),
      lin('qt', 'US Quart (qt)', 0.946353),
      lin('gal', 'US Gallon (gal)', 3.785411784),
    ],
  },
  temperature: {
    label: 'Temperature',
    units: [
      { id: 'C', label: 'Celsius (°C)', toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
      { id: 'F', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9 + 273.15, fromBase: (v) => ((v - 273.15) * 9) / 5 + 32 },
      { id: 'K', label: 'Kelvin (K)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'R', label: 'Rankine (°R)', toBase: (v) => (v * 5) / 9, fromBase: (v) => (v * 9) / 5 },
    ],
  },
  area: {
    label: 'Area',
    units: [
      lin('m2', 'Square Meter (m²)', 1),
      lin('cm2', 'Square cm (cm²)', 1e-4),
      lin('km2', 'Square km (km²)', 1e6),
      lin('ft2', 'Square Foot (ft²)', 0.09290304),
      lin('in2', 'Square Inch (in²)', 0.00064516),
      lin('acre', 'Acre', 4046.8564224),
      lin('ha', 'Hectare (ha)', 10000),
    ],
  },
  time: {
    label: 'Time',
    units: [
      lin('s', 'Second (s)', 1),
      lin('ms', 'Millisecond (ms)', 0.001),
      lin('min', 'Minute (min)', 60),
      lin('hr', 'Hour (h)', 3600),
      lin('day', 'Day', 86400),
      lin('wk', 'Week', 604800),
      lin('yr', 'Year (365.25d)', 31557600),
    ],
  },
  speed: {
    label: 'Speed',
    units: [
      lin('mps', 'Meters/sec (m/s)', 1),
      lin('kph', 'Kilometers/hr (km/h)', 1 / 3.6),
      lin('mph', 'Miles/hr (mph)', 0.44704),
      lin('kn', 'Knots (kn)', 0.514444),
      lin('fps', 'Feet/sec (ft/s)', 0.3048),
    ],
  },
  acceleration: {
    label: 'Acceleration',
    units: [
      lin('mps2', 'm/s²', 1),
      lin('g0', 'Standard Gravity (g)', 9.80665),
      lin('ftps2', 'ft/s²', 0.3048),
    ],
  },
  pressure: {
    label: 'Pressure',
    units: [
      lin('Pa', 'Pascal (Pa)', 1),
      lin('kPa', 'Kilopascal (kPa)', 1000),
      lin('bar', 'Bar', 100000),
      lin('atm', 'Atmosphere (atm)', 101325),
      lin('psi', 'PSI (lb/in²)', 6894.757),
      lin('mmHg', 'mmHg / Torr', 133.322),
    ],
  },
  energy: {
    label: 'Energy',
    units: [
      lin('J', 'Joule (J)', 1),
      lin('kJ', 'Kilojoule (kJ)', 1000),
      lin('cal', 'Calorie (cal)', 4.184),
      lin('kcal', 'Kilocalorie (kcal)', 4184),
      lin('Wh', 'Watt-hour (Wh)', 3600),
      lin('kWh', 'Kilowatt-hour (kWh)', 3.6e6),
      lin('BTU', 'BTU', 1055.056),
      lin('eV', 'Electronvolt (eV)', 1.602176634e-19),
    ],
  },
  power: {
    label: 'Power',
    units: [
      lin('W', 'Watt (W)', 1),
      lin('kW', 'Kilowatt (kW)', 1000),
      lin('MW', 'Megawatt (MW)', 1e6),
      lin('hp', 'Horsepower (hp)', 745.69987),
    ],
  },
  force: {
    label: 'Force',
    units: [
      lin('N', 'Newton (N)', 1),
      lin('kN', 'Kilonewton (kN)', 1000),
      lin('lbf', 'Pound-force (lbf)', 4.4482216),
      lin('kgf', 'Kilogram-force (kgf)', 9.80665),
    ],
  },
  electrical: {
    label: 'Electrical (Current/Voltage/Resistance)',
    units: [
      lin('A', 'Ampere (A)', 1),
      lin('mA', 'Milliampere (mA)', 0.001),
      lin('uA', 'Microampere (µA)', 1e-6),
      lin('kA', 'Kiloampere (kA)', 1000),
    ],
  },
  frequency: {
    label: 'Frequency',
    units: [
      lin('Hz', 'Hertz (Hz)', 1),
      lin('kHz', 'Kilohertz (kHz)', 1e3),
      lin('MHz', 'Megahertz (MHz)', 1e6),
      lin('GHz', 'Gigahertz (GHz)', 1e9),
      lin('rpm', 'RPM', 1 / 60),
    ],
  },
  data: {
    label: 'Data Storage',
    units: [
      lin('B', 'Byte (B)', 1),
      lin('KB', 'Kilobyte (KB)', 1024),
      lin('MB', 'Megabyte (MB)', 1024 ** 2),
      lin('GB', 'Gigabyte (GB)', 1024 ** 3),
      lin('TB', 'Terabyte (TB)', 1024 ** 4),
      lin('bit', 'Bit (b)', 0.125),
    ],
  },
  dataRate: {
    label: 'Data Transfer Rate',
    units: [
      lin('bps', 'Bits/sec (bps)', 1),
      lin('Kbps', 'Kilobits/sec (Kbps)', 1e3),
      lin('Mbps', 'Megabits/sec (Mbps)', 1e6),
      lin('Gbps', 'Gigabits/sec (Gbps)', 1e9),
      lin('MBps', 'Megabytes/sec (MB/s)', 8e6),
    ],
  },
  density: {
    label: 'Density',
    units: [
      lin('kg_m3', 'kg/m³', 1),
      lin('g_cm3', 'g/cm³ (g/mL)', 1000),
      lin('lb_ft3', 'lb/ft³', 16.018463),
      lin('lb_gal', 'lb/US gal', 119.8264),
    ],
  },
  concentration: {
    label: 'Concentration (Analytical Lab)',
    units: [
      lin('pct', 'Percent (% w/w or w/v)', 10000),
      lin('ppm', 'ppm (mg/kg or mg/L)', 1),
      lin('ppb', 'ppb (µg/kg or µg/L)', 0.001),
      lin('g_L', 'g/L', 1000),
      lin('mg_mL', 'mg/mL', 1000),
      lin('ug_mL', 'µg/mL', 1),
    ],
  },
  flow: {
    label: 'Flow Rate',
    units: [
      lin('L_min', 'L/min', 1),
      lin('mL_min', 'mL/min', 0.001),
      lin('L_s', 'L/sec', 60),
      lin('gpm', 'US gal/min (GPM)', 3.78541),
      lin('cfm', 'Cubic ft/min (CFM)', 28.3168),
    ],
  },
  angle: {
    label: 'Angles',
    units: [
      lin('deg', 'Degrees (°)', 1),
      lin('rad', 'Radians (rad)', 180 / Math.PI),
      lin('grad', 'Gradians (gon)', 0.9),
      lin('turn', 'Full Turns', 360),
    ],
  },
  torque: {
    label: 'Torque',
    units: [
      lin('Nm', 'Newton-meter (N·m)', 1),
      lin('ftlb', 'Foot-pound (ft·lb)', 1.355818),
      lin('inlb', 'Inch-pound (in·lb)', 0.112985),
    ],
  },
  fuel: {
    label: 'Fuel Economy',
    units: [
      { id: 'mpg', label: 'Miles/US gal (MPG)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'kml', label: 'km/L', toBase: (v) => v * 2.3521458, fromBase: (v) => v / 2.3521458 },
      { id: 'l100km', label: 'L/100km', toBase: (v) => (v > 0 ? 235.21458 / v : NaN), fromBase: (v) => (v > 0 ? 235.21458 / v : NaN) },
    ],
  },
  radiation: {
    label: 'Radiation & Dose',
    units: [
      lin('Sv', 'Sievert (Sv)', 1),
      lin('mSv', 'Millisievert (mSv)', 0.001),
      lin('uSv', 'Microsievert (µSv)', 1e-6),
      lin('rem', 'Rem', 0.01),
      lin('mrem', 'Millirem (mrem)', 1e-5),
    ],
  },
};

export function convertUnitValue(categoryKey: string, fromUnitId: string, toUnitId: string, value: number): number {
  const cat = UNIT_CATEGORIES[categoryKey];
  if (!cat) return NaN;
  const from = cat.units.find((u) => u.id === fromUnitId);
  const to = cat.units.find((u) => u.id === toUnitId);
  if (!from || !to) return NaN;
  return to.fromBase(from.toBase(value));
}

export const OFFLINE_FALLBACK_FX_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.39,
  AUD: 1.53,
  JPY: 154.0,
  CHF: 0.88,
  CNY: 7.24,
  MXN: 20.1,
  INR: 84.4,
  BRL: 5.8,
  KRW: 1395,
  NZD: 1.69,
  SEK: 10.9,
  NOK: 11.0,
};
