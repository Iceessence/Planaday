import { createRecord, updateRecord } from './repository';
import type {
  LifeRecord,
  NotePayload,
  RecordType,
  ScannedDocPayload,
  ScannedOcrWord,
  TaskPayload,
} from './types';

export type Point2D = [number, number]; // [x, y]

export interface DetectedTable {
  headers: string[];
  rows: string[][];
  csv: string;
}

export interface OcrConfidenceReport {
  avgConfidence: number;
  uncertainWords: ScannedOcrWord[];
  requiresManualReview: boolean;
}

export interface HybridOcrResult {
  text: string;
  confidence: number;
  words: ScannedOcrWord[];
  engineUsed: 'tesseract-local' | 'gpu-paddleocr' | 'gpu-vlm' | 'manual';
  requiresManualReview: boolean;
  detectedTable: DetectedTable | null;
  fallbackNotice?: string;
}

/**
 * Automatic document edge / boundary quad detection on an RGBA pixel buffer (§5).
 * Uses Sobel gradient magnitude + border-contrast thresholding to find the 4 extreme corners
 * [TopLeft, TopRight, BottomRight, BottomLeft] normalized to 0..1.
 */
export function detectDocumentBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): [Point2D, Point2D, Point2D, Point2D] {
  const fallback: [Point2D, Point2D, Point2D, Point2D] = [
    [0.05, 0.05],
    [0.95, 0.05],
    [0.95, 0.95],
    [0.05, 0.95],
  ];
  if (width < 8 || height < 8 || rgba.length < width * height * 4) return fallback;

  // Compute grayscale luminance
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }

  // Estimate border background intensity
  let borderSum = 0;
  let borderCnt = 0;
  for (let x = 0; x < width; x++) {
    borderSum += gray[x] + gray[(height - 1) * width + x];
    borderCnt += 2;
  }
  for (let y = 1; y < height - 1; y++) {
    borderSum += gray[y * width] + gray[y * width + (width - 1)];
    borderCnt += 2;
  }
  const borderMean = borderSum / Math.max(1, borderCnt);

  // Sobel edge magnitude + contrast mask
  let minSum = Number.POSITIVE_INFINITY;
  let maxSum = Number.NEGATIVE_INFINITY;
  let maxDiff = Number.NEGATIVE_INFINITY;
  let minDiff = Number.POSITIVE_INFINITY;

  let tl: Point2D = [width * 0.05, height * 0.05];
  let tr: Point2D = [width * 0.95, height * 0.05];
  let br: Point2D = [width * 0.95, height * 0.95];
  let bl: Point2D = [width * 0.05, height * 0.95];
  let strongCount = 0;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = y * width + x;
      const gx =
        -gray[idx - width - 1] +
        gray[idx - width + 1] -
        2 * gray[idx - 1] +
        2 * gray[idx + 1] -
        gray[idx + width - 1] +
        gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] -
        2 * gray[idx - width] -
        gray[idx - width + 1] +
        gray[idx + width - 1] +
        2 * gray[idx + width] +
        gray[idx + width + 1];
      const mag = Math.hypot(gx, gy);
      const contrast = Math.abs(gray[idx] - borderMean);

      if (mag > 90 || contrast > 42) {
        strongCount++;
        const s = x + y;
        const d = x - y;
        if (s < minSum) {
          minSum = s;
          tl = [x, y];
        }
        if (s > maxSum) {
          maxSum = s;
          br = [x, y];
        }
        if (d > maxDiff) {
          maxDiff = d;
          tr = [x, y];
        }
        if (d < minDiff) {
          minDiff = d;
          bl = [x, y];
        }
      }
    }
  }

  if (strongCount < 16) return fallback;

  const norm = (pt: Point2D): Point2D => [
    Math.max(0, Math.min(1, pt[0] / (width - 1))),
    Math.max(0, Math.min(1, pt[1] / (height - 1))),
  ];
  const quad: [Point2D, Point2D, Point2D, Point2D] = [norm(tl), norm(tr), norm(br), norm(bl)];

  // Ensure detected quad spans a sensible minimum area (> 12% of image)
  const wTop = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
  const hLeft = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
  if (wTop < 0.15 || hLeft < 0.15) return fallback;

  return quad;
}

/**
 * Computes a 3x3 projective homography matrix H mapping 4 source points -> 4 destination points
 * using Gaussian elimination with partial pivoting.
 */
