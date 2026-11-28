import { useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderKanban,
  ListChecks,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId, db, getBlobObjectUrl, storeBlob } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import {
  detectDocumentBounds,
  enhanceDocumentScanRgba,
  extractTableFromOcrText,
  runHybridOcr,
  saveScanToPlanadayTarget,
  warpPerspectiveRgba,
  type Point2D,
} from '../../core/documentScanner';
import { normalizeServerUrl } from '../../core/sync';
import type { LifeRecord, ScannedDocPayload, ScannedPageItem } from '../../core/types';

const OCR_LANGUAGES = [
  { code: 'eng', label: 'English (eng)' },
  { code: 'spa', label: 'Spanish (spa)' },
  { code: 'fra', label: 'French (fra)' },
  { code: 'deu', label: 'German (deu)' },
  { code: 'por', label: 'Portuguese (por)' },
  { code: 'ita', label: 'Italian (ita)' },
  { code: 'jpn', label: 'Japanese (jpn)' },
  { code: 'chi_sim', label: 'Chinese Simplified (chi_sim)' },
];

async function blobToCanvasImageData(
  blob: Blob,
  rotationDeg: number,
  maxDim = 1280
): Promise<{ canvas: HTMLCanvasElement; imageData: ImageData }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode scan image'));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const rot90 = rotationDeg === 90 || rotationDeg === 270;
    const canvas = document.createElement('canvas');
    canvas.width = rot90 ? h : w;
    canvas.height = rot90 ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const DocumentScannerView: React.FC = () => {
  const { settings, records, logicalToday, pushToast, setActiveView, setSelectedNoteId } = useApp();
  
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));


  const scans = useMemo(
    () =>
      (records.filter((r) => r.type === 'scanned_doc' && !r.deletedAt) as Array<LifeRecord<ScannedDocPayload>>).sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      ),
    [records]
  );

  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [ocrMode, setOcrMode] = useState<'auto' | 'local' | 'gpu' | 'manual'>('auto');
  const [ocrLanguage, setOcrLanguage] = useState('eng');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ pct: number; label: string } | null>(null);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showEnhanced, setShowEnhanced] = useState(true);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);
  const [targetTitle, setTargetTitle] = useState('');

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addPageInputRef = useRef<HTMLInputElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const activeScan = useMemo(
    () => scans.find((s) => s.id === selectedScanId) ?? scans[0] ?? null,
    [scans, selectedScanId]
  );
  const activePage: ScannedPageItem | null =
    activeScan?.payload.pages[Math.min(activePageIdx, Math.max(0, (activeScan?.payload.pages.length ?? 1) - 1))] ??
    null;

  useEffect(() => {
    if (activeScan) {
      setTargetTitle(activeScan.title);
    }
  }, [activeScan?.id, activeScan?.title]);

  useEffect(() => {
    let mounted = true;
    let ownedUrl: string | null = null;
    setPreviewUrl(null);
    const hash = showEnhanced
      ? activePage?.enhancedBlobHash || activePage?.originalBlobHash
      : activePage?.originalBlobHash;
    if (!hash) {
      setPreviewUrl(null);
      return;
    }
    void getBlobObjectUrl(hash, false, true).then((url) => {
      if (!mounted) { if (url) URL.revokeObjectURL(url); return; }
      ownedUrl = url;
      setPreviewUrl(url);
    }).catch(() => { if (mounted) setPreviewUrl(null); });
    return () => {
      mounted = false;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [activePage?.originalBlobHash, activePage?.enhancedBlobHash, showEnhanced]);

  const handleIngestFiles = async (files: FileList | null, appendToCurrent = false) => {
    if (!files || files.length === 0) return;
    const newPages: ScannedPageItem[] = [];
    const baseNum = appendToCurrent && activeScan ? activeScan.payload.pages.length : 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stored = await storeBlob(file, file.name || `scan-page-${baseNum + i + 1}.jpg`);
      let detectedCorners: [Point2D, Point2D, Point2D, Point2D] = [
        [0.05, 0.05],
        [0.95, 0.05],
        [0.95, 0.95],
        [0.05, 0.95],
      ];
      try {
        const { imageData } = await blobToCanvasImageData(file, 0, 480);
        detectedCorners = detectDocumentBounds(imageData.data, imageData.width, imageData.height);
      } catch {
        // Use clean default crop bounds if image decode unavailable
      }
      newPages.push({
        id: createId('spg'),
        pageNumber: baseNum + i + 1,
        originalBlobHash: stored.hash,
        enhancedBlobHash: null,
        corners: detectedCorners,
        rotationDeg: 0,
        contrastBoost: 35,
        shadowReduction: true,
        bwMode: false,
        extractedText: '',
        confidence: 0,
        uncertainWords: [],
        engineUsed: 'manual',
      });
    }

    if (appendToCurrent && activeScan) {
      await updateRecord<ScannedDocPayload>(activeScan.id, (cur) => ({
        ...cur,
        payload: {
          ...cur.payload,
          pages: [...cur.payload.pages, ...newPages],
        },
      }));
      setActivePageIdx(baseNum);
      pushToast(`Added ${newPages.length} page(s) to "${activeScan.title}"`);
    } else {
      const title =
        files[0].name?.replace(/\.[^.]+$/, '') || `Physical Note Scan — ${logicalToday}`;
      const created = await createRecord<ScannedDocPayload>(
        'scanned_doc',
        title,
        {
          pages: newPages,
          combinedText: '',
          avgConfidence: 0,
          engineUsed: 'manual',
          language: ocrLanguage,
          requiresManualReview: true,
          manualReviewConfirmed: false,
          detectedTableCsv: null,
          savedTargets: [],
        },
        { category: 'Scans', tags: ['scan', 'ocr'] }
      );
      setSelectedScanId(created.id);
      setActivePageIdx(0);
      pushToast(`Captured ${newPages.length} scan page(s) — auto-detected edges!`);
    }
  };

  const updateCurrentPage = async (updater: (page: ScannedPageItem) => ScannedPageItem) => {
    if (!activeScan || !activePage) return;
    await updateRecord<ScannedDocPayload>(activeScan.id, (cur) => {
      const nextPages = cur.payload.pages.map((pg) => (pg.id === activePage.id ? updater(pg) : pg));
      const combinedText = nextPages.map((pg) => pg.extractedText).filter(Boolean).join('\n\n---\n\n');
      const confs = nextPages.map((pg) => pg.confidence).filter((c) => c > 0);
      const avgConfidence = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
      const anyUncertain = nextPages.some((pg) => pg.uncertainWords.length > 0 || pg.confidence < 85);
      const table = extractTableFromOcrText(combinedText);
      return {
        ...cur,
        payload: {
          ...cur.payload,
          pages: nextPages,
          combinedText,
          avgConfidence,
          requiresManualReview: anyUncertain,
          detectedTableCsv: table?.csv ?? null,
        },
      };
    });
  };

  const applyPerspectiveAndEnhance = async () => {
    if (!activeScan || !activePage) return;
    setEnhanceBusy(true);
    try {
      const blobRec = await db.blobs.get(activePage.originalBlobHash);
      if (!blobRec) throw new Error('Original scan blob not found');
      const origBlob = new Blob([blobRec.data ?? blobRec.blob ?? new ArrayBuffer(0)], { type: blobRec.mimeType });
      const { imageData } = await blobToCanvasImageData(origBlob, activePage.rotationDeg, 1280);
      const corners = (activePage.corners.length === 4
        ? activePage.corners
        : [
            [0.05, 0.05],
            [0.95, 0.05],
            [0.95, 0.95],
            [0.05, 0.95],
          ]) as [Point2D, Point2D, Point2D, Point2D];

      const warped = warpPerspectiveRgba(
        imageData.data,
        imageData.width,
        imageData.height,
        corners,
        imageData.width,
        imageData.height
      );
      const enhanced = enhanceDocumentScanRgba(warped, imageData.width, imageData.height, {
        contrastBoost: activePage.contrastBoost,
        shadowReduction: activePage.shadowReduction,
        bwMode: activePage.bwMode,
      });

      const outCanvas = document.createElement('canvas');
      outCanvas.width = imageData.width;
      outCanvas.height = imageData.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Canvas 2D unavailable');
      outCtx.putImageData(new ImageData(new Uint8ClampedArray(enhanced), imageData.width, imageData.height), 0, 0);
      const outBlob = await new Promise<Blob | null>((res) => outCanvas.toBlob((b) => res(b), 'image/png'));
      if (!outBlob) throw new Error('Failed to encode enhanced scan');

      const stored = await storeBlob(outBlob, `enhanced-page-${activePage.pageNumber}.png`);
      await updateCurrentPage((pg) => ({ ...pg, enhancedBlobHash: stored.hash }));
      setShowEnhanced(true);
      pushToast('Applied 4-point perspective correction & shadow reduction ✓', { tone: 'ok' });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Enhancement failed', { tone: 'danger' });
    } finally {
      setEnhanceBusy(false);
    }
  };

  const runOcrOnPage = async (page: ScannedPageItem) => {
    const hash = page.enhancedBlobHash || page.originalBlobHash;
    const blobRec = await db.blobs.get(hash);
    if (!blobRec) throw new Error('Scan image blob missing');
    const blob = new Blob([blobRec.data ?? blobRec.blob ?? new ArrayBuffer(0)], { type: blobRec.mimeType });
    const gpuCfg = settings.gpuConfig;
    const serverBase =
      settings.operatingMode === 'docker-sync'
        ? normalizeServerUrl(settings.syncServerUrl || '')
        : undefined;

    return runHybridOcr(blob, {
      language: ocrLanguage,
      mode: ocrMode,
      gpuEnabled: Boolean(gpuCfg?.enabled),
      gpuPrivacyOptIn: Boolean(gpuCfg?.privacyOptIn),
      preferredGpuModel: gpuCfg?.preferredModel ?? 'auto',
      serverBase,
      authToken: settings.syncAuthToken,
      onProgress: (pct, label) => setOcrProgress({ pct, label }),
    });
  };

  const handleRunActivePageOcr = async () => {
    if (!activeScan || !activePage) return;
    setOcrBusy(true);
    setOcrNotice(null);
    try {
      const res = await runOcrOnPage(activePage);
      if (res.fallbackNotice) setOcrNotice(res.fallbackNotice);
      await updateCurrentPage((pg) => (pg.enhancedBlobHash || pg.originalBlobHash) !== (activePage.enhancedBlobHash || activePage.originalBlobHash) ? pg : ({
        ...pg,
        extractedText: res.text || pg.extractedText,
        confidence: res.confidence,
        uncertainWords: res.words.filter((w) => w.uncertain),
        engineUsed: res.engineUsed,
      }));
      pushToast(
        res.engineUsed === 'manual'
          ? 'Ready for manual review/transcription'
          : `OCR complete (${res.confidence}% confidence via ${res.engineUsed})`,
        { tone: res.confidence >= 80 ? 'ok' : 'info' }
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'OCR failed', { tone: 'danger' });
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

  const handleRunAllPagesOcr = async () => {
    if (!activeScan) return;
    setOcrBusy(true);
    setOcrNotice(null);
    try {
      const updatedPages: ScannedPageItem[] = [];
      for (let i = 0; i < activeScan.payload.pages.length; i++) {
        const pg = activeScan.payload.pages[i];
        setOcrProgress({ pct: Math.round((i / activeScan.payload.pages.length) * 100), label: `Scanning page ${i + 1}/${activeScan.payload.pages.length}…` });
        const res = await runOcrOnPage(pg);
        if (res.fallbackNotice) setOcrNotice(res.fallbackNotice);
        updatedPages.push({
          ...pg,
          extractedText: res.text || pg.extractedText,
          confidence: res.confidence,
          uncertainWords: res.words.filter((w) => w.uncertain),
          engineUsed: res.engineUsed,
        });
      }
      const combinedText = updatedPages.map((pg) => pg.extractedText).filter(Boolean).join('\n\n---\n\n');
      const confs = updatedPages.map((pg) => pg.confidence).filter((c) => c > 0);
      const avgConfidence = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
      const anyUncertain = updatedPages.some((pg) => pg.uncertainWords.length > 0 || pg.confidence < 85);
      const table = extractTableFromOcrText(combinedText);
      await updateRecord<ScannedDocPayload>(activeScan.id, (cur) => ({
        ...cur,
        payload: {
          ...cur.payload,
          pages: updatedPages,
          combinedText,
          avgConfidence,
          engineUsed: updatedPages[0]?.engineUsed ?? 'manual',
          requiresManualReview: anyUncertain,
          detectedTableCsv: table?.csv ?? null,
        },
      }));
      pushToast(`OCR completed for all ${updatedPages.length} page(s) (${avgConfidence}% avg confidence)`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Batch OCR failed', { tone: 'danger' });
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

  const handleCornerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCornerIdx === null || !previewContainerRef.current || !activePage) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / Math.max(1, rect.height)));
    const nextCorners = activePage.corners.map((pt, idx) => (idx === draggingCornerIdx ? ([nx, ny] as Point2D) : pt));
    void updateCurrentPage((pg) => ({ ...pg, corners: nextCorners }));
  };

  const detectedTable = useMemo(
    () => extractTableFromOcrText(activeScan?.payload.combinedText || activePage?.extractedText || ''),
    [activeScan?.payload.combinedText, activePage?.extractedText]
  );

  const handleRouteTarget = async (
    target: 'note' | 'task' | 'checklist' | 'spreadsheet' | 'lab_research' | 'project'
  ) => {
    if (!activeScan) return;
    try {
      const res = await saveScanToPlanadayTarget(activeScan, target, {
        title: targetTitle || activeScan.title,
        editedText: activeScan.payload.combinedText || activePage?.extractedText || '',
        logicalToday,
      });
      pushToast(res.summary, { tone: 'ok', canUndo: true });
      if (target === 'note') {
        setSelectedNoteId(res.created.id);
        setActiveView('notes');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not save scan', { tone: 'warn' });
    }
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-4)', gap: 14 }}>
      {/* Header & Capture Controls */}
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <ScanLine size={20} /> Physical Note Scanner &amp; Handwriting OCR Studio
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Camera capture &amp; multi-page scanning · Automatic edge detection &amp; 4-point perspective warp · Shadow reduction · Offline Tesseract.js + optional RTX 5050 GPU OCR
          </p>
        </div>
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => cameraInputRef.current?.click()}>
            <Camera size={14} /> Camera Capture
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Import Photo(s)
          </button>
          {activeScan && (
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => addPageInputRef.current?.click()}>
              + Add Page
            </button>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void handleIngestFiles(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void handleIngestFiles(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={addPageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void handleIngestFiles(e.target.files, true);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Saved Scans Strip */}
      {scans.length > 0 && (
        <div className="dp-row" style={{ gap: 6, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
          {scans.map((sc) => (
            <button
              key={sc.id}
              type="button"
              className={`dp-btn dp-btn-sm ${activeScan?.id === sc.id ? 'dp-btn-primary' : ''}`}
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                setSelectedScanId(sc.id);
                setActivePageIdx(0);
              }}
            >
              📄 {sc.title} ({sc.payload.pages.length}p · {sc.payload.avgConfidence || 0}%)
            </button>
          ))}
        </div>
      )}

      {!activeScan || !activePage ? (
        <div className="dp-card dp-stack" style={{ padding: 28, alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <ScanLine size={38} className="dp-muted" />
          <strong>Scan handwritten notebooks, receipts, whiteboards, or lab bench sheets</strong>
          <p className="dp-muted" style={{ maxWidth: 540, margin: 0, fontSize: '0.86rem' }}>
            Works 100% offline with on-device OCR (Tesseract.js), or optionally connects to your self-hosted NVIDIA RTX 5050 GPU service for heavy handwriting &amp; table extraction. Original scan images are always preserved alongside searchable text.
          </p>
          <div className="dp-row" style={{ gap: 8 }}>
            <button type="button" className="dp-btn dp-btn-primary" onClick={() => cameraInputRef.current?.click()}>
              <Camera size={16} /> Scan with Camera
            </button>
            <button type="button" className="dp-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} /> Import Existing Image(s)
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Multi-Page Selector & Enhancement Controls */}
          <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
            <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <input
                  className="dp-input"
                  style={{ minWidth: 200, fontWeight: 600 }}
                  aria-label="Scan document title"
                  value={targetTitle}
                  onChange={(e) => setTargetTitle(e.target.value)}
                  onBlur={() => {
                    if (targetTitle.trim() && targetTitle !== activeScan.title) {
                      void updateRecord(activeScan.id, { title: targetTitle.trim() });
                    }
                  }}
                />
                {activeScan.payload.pages.map((pg, idx) => (
                  <button
                    key={pg.id}
                    type="button"
                    className={`dp-btn dp-btn-sm ${idx === activePageIdx ? 'dp-btn-primary' : ''}`}
                    onClick={() => setActivePageIdx(idx)}
                  >
                    Page {idx + 1} {pg.confidence > 0 ? `(${pg.confidence}%)` : ''}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="dp-btn dp-btn-danger dp-btn-sm"
                onClick={guardAction('action-1', async () => {
                  await softDeleteRecord(activeScan.id);
                  setSelectedScanId(null);
                  pushToast('Moved scan to Trash', { canUndo: true });
                })}
              >
                <Trash2 size={13} /> Delete Scan
              </button>
            </div>

            {/* Perspective, Rotation & Image Cleanup Controls */}
            <div className="dp-row" style={{ gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() =>
                  void updateCurrentPage((pg) => ({
                    ...pg,
                    rotationDeg: ((pg.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270,
                  }))
                }
              >
                <RotateCw size={13} /> Rotate ({activePage.rotationDeg}°)
              </button>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Contrast ({activePage.contrastBoost}%):</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activePage.contrastBoost}
                  onChange={(e) => void updateCurrentPage((pg) => ({ ...pg, contrastBoost: Number(e.target.value) }))}
                />
              </label>
              <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activePage.shadowReduction}
                  onChange={(e) => void updateCurrentPage((pg) => ({ ...pg, shadowReduction: e.target.checked }))}
                />
                <span>Shadow Reduction</span>
              </label>
              <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activePage.bwMode}
                  onChange={(e) => void updateCurrentPage((pg) => ({ ...pg, bwMode: e.target.checked }))}
                />
                <span>Crisp B&amp;W Mode</span>
              </label>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                disabled={enhanceBusy}
                onClick={() => void applyPerspectiveAndEnhance()}
              >
                <Sparkles size={13} /> {enhanceBusy ? 'Processing…' : 'Deskew & Enhance Scan'}
              </button>
              {activePage.enhancedBlobHash && (
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => setShowEnhanced((v) => !v)}
                >
                  Viewing: {showEnhanced ? 'Enhanced' : 'Original'} (Toggle)
                </button>
              )}
            </div>

            {/* Hybrid OCR Engine Bar */}
            <div className="dp-row" style={{ gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--dp-surface-2)', borderRadius: 8, fontSize: '0.82rem' }}>
              <select
                aria-label="OCR language"
                className="dp-select"
                style={{ width: 'auto' }}
                value={ocrLanguage}
                onChange={(e) => setOcrLanguage(e.target.value)}
              >
                {OCR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <select
                aria-label="OCR engine mode"
                className="dp-select"
                style={{ width: 'auto' }}
                value={ocrMode}
                onChange={(e) => setOcrMode(e.target.value as typeof ocrMode)}
              >
                <option value="auto">Auto (GPU if opted-in → Offline On-Device)</option>
                <option value="local">Offline On-Device Only (Tesseract.js)</option>
                <option value="gpu">Self-Hosted RTX 5050 GPU (PaddleOCR / VLM)</option>
                <option value="manual">Manual Transcription Only</option>
              </select>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                disabled={ocrBusy}
                onClick={guardAction('ocr', () => handleRunActivePageOcr())}
              >
                <Cpu size={13} /> {ocrBusy ? 'Recognizing…' : 'Recognize Page Text'}
              </button>
              {activeScan.payload.pages.length > 1 && (
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  disabled={ocrBusy}
                  onClick={guardAction('ocr', () => handleRunAllPagesOcr())}
                >
                  OCR All {activeScan.payload.pages.length} Pages
                </button>
              )}
              <span className="dp-pill">
                Engine: {activePage.engineUsed} · Confidence: {activePage.confidence || 0}%
              </span>
            </div>

            {ocrProgress && (
              <div className="dp-stack" style={{ gap: 4 }}>
                <div className="dp-between" style={{ fontSize: '0.78rem' }}>
                  <span>{ocrProgress.label}</span>
                  <strong>{ocrProgress.pct}%</strong>
                </div>
                <div className="dp-progress-track">
                  <div className="dp-progress-fill" style={{ width: `${ocrProgress.pct}%` }} />
                </div>
              </div>
            )}

            {ocrNotice && (
              <div className="dp-banner" style={{ margin: 0, fontSize: '0.8rem' }}>
                <span>{ocrNotice}</span>
              </div>
            )}
          </div>

          {/* Side-by-Side Original/Enhanced Scan Preview + Editable OCR Verification */}
          <div className="dp-grid-2" style={{ gap: 14, alignItems: 'start' }}>
            {/* Left: Interactive Image with Draggable 4-Corner Perspective Handles */}
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <div className="dp-between" style={{ fontSize: '0.82rem' }}>
                <strong>Original / Enhanced Scan (Page {activePageIdx + 1})</strong>
                <span className="dp-muted">
                  {!showEnhanced || !activePage.enhancedBlobHash
                    ? 'Drag corners to refine crop/perspective'
                    : 'Showing perspective-corrected scan'}
                </span>
              </div>
              <div
                ref={previewContainerRef}
                onPointerMove={handleCornerPointerMove}
                onPointerUp={() => setDraggingCornerIdx(null)}
                onPointerLeave={() => setDraggingCornerIdx(null)}
                style={{
                  position: 'relative',
                  width: '100%',
                  background: '#181818',
                  borderRadius: 8,
                  overflow: 'hidden',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Scanned page ${activePageIdx + 1}`}
                    style={{ width: '100%', display: 'block', maxHeight: '58dvh', objectFit: 'contain' }}
                  />
                ) : (
                  <div className="dp-muted" style={{ padding: 40, textAlign: 'center' }}>Loading scan image…</div>
                )}

                {/* Draggable 4-corner quad overlay when adjusting original image */}
                {previewUrl && (!showEnhanced || !activePage.enhancedBlobHash) && activePage.corners.length === 4 && (
                  <>
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    >
                      <polygon
                        points={activePage.corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                        fill="rgba(169, 116, 52, 0.14)"
                        stroke="#e6a23c"
                        strokeWidth="0.7"
                      />
                    </svg>
                    {activePage.corners.map(([cx, cy], idx) => (
                      <div
                        key={idx}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingCornerIdx(idx);
                        }}
                        title={['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'][idx]}
                        style={{
                          position: 'absolute',
                          left: `${cx * 100}%`,
                          top: `${cy * 100}%`,
                          width: 20,
                          height: 20,
                          marginLeft: -10,
                          marginTop: -10,
                          borderRadius: '50%',
                          background: '#e6a23c',
                          border: '2px solid #fff',
                          cursor: 'grab',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right: Editable Text, Uncertain-Word Confidence Flags, Table Preview & Save Targets */}
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
              <div className="dp-between">
                <strong>Editable Extracted Text (Side-by-Side Review)</strong>
                <span className="dp-pill">
                  {activePage.uncertainWords.length > 0
                    ? `⚠ ${activePage.uncertainWords.length} uncertain word(s)`
                    : activePage.confidence >= 85
                      ? '✓ High Confidence'
                      : 'Review Recommended'}
                </span>
              </div>

              {activePage.uncertainWords.length > 0 && (
                <div className="dp-card dp-stack" style={{ padding: 8, gap: 5, borderColor: 'var(--dp-warn)', background: 'var(--dp-surface-2)' }}>
                  <div className="dp-row" style={{ gap: 6, fontSize: '0.78rem' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--dp-warn)' }} />
                    <strong>Low-Confidence Words (&lt;70%) — verify carefully against scan:</strong>
                  </div>
                  <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {activePage.uncertainWords.slice(0, 24).map((w, i) => (
                      <span
                        key={`${w.text}-${i}`}
                        className="dp-pill"
                        style={{ borderColor: 'var(--dp-warn)', color: 'var(--dp-warn)', fontSize: '0.74rem' }}
                      >
                        "{w.text}" ({w.confidence}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                className="dp-textarea"
                style={{ minHeight: 240, fontFamily: 'var(--dp-font-mono)', fontSize: '0.88rem' }}
                placeholder="Extracted text appears here (or transcribe manually while looking at your scan on the left)…"
                value={activePage.extractedText}
                onChange={(e) => void updateCurrentPage((pg) => ({ ...pg, extractedText: e.target.value }))}
              />

              {detectedTable && (
                <div className="dp-card dp-stack" style={{ padding: 8, gap: 4, background: 'var(--dp-surface-2)', fontSize: '0.78rem' }}>
                  <strong>📊 Table Detected ({detectedTable.rows.length} rows × {detectedTable.headers.length} columns)</strong>
                  <pre style={{ margin: 0, overflow: 'auto', maxHeight: 110 }}>{detectedTable.csv}</pre>
                </div>
              )}

              {/* Explicit Lab / Financial Verification Gate (§5) */}
              <label
                className="dp-row"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${activeScan.payload.manualReviewConfirmed ? 'var(--dp-ok)' : 'var(--dp-warn)'}`,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(activeScan.payload.manualReviewConfirmed)}
                  onChange={(e) =>
                    void updateRecord<ScannedDocPayload>(activeScan.id, (cur) => ({
                      ...cur,
                      payload: { ...cur.payload, manualReviewConfirmed: e.target.checked },
                    }))
                  }
                />
                <span>
                  <CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} />{' '}
                  <strong>Manual Review Confirmed:</strong> I have checked uncertain words, units, and measurements (required before saving to Laboratory or Financial records).
                </span>
              </label>

              {/* Save As Planaday Targets */}
              <div className="dp-stack" style={{ gap: 6 }}>
                <strong style={{ fontSize: '0.82rem' }}>Save Verified Scan Into Planaday (Original Scan Always Preserved):</strong>
                <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('note'))}>
                    <FileText size={13} /> Save as Note
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('task'))}>
                    Save as Task
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('checklist'))}>
                    <ListChecks size={13} /> Save as Checklist
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('spreadsheet'))}>
                    <FileSpreadsheet size={13} /> Save as Spreadsheet
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('lab_research'))}>
                    <FlaskConical size={13} /> Save to Lab Research
                  </button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('route', () => handleRouteTarget('project'))}>
                    <FolderKanban size={13} /> Save to Project
                  </button>
                </div>
              </div>

              {(activeScan.payload.savedTargets?.length ?? 0) > 0 && (
                <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                  Linked records created: {activeScan.payload.savedTargets!.map((t) => `${t.label} (${t.type})`).join(', ')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
