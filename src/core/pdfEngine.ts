import type { PdfAnnotationItem, PdfRedactionRect } from './types';

export interface PdfMetadataInfo {
  pageCount: number;
  title?: string;
  author?: string;
  formFields: Array<{ name: string; kind: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'other'; value: string | boolean }>;
  pageSizes: Array<{ width: number; height: number; rotation: number }>;
}

export interface PdfSearchHit {
  page: number;
  count: number;
  snippet: string;
}

export interface PdfApplyEditsResult {
  bytes: Uint8Array;
  structuralEdit: boolean;
  annotationCount: number;
  redactedPagesCount: number;
  redactionMode: 'none' | 'rasterized-flattened' | 'stream-stripped';
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#e6b800').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return { r: 0.9, g: 0.72, b: 0 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

async function loadPdfLib() {
  return import('pdf-lib');
}

let pdfjsConfigured = false;
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjsConfigured) {
    pdfjsConfigured = true;
    try {
      // Configure worker source cleanly when running in browser; gracefully disable if unavailable
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      if (workerMod?.default && pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      }
    } catch {
      // Worker URL optional — pdfjs falls back cleanly to main/fake worker in Node/test/offline contexts
    }
  }
  return pdfjs;
}

/**
 * Creates a clean standalone PDF document (used for "New Blank PDF" or unit tests).
 */
export async function createBlankPdfBytes(
  title = 'Untitled Planaday Document',
  initialLines: string[] = []
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('Planaday PDF Studio');
  const page = doc.addPage([612, 792]);
  if (initialLines.length > 0) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let y = 740;
    for (const line of initialLines) {
      page.drawText(line.slice(0, 120), { x: 48, y, size: 12, font, color: rgb(0.12, 0.12, 0.12) });
      y -= 18;
      if (y < 48) break;
    }
  }
  return doc.save();
}

/**
 * Inspects PDF metadata, page geometry, and AcroForm fields using pdf-lib.
 */
export async function inspectPdfBytes(bytes: Uint8Array): Promise<PdfMetadataInfo> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const pageSizes = pages.map((pg) => {
    const sz = pg.getSize();
    return { width: sz.width, height: sz.height, rotation: pg.getRotation().angle };
  });

  const formFields: PdfMetadataInfo['formFields'] = [];
  try {
    const form = doc.getForm();
    for (const field of form.getFields()) {
      const name = field.getName();
      if (field instanceof PDFTextField) {
        formFields.push({ name, kind: 'text', value: field.getText() ?? '' });
      } else if (field instanceof PDFCheckBox) {
        formFields.push({ name, kind: 'checkbox', value: field.isChecked() });
      } else if (field instanceof PDFDropdown) {
        formFields.push({ name, kind: 'dropdown', value: field.getSelected()[0] ?? '' });
      } else if (field instanceof PDFRadioGroup) {
        formFields.push({ name, kind: 'radio', value: field.getSelected() ?? '' });
      } else {
        formFields.push({ name, kind: 'other', value: '' });
      }
    }
  } catch {
    // PDF has no AcroForm dictionary
  }

  return {
    pageCount: pages.length,
    title: doc.getTitle() ?? undefined,
    author: doc.getAuthor() ?? undefined,
    formFields,
    pageSizes,
  };
}

/**
 * Extracts native selectable text from every page via pdfjs-dist (1-based page index -> text).
 * Pages with empty/sparse text are flagged in `scannedPages` so users can run hybrid OCR on them!
 */