export function computeHomographyMatrix(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D]
): number[] {
  // Build 8x9 augmented matrix for Ah = b with h8 = 1
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r][col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-10) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    if (pivotRow !== col) {
      const tmp = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmp;
    }
    const pivot = A[col][col];
    for (let c = col; c <= n; c++) A[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        A[r][c] -= factor * A[col][c];
      }
    }
  }

  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
}

/**
 * Applies true 4-point projective perspective correction with bilinear interpolation (§5).
 */
export function warpPerspectiveRgba(
  srcRgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  srcCornersNorm: [Point2D, Point2D, Point2D, Point2D],
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const srcPts: [Point2D, Point2D, Point2D, Point2D] = [
    [srcCornersNorm[0][0] * (srcW - 1), srcCornersNorm[0][1] * (srcH - 1)],
    [srcCornersNorm[1][0] * (srcW - 1), srcCornersNorm[1][1] * (srcH - 1)],
    [srcCornersNorm[2][0] * (srcW - 1), srcCornersNorm[2][1] * (srcH - 1)],
    [srcCornersNorm[3][0] * (srcW - 1), srcCornersNorm[3][1] * (srcH - 1)],
  ];
  const dstPts: [Point2D, Point2D, Point2D, Point2D] = [
    [0, 0],
    [dstW - 1, 0],
    [dstW - 1, dstH - 1],
    [0, dstH - 1],
  ];

  // Backward homography: map destination pixel -> source coordinates
  const H = computeHomographyMatrix(dstPts, srcPts);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const denom = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / (denom || 1);
      const sy = (H[3] * x + H[4] * y + H[5]) / (denom || 1);

      const dstIdx = (y * dstW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= srcW - 1 || sy >= srcH - 1) {
        out[dstIdx] = 255;
        out[dstIdx + 1] = 255;
        out[dstIdx + 2] = 255;
        out[dstIdx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      out[dstIdx] = Math.round(srcRgba[i00] * w00 + srcRgba[i10] * w10 + srcRgba[i01] * w01 + srcRgba[i11] * w11);
      out[dstIdx + 1] = Math.round(
        srcRgba[i00 + 1] * w00 + srcRgba[i10 + 1] * w10 + srcRgba[i01 + 1] * w01 + srcRgba[i11 + 1] * w11
      );
      out[dstIdx + 2] = Math.round(
        srcRgba[i00 + 2] * w00 + srcRgba[i10 + 2] * w10 + srcRgba[i01 + 2] * w01 + srcRgba[i11 + 2] * w11
      );
      out[dstIdx + 3] = 255;
    }
  }
  return out;
}

/**
 * Enhances a scanned document image via integral-image local background normalization (shadow reduction),
 * contrast stretching, and optional crisp black-and-white document mode (§5).
 */
