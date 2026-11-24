// Analytical Chemistry Wet Chemistry vs. NIR Statistical Comparison Engine (Section 19.14)
// Explicitly tracks calculation methods, sample sizes, units, and excluded points.

export interface WetNirPairRecord {
  id: string;
  sampleId: string;
  commodity: string;
  analysis: string;
  wetMethod: string;
  wetResult: number; // mean if replicates provided
  wetReplicates?: number[];
  nirResult: number; // mean if replicates provided
  nirReplicates?: number[];
  unit: string;
  instrumentId: string;
  calibrationModel: string;
  dateTested: string; // YYYY-MM-DD
  analyst: string;
  excluded?: boolean;
  excludeReason?: string;
  notes?: string;
}

export interface WetNirPointResult {
  record: WetNirPairRecord;
  wetMean: number;
  nirMean: number;
  signedDiff: number; // NIR - Wet
  absDiff: number; // |NIR - Wet|
  pctDiff: number | null; // ((NIR - Wet) / Wet) * 100 when Wet != 0
}

export interface WetNirSummaryStats {
  nIncluded: number;
  nExcluded: number;
  units: string[];
  mixedUnitsWarning: boolean;
  meanWet: number | null;
  meanNir: number | null;
  bias: number | null; // mean(NIR - Wet)
  sdDiff: number | null; // sample SD of (NIR - Wet) (n-1 denominator, SEP)
  rmse: number | null; // sqrt(mean((NIR - Wet)^2))
  meanAbsDiff: number | null;
  meanAbsPctDiff: number | null;
  pearsonR: number | null;
  rSquared: number | null;
  slope: number | null; // OLS NIR = slope * Wet + intercept
  intercept: number | null;
  methodNotes: string;
  points: WetNirPointResult[];
  excludedPoints: WetNirPointResult[];
}

export function meanOf(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export function computeWetNirComparison(records: WetNirPairRecord[]): WetNirSummaryStats {
  const allPoints: WetNirPointResult[] = records.map((rec) => {
    const wetMean =
      rec.wetReplicates && rec.wetReplicates.length > 0 ? meanOf(rec.wetReplicates) : Number(rec.wetResult);
    const nirMean =
      rec.nirReplicates && rec.nirReplicates.length > 0 ? meanOf(rec.nirReplicates) : Number(rec.nirResult);
    const signedDiff = nirMean - wetMean;
    const absDiff = Math.abs(signedDiff);
    const pctDiff = wetMean !== 0 ? (signedDiff / wetMean) * 100 : null;
    return { record: rec, wetMean, nirMean, signedDiff, absDiff, pctDiff };
  });

  const points = allPoints.filter((p) => !p.record.excluded && Number.isFinite(p.wetMean) && Number.isFinite(p.nirMean));
  const excludedPoints = allPoints.filter((p) => p.record.excluded);
  const units = Array.from(new Set(points.map((p) => (p.record.unit || '%').trim()).filter(Boolean)));
  const mixedUnitsWarning = units.length > 1;

  const n = points.length;
  if (n === 0) {
    return {
      nIncluded: 0,
      nExcluded: excludedPoints.length,
      units,
      mixedUnitsWarning,
      meanWet: null,
      meanNir: null,
      bias: null,
      sdDiff: null,
      rmse: null,
      meanAbsDiff: null,
      meanAbsPctDiff: null,
      pearsonR: null,
      rSquared: null,
      slope: null,
      intercept: null,
      methodNotes: 'No included pairs available.',
      points,
      excludedPoints,
    };
  }

  const xs = points.map((p) => p.wetMean);
  const ys = points.map((p) => p.nirMean);
  const diffs = points.map((p) => p.signedDiff);

  const meanWet = meanOf(xs);
  const meanNir = meanOf(ys);
  const bias = meanOf(diffs);
  const meanAbsDiff = meanOf(points.map((p) => p.absDiff));
  const validPcts = points.map((p) => p.pctDiff).filter((v): v is number => v !== null);
  const meanAbsPctDiff = validPcts.length > 0 ? meanOf(validPcts.map((v) => Math.abs(v))) : null;

  // RMSE = sqrt(sum((NIR - Wet)^2) / n)
  const mse = diffs.reduce((s, d) => s + d * d, 0) / n;
  const rmse = Math.sqrt(mse);

  // Sample SD of differences (SEP, n-1 denominator)
  const sdDiff =
    n >= 2 ? Math.sqrt(diffs.reduce((s, d) => s + (d - bias) * (d - bias), 0) / (n - 1)) : null;

  // Ordinary Least Squares regression (NIR = slope * Wet + intercept) and Pearson r / R^2
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanWet;
    const dy = ys[i] - meanNir;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  let slope: number | null = null;
  let intercept: number | null = null;
  let pearsonR: number | null = null;
  let rSquared: number | null = null;

  if (n >= 2 && sxx > 0) {
    slope = sxy / sxx;
    intercept = meanNir - slope * meanWet;
    if (syy > 0) {
      pearsonR = sxy / Math.sqrt(sxx * syy);
      rSquared = pearsonR * pearsonR;
    }
  }

  return {
    nIncluded: n,
    nExcluded: excludedPoints.length,
    units,
    mixedUnitsWarning,
    meanWet,
    meanNir,
    bias,
    sdDiff,
    rmse,
    meanAbsDiff,
    meanAbsPctDiff,
    pearsonR,
    rSquared,
    slope,
    intercept,
    methodNotes:
      'Signed Diff = NIR − Wet; Bias = mean(NIR − Wet); SD/SEP uses sample denominator (n − 1); RMSE = √[Σ(NIR − Wet)² / n]; OLS regression fits NIR = slope × Wet + intercept; R² = r². Observational comparison only — does not establish regulatory analytical validity.',
    points,
    excludedPoints,
  };
}