export async function extractPdfTextByPage(
  bytes: Uint8Array
): Promise<{ textByPage: Record<number, string>; scannedPages: number[]; pageCount: number }> {
  const pdfjs = await loadPdfJs();
  const copy = new Uint8Array(bytes);
  const loadingTask = pdfjs.getDocument({
    data: copy,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  try {
    const pdfDoc = await loadingTask.promise;
    const textByPage: Record<number, string> = {};
    const scannedPages: number[] = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      try {
        const content = await page.getTextContent();
        const parts: string[] = [];
        for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
          if (typeof item.str === 'string') {
            parts.push(item.str);
            if (item.hasEOL) parts.push('\n');
            else parts.push(' ');
          }
        }
        const cleaned = parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\s{3,}/g, '  ').trim();
        textByPage[p] = cleaned;
        if (cleaned.length < 15) {
          scannedPages.push(p);
        }
      } finally {
        page.cleanup();
      }
    }

    const pageCount = pdfDoc.numPages;
    return { textByPage, scannedPages, pageCount };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export function searchPdfText(textByPage: Record<number, string>, query: string): PdfSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: PdfSearchHit[] = [];
  for (const [pageStr, text] of Object.entries(textByPage)) {
    const lower = (text || '').toLowerCase();
    let idx = lower.indexOf(q);
    if (idx === -1) continue;
    let count = 0;
    const firstIdx = idx;
    while (idx !== -1) {
      count++;
      idx = lower.indexOf(q, idx + q.length);
    }
    const start = Math.max(0, firstIdx - 36);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, start + 130).trim();
    hits.push({ page: Number(pageStr), count, snippet });
  }
  return hits.sort((a, b) => a.page - b.page);
}

// --- True Structural PDF Page Operations (pdf-lib) ---

export async function rotatePdfPage(
  bytes: Uint8Array,
  pageIndex: number,
  deltaDeg: 90 | 180 | 270 | -90
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) throw new Error('Invalid page index');
  const pg = pages[pageIndex];
  const next = (pg.getRotation().angle + deltaDeg + 360) % 360;
  pg.setRotation(degrees(next));
  return doc.save();
}

export async function cropPdfPage(
  bytes: Uint8Array,
  pageIndex: number,
  cropNorm: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) throw new Error('Invalid page index');
  const pg = pages[pageIndex];
  const { width, height } = pg.getSize();
  const cx = Math.max(0, Math.min(0.9, cropNorm.x)) * width;
  const cw = Math.max(0.1, Math.min(1 - cropNorm.x, cropNorm.width)) * width;
  const ch = Math.max(0.1, Math.min(1 - cropNorm.y, cropNorm.height)) * height;
  // Convert top-down normalized Y to bottom-up PDF coordinates
  const cy = Math.max(0, height - (cropNorm.y + cropNorm.height) * height);
  pg.setCropBox(cx, cy, cw, ch);
  return doc.save();
}

export async function addBlankPdfPage(
  bytes: Uint8Array,
  afterIndex?: number,
  width = 612,
  height = 792
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const insertAt =
    afterIndex !== undefined ? Math.max(0, Math.min(doc.getPageCount(), afterIndex + 1)) : doc.getPageCount();
  doc.insertPage(insertAt, [width, height]);
  return doc.save();
}

export async function duplicatePdfPage(bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Invalid page index');
  const [copied] = await doc.copyPages(doc, [pageIndex]);
  doc.insertPage(pageIndex + 1, copied);
  return doc.save();
}

export async function deletePdfPage(bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (doc.getPageCount() <= 1) throw new Error('Cannot delete the only remaining page in a PDF');
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error('Invalid page index');
  doc.removePage(pageIndex);
  return doc.save();
}

export async function reorderPdfPages(bytes: Uint8Array, newOrderIndices: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const dst = await PDFDocument.create();
  if (src.getTitle()) dst.setTitle(src.getTitle()!);
  const valid = newOrderIndices.filter((i) => i >= 0 && i < src.getPageCount());
  if (valid.length === 0) throw new Error('Page order cannot be empty');
  const copied = await dst.copyPages(src, valid);
  for (const pg of copied) dst.addPage(pg);
  return dst.save();
}

export async function mergePdfDocuments(pdfByteArrays: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const merged = await PDFDocument.create();
  merged.setCreator('Planaday PDF Studio');
  for (const bytes of pdfByteArrays) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = doc.getPageIndices();
    const pages = await merged.copyPages(doc, indices);
    for (const pg of pages) merged.addPage(pg);
  }
  return merged.save();
}

export async function splitPdfDocument(bytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  return reorderPdfPages(bytes, pageIndices);
}

export async function insertImageOnPdfPage(
  bytes: Uint8Array,
  pageIndex: number,
  imageBytes: Uint8Array,
  mimeType: string,
  rectNorm: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) throw new Error('Invalid page index');
  const pg = pages[pageIndex];
  const { width, height } = pg.getSize();
  const embedded = mimeType.includes('png') ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
  const drawW = Math.max(12, rectNorm.width * width);
  const drawH = Math.max(12, rectNorm.height * height);
  const drawX = rectNorm.x * width;
  const drawY = height - (rectNorm.y + rectNorm.height) * height;
  pg.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
  return doc.save();
}