export function enhanceDocumentScanRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { contrastBoost?: number; shadowReduction?: boolean; bwMode?: boolean } = {}
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const contrastFactor = 1 + Math.max(0, Math.min(100, opts.contrastBoost ?? 30)) / 50;
  const doShadow = opts.shadowReduction ?? true;
  const doBw = opts.bwMode ?? false;

  // Build integral image of luminance for fast O(1)-per-pixel local illumination estimation
  let integral: Float64Array | null = null;
  if (doShadow && width > 2 && height > 2) {
    integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
        rowSum += lum;
        integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
      }
    }
  }

  const rad = Math.max(8, Math.round(Math.min(width, height) * 0.06));

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - rad);
    const y2 = Math.min(height, y + rad + 1);
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      let r = rgba[p];
      let g = rgba[p + 1];
      let b = rgba[p + 2];

      if (integral) {
        const x1 = Math.max(0, x - rad);
        const x2 = Math.min(width, x + rad + 1);
        const area = Math.max(1, (x2 - x1) * (y2 - y1));
        const stride = width + 1;
        const localMean =
          (integral[y2 * stride + x2] -
            integral[y1 * stride + x2] -
            integral[y2 * stride + x1] +
            integral[y1 * stride + x1]) /
          area;
        const scale = localMean > 20 ? Math.min(2.2, 238 / localMean) : 1;
        r = Math.min(255, r * scale);
        g = Math.min(255, g * scale);
        b = Math.min(255, b * scale);
      }

      // Contrast stretch around midpoint
      r = Math.max(0, Math.min(255, (r - 128) * contrastFactor + 128));
      g = Math.max(0, Math.min(255, (g - 128) * contrastFactor + 128));
      b = Math.max(0, Math.min(255, (b - 128) * contrastFactor + 128));

      if (doBw) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const v = lum < 172 ? 18 : 252;
        out[p] = v;
        out[p + 1] = v;
        out[p + 2] = v;
        out[p + 3] = 255;
      } else {
        out[p] = Math.round(r);
        out[p + 1] = Math.round(g);
        out[p + 2] = Math.round(b);
        out[p + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Analyzes word-level OCR confidence scores and highlights uncertain words (< 70%).
 * Enforces manual verification for Laboratory and Financial data integrity (§5).
 */
export function analyzeOcrConfidence(
  rawWords: Array<{ text: string; confidence: number }>,
  uncertainThreshold = 70
): OcrConfidenceReport {
  const cleaned = rawWords
    .map((w) => ({
      text: (w.text || '').trim(),
      confidence: Math.max(0, Math.min(100, Math.round(w.confidence))),
    }))
    .filter((w) => w.text.length > 0);

  if (cleaned.length === 0) {
    return { avgConfidence: 0, uncertainWords: [], requiresManualReview: true };
  }

  let sum = 0;
  const uncertainWords: ScannedOcrWord[] = [];
  for (const w of cleaned) {
    sum += w.confidence;
    const isUncertain = w.confidence < uncertainThreshold;
    if (isUncertain) {
      uncertainWords.push({ text: w.text, confidence: w.confidence, uncertain: true });
    }
  }

  const avgConfidence = Math.round(sum / cleaned.length);
  return {
    avgConfidence,
    uncertainWords,
    requiresManualReview: avgConfidence < 85 || uncertainWords.length > 0,
  };
}

/**
 * Detects structured tables inside OCR output (pipe-delimited, tab-delimited, or multi-space columns)
 * and formats them into Spreadsheet-ready headers, rows, and CSV (§5).
 */
export function extractTableFromOcrText(text: string): DetectedTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  const splitRow = (line: string): string[] => {
    if (line.includes('|')) {
      return line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    }
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.trim());
    }
    return line.split(/\s{2,}/).map((c) => c.trim());
  };

  const parsed = lines
    .filter((l) => !/^[-|:\s]+$/.test(l))
    .map(splitRow)
    .filter((cols) => cols.length >= 2);

  if (parsed.length < 2) return null;

  const colCount = Math.max(...parsed.map((r) => r.length));
  if (colCount < 2) return null;

  const normalized = parsed.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push('');
    return padded;
  });

  const headers = normalized[0];
  const rows = normalized.slice(1);
  const escapeCsv = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  return { headers, rows, csv };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
}

/**
 * Hybrid OCR runner:
 * 1. If the user explicitly enabled & opted into the self-hosted RTX 5050 GPU service, sends the scan to /api/gpu/ocr.
 * 2. Otherwise (or on any offline/unreachable condition), automatically runs on-device offline Tesseract.js Web Worker.
 * 3. If offline language assets are unavailable, gracefully falls back to manual transcription — never invents text!
 */
