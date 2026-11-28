import { useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  CheckSquare,
  Copy,
  Crop,
  Download,
  EyeOff,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Highlighter,
  History,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Merge,
  PenTool,
  Printer,
  Redo2,
  RotateCw,
  Save,
  ScanLine,
  Scissors,
  Search,
  ShieldAlert,
  Square,
  Stamp,
  Trash2,
  Type,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId, db, storeBlob } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import {
  addBlankPdfPage,
  applyPdfAnnotationsAndRedactions,
  createBlankPdfBytes,
  cropPdfPage,
  deletePdfPage,
  duplicatePdfPage,
  extractPdfTextByPage,
  fillPdfFormFields,
  insertImageOnPdfPage,
  inspectPdfBytes,
  loadPdfJs,
  mergePdfDocuments,
  reorderPdfPages,
  rotatePdfPage,
  searchPdfText,
  splitPdfDocument,
  type PdfMetadataInfo,
} from '../../core/pdfEngine';
import { extractTableFromOcrText, runHybridOcr } from '../../core/documentScanner';
import { normalizeServerUrl } from '../../core/sync';
import type {
  LifeRecord,
  NotePayload,
  PdfAnnotationItem,
  PdfDocPayload,
  PdfRedactionRect,
  TaskPayload,
} from '../../core/types';

type ToolMode =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'text'
  | 'comment'
  | 'ink'
  | 'rect'
  | 'arrow'
  | 'stamp'
  | 'signature'
  | 'redact';

type RailTab = 'pages' | 'bookmarks' | 'search' | 'forms' | 'revisions';

