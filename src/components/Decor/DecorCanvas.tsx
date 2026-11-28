import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eraser,
  Highlighter,
  Lock,
  PenTool,
  RotateCcw,
  RotateCw,
  Sparkles,
  Stamp,
  StickyNote,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { BUILTIN_STICKERS, STICKER_CATEGORIES, type StickerCategory } from '../../data/stickers';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { getBlobObjectUrl, storeBlob } from '../../core/db';
import { sanitizeSvgMarkup } from '../../core/sanitizer';
import { ModalDialog } from '../Common/ModalDialog';
import { SafeTextarea } from '../Common/SafeTextEditor';
import type { DecorItemPayload, LifeRecord } from '../../core/types';

const WASHI_COLORS = ['#c96f53', '#5e8c78', '#c79b43', '#6b5ca5', '#3b6ea5', '#d98a9c'];
const RUBBER_STAMPS = ['DONE', 'PRIORITY', 'MOVED', 'CANCELED'] as const;
const INK_PALETTE = ['#2a241d', '#a97434', '#2e5c8a', '#b5453a', '#3e7a5d', '#6b5ca5', '#d98a9c', '#e6b800'];

type InkTool = 'pen' | 'pencil' | 'fine' | 'marker' | 'highlighter' | 'dashed' | 'line' | 'rect' | 'ellipse' | 'eraser';