export async function runHybridOcr(
  imageBlob: Blob,
  opts: {
    language?: string;
    mode?: 'auto' | 'local' | 'gpu' | 'manual';
    gpuEnabled?: boolean;
    gpuPrivacyOptIn?: boolean;
    preferredGpuModel?: 'paddleocr' | 'vlm_handwriting' | 'auto';
    serverBase?: string;
    authToken?: string;
    fetchImpl?: typeof fetch;
    onProgress?: (pct: number, status: string) => void;
  } = {}
): Promise<HybridOcrResult> {
  const language = opts.language || 'eng';
  const mode = opts.mode || 'auto';

  if (mode === 'manual') {
    return {
      text: '',
      confidence: 0,
      words: [],
      engineUsed: 'manual',
      requiresManualReview: true,
      detectedTable: null,
      fallbackNotice: 'Manual transcription mode selected — type or review directly beside the original scan.',
    };
  }

  // Optional Self-Hosted RTX 5050 GPU Acceleration path (§5 & §6)
  const shouldTryGpu =
    (mode === 'gpu' || (mode === 'auto' && opts.gpuEnabled)) &&
    Boolean(opts.gpuPrivacyOptIn) &&
    opts.serverBase !== undefined;

  if (shouldTryGpu) {
    try {
      opts.onProgress?.(15, 'Sending scan to self-hosted GPU OCR worker…');
      const ab = await imageBlob.arrayBuffer();
      const fetchFn = opts.fetchImpl ?? fetch;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;
      const res = await fetchFn(`${opts.serverBase}/api/gpu/ocr`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: arrayBufferToBase64(ab),
          mimeType: imageBlob.type || 'image/png',
          language,
          model: opts.preferredGpuModel || 'paddleocr',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          available?: boolean;
          text?: string;
          words?: Array<{ text: string; confidence: number }>;
          engine?: 'gpu-paddleocr' | 'gpu-vlm';
        };
        if (data.ok && data.available !== false && typeof data.text === 'string') {
          const report = analyzeOcrConfidence(data.words ?? []);
          const words: ScannedOcrWord[] = (data.words ?? []).map((w) => ({
            text: w.text,
            confidence: Math.round(w.confidence),
            uncertain: w.confidence < 70,
          }));
          opts.onProgress?.(100, 'GPU OCR complete');
          return {
            text: data.text,
            confidence: report.avgConfidence || 90,
            words,
            engineUsed: data.engine ?? 'gpu-paddleocr',
            requiresManualReview: report.requiresManualReview,
            detectedTable: extractTableFromOcrText(data.text),
          };
        }
      }
    } catch {
      // Fall through cleanly to local on-device Tesseract.js OCR
    }
  }

  // On-Device Offline OCR via lazy-loaded Tesseract.js Web Worker
  try {
    opts.onProgress?.(20, 'Loading on-device OCR engine (Tesseract.js)…');
    const tesseractMod = await import('tesseract.js');
    const recognizeFn = tesseractMod.recognize ?? tesseractMod.default?.recognize;
    if (typeof recognizeFn !== 'function') {
      throw new Error('Tesseract recognize API unavailable');
    }
    const result = await recognizeFn(imageBlob, language, {
      logger: (m: { status?: string; progress?: number }) => {
        if (typeof m.progress === 'number') {
          opts.onProgress?.(Math.round(20 + m.progress * 75), m.status || 'Recognizing text…');
        }
      },
    });
    const text = (result?.data?.text ?? '').trim();
    const pageData = result?.data as unknown as { words?: Array<{ text: string; confidence: number }>; confidence?: number } | undefined;
    const rawWords = Array.isArray(pageData?.words)
      ? pageData.words
      : text
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => ({ text: t, confidence: pageData?.confidence ?? 75 }));
    const report = analyzeOcrConfidence(rawWords);
    const words: ScannedOcrWord[] = rawWords.map((w) => ({
      text: w.text,
      confidence: Math.round(w.confidence),
      uncertain: w.confidence < 70,
    }));
    opts.onProgress?.(100, 'On-device OCR complete');
    return {
      text,
      confidence: report.avgConfidence,
      words,
      engineUsed: 'tesseract-local',
      requiresManualReview: report.requiresManualReview,
      detectedTable: extractTableFromOcrText(text),
    };
  } catch (err) {
    return {
      text: '',
      confidence: 0,
      words: [],
      engineUsed: 'manual',
      requiresManualReview: true,
      detectedTable: null,
      fallbackNotice: `On-device OCR could not load language data (${err instanceof Error ? err.message : 'offline'}). Your scan image is preserved — transcribe or edit manually, or connect your self-hosted GPU OCR service.`,
    };
  }
}

/**
 * Saves a scanned document's verified text/tables into any Planaday module while preserving
 * the original scan image blobs and creating bidirectional EntityLinks (§5).
 */