export async function fillPdfFormFields(
  bytes: Uint8Array,
  values: Record<string, string | boolean>,
  flatten = false
): Promise<Uint8Array> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const val = values[name];
    if (field instanceof PDFTextField) {
      field.setText(String(val ?? ''));
    } else if (field instanceof PDFCheckBox) {
      if (val) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown && typeof val === 'string') {
      field.select(val);
    } else if (field instanceof PDFRadioGroup && typeof val === 'string') {
      field.select(val);
    }
  }
  if (flatten) {
    form.flatten();
  }
  return doc.save();
}

/**
 * Permanently embeds vector/text annotations AND executes TRUE IRREVERSIBLE SECURE REDACTION (§7).
 *
 * Security guarantee for redactions:
 * - Never merely draws a black rectangle over selectable PDF text!
 * - For every page containing redaction rects:
 *   1. When `renderedRedactedPagePngs[pageIndex]` is provided (browser canvas rasterization with solid black
 *      redactions baked into pixels), completely removes the original PDF page (destroying ALL underlying text
 *      streams & vector operators) and replaces it with a fresh page containing ONLY the sanitized PNG image!
 *   2. When invoked without rasterized PNGs (e.g. headless/server/test), strips the original page completely
 *      and rebuilds a clean blank/sanitized replacement page with solid black redaction blocks so zero bytes
 *      of the redacted page's sensitive underlying text survive in the saved PDF!
 */