function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/** Build a smooth quadratic Bezier SVG path string from normalized [0..1, 0..1] points in a 1000x1000 viewBox. */
function buildSmoothSvgPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${(x * 1000).toFixed(1)} ${(y * 1000).toFixed(1)} L ${(x * 1000 + 0.5).toFixed(1)} ${(y * 1000).toFixed(1)}`;
  }
  let d = `M ${(points[0][0] * 1000).toFixed(1)} ${(points[0][1] * 1000).toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cx = points[i][0] * 1000;
    const cy = points[i][1] * 1000;
    const mx = ((points[i][0] + points[i + 1][0]) * 500).toFixed(1);
    const my = ((points[i][1] + points[i + 1][1]) * 500).toFixed(1);
    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${(last[0] * 1000).toFixed(1)} ${(last[1] * 1000).toFixed(1)}`;
  return d;
}

/**
 * Freeform Anchored Sticker, Washi Tape, Sticky Note, Rubber Stamp & 60fps Live Stylus Ink Canvas.
 * Uses an imperative HTML5 Canvas for active strokes (zero React re-renders during draw) + instant stroke eraser.
 */
export const DecorCanvasOverlay: React.FC<{ spreadKey: string }> = ({ spreadKey }) => {
  const { settings, patchSettings, records, pushToast } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);

  // Smooth customizable ink state
  const [inkMode, setInkMode] = useState(false);
  const [clearInkOpen, setClearInkOpen] = useState(false);
  const [clearingInk, setClearingInk] = useState(false);
  const clearInkLock = useRef(false);
  const [inkTool, setInkTool] = useState<InkTool>('pen');
  const [inkColor, setInkColor] = useState('#2a241d');
  const [inkWidth, setInkWidth] = useState(3);
  const [inkOpacity, setInkOpacity] = useState(92);
  const [erasedLocalIds, setErasedLocalIds] = useState<Set<string>>(() => new Set());

  // Smooth sticker drag preview (avoids IndexedDB write on every pixel)
  const [dragPos, setDragPos] = useState<{ id: string; relX: number; relY: number } | null>(null);

  const [activeCat, setActiveCat] = useState<StickerCategory | 'Favorites' | 'Recents' | 'Custom'>('Planning');
  const [stickerSearch, setStickerSearch] = useState('');
  const [dieCutBorder, setDieCutBorder] = useState(true);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const layerRef = useRef<HTMLDivElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origRelX: number; origRelY: number; curRelX: number; curRelY: number } | null>(null);
  const drawingRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const inkFrame = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const erasedPending = useRef(new Set<string>());
  const urlsRef = useRef(new Map<string, string>());
  const erasingRef = useRef(false);
  const inkPointsRef = useRef<Array<[number, number]>>([]);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const decorItems = useMemo(
    () =>
      (records.filter(
        (r) => !r.deletedAt && r.type === 'decor_item' && (r.payload as DecorItemPayload).spreadKey === spreadKey
      ) as Array<LifeRecord<DecorItemPayload>>).sort((a, b) => (a.payload.zIndex ?? 1) - (b.payload.zIndex ?? 1)),
    [records, spreadKey]
  );

  const inkItems = useMemo(
    () => decorItems.filter((d) => d.payload.kind === 'ink' && d.payload.inkPaths?.length && !erasedLocalIds.has(d.id)),
    [decorItems, erasedLocalIds]
  );

  const customStickers = useMemo(
    () => records.filter((r) => !r.deletedAt && r.type === 'custom_sticker'),
    [records]
  );

  // Clean up local erased cache once IndexedDB catches up
  useEffect(() => {
    if (erasedLocalIds.size === 0) return;
    const existingIds = new Set(decorItems.map((d) => d.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of erasedLocalIds) {
      if (existingIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setErasedLocalIds(next);
  }, [decorItems, erasedLocalIds]);

  // Stable hash dependency: dragging, changing opacity, or adding ink does not reload images.
  const hashKey = useMemo(() => {
    const hashes = new Set<string>();
    for (const d of decorItems) if (d.payload.customBlobId) hashes.add(d.payload.customBlobId);
    if (drawerOpen && activeCat === 'Custom') for (const cs of customStickers) {
      const h = (cs.payload as { blobHash?: string }).blobHash;
      if (h) hashes.add(h);
    }
    return JSON.stringify([...hashes].sort());
  }, [decorItems, customStickers, drawerOpen, activeCat]);
  useEffect(() => {
    const wanted = new Set<string>(JSON.parse(hashKey) as string[]);
    let alive = true;
    for (const [hash, url] of urlsRef.current) if (!wanted.has(hash)) {
      URL.revokeObjectURL(url); urlsRef.current.delete(hash);
    }
    setBlobUrls(Object.fromEntries(urlsRef.current));
    void Promise.all([...wanted].filter((hash) => !urlsRef.current.has(hash)).map(async (hash) => {
      try {
        const url = await getBlobObjectUrl(hash, false, true);
        if (!url) return;
        if (!alive) { URL.revokeObjectURL(url); return; }
        urlsRef.current.set(hash, url);
      } catch { /* Missing or unavailable images retain the existing placeholder. */ }
    })).then(() => { if (alive) setBlobUrls(Object.fromEntries(urlsRef.current)); });
    return () => { alive = false; };
  }, [hashKey]);
  useEffect(() => () => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  // Size live canvas cleanly to layer dimensions when inkMode is active
  const syncLiveCanvasSize = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    const rect = layer.getBoundingClientRect();
    // Limit the backing store to roughly 8 megapixels even on very long spreads.
    const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(8_000_000 / Math.max(1, rect.width * rect.height)), 8192 / Math.max(1, rect.width, rect.height));
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }, []);

  useEffect(() => {
    if (!inkMode) return;
    syncLiveCanvasSize();
    const onResize = () => syncLiveCanvasSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (layerRef.current) observer?.observe(layerRef.current);
    window.addEventListener('resize', onResize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', onResize); };
  }, [inkMode, syncLiveCanvasSize]);

  const effectiveInkWidth =
    inkTool === 'fine'
      ? Math.max(1, inkWidth * 0.55)
      : inkTool === 'highlighter'
        ? Math.max(12, inkWidth * 4.2)
        : inkTool === 'marker'
          ? Math.max(6, inkWidth * 2.1)
          : inkWidth;

  const effectiveInkOpacity = inkTool === 'highlighter' ? Math.min(0.45, inkOpacity / 100) : inkTool === 'pencil' ? Math.min(0.65, inkOpacity / 100) : inkOpacity / 100;

  const clearLiveCanvas = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawLiveStroke = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const pts = inkPointsRef.current;
    if (!canvas || pts.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = inkColor;
    ctx.globalAlpha = effectiveInkOpacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Match 1000-unit SVG viewBox scale so live preview width equals saved stroke width
    // Draw in the same normalized coordinate space as the persisted SVG.
    ctx.scale(w / 1000, h / 1000);
    ctx.lineWidth = effectiveInkWidth;
    if (inkTool === 'dashed') {
      ctx.setLineDash([ctx.lineWidth * 2.5, ctx.lineWidth * 2]);
    }
    ctx.beginPath();
    const start = pts[0]; const last = pts[pts.length - 1];
    const x = start[0] * 1000, y = start[1] * 1000, ex = last[0] * 1000, ey = last[1] * 1000;
    if (pts.length === 1) { ctx.moveTo(x, y); ctx.lineTo(x + 0.5, y); }
    else if (inkTool === 'line') { ctx.moveTo(x, y); ctx.lineTo(ex, ey); }
    else if (inkTool === 'rect') ctx.rect(x, y, ex - x, ey - y);
    else if (inkTool === 'ellipse') ctx.ellipse((x + ex) / 2, (y + ey) / 2, Math.abs(ex - x) / 2, Math.abs(ey - y) / 2, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(x, y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) * 500;
        const my = (pts[i][1] + pts[i + 1][1]) * 500;
        ctx.quadraticCurveTo(pts[i][0] * 1000, pts[i][1] * 1000, mx, my);
      }
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    ctx.restore();
  }, [inkColor, effectiveInkOpacity, effectiveInkWidth, inkTool]);

  const scheduleInk = () => {
    if (inkFrame.current === null) inkFrame.current = requestAnimationFrame(() => {
      inkFrame.current = null; drawLiveStroke();
    });
  };
  const cancelGesture = useCallback(() => {
    if (inkFrame.current !== null) cancelAnimationFrame(inkFrame.current);
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    inkFrame.current = null; dragFrame.current = null;
    pointerRef.current = null; drawingRef.current = false; erasingRef.current = false;
    draggingRef.current = null; inkPointsRef.current = [];
    clearLiveCanvas();
  }, [clearLiveCanvas]);
  useEffect(() => {
    cancelGesture(); setDragPos(null); setSelectedId(null); setClearInkOpen(false);
    return cancelGesture;
  }, [spreadKey, inkMode, cancelGesture]);
  const inkMarkup = useMemo(() => inkItems.flatMap((d) => d.payload.inkPaths!.map((path, idx) => ({
    key: `${d.id}-${idx}`, path,
    d: d.title.startsWith('Shape: rect') ? path.points.map(([x,y], i) => `${i ? 'L' : 'M'} ${x * 1000} ${y * 1000}`).join(' ') : buildSmoothSvgPath(path.points),
  }))), [inkItems]);

  const eraseAtPoint = useCallback(
    (nx: number, ny: number) => {
      const hitRadius = Math.max(0.018, (inkWidth * 0.0045));
      const hitSq = hitRadius * hitRadius;
      const toErase: string[] = [];
      for (const item of inkItems) {
        if (item.payload.locked || erasedPending.current.has(item.id)) continue;
        const paths = item.payload.inkPaths ?? [];
        let hit = false;
        for (const p of paths) {
          const pts = p.points;
          for (let i = 0; i < pts.length; i++) {
            const [x1, y1] = pts[i];
            if (i + 1 < pts.length) {
              const [x2, y2] = pts[i + 1];
              if (pointToSegmentDistSq(nx, ny, x1, y1, x2, y2) <= hitSq) {
                hit = true;
                break;
              }
            } else if ((nx - x1) * (nx - x1) + (ny - y1) * (ny - y1) <= hitSq) {
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (hit) toErase.push(item.id);
      }
      if (toErase.length > 0) {
        setErasedLocalIds((prev) => {
          const next = new Set(prev);
          for (const id of toErase) next.add(id);
          return next;
        });
        for (const id of toErase) {
          erasedPending.current.add(id);
          void softDeleteRecord(id).catch(() => {
            setErasedLocalIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            pushToast('Could not erase stroke. Please retry.', { tone: 'warn' });
          }).finally(() => erasedPending.current.delete(id));
        }
      }
    },
    [inkItems, inkWidth, pushToast]
  );

  const placeDecor = async (partial: Partial<DecorItemPayload>, title: string, opts?: { silent?: boolean }) => {
    const zIndex = decorItems.reduce((m, x) => Math.max(m, x.payload.zIndex ?? 1), 1) + 1;
    const rect = layerRef.current?.getBoundingClientRect();
    const rx = partial.relX ?? 0.72;
    const ry = partial.relY ?? 0.14;
    try {
    const created = await createRecord<DecorItemPayload>(
      'decor_item',
      title,
      {
        spreadKey,
        kind: partial.kind ?? 'sticker',
        anchorId: spreadKey,
        anchorMode: partial.anchorMode ?? 'canvas', // Fixed px anchor prevents drift when sections expand!
        layerPosition: partial.layerPosition ?? 'above',
        relX: rx,
        relY: ry,
        fixedPxX: partial.fixedPxX ?? (rect ? Math.round(rx * rect.width) : undefined),
        fixedPxY: partial.fixedPxY ?? (rect ? Math.round(ry * rect.height) : undefined),
        scale: partial.scale ?? 1,
        rotation: partial.rotation ?? 0,
        opacity: partial.opacity ?? 1,
        zIndex,
        locked: false,
        lockEditing: false,
        ...partial,
      },
      {},
      { undoLabel: `Placed ${title}` }
    );
    if (!opts?.silent) {
      setSelectedId(created.id);
      setDrawerOpen(false);
      pushToast(`Placed "${title}" — anchored cleanly against layout resizing`, { canUndo: true });
    }
    } catch (err) { if (opts?.silent) throw err; pushToast('Could not place decor. Please retry.', { tone: 'warn' }); }
  };

  const handleUploadCustomSticker = async (file: File) => {
    if (uploadLock.current) return;
    if (file.size > 20 * 1024 * 1024) { pushToast('Sticker files must be 20 MB or smaller.', { tone: 'warn' }); return; }
    if (!/\.(svg|png|webp|jpe?g)$/i.test(file.name) && !['image/svg+xml','image/png','image/webp','image/jpeg'].includes(file.type)) { pushToast('Choose a PNG, WebP, JPEG or SVG image.', { tone: 'warn' }); return; }
    uploadLock.current = true; setUploading(true);
    try {
      if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
        const raw = await file.text();
        const cleanSvg = await sanitizeSvgMarkup(raw);
        const blob = new Blob([cleanSvg], { type: 'image/svg+xml' });
        const stored = await storeBlob(blob, file.name);
        await createRecord('custom_sticker', file.name.replace(/\.svg$/i, ''), { blobHash: stored.hash, isSvg: true });
        pushToast(`Sanitized & saved custom SVG sticker "${file.name}"`);
        return;
      }

      let finalBlob: Blob = file;
      if (dieCutBorder && typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(file);
        try {
        const size = Math.min(320, Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = size + 24;
        canvas.height = size + 24;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.roundRect(4, 4, size + 16, size + 16, 26);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(12, 12, size, size, 20);
          ctx.clip();
          const ratio = Math.min(size / bmp.width, size / bmp.height);
          const bw = bmp.width * ratio, bh = bmp.height * ratio;
          ctx.drawImage(bmp, 12 + (size - bw) / 2, 12 + (size - bh) / 2, bw, bh);
          ctx.restore();
          const out = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
          if (out) finalBlob = out;
        }
        } finally { bmp.close(); }
      }
      const stored = await storeBlob(finalBlob, file.name);
      await createRecord('custom_sticker', file.name.replace(/\.[^.]+$/, ''), { blobHash: stored.hash });
      pushToast(`Saved custom die-cut sticker "${file.name}"`);
    } catch {
      pushToast('Could not process custom sticker file.', { tone: 'warn' });
    } finally { uploadLock.current = false; setUploading(false); }
  };

  const visibleStickers = useMemo(() => {
    const q = stickerSearch.trim().toLowerCase();
    if (q) return BUILTIN_STICKERS.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    if (activeCat === 'Favorites') return BUILTIN_STICKERS.filter((s) => settings.favoriteStickerIds.includes(s.id));
    if (activeCat === 'Recents') {
      return settings.recentStickerIds
        .map((id) => BUILTIN_STICKERS.find((s) => s.id === id))
        .filter((x): x is (typeof BUILTIN_STICKERS)[number] => Boolean(x));
    }
    if (activeCat === 'Custom') return [];
    return BUILTIN_STICKERS.filter((s) => s.category === activeCat);
  }, [activeCat, stickerSearch, settings.favoriteStickerIds, settings.recentStickerIds]);

  const selectedItem = decorItems.find((d) => d.id === selectedId) ?? null;

  return (
    <>
      {/* Top-right compact Decor & Ink toggles */}
      <div className="dp-no-print" style={{ position: 'absolute', top: 8, insetInlineEnd: 10, zIndex: 15, display: 'flex', gap: 4 }}>
        <button
          type="button"
          className="dp-btn dp-btn-sm"
          style={{ padding: '4px 9px', fontSize: '0.76rem', minHeight: 28, opacity: 0.92 }}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open stickers and decor drawer"
          title="Open built-in stickers, washi tape, sticky notes and stamps"
        >
          <Sparkles size={12} /> Decor
        </button>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${inkMode ? 'dp-btn-primary' : ''}`}
          style={{ padding: '4px 9px', fontSize: '0.76rem', minHeight: 28, opacity: 0.92 }}
          onClick={() => setInkMode((v) => !v)}
          aria-pressed={inkMode}
          aria-label={inkMode ? 'Turn off ink mode' : 'Turn on ink mode'}
          title="Toggle Smooth Pen, Highlighter & Stroke Eraser"
        >
          <PenTool size={12} /> {inkMode ? 'Ink On' : 'Ink'}
        </button>
      </div>

      {/* Floating Smooth Ink Studio Toolbar (appears when Ink On) */}
      {inkMode && (
        <div
          className="dp-no-print dp-card"
          style={{
            position: 'absolute',
            top: 38,
            insetInline: 10,
            zIndex: 16,
            padding: '8px 10px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--dp-shadow-float)',
            background: 'var(--dp-paper)',
            fontSize: '0.76rem',
          }}
        >
          <div className="dp-row" style={{ gap: 4 }}>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              style={{ padding: '2px 6px', fontSize: '0.72rem' }}
              title="Preset: Crisp Fountain Black Pen"
              onClick={() => { setInkTool('pen'); setInkColor('#2a241d'); setInkWidth(2.5); setInkOpacity(95); }}
            >
              🖋️ Fountain
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              style={{ padding: '2px 6px', fontSize: '0.72rem' }}
              title="Preset: Warm Amber Highlighter"
              onClick={() => { setInkTool('highlighter'); setInkColor('#e6b800'); setInkWidth(4); setInkOpacity(40); }}
            >
              🖍️ Hi-Lite
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              style={{ padding: '2px 6px', fontSize: '0.72rem' }}
              title="Preset: Red Proofing Markup"
              onClick={() => { setInkTool('fine'); setInkColor('#b5453a'); setInkWidth(3); setInkOpacity(92); }}
            >
              ✏️ Red Pen
            </button>
          </div>

          <div className="dp-row" style={{ gap: 4 }}>
            {(
              [
                ['pen', 'Pen', <PenTool size={12} key="p" />],
                ['pencil', 'Pencil', null],
                ['fine', 'Fine', null],
                ['marker', 'Marker', null],
                ['highlighter', 'Hi-Lite', <Highlighter size={12} key="h" />],
                ['dashed', 'Dashed', null],
                ['line', '╱ Line', null],
                ['rect', '▭ Box', null],
                ['ellipse', '◯ Oval', null],
                ['eraser', 'Eraser', <Eraser size={12} key="e" />],
              ] as const
            ).map(([toolId, label, icon]) => (
              <button
                key={toolId}
                type="button"
                className={`dp-btn dp-btn-sm ${inkTool === toolId ? 'dp-btn-primary' : ''}`}
                style={{ padding: '2px 7px', fontSize: '0.74rem' }}
                aria-pressed={inkTool === toolId}
                onClick={() => setInkTool(toolId)}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {inkTool !== 'eraser' && (
            <div className="dp-row" style={{ gap: 4 }}>
              {INK_PALETTE.map((col) => (
                <button
                  key={col}
                  type="button"
                  aria-label={`Ink color ${col}`}
                  aria-pressed={inkColor === col}
                  onClick={() => setInkColor(col)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: col,
                    border: inkColor === col ? '2px solid var(--dp-ink)' : '1px solid var(--dp-border)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom ink color"
                value={inkColor}
                onChange={(e) => setInkColor(e.target.value)}
                style={{ width: 22, height: 22, padding: 0, border: 'none', cursor: 'pointer' }}
              />
            </div>
          )}

          <label className="dp-row" style={{ gap: 4 }}>
            <span className="dp-muted">{inkTool === 'eraser' ? 'Radius' : 'Size'}:</span>
            <input
              type="range"
              min={1}
              max={16}
              step={0.5}
              style={{ width: 64 }}
              value={inkWidth}
              onChange={(e) => setInkWidth(Number(e.target.value))}
            />
          </label>

          {inkTool !== 'eraser' && (
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">Opacity: {inkOpacity}%</span>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                style={{ width: 58 }}
                value={inkOpacity}
                onChange={(e) => setInkOpacity(Number(e.target.value))}
              />
            </label>
          )}

          <div className="dp-row" style={{ gap: 4, marginInlineStart: 'auto' }}>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              style={{ padding: '2px 7px', fontSize: '0.74rem' }}
              disabled={inkItems.length === 0}
              onClick={async () => {
                const last = inkItems[inkItems.length - 1];
                if (!last) return;
                await softDeleteRecord(last.id);
                pushToast('Undid last ink stroke', { canUndo: true });
              }}
            >
              <RotateCcw size={12} /> Undo Ink
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-danger dp-btn-sm"
              style={{ padding: '2px 7px', fontSize: '0.74rem' }}
              disabled={inkItems.length === 0}
              onClick={() => setClearInkOpen(true)}
            >
              <Trash2 size={12} /> Clear Ink
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              style={{ padding: '2px 7px', fontSize: '0.74rem' }}
              onClick={() => setInkMode(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Freeform Decor & 60fps Ink Layer */}
      <div
        ref={layerRef}
        className="dp-decor-layer"
        style={{
          pointerEvents: inkMode ? 'auto' : 'none',
          cursor: inkMode ? (inkTool === 'eraser' ? 'cell' : 'crosshair') : 'default',
          touchAction: inkMode ? 'none' : 'auto',
        }}
        onPointerDown={(e) => {
          if (!inkMode || !layerRef.current || pointerRef.current !== null || e.button !== 0) return;
          pointerRef.current = e.pointerId;
          e.preventDefault();
          layerRef.current.setPointerCapture?.(e.pointerId);
          const rect = layerRef.current.getBoundingClientRect();
          const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

          if (inkTool === 'eraser') {
            erasingRef.current = true;
            eraseAtPoint(nx, ny);
            return;
          }

          syncLiveCanvasSize();
          drawingRef.current = true;
          inkPointsRef.current = [[Number(nx.toFixed(4)), Number(ny.toFixed(4))]];
          scheduleInk();
        }}
        onPointerMove={(e) => {
          if (pointerRef.current !== e.pointerId) return;
          if (inkMode && layerRef.current) {
            const rect = layerRef.current.getBoundingClientRect();
            const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

            if (erasingRef.current && inkTool === 'eraser') {
              eraseAtPoint(nx, ny);
              return;
            }
            if (drawingRef.current) {
              const pts = inkPointsRef.current;
              const prev = pts[pts.length - 1];
              // Skip redundant sub-pixel samples for super crisp, compact strokes
              if (!prev || Math.hypot(nx - prev[0], ny - prev[1]) >= 0.0022) {
                const point: [number, number] = [Number(nx.toFixed(4)), Number(ny.toFixed(4))];
                if (['line', 'rect', 'ellipse'].includes(inkTool) && pts.length > 1) pts[1] = point;
                else pts.push(point);
                scheduleInk();
              }
              return;
            }
          }

          const drag = draggingRef.current;
          if (!drag || !layerRef.current) return;
          const rect = layerRef.current.getBoundingClientRect();
          let relX = drag.origRelX + (e.clientX - drag.startX) / Math.max(1, rect.width);
          let relY = drag.origRelY + (e.clientY - drag.startY) / Math.max(1, rect.height);
          if (snapToGrid) {
            relX = Math.round(relX * 20) / 20;
            relY = Math.round(relY * 20) / 20;
          }
          relX = Math.max(0.02, Math.min(0.95, relX));
          relY = Math.max(0.02, Math.min(0.95, relY));
          drag.curRelX = relX;
          drag.curRelY = relY;
          if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(() => {
            dragFrame.current = null;
            const current = draggingRef.current;
            if (current) setDragPos({ id: current.id, relX: current.curRelX, relY: current.curRelY });
          });
        }}
        onPointerUp={async (e) => {
          if (pointerRef.current !== e.pointerId) return;
          pointerRef.current = null;
          if (inkFrame.current !== null) { cancelAnimationFrame(inkFrame.current); inkFrame.current = null; }
          if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; }
          try {
          if (draggingRef.current) {
            const d = draggingRef.current;
            draggingRef.current = null;
            setDragPos(null);
            const rect = layerRef.current?.getBoundingClientRect();
            const pxX = rect ? Math.round(d.curRelX * rect.width) : undefined;
            const pxY = rect ? Math.round(d.curRelY * rect.height) : undefined;
            if (d.curRelX !== d.origRelX || d.curRelY !== d.origRelY) await updateRecord<DecorItemPayload>(
              d.id,
              (c) => ({
                ...c,
                payload: {
                  ...c.payload,
                  relX: d.curRelX,
                  relY: d.curRelY,
                  fixedPxX: pxX ?? c.payload.fixedPxX,
                  fixedPxY: pxY ?? c.payload.fixedPxY,
                },
              }),
              { skipUndo: true }
            );
            return; // Do not touch a new drawing gesture started during the async drag save.
          }

          if (erasingRef.current) {
            erasingRef.current = false;
            return;
          }

          if (drawingRef.current) {
            drawingRef.current = false;
            const pts = [...inkPointsRef.current];
            const rect = layerRef.current?.getBoundingClientRect();
            if (rect && pts.length) {
              const end: [number, number] = [Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))), Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)))];
              const last = pts[pts.length - 1];
              if (Math.hypot(end[0] - last[0], end[1] - last[1]) > 0.0005) pts.push(end);
            }
            inkPointsRef.current = [];
            clearLiveCanvas();

            if (pts.length >= 1) {
              const isShape = inkTool === 'line' || inkTool === 'rect' || inkTool === 'ellipse';
              if (isShape && pts.length < 2) return;
              if (isShape) {
                const start = pts[0];
                const end = pts[pts.length - 1];
                const shapePts: Array<[number, number]> =
                  inkTool === 'line'
                    ? [start, end]
                    : inkTool === 'rect'
                      ? [start, [end[0], start[1]], end, [start[0], end[1]], start]
                      : Array.from({ length: 25 }, (_, i) => {
                          const ang = (i / 24) * Math.PI * 2;
                          const cx = (start[0] + end[0]) / 2;
                          const cy = (start[1] + end[1]) / 2;
                          const rx = Math.abs(end[0] - start[0]) / 2;
                          const ry = Math.abs(end[1] - start[1]) / 2;
                          return [Number((cx + Math.cos(ang) * rx).toFixed(4)), Number((cy + Math.sin(ang) * ry).toFixed(4))] as [number, number];
                        });
                await placeDecor(
                  {
                    kind: 'ink',
                    relX: 0,
                    relY: 0,
                    inkPaths: [
                      {
                        color: inkColor,
                        width: effectiveInkWidth,
                        opacity: effectiveInkOpacity,
                        tool: 'pen',
                        points: shapePts,
                      },
                    ],
                  },
                  `Shape: ${inkTool}`,
                  { silent: true }
                );
              } else {
                await placeDecor(
                  {
                    kind: 'ink',
                    relX: 0,
                    relY: 0,
                    inkPaths: [
                      {
                        color: inkColor,
                        width: effectiveInkWidth,
                        opacity: inkTool === 'pencil' ? Math.min(0.65, effectiveInkOpacity) : effectiveInkOpacity,
                        tool: inkTool === 'eraser' ? 'pen' : inkTool,
                        highlighter: inkTool === 'highlighter',
                        points: pts,
                      },
                    ],
                  },
                  inkTool === 'highlighter' ? 'Highlighter Stroke' : 'Ink Stroke',
                  { silent: true }
                );
              }
            }
          }
          } catch { pushToast('Could not save decor change. Please retry.', { tone: 'warn' }); }
        }}
        onPointerCancel={(e) => { if (pointerRef.current === e.pointerId) { cancelGesture(); setDragPos(null); } }}
        onLostPointerCapture={(e) => { if (pointerRef.current === e.pointerId) { cancelGesture(); setDragPos(null); } }}
      >
        {/* Persisted Smooth SVG Ink / Highlighter Strokes */}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {inkMarkup.map(({ key, path, d }) => <path key={key} d={d} fill="none" stroke={path.color}
            strokeWidth={path.width} strokeOpacity={path.opacity ?? (path.highlighter ? 0.35 : 0.9)}
            strokeDasharray={path.tool === 'dashed' ? `${path.width * 2.5} ${path.width * 2}` : undefined}
            strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>

        {/* Zero-Lag 60fps Live Stroke Canvas */}
        {inkMode && (
          <canvas
            ref={liveCanvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
        )}

        {/* Anchored Stickers, Washi Tape, Sticky Notes & Rubber Stamps */}
        {decorItems
          .filter((d) => d.payload.kind !== 'ink')
          .map((item) => {
            const p = item.payload;
            const isSel = selectedId === item.id;
            const curX = dragPos?.id === item.id ? dragPos.relX : p.relX;
            const curY = dragPos?.id === item.id ? dragPos.relY : p.relY;
            const useFixedPx =
              dragPos?.id !== item.id &&
              (p.anchorMode === 'canvas' || p.anchorMode === 'section' || p.anchorMode === 'object') &&
              typeof p.fixedPxX === 'number' &&
              typeof p.fixedPxY === 'number';
            const effZ = p.layerPosition === 'below' ? 0 : Math.max(1, p.zIndex);
            return (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`${p.kind}: ${item.title}`}
                className={`dp-decor-item ${p.locked ? 'locked' : ''}`}
                style={{
                  left: useFixedPx ? `${p.fixedPxX}px` : `${curX * 100}%`,
                  top: useFixedPx ? `${p.fixedPxY}px` : `${curY * 100}%`,
                  transform: `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}deg)`,
                  opacity: p.opacity,
                  zIndex: effZ,
                  outline: isSel ? '2px dashed var(--dp-accent)' : undefined,
                  borderRadius: 6,
                  pointerEvents: inkMode ? 'none' : 'auto',
                  touchAction: p.locked ? 'auto' : 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(item.id);
                }}
                onPointerDown={(e) => {
                  if (inkMode || e.button !== 0 || pointerRef.current !== null) return;
                  e.stopPropagation();
                  setSelectedId(item.id);
                  if (p.locked) return;
                  const rect = layerRef.current?.getBoundingClientRect();
                  const rx = useFixedPx && rect ? p.fixedPxX! / Math.max(1, rect.width) : p.relX;
                  const ry = useFixedPx && rect ? p.fixedPxY! / Math.max(1, rect.height) : p.relY;
                  pointerRef.current = e.pointerId;
                  layerRef.current?.setPointerCapture?.(e.pointerId);
                  draggingRef.current = {
                    id: item.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origRelX: rx,
                    origRelY: ry,
                    curRelX: rx,
                    curRelY: ry,
                  };
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(item.id); return; }
                  if (p.locked || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
                  e.preventDefault(); e.stopPropagation();
                  const step = e.shiftKey ? 0.05 : 0.015;
                  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                  const rect = layerRef.current?.getBoundingClientRect();
                  void updateRecord<DecorItemPayload>(item.id, (c) => {
                    const cp = c.payload;
                    const fixed = rect && ['canvas','section','object'].includes(cp.anchorMode ?? '') && cp.fixedPxX != null && cp.fixedPxY != null;
                    const x = Math.max(0.02, Math.min(0.95, (fixed ? cp.fixedPxX! / Math.max(1, rect!.width) : cp.relX) + dx));
                    const y = Math.max(0.02, Math.min(0.95, (fixed ? cp.fixedPxY! / Math.max(1, rect!.height) : cp.relY) + dy));
                    return { ...c, payload: { ...cp, relX: x, relY: y, fixedPxX: rect ? Math.round(x * rect.width) : cp.fixedPxX, fixedPxY: rect ? Math.round(y * rect.height) : cp.fixedPxY } };
                  }).catch(() => pushToast('Could not move decor.', { tone: 'warn' }));
                }}
              >
                {p.kind === 'sticker' && p.customBlobId && blobUrls[p.customBlobId] ? (
                  <img src={blobUrls[p.customBlobId]} alt={item.title} style={{ width: 58, height: 58, objectFit: 'contain', pointerEvents: 'none' }} />
                ) : p.kind === 'sticker' ? (
                  <span style={{ fontSize: '2.15rem', lineHeight: 1, display: 'inline-block', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.16))' }}>
                    {p.emoji || '✨'}
                  </span>
                ) : p.kind === 'washi' ? (
                  <div className="dp-washi-strip" style={{ backgroundColor: p.color || '#c96f53', width: 150 }} />
                ) : p.kind === 'stamp' ? (
                  <div className="dp-rubber-stamp" style={{ color: p.color || '#b5453a' }}>
                    {p.stampText || 'DONE'}
                  </div>
                ) : (
                  <div
                    style={{
                      width: 145,
                      padding: 10,
                      borderRadius: 4,
                      background: p.color || '#fdf1b5',
                      color: '#2b2416',
                      boxShadow: '0 4px 10px rgb(0 0 0 / 0.14)',
                      fontSize: '0.8rem',
                    }}
                  >
                    {p.text || 'Sticky note'}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Selected Decor Floating Inspector */}
      {selectedItem && (
        <div
          className="dp-no-print dp-row"
          style={{
            position: 'absolute',
            bottom: 8,
            insetInlineEnd: 8,
            zIndex: 14,
            background: 'var(--dp-paper)',
            border: '1px solid var(--dp-border)',
            borderRadius: 10,
            padding: '5px 8px',
            boxShadow: 'var(--dp-shadow-float)',
            fontSize: '0.78rem', flexWrap: 'wrap', maxWidth: 'calc(100% - 16px)',
          }}
        >
          <strong>{selectedItem.title}</strong>
          {selectedItem.payload.kind === 'sticky_note' && <SafeTextarea key={selectedItem.id} recordKey={`${selectedItem.id}:text`} externalValue={selectedItem.payload.text ?? ''} titleHint={selectedItem.title} aria-label="Edit sticky note" className="dp-input" rows={2} autoGrow={false} disabled={selectedItem.payload.locked} onCommit={async (text) => { await updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, text } })); }} />}
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, scale: Math.min(2.5, Number((c.payload.scale + 0.15).toFixed(2))) } }))}
          >
            +Size
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, scale: Math.max(0.5, Number((c.payload.scale - 0.15).toFixed(2))) } }))}
          >
            −Size
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            title="Rotate +15deg"
            onClick={() => void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, rotation: (c.payload.rotation + 15) % 360 } }))}
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            title="Toggle Above vs Below text layer"
            onClick={() =>
              void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({
                ...c,
                payload: { ...c.payload, layerPosition: c.payload.layerPosition === 'below' ? 'above' : 'below' },
              }))
            }
          >
            {selectedItem.payload.layerPosition === 'below' ? '↓ Below' : '↑ Above'}
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            title="Bring to front"
            onClick={() => {
              const maxZ = decorItems.reduce((m, x) => Math.max(m, x.payload.zIndex ?? 1), 1);
              void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, zIndex: maxZ + 1, layerPosition: 'above' } }));
            }}
          >
            Front
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            title="Send to back"
            onClick={() =>
              void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, zIndex: 1, layerPosition: 'below' } }))
            }
          >
            Back
          </button>
          <select
            aria-label="Anchor mode"
            className="dp-select"
            style={{ width: 'auto', padding: '1px 5px', fontSize: '0.72rem' }}
            value={selectedItem.payload.anchorMode ?? 'canvas'}
            onChange={(e) =>
              void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({
                ...c,
                payload: { ...c.payload, anchorMode: e.target.value as DecorItemPayload['anchorMode'] },
              }))
            }
          >
            <option value="canvas">Anchor: Fixed Px</option>
            <option value="page">Anchor: Relative %</option>
            <option value="section">Anchor: Section</option>
            <option value="object">Anchor: Object</option>
            <option value="text">Anchor: Text Block</option>
          </select>
          <input
            type="range"
            aria-label="Decor opacity"
            min={20}
            max={100}
            style={{ width: 52 }}
            value={Math.round((selectedItem.payload.opacity ?? 1) * 100)}
            onChange={(e) =>
              void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({
                ...c,
                payload: { ...c.payload, opacity: Number(e.target.value) / 100 },
              }))
            }
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => void updateRecord<DecorItemPayload>(selectedItem.id, (c) => ({ ...c, payload: { ...c.payload, locked: !c.payload.locked } }))}
          >
            {selectedItem.payload.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-danger dp-btn-sm"
            onClick={async () => {
              await softDeleteRecord(selectedItem.id);
              setSelectedId(null);
            }}
          >
            <Trash2 size={12} />
          </button>
          <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setSelectedId(null)}>
            Done
          </button>
        </div>
      )}

      <ModalDialog open={clearInkOpen} onClose={() => { if (!clearInkLock.current) setClearInkOpen(false); }} dismissible={!clearingInk} title="Clear ink on this spread?">
        <p>Move {inkItems.length} ink stroke(s) to Trash? Stickers, stamps and sticky notes will stay in place.</p>
        <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="dp-btn" disabled={clearingInk} onClick={() => setClearInkOpen(false)}>Cancel</button>
          <button type="button" className="dp-btn dp-btn-danger" disabled={clearingInk} onClick={async () => {
            if (clearInkLock.current) return;
            clearInkLock.current = true; setClearingInk(true);
            let cleared = 0;
            try { for (const item of inkItems) { const result = await softDeleteRecord(item.id); if (result.trashed) cleared++; } pushToast(`Cleared ${cleared} ink stroke(s), recoverable in Trash.`); setClearInkOpen(false); }
            catch { pushToast(`Cleared ${cleared} stroke(s) before an error. Try again for remaining strokes.`, { tone: 'warn' }); }
            finally { clearInkLock.current = false; setClearingInk(false); }
          }}>{clearingInk ? 'Clearing…' : 'Clear Ink'}</button>
        </div>
      </ModalDialog>

      {/* Sticker Book, Washi, Stamps & Sticky Notes Modal */}
      <ModalDialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title={`Stationery Decor Studio (${BUILTIN_STICKERS.length} Built-In Stickers + Custom)`} wide>
        <div className="dp-stack">
          <div className="dp-grid-3" style={{ gap: 10 }}>
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
              <strong style={{ fontSize: '0.84rem' }}>Washi Tape Strips</strong>
              <div className="dp-row" style={{ gap: 5 }}>
                {WASHI_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Place ${col} washi tape`}
                    style={{ width: 26, height: 18, borderRadius: 3, background: col, border: 'none', cursor: 'pointer', opacity: 0.8 }}
                    onClick={() => void placeDecor({ kind: 'washi', color: col, rotation: -4 }, 'Washi Tape')}
                  />
                ))}
              </div>
            </div>

            <div className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
              <strong style={{ fontSize: '0.84rem' }}><Stamp size={13} /> Decorative Rubber Stamps</strong>
              <div className="dp-row" style={{ gap: 4 }}>
                {RUBBER_STAMPS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => void placeDecor({ kind: 'stamp', stampText: st, rotation: -12, color: st === 'DONE' ? '#3e7a5d' : '#b5453a' }, `Stamp: ${st}`)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
              <strong style={{ fontSize: '0.84rem' }}><StickyNote size={13} /> Sticky Notes & Grid</strong>
              <div className="dp-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => void placeDecor({ kind: 'sticky_note', text: 'Remember this ✨', color: '#fdf1b5', rotation: 2 }, 'Sticky Note')}
                >
                  + Sticky Note
                </button>
                <label className="dp-row" style={{ fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                  Snap to grid
                </label>
              </div>
            </div>
          </div>

          <div className="dp-row">
            <input
              className="dp-input"
              style={{ flex: 1 }}
              aria-label="Search stickers" placeholder={`Search all ${BUILTIN_STICKERS.length} built-in stickers…`}
              value={stickerSearch}
              onChange={(e) => setStickerSearch(e.target.value)}
            />
            <label className="dp-row" style={{ fontSize: '0.82rem' }}>
              <input type="checkbox" checked={dieCutBorder} onChange={(e) => setDieCutBorder(e.target.checked)} />
              <span>White die-cut border</span>
            </label>
            <button type="button" className="dp-btn dp-btn-sm" disabled={uploading} onClick={() => customInputRef.current?.click()}>
              <Upload size={13} /> {uploading ? 'Processing…' : 'Upload PNG/SVG'}
            </button>
            <input
              ref={customInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg,image/svg+xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadCustomSticker(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="dp-row" style={{ gap: 5 }}>
            {(['Favorites', 'Recents', 'Custom', ...STICKER_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                aria-pressed={activeCat === cat && !stickerSearch}
                type="button"
                className={`dp-btn dp-btn-sm ${activeCat === cat && !stickerSearch ? 'dp-btn-primary' : ''}`}
                onClick={() => {
                  setStickerSearch('');
                  setActiveCat(cat);
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {activeCat === 'Custom' && !stickerSearch ? (
            <div className="dp-row">
              {customStickers.length === 0 ? (
                <p className="dp-muted">Upload transparent PNG/WebP, photos (auto die-cut), or SVGs (strictly sanitized).</p>
              ) : (
                customStickers.map((cs) => {
                  const h = (cs.payload as { blobHash?: string }).blobHash;
                  return (
                    <button
                      key={cs.id}
                      type="button"
                      className="dp-card"
                      style={{ padding: 8, cursor: 'pointer' }}
                      onClick={() => void placeDecor({ kind: 'sticker', customBlobId: h }, cs.title)}
                    >
                      {h && blobUrls[h] ? <img src={blobUrls[h]} alt={cs.title} style={{ width: 48, height: 48, objectFit: 'contain' }} /> : cs.title}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {visibleStickers.map((stk) => {
                const isFav = settings.favoriteStickerIds.includes(stk.id);
                return (
                  <div key={stk.id} className="dp-card" style={{ padding: 8, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      className="dp-btn dp-btn-ghost"
                      style={{ fontSize: '1.8rem', padding: 4 }}
                      onClick={() => {
                        const nextRecents = [stk.id, ...settings.recentStickerIds.filter((x) => x !== stk.id)].slice(0, 18);
                        void patchSettings({ recentStickerIds: nextRecents });
                        void placeDecor({ kind: 'sticker', stickerId: stk.id, emoji: stk.emoji }, stk.name);
                      }}
                    >
                      {stk.emoji}
                    </button>
                    <span style={{ fontSize: '0.73rem' }}>{stk.name}</span>
                    <button
                      type="button"
                      className="dp-btn dp-btn-ghost dp-btn-sm"
                      style={{ fontSize: '0.7rem', padding: '1px 4px' }}
                      aria-pressed={isFav}
                      aria-label={`${isFav ? 'Remove' : 'Add'} ${stk.name} ${isFav ? 'from' : 'to'} favorites`}
                      onClick={() => {
                        const nextFavs = isFav
                          ? settings.favoriteStickerIds.filter((x) => x !== stk.id)
                          : [...settings.favoriteStickerIds, stk.id];
                        void patchSettings({ favoriteStickerIds: nextFavs });
                      }}
                    >
                      {isFav ? '★ Fav' : '☆ Fav'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ModalDialog>
    </>
  );
};