export async function saveScanToPlanadayTarget(
  scanRecord: LifeRecord<ScannedDocPayload>,
  target: 'note' | 'task' | 'checklist' | 'spreadsheet' | 'lab_research' | 'project',
  opts: {
    title?: string;
    editedText: string;
    logicalToday: string;
    notebookId?: string;
  }
): Promise<{ created: LifeRecord; summary: string }> {
  const p = scanRecord.payload;
  const title = (opts.title || scanRecord.title || `Scanned Document ${opts.logicalToday}`).trim();
  const text = opts.editedText.trim();

  // Safety gate (§5): Laboratory records require explicit manual confirmation when uncertain!
  if (target === 'lab_research' && p.requiresManualReview && !p.manualReviewConfirmed) {
    throw new Error(
      'Manual review confirmation is required before saving uncertain OCR results to Laboratory records.'
    );
  }

  const sourceBlobIds = p.pages.map((pg) => pg.enhancedBlobHash || pg.originalBlobHash).filter(Boolean);
  const originalBlobIds = p.pages.map((pg) => pg.originalBlobHash).filter(Boolean);
  const allBlobIds = Array.from(new Set([...originalBlobIds, ...sourceBlobIds]));

  const linkToScan = [{ targetId: scanRecord.id, targetType: 'scanned_doc' as RecordType, relation: 'scanned_from' as const, label: scanRecord.title }];
  let created: LifeRecord;

  if (target === 'note') {
    created = await createRecord<NotePayload>(
      'note',
      title,
      {
        notebookId: opts.notebookId || 'nb_personal',
        writtenForDate: opts.logicalToday,
        sourcePlannerDate: opts.logicalToday,
        isDailyNote: false,
        dailyCategory: 'research',
        content: text || `# ${title}\n`,
        attachmentBlobIds: allBlobIds,
        ocrSourceBlobIds: originalBlobIds,
        ocrConfidence: p.avgConfidence,
        touchedDates: [opts.logicalToday],
      },
      { category: 'Scanned Notes', tags: ['scanned', 'ocr'], links: linkToScan }
    );
  } else if (target === 'task') {
    created = await createRecord<TaskPayload>(
      'task',
      title,
      {
        notes: text,
        subtasks: [],
        boardColumn: 'next',
        sourceProvenance: `scan:${scanRecord.id}`,
      },
      { doDate: opts.logicalToday, tags: ['scanned'], links: linkToScan }
    );
  } else if (target === 'checklist') {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*•[\]xX\s]+/, '').trim())
      .filter(Boolean);
    created = await createRecord<TaskPayload>(
      'task',
      title,
      {
        notes: `Scanned checklist (${p.pages.length} page(s))`,
        subtasks: lines.map((ln, idx) => ({ id: `sub_${Date.now()}_${idx}`, title: ln, done: false })),
        boardColumn: 'next',
        sourceProvenance: `scan:${scanRecord.id}`,
      },
      { doDate: opts.logicalToday, tags: ['scanned', 'checklist'], links: linkToScan }
    );
  } else if (target === 'spreadsheet') {
    const detected = extractTableFromOcrText(text);
    const cells: Record<string, string> = {};
    if (detected) {
      detected.headers.forEach((h, c) => {
        const col = String.fromCharCode(65 + Math.min(25, c));
        cells[`${col}1`] = h;
      });
      detected.rows.forEach((row, r) => {
        row.forEach((val, c) => {
          const col = String.fromCharCode(65 + Math.min(25, c));
          cells[`${col}${r + 2}`] = val;
        });
      });
    } else {
      text.split(/\r?\n/).forEach((ln, r) => {
        cells[`A${r + 1}`] = ln;
      });
    }
    created = await createRecord<Record<string, unknown>>(
      'spreadsheet',
      title,
      {
        cells,
        csvPreview: detected?.csv ?? text,
        sourceScanId: scanRecord.id,
        attachmentBlobIds: originalBlobIds,
      },
      { category: 'Scanned Tables', tags: ['scanned', 'table'], links: linkToScan }
    );
  } else if (target === 'lab_research') {
    created = await createRecord<Record<string, unknown>>(
      'lab_research',
      title,
      {
        notes: text,
        verifiedByManualReview: true,
        ocrConfidence: p.avgConfidence,
        attachmentBlobIds: allBlobIds,
        date: opts.logicalToday,
      },
      { category: 'Laboratory', tags: ['scanned', 'lab-verified'], links: linkToScan }
    );
  } else {
    created = await createRecord<Record<string, unknown>>(
      'project',
      title,
      {
        description: text,
        stage: 'planning',
        attachmentBlobIds: allBlobIds,
        sourceScanId: scanRecord.id,
      },
      { category: 'Projects', tags: ['scanned'], links: linkToScan }
    );
  }

  await updateRecord<ScannedDocPayload>(
    scanRecord.id,
    (cur) => ({
      ...cur,
      payload: {
        ...cur.payload,
        combinedText: text,
        savedTargets: [
          ...(cur.payload.savedTargets ?? []),
          { recordId: created.id, type: created.type, label: created.title, createdAt: new Date().toISOString() },
        ],
      },
    }),
    { skipUndo: true }
  );

  return { created, summary: `Saved scan to ${target.replace('_', ' ')} "${created.title}"` };
}