export const PdfStudioView: React.FC = () => {
  const {
    settings,
    records,
    logicalToday,
    pushToast,
    selectedPdfId,
    setSelectedPdfId,
    setSelectedNoteId,
    setActiveView,
  } = useApp();
  
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));


  const pdfDocs = useMemo(
    () =>
      (records.filter((r) => r.type === 'pdf_doc' && !r.deletedAt) as Array<LifeRecord<PdfDocPayload>>).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
    [records]
  );

  const folders = useMemo(() => records.filter((r) => r.type === 'file_folder' && !r.deletedAt), [records]);
  const projects = useMemo(() => records.filter((r) => r.type === 'project' && !r.deletedAt), [records]);

  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [railTab, setRailTab] = useState<RailTab>('pages');
  const [tool, setTool] = useState<ToolMode>('select');
  const [toolColor, setToolColor] = useState('#e6b800');
  const [toolText, setToolText] = useState('APPROVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [metaInfo, setMetaInfo] = useState<PdfMetadataInfo | null>(null);
  const [formDraft, setFormDraft] = useState<Record<string, string | boolean>>({});
  const [renderedPages, setRenderedPages] = useState<Record<number, string>>({});
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [splitPagesInput, setSplitPagesInput] = useState('1');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local undo/redo stack for annotations/redactions before committing structural PDF write
  const [undoStack, setUndoStack] = useState<Array<{ annotations: PdfAnnotationItem[]; redactions: PdfRedactionRect[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ annotations: PdfAnnotationItem[]; redactions: PdfRedactionRect[] }>>([]);
  const [drawingInk, setDrawingInk] = useState<Array<[number, number]> | null>(null);
  const [dragBoxStart, setDragBoxStart] = useState<[number, number] | null>(null);
  const [dragBoxNow, setDragBoxNow] = useState<[number, number] | null>(null);

  const importPdfRef = useRef<HTMLInputElement | null>(null);
  const mergePdfRef = useRef<HTMLInputElement | null>(null);
  const insertImageRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const activeDoc = useMemo(
    () => pdfDocs.find((d) => d.id === selectedPdfId) ?? pdfDocs[0] ?? null,
    [pdfDocs, selectedPdfId]
  );

  useEffect(() => {
    if (activeDoc && !openTabIds.includes(activeDoc.id)) {
      setOpenTabIds((prev) => [...prev.slice(-5), activeDoc.id]);
    }
  }, [activeDoc, openTabIds]);

  const activeHash = activeDoc?.payload.activeBlobHash;
  const loadActiveBytes = useCallback(async (): Promise<Uint8Array | null> => {
    if (!activeHash) return null;
    const blobRec = await db.blobs.get(activeHash);
    if (!blobRec) return null;
    const data = blobRec.data ?? blobRec.blob;
    if (!data) return null;
    return new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data);
  }, [activeHash]);

  // Metadata is independent of zoom/page changes. Do not overwrite in-progress form edits.
  useEffect(() => {
    let cancelled = false;
    setMetaInfo(null);
    setFormDraft({});
    if (!activeDoc) return;
    const savedForm = { ...(activeDoc.payload.formValues ?? {}) };
    void (async () => {
      try {
        const bytes = await loadActiveBytes();
        if (!bytes || cancelled) return;
        const info = await inspectPdfBytes(bytes);
        if (cancelled) return;
        setMetaInfo(info);
        for (const f of info.formFields) if (!(f.name in savedForm)) savedForm[f.name] = f.value;
        setFormDraft(savedForm);
      } catch (err) { if (!cancelled) console.warn('PDF metadata unavailable', err); }
    })();
    return () => { cancelled = true; };
  }, [activeDoc?.id, activeHash, loadActiveBytes]);

  // Keep one persistent PDF.js document/worker alive per active PDF hash so page flips & zooms never respawn workers.
  const [loadedPdf, setLoadedPdf] = useState<{
    docId: string;
    hash: string;
    pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJs>>['getDocument']>['promise']>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => Promise<void>) | undefined;
    setLoadedPdf(null);
    if (!activeDoc || !activeHash) return;
    const docId = activeDoc.id;
    const hash = activeHash;
    void (async () => {
      try {
        const bytes = await loadActiveBytes();
        if (!bytes || cancelled) return;
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const task = pdfjs.getDocument({ data: bytes, useWorkerFetch: false });
        let destroyed = false;
        dispose = async () => { if (!destroyed) { destroyed = true; await task.destroy(); } };
        const pdf = await task.promise;
        if (cancelled) {
          await dispose().catch(() => {});
          return;
        }
        setLoadedPdf({ docId, hash, pdf });
      } catch (err) {
        if (!cancelled) console.warn('PDF worker load failed', err);
        if (dispose) await dispose().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      setLoadedPdf(null);
      if (dispose) void dispose().catch(() => {});
    };
  }, [activeDoc?.id, activeHash, loadActiveBytes]);

  // Render a bounded window against the persistent PDF.js worker. Dispose cancelled render tasks and canvases.
  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    const urls: string[] = [];
    setRenderedPages({});
    if (!activeDoc || !loadedPdf || loadedPdf.docId !== activeDoc.id || loadedPdf.hash !== activeHash) return;
    const pdf = loadedPdf.pdf;
    void (async () => {
      try {
        const zoom = Math.max(0.1, Math.min(8, activeDoc.payload.zoom || 1.15));
        const cur = Math.max(1, Math.min(pdf.numPages, activeDoc.payload.currentPage || 1));
        const from = activeDoc.payload.viewMode === 'continuous' ? Math.max(1, cur - 3) : cur;
        const to = activeDoc.payload.viewMode === 'continuous' ? Math.min(pdf.numPages, cur + 5) : activeDoc.payload.viewMode === 'spread' ? Math.min(pdf.numPages, cur + 1) : cur;
        const nextUrls: Record<number, string> = {};
        for (let pageNum = from; pageNum <= to && !cancelled; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) { page.cleanup(); break; }
          const natural = page.getViewport({ scale: zoom * 1.25 });
          const limit = Math.min(1, Math.sqrt(8_000_000 / Math.max(1, natural.width * natural.height)), 4096 / Math.max(1, natural.width, natural.height));
          const viewport = page.getViewport({ scale: zoom * 1.25 * limit });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          try {
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            const render = page.render({ canvasContext: ctx, viewport, canvas });
            cancelRender = () => render.cancel();
            await render.promise;
            cancelRender = undefined;
            if (cancelled) break;
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob && !cancelled) {
              const url = URL.createObjectURL(blob);
              urls.push(url); nextUrls[pageNum] = url;
              setRenderedPages({ ...nextUrls });
            }
          } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
        }
      } catch (err) { if (!cancelled) console.warn('PDF rendering failed', err); }
    })();
    return () => { cancelled = true; cancelRender?.(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [loadedPdf, activeDoc?.id, activeHash, activeDoc?.payload.currentPage, activeDoc?.payload.zoom, activeDoc?.payload.viewMode]);

  const importPdfFile = async (file: File) => {
    setBusyMsg(`Importing "${file.name}"…`);
    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const stored = await storeBlob(new Blob([bytes], { type: 'application/pdf' }), file.name);
      const info = await inspectPdfBytes(bytes);
      let textByPage: Record<number, string> = {};
      try {
        const extracted = await extractPdfTextByPage(bytes);
        textByPage = extracted.textByPage;
      } catch {
        // Optional native text extraction fallback
      }
      const created = await createRecord<PdfDocPayload>(
        'pdf_doc',
        info.title || file.name.replace(/\.pdf$/i, ''),
        {
          fileName: file.name,
          originalBlobHash: stored.hash,
          activeBlobHash: stored.hash,
          pageCount: info.pageCount,
          currentPage: 1,
          zoom: 1.15,
          viewMode: 'single',
          readingProgressPct: Math.round((1 / Math.max(1, info.pageCount)) * 100),
          bookmarks: [],
          annotations: [],
          pendingRedactions: [],
          appliedRedactionCount: 0,
          extractedTextByPage: textByPage,
          ocrCompletedPages: [],
          revisions: [
            {
              id: createId('pdfrev'),
              blobHash: stored.hash,
              label: 'Original Imported PDF',
              timestamp: new Date().toISOString(),
              structuralEdit: false,
            },
          ],
        },
        { category: 'PDF Documents', tags: ['pdf'] }
      );
      setSelectedPdfId(created.id);
      pushToast(`Imported "${created.title}" (${info.pageCount} page(s), indexed in Global Search)`, { tone: 'ok' });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'PDF import failed', { tone: 'danger' });
    } finally {
      setBusyMsg(null);
    }
  };

  const handleCreateBlankPdf = async () => {
    const bytes = await createBlankPdfBytes(`New PDF — ${logicalToday}`, [`Planaday PDF Document (${logicalToday})`]);
    const stored = await storeBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), `planaday-${logicalToday}.pdf`);
    const created = await createRecord<PdfDocPayload>(
      'pdf_doc',
      `New PDF — ${logicalToday}`,
      {
        fileName: `planaday-${logicalToday}.pdf`,
        originalBlobHash: stored.hash,
        activeBlobHash: stored.hash,
        pageCount: 1,
        currentPage: 1,
        zoom: 1.15,
        viewMode: 'single',
        readingProgressPct: 100,
        bookmarks: [],
        annotations: [],
        pendingRedactions: [],
        extractedTextByPage: { 1: `Planaday PDF Document (${logicalToday})` },
        revisions: [
          { id: createId('pdfrev'), blobHash: stored.hash, label: 'Initial Blank PDF', timestamp: new Date().toISOString(), structuralEdit: true },
        ],
      },
      { category: 'PDF Documents', tags: ['pdf'] }
    );
    setSelectedPdfId(created.id);
    pushToast('Created new editable PDF document');
  };

  const commitStructuralPdf = async (
    nextBytes: Uint8Array,
    label: string,
    extraPayload: Partial<PdfDocPayload> = {}
  ) => {
    if (!activeDoc) return;
    const stored = await storeBlob(new Blob([nextBytes as unknown as BlobPart], { type: 'application/pdf' }), activeDoc.payload.fileName);
    const info = await inspectPdfBytes(nextBytes);
    const nextCurrent = Math.min(activeDoc.payload.currentPage || 1, Math.max(1, info.pageCount));
    await updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
      ...cur,
      payload: {
        ...cur.payload,
        ...extraPayload,
        activeBlobHash: stored.hash,
        pageCount: info.pageCount,
        currentPage: nextCurrent,
        readingProgressPct: Math.round((nextCurrent / Math.max(1, info.pageCount)) * 100),
        revisions: [
          ...(cur.payload.revisions ?? []),
          {
            id: createId('pdfrev'),
            blobHash: stored.hash,
            label,
            timestamp: new Date().toISOString(),
            structuralEdit: true,
          },
        ].slice(-20),
      },
    }));
  };

  const pushAnnotationState = async (
    nextAnnotations: PdfAnnotationItem[],
    nextRedactions: PdfRedactionRect[]
  ) => {
    if (!activeDoc) return;
    setUndoStack((s) => [
      ...s.slice(-24),
      { annotations: activeDoc.payload.annotations ?? [], redactions: activeDoc.payload.pendingRedactions ?? [] },
    ]);
    setRedoStack([]);
    await updateRecord<PdfDocPayload>(
      activeDoc.id,
      (cur) => ({
        ...cur,
        payload: { ...cur.payload, annotations: nextAnnotations, pendingRedactions: nextRedactions },
      }),
      { skipUndo: true }
    );
  };

  const handleUndoAnnotation = async () => {
    if (!activeDoc || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [
      ...r,
      { annotations: activeDoc.payload.annotations ?? [], redactions: activeDoc.payload.pendingRedactions ?? [] },
    ]);
    await updateRecord<PdfDocPayload>(
      activeDoc.id,
      (cur) => ({
        ...cur,
        payload: { ...cur.payload, annotations: prev.annotations, pendingRedactions: prev.redactions },
      }),
      { skipUndo: true }
    );
  };

  const handleRedoAnnotation = async () => {
    if (!activeDoc || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [
      ...s,
      { annotations: activeDoc.payload.annotations ?? [], redactions: activeDoc.payload.pendingRedactions ?? [] },
    ]);
    await updateRecord<PdfDocPayload>(
      activeDoc.id,
      (cur) => ({
        ...cur,
        payload: { ...cur.payload, annotations: next.annotations, pendingRedactions: next.redactions },
      }),
      { skipUndo: true }
    );
  };

  const handlePagePointerDown = (pageNum: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDoc || tool === 'select') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

    if (tool === 'ink') {
      setDrawingInk([[nx, ny]]);
      return;
    }

    if (tool === 'text' || tool === 'comment' || tool === 'stamp' || tool === 'signature') {
      const ann: PdfAnnotationItem = {
        id: createId('pann'),
        pageIndex: pageNum - 1,
        kind: tool,
        x: nx,
        y: ny,
        width: 0.22,
        height: 0.045,
        color: toolColor,
        text: toolText || (tool === 'stamp' ? 'APPROVED' : tool === 'signature' ? 'Signed' : 'Comment'),
        createdAt: new Date().toISOString(),
      };
      void pushAnnotationState([...(activeDoc.payload.annotations ?? []), ann], activeDoc.payload.pendingRedactions ?? []);
      return;
    }

    setDragBoxStart([nx, ny]);
    setDragBoxNow([nx, ny]);
  };

  const handlePagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingInk && !dragBoxStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    if (drawingInk) {
      setDrawingInk((pts) => (pts ? [...pts, [nx, ny]] : [[nx, ny]]));
    } else if (dragBoxStart) {
      setDragBoxNow([nx, ny]);
    }
  };

  const handlePagePointerUp = (pageNum: number) => {
    if (!activeDoc) return;
    if (drawingInk && drawingInk.length >= 2) {
      const ann: PdfAnnotationItem = {
        id: createId('pann'),
        pageIndex: pageNum - 1,
        kind: 'ink',
        x: drawingInk[0][0],
        y: drawingInk[0][1],
        color: toolColor,
        strokeWidth: 2,
        points: drawingInk,
        createdAt: new Date().toISOString(),
      };
      void pushAnnotationState([...(activeDoc.payload.annotations ?? []), ann], activeDoc.payload.pendingRedactions ?? []);
    } else if (dragBoxStart && dragBoxNow) {
      const [x1, y1] = dragBoxStart;
      const [x2, y2] = dragBoxNow;
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.max(0.03, Math.abs(x2 - x1));
      const height = Math.max(0.018, Math.abs(y2 - y1));

      if (tool === 'redact') {
        const red: PdfRedactionRect = {
          id: createId('pred'),
          pageIndex: pageNum - 1,
          x,
          y,
          width,
          height,
          appliedPermanently: false,
        };
        void pushAnnotationState(activeDoc.payload.annotations ?? [], [...(activeDoc.payload.pendingRedactions ?? []), red]);
      } else if (tool === 'arrow') {
        const ann: PdfAnnotationItem = {
          id: createId('pann'),
          pageIndex: pageNum - 1,
          kind: 'arrow',
          x: x1,
          y: y1,
          x2,
          y2,
          color: toolColor,
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        };
        void pushAnnotationState([...(activeDoc.payload.annotations ?? []), ann], activeDoc.payload.pendingRedactions ?? []);
      } else if (tool === 'highlight' || tool === 'underline' || tool === 'strikethrough' || tool === 'rect') {
        const ann: PdfAnnotationItem = {
          id: createId('pann'),
          pageIndex: pageNum - 1,
          kind: tool,
          x,
          y,
          width,
          height,
          color: toolColor,
          opacity: tool === 'highlight' ? 0.35 : 1,
          createdAt: new Date().toISOString(),
        };
        void pushAnnotationState([...(activeDoc.payload.annotations ?? []), ann], activeDoc.payload.pendingRedactions ?? []);
      }
    }
    setDrawingInk(null);
    setDragBoxStart(null);
    setDragBoxNow(null);
  };

  /**
   * True PDF Structural Save:
   * - Embeds all annotations permanently into the PDF binary
   * - For any pending redactions, rasterizes affected pages to PNG with solid black boxes baked in,
   *   completely destroying the underlying text stream so redacted content cannot be copied or searched!
   */
  const handleCommitAnnotationsAndRedactions = async (discardOriginalOnRedaction = false) => {
    if (!activeDoc) return;
    setBusyMsg('Applying true PDF structural edits & irreversible redactions…');
    try {
      const bytes = await loadActiveBytes();
      if (!bytes) throw new Error('Active PDF binary not found');
      const anns = activeDoc.payload.annotations ?? [];
      const reds = activeDoc.payload.pendingRedactions ?? [];

      // Rasterize pages needing permanent redaction via pdfjs canvas -> PNG with solid black blocks baked in!
      const rasterizedRedactedPngs: Record<number, Uint8Array> = {};
      const redactedPageIndices = Array.from(new Set(reds.map((r) => r.pageIndex)));

      if (redactedPageIndices.length > 0) {
        try {
          const pdfjs = await loadPdfJs();
          const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false });
          const pdf = await task.promise;
          for (const pIdx of redactedPageIndices) {
            const pg = await pdf.getPage(pIdx + 1);
            const vp = pg.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(vp.width));
            canvas.height = Math.max(1, Math.round(vp.height));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await pg.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
              ctx.fillStyle = '#000000';
              for (const r of reds.filter((item) => item.pageIndex === pIdx)) {
                ctx.fillRect(
                  r.x * canvas.width,
                  r.y * canvas.height,
                  Math.max(6, r.width * canvas.width),
                  Math.max(6, r.height * canvas.height)
                );
              }
              const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
              if (pngBlob) {
                rasterizedRedactedPngs[pIdx] = new Uint8Array(await pngBlob.arrayBuffer());
              }
            }
          }
          await task.destroy();
        } catch {
          // Falls back safely to stream-stripped irreversible redaction in applyPdfAnnotationsAndRedactions!
        }
      }

      const applied = await applyPdfAnnotationsAndRedactions(bytes, anns, reds, rasterizedRedactedPngs);

      // Scrub extracted search text on redacted pages so redacted secrets do NOT linger in search index!
      const nextTextMap = { ...(activeDoc.payload.extractedTextByPage ?? {}) };
      for (const pIdx of redactedPageIndices) {
        nextTextMap[pIdx + 1] = `[Page ${pIdx + 1} permanently redacted]`;
      }

      const stored = await storeBlob(new Blob([applied.bytes as unknown as BlobPart], { type: 'application/pdf' }), activeDoc.payload.fileName);
      await commitStructuralPdf(
        applied.bytes,
        redactedPageIndices.length > 0
          ? `Embedded ${anns.length} annotation(s) + ${reds.length} permanent redaction(s) (${applied.redactionMode})`
          : `Embedded ${anns.length} annotation(s) into PDF`,
        {
          annotations: [],
          pendingRedactions: [],
          appliedRedactionCount: (activeDoc.payload.appliedRedactionCount ?? 0) + reds.length,
          extractedTextByPage: nextTextMap,
          ...(discardOriginalOnRedaction && redactedPageIndices.length > 0 ? { originalBlobHash: stored.hash } : {}),
        }
      );

      pushToast(
        redactedPageIndices.length > 0
          ? `Saved PDF with ${reds.length} permanent irreversible redaction(s) (${applied.redactionMode}) ✓`
          : `Embedded ${anns.length} annotation(s) permanently into PDF binary ✓`,
        { tone: 'ok' }
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to apply PDF edits', { tone: 'danger' });
    } finally {
      setBusyMsg(null);
    }
  };

  const handleRunOcrOnCurrentPage = async () => {
    if (!activeDoc) return;
    const pNum = activeDoc.payload.currentPage || 1;
    const dataUrl = renderedPages[pNum];
    if (!dataUrl) {
      pushToast('Render the page first before running OCR.', { tone: 'warn' });
      return;
    }
    setBusyMsg(`Running hybrid OCR on page ${pNum}…`);
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const gpuCfg = settings.gpuConfig;
      const serverBase =
        settings.operatingMode === 'docker-sync' ? normalizeServerUrl(settings.syncServerUrl || '') : undefined;
      const res = await runHybridOcr(blob, {
        language: 'eng',
        mode: 'auto',
        gpuEnabled: Boolean(gpuCfg?.enabled),
        gpuPrivacyOptIn: Boolean(gpuCfg?.privacyOptIn),
        preferredGpuModel: gpuCfg?.preferredModel ?? 'auto',
        serverBase,
        authToken: settings.syncAuthToken,
      });
      await updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
        ...cur,
        payload: {
          ...cur.payload,
          extractedTextByPage: { ...(cur.payload.extractedTextByPage ?? {}), [pNum]: res.text },
          ocrCompletedPages: Array.from(new Set([...(cur.payload.ocrCompletedPages ?? []), pNum])),
        },
      }));
      pushToast(
        res.text
          ? `Indexed OCR text for page ${pNum} (${res.confidence}% via ${res.engineUsed}) into Global Search!`
          : res.fallbackNotice || 'No text detected on page.'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'PDF page OCR failed', { tone: 'danger' });
    } finally {
      setBusyMsg(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!activeDoc) return;
    const bytes = await loadActiveBytes();
    if (!bytes) return;
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeDoc.payload.fileName || `${activeDoc.title}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast(`Exported byte-verified PDF (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
  };

  const searchHits = useMemo(
    () => (activeDoc ? searchPdfText(activeDoc.payload.extractedTextByPage ?? {}, searchQuery) : []),
    [activeDoc, searchQuery]
  );

  const visiblePageNumbers = useMemo(() => {
    if (!activeDoc) return [];
    const cur = Math.max(1, Math.min(activeDoc.payload.pageCount, activeDoc.payload.currentPage || 1));
    if (activeDoc.payload.viewMode === 'continuous') {
      const start = Math.max(1, cur - 3);
      const end = Math.min(activeDoc.payload.pageCount, cur + 5);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    if (activeDoc.payload.viewMode === 'spread') {
      return cur + 1 <= activeDoc.payload.pageCount ? [cur, cur + 1] : [cur];
    }
    return [cur];
  }, [activeDoc]);

  const setCurrentPage = (nextPage: number) => {
    if (!activeDoc) return;
    const clamped = Math.max(1, Math.min(activeDoc.payload.pageCount, nextPage));
    void updateRecord<PdfDocPayload>(
      activeDoc.id,
      (cur) => ({
        ...cur,
        payload: {
          ...cur.payload,
          currentPage: clamped,
          readingProgressPct: Math.round((clamped / Math.max(1, cur.payload.pageCount)) * 100),
        },
      }),
      { skipUndo: true }
    );
  };

  return (
    <div
      ref={stageRef}
      className="dp-paper-sheet dp-stack"
      data-paper={settings.paperMaterial}
      style={{
        padding: 'var(--dp-space-4)',
        gap: 12,
        ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 90, overflowY: 'auto' } : {}),
      }}
    >
      {/* Header & Import / Export Bar */}
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} /> Integrated PDF Reader, Editor &amp; Secure Redaction Studio
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
            100% offline PDF reading &amp; structural editing (`pdf-lib` + `pdfjs-dist`) · Highlights, ink, forms, merge/split, OCR search, and irreversible secure redaction
          </p>
        </div>
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => importPdfRef.current?.click()}>
            <Upload size={14} /> Open / Import PDF
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('pdf-write', () => handleCreateBlankPdf())}>
            <FilePlus size={14} /> New Blank PDF
          </button>
          {activeDoc && (
            <>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleDownloadPdf()}>
                <Download size={14} /> Export .PDF
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => setIsFullscreen((f) => !f)}>
                <Maximize2 size={14} /> {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            </>
          )}
          <input
            ref={importPdfRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPdfFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Multi-Tab Open PDFs Strip */}
      {pdfDocs.length > 0 && (
        <div className="dp-row" style={{ gap: 5, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
          {pdfDocs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`dp-btn dp-btn-sm ${activeDoc?.id === doc.id ? 'dp-btn-primary' : ''}`}
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => setSelectedPdfId(doc.id)}
            >
              📕 {doc.title} ({doc.payload.currentPage}/{doc.payload.pageCount})
            </button>
          ))}
        </div>
      )}

      {busyMsg && (
        <div className="dp-banner" style={{ margin: 0 }}>
          <span>⏳ {busyMsg}</span>
        </div>
      )}

      {!activeDoc ? (
        <div className="dp-card dp-stack" style={{ padding: 28, alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <FileText size={38} className="dp-muted" />
          <strong>Open, annotate, edit, merge, split, OCR, and securely redact PDFs directly inside Planaday</strong>
          <p className="dp-muted" style={{ maxWidth: 560, margin: 0, fontSize: '0.86rem' }}>
            Every imported PDF is stored locally in IndexedDB blob storage for offline reading, indexed into Global Search, linked to Notes, Tasks, Projects, and Laboratory folders, and exportable as a standard byte-verified `.pdf`.
          </p>
          <div className="dp-row" style={{ gap: 8 }}>
            <button type="button" className="dp-btn dp-btn-primary" onClick={() => importPdfRef.current?.click()}>
              <Upload size={15} /> Import PDF Document
            </button>
            <button type="button" className="dp-btn" onClick={guardAction('pdf-write', () => handleCreateBlankPdf())}>
              <FilePlus size={15} /> Create Blank PDF
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Reading Mode, Zoom, Organization & Structural Controls Bar */}
          <div className="dp-card dp-stack" style={{ padding: 10, gap: 8 }}>
            <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.8rem' }}>
              <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                <button type="button" className="dp-btn dp-btn-sm" disabled={activeDoc.payload.currentPage <= 1} onClick={() => setCurrentPage(activeDoc.payload.currentPage - 1)}>
                  ← Prev
                </button>
                <span className="dp-pill">
                  Page <strong>{activeDoc.payload.currentPage}</strong> / {activeDoc.payload.pageCount} ({activeDoc.payload.readingProgressPct}%)
                </span>
                <button type="button" className="dp-btn dp-btn-sm" disabled={activeDoc.payload.currentPage >= activeDoc.payload.pageCount} onClick={() => setCurrentPage(activeDoc.payload.currentPage + 1)}>
                  Next →
                </button>
                <select
                  aria-label="PDF view mode"
                  className="dp-select"
                  style={{ width: 'auto', padding: '3px 6px' }}
                  value={activeDoc.payload.viewMode}
                  onChange={(e) =>
                    void updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, viewMode: e.target.value as PdfDocPayload['viewMode'] },
                    }))
                  }
                >
                  <option value="single">Single Page</option>
                  <option value="spread">2-Page Spread</option>
                  <option value="continuous">Continuous Scroll</option>
                </select>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  aria-label="Zoom out"
                  onClick={() =>
                    void updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, zoom: Math.max(0.5, Number(((cur.payload.zoom || 1) - 0.2).toFixed(2))) },
                    }))
                  }
                >
                  <ZoomOut size={13} />
                </button>
                <span className="dp-pill">{Math.round((activeDoc.payload.zoom || 1) * 100)}%</span>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  aria-label="Zoom in"
                  onClick={() =>
                    void updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, zoom: Math.min(2.5, Number(((cur.payload.zoom || 1) + 0.2).toFixed(2))) },
                    }))
                  }
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              {/* Planaday Organization & Integration */}
              <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                <select
                  aria-label="Assign PDF folder"
                  className="dp-select"
                  style={{ width: 'auto', maxWidth: 140, padding: '3px 6px' }}
                  value={activeDoc.payload.folderId ?? ''}
                  onChange={(e) =>
                    void updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, folderId: e.target.value || null },
                    }))
                  }
                >
                  <option value="">Folder: None</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>📁 {f.title}</option>)}
                </select>
                <select
                  aria-label="Assign PDF project"
                  className="dp-select"
                  style={{ width: 'auto', maxWidth: 140, padding: '3px 6px' }}
                  value={activeDoc.payload.projectId ?? ''}
                  onChange={(e) =>
                    void updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, projectId: e.target.value || null },
                    }))
                  }
                >
                  <option value="">Project: None</option>
                  {projects.map((pr) => <option key={pr.id} value={pr.id}>🗂 {pr.title}</option>)}
                </select>
                <button
                  type="button"
                  className="dp-btn dp-btn-danger dp-btn-sm"
                  onClick={guardAction('action-1', async () => {
                    await softDeleteRecord(activeDoc.id);
                    setSelectedPdfId(null);
                    pushToast('Moved PDF to Trash', { canUndo: true });
                  })}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Annotation, Drawing & Secure Redaction Toolbar */}
            <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap', padding: '6px 8px', background: 'var(--dp-surface-2)', borderRadius: 8, fontSize: '0.78rem' }}>
              {(
                [
                  ['select', 'Read / Select', <Layers key="i" size={12} />],
                  ['highlight', 'Highlight', <Highlighter key="i" size={12} />],
                  ['underline', 'Underline', <Type key="i" size={12} />],
                  ['strikethrough', 'Strike', <Type key="i" size={12} />],
                  ['text', 'Text Box', <Type key="i" size={12} />],
                  ['comment', 'Comment', <FileText key="i" size={12} />],
                  ['ink', 'Draw / Ink', <PenTool key="i" size={12} />],
                  ['rect', 'Box', <Square key="i" size={12} />],
                  ['arrow', 'Arrow', <PenTool key="i" size={12} />],
                  ['stamp', 'Stamp', <Stamp key="i" size={12} />],
                  ['signature', 'Signature', <PenTool key="i" size={12} />],
                  ['redact', '🔒 Secure Redact', <EyeOff key="i" size={12} />],
                ] as Array<[ToolMode, string, React.ReactNode]>
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={`dp-btn dp-btn-sm ${tool === id ? (id === 'redact' ? 'dp-btn-danger' : 'dp-btn-primary') : ''}`}
                  onClick={() => setTool(id)}
                >
                  {icon} {label}
                </button>
              ))}
              <input type="color" aria-label="Annotation color" value={toolColor} onChange={(e) => setToolColor(e.target.value)} style={{ width: 24, height: 24 }} />
              {(tool === 'text' || tool === 'comment' || tool === 'stamp' || tool === 'signature') && (
                <input
                  className="dp-input"
                  style={{ width: 140, padding: '2px 6px' }}
                  placeholder="Text / Stamp / Name…"
                  value={toolText}
                  onChange={(e) => setToolText(e.target.value)}
                />
              )}
              <button type="button" className="dp-btn dp-btn-sm" disabled={undoStack.length === 0} onClick={guardAction('pdf-write', () => handleUndoAnnotation())} title="Undo annotation">
                <Undo2 size={12} />
              </button>
              <button type="button" className="dp-btn dp-btn-sm" disabled={redoStack.length === 0} onClick={guardAction('pdf-write', () => handleRedoAnnotation())} title="Redo annotation">
                <Redo2 size={12} />
              </button>
            </div>

            {/* Explicit Distinction: Pending Visual Overlays vs. True PDF Structural Write */}
            {((activeDoc.payload.annotations?.length ?? 0) > 0 || (activeDoc.payload.pendingRedactions?.length ?? 0) > 0) && (
              <div className="dp-between" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dp-warn)', fontSize: '0.78rem', flexWrap: 'wrap', gap: 8 }}>
                <span>
                  <ShieldAlert size={13} style={{ verticalAlign: '-2px' }} />{' '}
                  <strong>Unapplied Overlays:</strong> {activeDoc.payload.annotations?.length ?? 0} annotation(s) &amp;{' '}
                  <strong>{activeDoc.payload.pendingRedactions?.length ?? 0} pending redaction(s)</strong>. Click below to write a <strong>true structural PDF binary</strong> (redacted pages are permanently flattened so underlying text bytes are destroyed!).
                </span>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={guardAction('pdf-write', () => handleCommitAnnotationsAndRedactions(false))}>
                    <Save size={13} /> Embed Edits &amp; Permanently Redact PDF
                  </button>
                  {(activeDoc.payload.pendingRedactions?.length ?? 0) > 0 && (
                    <button type="button" className="dp-btn dp-btn-danger dp-btn-sm" onClick={guardAction('pdf-write', () => handleCommitAnnotationsAndRedactions(true))}>
                      Redact &amp; Purge Original Copy
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Page-Level Extraction & Planaday Integration Strip */}
            <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap', fontSize: '0.78rem' }}>
              <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('pdf-write', () => handleRunOcrOnCurrentPage())}>
                <ScanLine size={12} /> OCR Scanned Page #{activeDoc.payload.currentPage}
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={guardAction('action-2', async () => {
                  const pNum = activeDoc.payload.currentPage;
                  const txt = activeDoc.payload.extractedTextByPage?.[pNum] || '';
                  const note = await createRecord<NotePayload>(
                    'note',
                    `${activeDoc.title} — Page ${pNum}`,
                    {
                      notebookId: 'nb_personal',
                      writtenForDate: logicalToday,
                      sourcePlannerDate: logicalToday,
                      content: `# ${activeDoc.title} (Page ${pNum})\n\n${txt || '(No extracted text yet — click OCR Scanned Page first.)'}`,
                      touchedDates: [logicalToday],
                    },
                    {
                      tags: ['pdf-extract'],
                      links: [{ targetId: activeDoc.id, targetType: 'pdf_doc', relation: 'pdf_page', label: `${activeDoc.title}#page=${pNum}` }],
                    }
                  );
                  setSelectedNoteId(note.id);
                  setActiveView('notes');
                  pushToast(`Extracted Page ${pNum} to Note with #page=${pNum} backlink!`);
                })}
              >
                <FileText size={12} /> Extract Page → Note
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={guardAction('action-3', async () => {
                  const pNum = activeDoc.payload.currentPage;
                  const txt = activeDoc.payload.extractedTextByPage?.[pNum] || '';
                  await createRecord<TaskPayload>(
                    'task',
                    `Review ${activeDoc.title} (p.${pNum})`,
                    { notes: txt.slice(0, 600), subtasks: [], boardColumn: 'next', sourceProvenance: `pdf:${activeDoc.id}#page=${pNum}` },
                    {
                      doDate: logicalToday,
                      links: [{ targetId: activeDoc.id, targetType: 'pdf_doc', relation: 'pdf_page', label: `${activeDoc.title}#page=${pNum}` }],
                    }
                  );
                  pushToast(`Created Task linked to ${activeDoc.title}#page=${pNum}`);
                })}
              >
                <CheckSquare size={12} /> Page → Task
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={guardAction('action-4', async () => {
                  const pNum = activeDoc.payload.currentPage;
                  const txt = activeDoc.payload.extractedTextByPage?.[pNum] || '';
                  const tbl = extractTableFromOcrText(txt);
                  const cells: Record<string, string> = {};
                  if (tbl) {
                    tbl.headers.forEach((h, c) => (cells[`${String.fromCharCode(65 + Math.min(25, c))}1`] = h));
                    tbl.rows.forEach((row, r) => row.forEach((v, c) => (cells[`${String.fromCharCode(65 + Math.min(25, c))}${r + 2}`] = v)));
                  } else {
                    txt.split(/\r?\n/).slice(0, 50).forEach((ln, r) => (cells[`A${r + 1}`] = ln));
                  }
                  await createRecord(
                    'spreadsheet',
                    `${activeDoc.title} Table (p.${pNum})`,
                    { cells, csvPreview: tbl?.csv ?? txt },
                    { links: [{ targetId: activeDoc.id, targetType: 'pdf_doc', relation: 'pdf_page', label: `${activeDoc.title}#page=${pNum}` }] }
                  );
                  pushToast(`Extracted Page ${pNum} table to Spreadsheets!`);
                })}
              >
                <FileSpreadsheet size={12} /> Table → Spreadsheet
              </button>
            </div>
          </div>

          {/* Main Split: Left Tool/Navigation Rail + Center Interactive PDF Canvas */}
          <div className="dp-studio-split">
            {/* Left Rail */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 8, minWidth: 0 }}>
              <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {(
                  [
                    ['pages', 'Pages'],
                    ['bookmarks', 'Marks'],
                    ['search', 'Search'],
                    ['forms', 'Forms'],
                    ['revisions', 'History'],
                  ] as Array<[RailTab, string]>
                ).map(([id, lbl]) => (
                  <button key={id} type="button" className={`dp-btn dp-btn-sm ${railTab === id ? 'dp-btn-primary' : ''}`} onClick={() => setRailTab(id)}>
                    {lbl}
                  </button>
                ))}
              </div>

              {railTab === 'pages' && (
                <div className="dp-stack" style={{ gap: 6, fontSize: '0.78rem' }}>
                  <strong>Page Organizer (True PDF Structural Edits)</strong>
                  <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const next = await rotatePdfPage(bytes, activeDoc.payload.currentPage - 1, 90);
                        await commitStructuralPdf(next, `Rotated page ${activeDoc.payload.currentPage} by 90°`);
                        pushToast(`Rotated page ${activeDoc.payload.currentPage}`);
                      }}
                    >
                      <RotateCw size={12} /> Rotate 90°
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const next = await cropPdfPage(bytes, activeDoc.payload.currentPage - 1, { x: 0.06, y: 0.06, width: 0.88, height: 0.88 });
                        await commitStructuralPdf(next, `Cropped page ${activeDoc.payload.currentPage} margins`);
                        pushToast('Trimmed page margins');
                      }}
                    >
                      <Crop size={12} /> Trim Margins
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const next = await duplicatePdfPage(bytes, activeDoc.payload.currentPage - 1);
                        await commitStructuralPdf(next, `Duplicated page ${activeDoc.payload.currentPage}`);
                        pushToast('Duplicated page');
                      }}
                    >
                      <Copy size={12} /> Duplicate
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const next = await addBlankPdfPage(bytes, activeDoc.payload.currentPage - 1);
                        await commitStructuralPdf(next, `Inserted blank page after p.${activeDoc.payload.currentPage}`);
                        pushToast('Inserted blank page');
                      }}
                    >
                      + Blank Page
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      disabled={activeDoc.payload.pageCount <= 1}
                      onClick={async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const next = await deletePdfPage(bytes, activeDoc.payload.currentPage - 1);
                        await commitStructuralPdf(next, `Deleted page ${activeDoc.payload.currentPage}`);
                        pushToast('Deleted page');
                      }}
                    >
                      <Trash2 size={12} /> Delete Pg
                    </button>
                    <button type="button" className="dp-btn dp-btn-sm" onClick={() => mergePdfRef.current?.click()}>
                      <Merge size={12} /> Merge PDF
                    </button>
                    <button type="button" className="dp-btn dp-btn-sm" onClick={() => insertImageRef.current?.click()}>
                      <ImageIcon size={12} /> Insert Image
                    </button>
                  </div>

                  <input
                    ref={mergePdfRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const curBytes = await loadActiveBytes();
                      if (!curBytes) return;
                      const addBytes = new Uint8Array(await f.arrayBuffer());
                      const merged = await mergePdfDocuments([curBytes, addBytes]);
                      await commitStructuralPdf(merged, `Merged "${f.name}"`);
                      pushToast(`Merged "${f.name}" into PDF!`);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={insertImageRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const curBytes = await loadActiveBytes();
                      if (!curBytes) return;
                      const imgBytes = new Uint8Array(await f.arrayBuffer());
                      const updated = await insertImageOnPdfPage(curBytes, activeDoc.payload.currentPage - 1, imgBytes, f.type, {
                        x: 0.12,
                        y: 0.12,
                        width: 0.35,
                        height: 0.25,
                      });
                      await commitStructuralPdf(updated, `Inserted image "${f.name}" on p.${activeDoc.payload.currentPage}`);
                      pushToast('Embedded image onto PDF page');
                      e.target.value = '';
                    }}
                  />

                  {/* Split PDF into new document */}
                  <div className="dp-row" style={{ gap: 4 }}>
                    <input
                      className="dp-input"
                      style={{ flex: 1, minWidth: 0, padding: '3px 6px' }}
                      placeholder="Pages e.g. 1,2"
                      value={splitPagesInput}
                      onChange={(e) => setSplitPagesInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={guardAction('action-5', async () => {
                        const bytes = await loadActiveBytes();
                        if (!bytes) return;
                        const indices = splitPagesInput
                          .split(',')
                          .map((s) => Number(s.trim()) - 1)
                          .filter((n) => Number.isInteger(n) && n >= 0 && n < activeDoc.payload.pageCount);
                        if (indices.length === 0) {
                          pushToast('Enter valid 1-based page numbers (e.g. 1,3)', { tone: 'warn' });
                          return;
                        }
                        const splitBytes = await splitPdfDocument(bytes, indices);
                        const stored = await storeBlob(new Blob([splitBytes as unknown as BlobPart], { type: 'application/pdf' }), `${activeDoc.title}-split.pdf`);
                        const created = await createRecord<PdfDocPayload>(
                          'pdf_doc',
                          `${activeDoc.title} (Split p.${indices.map((i) => i + 1).join(',')})`,
                          {
                            fileName: `${activeDoc.title}-split.pdf`,
                            originalBlobHash: stored.hash,
                            activeBlobHash: stored.hash,
                            pageCount: indices.length,
                            currentPage: 1,
                            zoom: 1.15,
                            viewMode: 'single',
                            readingProgressPct: 100,
                            bookmarks: [],
                            annotations: [],
                            pendingRedactions: [],
                            extractedTextByPage: {},
                            revisions: [{ id: createId('pdfrev'), blobHash: stored.hash, label: 'Split extract', timestamp: new Date().toISOString(), structuralEdit: true }],
                          },
                          { category: 'PDF Documents', tags: ['pdf', 'split'] }
                        );
                        setSelectedPdfId(created.id);
                        pushToast(`Created split PDF (${indices.length} page(s))`);
                      })}
                    >
                      <Scissors size={12} /> Split
                    </button>
                  </div>

                  {/* Page list with reorder up/down */}
                  <div className="dp-stack" style={{ gap: 4, maxHeight: '42dvh', overflowY: 'auto' }}>
                    {Array.from({ length: activeDoc.payload.pageCount }, (_, i) => i + 1).map((pNum) => (
                      <div key={pNum} className="dp-between" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className={`dp-btn dp-btn-sm ${activeDoc.payload.currentPage === pNum ? 'dp-btn-primary' : ''}`}
                          style={{ flex: 1, justifyContent: 'flex-start' }}
                          onClick={() => setCurrentPage(pNum)}
                        >
                          Page {pNum}
                          {activeDoc.payload.ocrCompletedPages?.includes(pNum) ? ' · OCR ✓' : ''}
                        </button>
                        {pNum > 1 && (
                          <button
                            type="button"
                            className="dp-btn dp-btn-sm"
                            title="Move page up"
                            onClick={async () => {
                              const bytes = await loadActiveBytes();
                              if (!bytes) return;
                              const order = Array.from({ length: activeDoc.payload.pageCount }, (_, idx) => idx);
                              const idx = pNum - 1;
                              [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                              const next = await reorderPdfPages(bytes, order);
                              await commitStructuralPdf(next, `Moved page ${pNum} before ${pNum - 1}`);
                            }}
                          >
                            ↑
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {railTab === 'bookmarks' && (
                <div className="dp-stack" style={{ gap: 6, fontSize: '0.8rem' }}>
                  <div className="dp-row" style={{ gap: 4 }}>
                    <input
                      className="dp-input"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder={`Bookmark p.${activeDoc.payload.currentPage}…`}
                      value={bookmarkTitle}
                      onChange={(e) => setBookmarkTitle(e.target.value)}
                    />
                    <button
                      type="button"
                      className="dp-btn dp-btn-primary dp-btn-sm"
                      onClick={async () => {
                        const title = bookmarkTitle.trim() || `Page ${activeDoc.payload.currentPage}`;
                        await updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                          ...cur,
                          payload: {
                            ...cur.payload,
                            bookmarks: [
                              ...(cur.payload.bookmarks ?? []),
                              { id: createId('bmk'), title, pageIndex: cur.payload.currentPage - 1, createdAt: new Date().toISOString() },
                            ],
                          },
                        }));
                        setBookmarkTitle('');
                      }}
                    >
                      <Bookmark size={12} /> Add
                    </button>
                  </div>
                  {(activeDoc.payload.bookmarks ?? []).length === 0 ? (
                    <span className="dp-muted">No bookmarks yet.</span>
                  ) : (
                    activeDoc.payload.bookmarks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="dp-btn dp-btn-sm"
                        style={{ justifyContent: 'space-between' }}
                        onClick={() => setCurrentPage(b.pageIndex + 1)}
                      >
                        <span>🔖 {b.title}</span>
                        <span className="dp-muted">p.{b.pageIndex + 1}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {railTab === 'search' && (
                <div className="dp-stack" style={{ gap: 6, fontSize: '0.8rem' }}>
                  <div className="dp-row" style={{ gap: 4 }}>
                    <Search size={14} />
                    <input
                      className="dp-input"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="Search inside this PDF…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  {searchHits.length === 0 ? (
                    <span className="dp-muted">
                      {searchQuery ? 'No matches in extracted text (run OCR if scanned).' : 'Enter a word to search across all pages.'}
                    </span>
                  ) : (
                    searchHits.map((h) => (
                      <button
                        key={h.page}
                        type="button"
                        className="dp-card"
                        style={{ padding: 8, textAlign: 'start', cursor: 'pointer' }}
                        onClick={() => setCurrentPage(h.page)}
                      >
                        <strong>Page {h.page} ({h.count} hit{h.count === 1 ? '' : 's'})</strong>
                        <div className="dp-muted" style={{ fontSize: '0.74rem' }}>{h.snippet}</div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {railTab === 'forms' && (
                <div className="dp-stack" style={{ gap: 8, fontSize: '0.8rem' }}>
                  <strong>AcroForm Fields ({metaInfo?.formFields.length ?? 0})</strong>
                  {!metaInfo?.formFields.length ? (
                    <span className="dp-muted">No interactive AcroForm fields detected in this PDF.</span>
                  ) : (
                    <>
                      {metaInfo.formFields.map((fld) => (
                        <label key={fld.name} className="dp-stack" style={{ gap: 2 }}>
                          <span className="dp-muted">{fld.name}</span>
                          {fld.kind === 'checkbox' ? (
                            <input
                              type="checkbox"
                              checked={Boolean(formDraft[fld.name])}
                              onChange={(e) => setFormDraft((prev) => ({ ...prev, [fld.name]: e.target.checked }))}
                            />
                          ) : (
                            <input
                              className="dp-input"
                              value={String(formDraft[fld.name] ?? '')}
                              onChange={(e) => setFormDraft((prev) => ({ ...prev, [fld.name]: e.target.value }))}
                            />
                          )}
                        </label>
                      ))}
                      <button
                        type="button"
                        className="dp-btn dp-btn-primary dp-btn-sm"
                        onClick={async () => {
                          const bytes = await loadActiveBytes();
                          if (!bytes) return;
                          const filled = await fillPdfFormFields(bytes, formDraft, false);
                          await commitStructuralPdf(filled, 'Filled AcroForm fields', { formValues: formDraft });
                          pushToast('Saved AcroForm field values into PDF ✓', { tone: 'ok' });
                        }}
                      >
                        <Save size={12} /> Save Form Fields to PDF
                      </button>
                    </>
                  )}
                </div>
              )}

              {railTab === 'revisions' && (
                <div className="dp-stack" style={{ gap: 6, fontSize: '0.78rem' }}>
                  <strong><History size={13} /> Preserved Revisions ({activeDoc.payload.revisions?.length ?? 0})</strong>
                  {(activeDoc.payload.revisions ?? []).slice().reverse().map((rev) => (
                    <div key={rev.id} className="dp-card dp-stack" style={{ padding: 8, gap: 4 }}>
                      <strong>{rev.label}</strong>
                      <span className="dp-muted">{new Date(rev.timestamp).toLocaleString()}</span>
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={async () => {
                          await updateRecord<PdfDocPayload>(activeDoc.id, (cur) => ({
                            ...cur,
                            payload: { ...cur.payload, activeBlobHash: rev.blobHash },
                          }));
                          pushToast(`Restored "${rev.label}"`);
                        }}
                      >
                        Restore Version
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Center Interactive PDF Page Viewport */}
            <div
              className="dp-card"
              style={{
                padding: 14,
                minHeight: 480,
                background: 'var(--dp-surface-2)',
                display: 'grid',
                gridTemplateColumns: activeDoc.payload.viewMode === 'spread' ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                gap: 14,
                alignItems: 'start',
                justifyItems: 'center',
                overflowAuto: 'auto',
              } as React.CSSProperties}
            >
              {visiblePageNumbers.map((pageNum) => {
                const pageAnns = (activeDoc.payload.annotations ?? []).filter((a) => a.pageIndex === pageNum - 1);
                const pageReds = (activeDoc.payload.pendingRedactions ?? []).filter((r) => r.pageIndex === pageNum - 1);
                const imgSrc = renderedPages[pageNum];
                const extractedTxt = activeDoc.payload.extractedTextByPage?.[pageNum] ?? '';

                return (
                  <div
                    key={pageNum}
                    onPointerDown={(e) => handlePagePointerDown(pageNum, e)}
                    onPointerMove={handlePagePointerMove}
                    onPointerUp={() => handlePagePointerUp(pageNum)}
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: 760,
                      background: '#fff',
                      color: '#1b1b1b',
                      borderRadius: 6,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
                      overflow: 'hidden',
                      cursor: tool === 'select' ? 'default' : 'crosshair',
                      touchAction: tool === 'select' ? 'auto' : 'none',
                    }}
                  >
                    {imgSrc ? (
                      <img src={imgSrc} alt={`PDF page ${pageNum}`} style={{ width: '100%', display: 'block', pointerEvents: 'none' }} />
                    ) : (
                      <div style={{ padding: 28, minHeight: 420 }}>
                        <div style={{ fontSize: '0.78rem', opacity: 0.65, marginBottom: 10 }}>
                          Page {pageNum} of {activeDoc.payload.pageCount}
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: '0.9rem' }}>
                          {extractedTxt || 'Rendering PDF page…'}
                        </pre>
                      </div>
                    )}

                    {/* Live SVG Overlay for Pending Annotations & Pending Redactions */}
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    >
                      {pageAnns.map((ann) => {
                        if (ann.kind === 'highlight') {
                          return (
                            <rect
                              key={ann.id}
                              x={ann.x * 100}
                              y={ann.y * 100}
                              width={(ann.width ?? 0.16) * 100}
                              height={(ann.height ?? 0.04) * 100}
                              fill={ann.color}
                              fillOpacity={0.35}
                            />
                          );
                        }
                        if (ann.kind === 'rect') {
                          return (
                            <rect
                              key={ann.id}
                              x={ann.x * 100}
                              y={ann.y * 100}
                              width={(ann.width ?? 0.16) * 100}
                              height={(ann.height ?? 0.04) * 100}
                              fill="none"
                              stroke={ann.color}
                              strokeWidth="0.6"
                            />
                          );
                        }
                        if (ann.kind === 'underline' || ann.kind === 'strikethrough') {
                          const yPos = ann.kind === 'underline' ? (ann.y + (ann.height ?? 0.02)) * 100 : (ann.y + (ann.height ?? 0.02) / 2) * 100;
                          return (
                            <line
                              key={ann.id}
                              x1={ann.x * 100}
                              y1={yPos}
                              x2={(ann.x + (ann.width ?? 0.16)) * 100}
                              y2={yPos}
                              stroke={ann.color}
                              strokeWidth="0.6"
                            />
                          );
                        }
                        if (ann.kind === 'arrow') {
                          return (
                            <line
                              key={ann.id}
                              x1={ann.x * 100}
                              y1={ann.y * 100}
                              x2={(ann.x2 ?? ann.x + 0.1) * 100}
                              y2={(ann.y2 ?? ann.y) * 100}
                              stroke={ann.color}
                              strokeWidth="0.7"
                            />
                          );
                        }
                        if (ann.kind === 'ink' && ann.points && ann.points.length > 1) {
                          return (
                            <polyline
                              key={ann.id}
                              fill="none"
                              stroke={ann.color}
                              strokeWidth="0.6"
                              points={ann.points.map(([px, py]) => `${px * 100},${py * 100}`).join(' ')}
                            />
                          );
                        }
                        return (
                          <text
                            key={ann.id}
                            x={ann.x * 100}
                            y={(ann.y + 0.025) * 100}
                            fill={ann.color}
                            fontSize="2.8"
                            fontWeight="bold"
                          >
                            {ann.text || ann.kind}
                          </text>
                        );
                      })}

                      {pageReds.map((red) => (
                        <rect
                          key={red.id}
                          x={red.x * 100}
                          y={red.y * 100}
                          width={red.width * 100}
                          height={red.height * 100}
                          fill="#000000"
                          stroke="#ff3b30"
                          strokeWidth="0.4"
                          strokeDasharray="1,1"
                        />
                      ))}

                      {drawingInk && drawingInk.length > 1 && (
                        <polyline
                          fill="none"
                          stroke={toolColor}
                          strokeWidth="0.6"
                          points={drawingInk.map(([px, py]) => `${px * 100},${py * 100}`).join(' ')}
                        />
                      )}
                      {dragBoxStart && dragBoxNow && (
                        <rect
                          x={Math.min(dragBoxStart[0], dragBoxNow[0]) * 100}
                          y={Math.min(dragBoxStart[1], dragBoxNow[1]) * 100}
                          width={Math.abs(dragBoxNow[0] - dragBoxStart[0]) * 100}
                          height={Math.abs(dragBoxNow[1] - dragBoxStart[1]) * 100}
                          fill={tool === 'redact' ? 'rgba(0,0,0,0.8)' : 'rgba(230,184,0,0.28)'}
                          stroke={tool === 'redact' ? '#ff3b30' : toolColor}
                          strokeWidth="0.5"
                        />
                      )}
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