export async function applyPdfAnnotationsAndRedactions(
  bytes: Uint8Array,
  annotations: PdfAnnotationItem[],
  redactions: PdfRedactionRect[],
  renderedRedactedPagePngs: Record<number, Uint8Array> = {}
): Promise<PdfApplyEditsResult> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  if (srcDoc.getTitle()) outDoc.setTitle(srcDoc.getTitle()!);
  outDoc.setCreator('Planaday PDF Studio');

  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const redactionsByPage = new Map<number, PdfRedactionRect[]>();
  for (const red of redactions) {
    const list = redactionsByPage.get(red.pageIndex) ?? [];
    list.push(red);
    redactionsByPage.set(red.pageIndex, list);
  }

  const annByPage = new Map<number, PdfAnnotationItem[]>();
  for (const ann of annotations) {
    const list = annByPage.get(ann.pageIndex) ?? [];
    list.push(ann);
    annByPage.set(ann.pageIndex, list);
  }

  let redactedPagesCount = 0;
  let usedRasterized = false;
  let usedStripped = false;
  const totalPages = srcDoc.getPageCount();

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const srcPage = srcDoc.getPage(pIdx);
    const { width, height } = srcPage.getSize();
    const pageRedactions = redactionsByPage.get(pIdx) ?? [];

    let targetPage;
    if (pageRedactions.length > 0) {
      redactedPagesCount++;
      const rasterPng = renderedRedactedPagePngs[pIdx];
      // Insert a BRAND-NEW page (original content stream & text bytes are permanently discarded!)
      targetPage = outDoc.addPage([width, height]);
      if (rasterPng && rasterPng.byteLength > 0) {
        const embeddedPng = await outDoc.embedPng(rasterPng);
        targetPage.drawImage(embeddedPng, { x: 0, y: 0, width, height });
        usedRasterized = true;
      } else {
        targetPage.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
        targetPage.drawText('[Page securely sanitized & redacted by Planaday PDF Studio]', {
          x: 36,
          y: height - 32,
          size: 9,
          font,
          color: rgb(0.35, 0.35, 0.35),
        });
        usedStripped = true;
      }
      // Bake irreversible opaque black redaction blocks onto the fresh page as well
      for (const red of pageRedactions) {
        const rx = red.x * width;
        const rw = Math.max(8, red.width * width);
        const rh = Math.max(8, red.height * height);
        const ry = height - (red.y + red.height) * height;
        targetPage.drawRectangle({ x: rx, y: ry, width: rw, height: rh, color: rgb(0, 0, 0) });
      }
    } else {
      const [copied] = await outDoc.copyPages(srcDoc, [pIdx]);
      targetPage = outDoc.addPage(copied);
    }

    // Embed true PDF annotations on targetPage
    const pageAnns = annByPage.get(pIdx) ?? [];
    for (const ann of pageAnns) {
      const { r, g, b } = hexToRgb01(ann.color);
      const col = rgb(r, g, b);
      const ax = ann.x * width;
      const aw = Math.max(10, (ann.width ?? 0.16) * width);
      const ah = Math.max(10, (ann.height ?? 0.04) * height);
      const ay = height - (ann.y + (ann.height ?? 0.04)) * height;

      if (ann.kind === 'highlight') {
        targetPage.drawRectangle({ x: ax, y: ay, width: aw, height: ah, color: col, opacity: ann.opacity ?? 0.35 });
      } else if (ann.kind === 'underline') {
        targetPage.drawLine({
          start: { x: ax, y: ay },
          end: { x: ax + aw, y: ay },
          thickness: ann.strokeWidth ?? 2,
          color: col,
        });
      } else if (ann.kind === 'strikethrough') {
        targetPage.drawLine({
          start: { x: ax, y: ay + ah / 2 },
          end: { x: ax + aw, y: ay + ah / 2 },
          thickness: ann.strokeWidth ?? 2,
          color: col,
        });
      } else if (ann.kind === 'rect') {
        targetPage.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          borderColor: col,
          borderWidth: ann.strokeWidth ?? 2,
        });
      } else if (ann.kind === 'ellipse') {
        targetPage.drawEllipse({
          x: ax + aw / 2,
          y: ay + ah / 2,
          xScale: aw / 2,
          yScale: ah / 2,
          borderColor: col,
          borderWidth: ann.strokeWidth ?? 2,
        });
      } else if (ann.kind === 'arrow') {
        const x1 = ann.x * width;
        const y1 = height - ann.y * height;
        const x2 = (ann.x2 ?? ann.x + 0.12) * width;
        const y2 = height - (ann.y2 ?? ann.y) * height;
        targetPage.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: ann.strokeWidth ?? 2, color: col });
      } else if (ann.kind === 'text' || ann.kind === 'comment') {
        const label = (ann.text || 'Note').slice(0, 240);
        if (ann.kind === 'comment') {
          targetPage.drawRectangle({
            x: ax - 4,
            y: ay - 4,
            width: Math.min(width - ax, Math.max(100, label.length * 6.2)),
            height: 22,
            color: rgb(1, 0.97, 0.8),
            borderColor: col,
            borderWidth: 1,
          });
        }
        targetPage.drawText(label, { x: ax, y: ay + 2, size: 11, font, color: col });
      } else if (ann.kind === 'stamp' || ann.kind === 'signature') {
        const label = (ann.text || (ann.kind === 'stamp' ? 'APPROVED' : 'Signed')).slice(0, 60);
        if (ann.kind === 'stamp') {
          targetPage.drawRectangle({
            x: ax - 6,
            y: ay - 4,
            width: Math.max(84, label.length * 8.5),
            height: 24,
            borderColor: col,
            borderWidth: 2,
          });
        }
        targetPage.drawText(label, { x: ax, y: ay + 3, size: 13, font: boldFont, color: col });
      } else if (ann.kind === 'ink' && ann.points && ann.points.length >= 2) {
        for (let i = 1; i < ann.points.length; i++) {
          const [px1, py1] = ann.points[i - 1];
          const [px2, py2] = ann.points[i];
          targetPage.drawLine({
            start: { x: px1 * width, y: height - py1 * height },
            end: { x: px2 * width, y: height - py2 * height },
            thickness: ann.strokeWidth ?? 2,
            color: col,
          });
        }
      }
    }
  }

  const saved = await outDoc.save({ useObjectStreams: false });
  return {
    bytes: saved,
    structuralEdit: true,
    annotationCount: annotations.length,
    redactedPagesCount,
    redactionMode:
      redactedPagesCount === 0
        ? 'none'
        : usedRasterized
          ? 'rasterized-flattened'
          : usedStripped
            ? 'stream-stripped'
            : 'none',
  };
}
