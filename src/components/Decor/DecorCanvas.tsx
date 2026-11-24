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
import type { DecorItemPayload, LifeRecord } from '../../core/types';

const WASHI_COLORS = ['#c96f53', '#5e8c78', '#c79b43', '#6b5ca5', '#3b6ea5', '#d98a9c'];
const RUBBER_STAMPS = ['DONE', 'PRIORITY', 'MOVED', 'CANCELED'] as const;
const INK_PALETTE = ['#2a241d', '#a97434', '#2e5c8a', '#b5453a', '#3e7a5d', '#6b5ca5', '#d98a9c', '#e6b800'];

type InkTool = 'pen' | 'fine' | 'marker' | 'highlighter' | 'dashed' | 'eraser';

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
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const layerRef = useRef<HTMLDivElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origRelX: number; origRelY: number; curRelX: number; curRelY: number } | null>(null);
  const drawingRef = useRef(false);
  const erasingRef = useRef(false);
  const inkPointsRef = useRef<Array<[number, number]>>([]);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const decorItems = useMemo(
    () =>
      (records.filter(
        (r) => r.type === 'decor_item' && (r.payload as DecorItemPayload).spreadKey === spreadKey
      ) as Array<LifeRecord<DecorItemPayload>>).sort((a, b) => (a.payload.zIndex ?? 1) - (b.payload.zIndex ?? 1)),
    [records, spreadKey]
  );

  const inkItems = useMemo(
    () => decorItems.filter((d) => d.payload.kind === 'ink' && d.payload.inkPaths?.length && !erasedLocalIds.has(d.id)),
    [decorItems, erasedLocalIds]
  );

  const customStickers = useMemo(
    () => records.filter((r) => r.type === 'custom_sticker'),
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

  useEffect(() => {
    const hashes = new Set<string>();
    for (const d of decorItems) if (d.payload.customBlobId) hashes.add(d.payload.customBlobId);
    for (const cs of customStickers) {
      const h = (cs.payload as { blobHash?: string }).blobHash;
      if (h) hashes.add(h);
    }
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const h of hashes) {
        const u = await getBlobObjectUrl(h);
        if (u) next[h] = u;
      }
      if (alive) setBlobUrls(next);
    })();
    return () => {
      alive = false;
    };
  }, [decorItems, customStickers]);

  // Size live canvas cleanly to layer dimensions when inkMode is active
  const syncLiveCanvasSize = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    const rect = layer.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [inkMode, syncLiveCanvasSize]);

  const effectiveInkWidth =
    inkTool === 'fine'
      ? Math.max(1, inkWidth * 0.55)
      : inkTool === 'highlighter'
        ? Math.max(12, inkWidth * 4.2)
        : inkTool === 'marker'
          ? Math.max(6, inkWidth * 2.1)
          : inkWidth;

  const effectiveInkOpacity = inkTool === 'highlighter' ? Math.min(0.45, inkOpacity / 100) : inkOpacity / 100;

  const clearLiveCanvas = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawLiveStroke = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const pts = inkPointsRef.current;
    if (!canvas || pts.length < 2) return;
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
    ctx.lineWidth = (effectiveInkWidth / 1000) * Math.max(w, h);
    if (inkTool === 'dashed') {
      ctx.setLineDash([ctx.lineWidth * 2.5, ctx.lineWidth * 2]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) * 0.5) * w;
      const my = ((pts[i][1] + pts[i + 1][1]) * 0.5) * h;
      ctx.quadraticCurveTo(pts[i][0] * w, pts[i][1] * h, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * w, last[1] * h);
    ctx.stroke();
    ctx.restore();
  }, [inkColor, effectiveInkOpacity, effectiveInkWidth, inkTool]);

  const eraseAtPoint = useCallback(
    (nx: number, ny: number) => {
      const hitRadius = Math.max(0.018, (inkWidth * 0.0045));
      const hitSq = hitRadius * hitRadius;
      const toErase: string[] = [];
      for (const item of inkItems) {
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
          void softDeleteRecord(id);
        }
      }
    },
    [inkItems, inkWidth]
  );

  const placeDecor = async (partial: Partial<DecorItemPayload>, title: string, opts?: { silent?: boolean }) => {
    const zIndex = decorItems.reduce((m, x) => Math.max(m, x.payload.zIndex ?? 1), 1) + 1;
    const created = await createRecord<DecorItemPayload>(
      'decor_item',
      title,
      {
        spreadKey,
        kind: partial.kind ?? 'sticker',
        anchorId: spreadKey,
        relX: partial.relX ?? 0.72,
        relY: partial.relY ?? 0.14,
        scale: partial.scale ?? 1,
        rotation: partial.rotation ?? 0,
        opacity: partial.opacity ?? 1,
        zIndex,
        locked: false,
        ...partial,
      },
      {},
      { undoLabel: `Placed ${title}` }
    );
    if (!opts?.silent) {
      setSelectedId(created.id);
      setDrawerOpen(false);
      pushToast(`Placed "${title}" — drag or use arrow keys to position`, { canUndo: true });
    }
  };

  const handleUploadCustomSticker = async (file: File) => {
    try {
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
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
          ctx.drawImage(bmp, 12, 12, size, size);
          ctx.restore();
          const out = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
          if (out) finalBlob = out;
        }
        bmp.close();
      }
      const stored = await storeBlob(finalBlob, file.name);
      await createRecord('custom_sticker', file.name.replace(/\.[^.]+$/, ''), { blobHash: stored.hash });
      pushToast(`Saved custom die-cut sticker "${file.name}"`);
    } catch {
      pushToast('Could not process custom sticker file.', { tone: 'warn' });
    }
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
          style={{ padding: '2px 8px', fontSize: '0.75rem', opacity: 0.9 }}
          onClick={() => setDrawerOpen(true)}
          title="Open 208 Built-In Stickers, Washi Tape, Sticky Notes & Stamps"
        >
          <Sparkles size={12} /> Decor
        </button>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${inkMode ? 'dp-btn-primary' : ''}`}
          style={{ padding: '2px 8px', fontSize: '0.75rem', opacity: 0.9 }}
          onClick={() => setInkMode((v) => !v)}
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
            {(
              [
                ['pen', 'Pen', <PenTool size={12} key="p" />],
                ['fine', 'Fine', null],
                ['marker', 'Marker', null],
                ['highlighter', 'Hi-Lite', <Highlighter size={12} key="h" />],
                ['dashed', 'Dashed', null],
                ['eraser', 'Eraser', <Eraser size={12} key="e" />],
              ] as const
            ).map(([toolId, label, icon]) => (
              <button
                key={toolId}
                type="button"
                className={`dp-btn dp-btn-sm ${inkTool === toolId ? 'dp-btn-primary' : ''}`}
                style={{ padding: '2px 7px', fontSize: '0.74rem' }}
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
              onClick={async () => {
                for (const item of inkItems) {
                  await softDeleteRecord(item.id);
                }
                pushToast(`Cleared ${inkItems.length} ink stroke(s) (recoverable in Trash)`, { canUndo: true });
              }}
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
          if (!inkMode || !layerRef.current) return;
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
        }}
        onPointerMove={(e) => {
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
                pts.push([Number(nx.toFixed(4)), Number(ny.toFixed(4))]);
                drawLiveStroke();
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
          setDragPos({ id: drag.id, relX, relY });
        }}
        onPointerUp={async () => {
          if (draggingRef.current) {
            const d = draggingRef.current;
            draggingRef.current = null;
            setDragPos(null);
            await updateRecord<DecorItemPayload>(
              d.id,
              (c) => ({ ...c, payload: { ...c.payload, relX: d.curRelX, relY: d.curRelY } }),
              { skipUndo: true }
            );
          }

          if (erasingRef.current) {
            erasingRef.current = false;
            return;
          }

          if (drawingRef.current) {
            drawingRef.current = false;
            const pts = [...inkPointsRef.current];
            inkPointsRef.current = [];
            clearLiveCanvas();

            if (pts.length >= 2) {
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
        }}
        onPointerCancel={() => {
          drawingRef.current = false;
          erasingRef.current = false;
          inkPointsRef.current = [];
          clearLiveCanvas();
        }}
      >
        {/* Persisted Smooth SVG Ink / Highlighter Strokes */}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {inkItems.map((d) =>
            d.payload.inkPaths!.map((path, idx) => (
              <path
                key={`${d.id}-${idx}`}
                d={buildSmoothSvgPath(path.points)}
                fill="none"
                stroke={path.color}
                strokeWidth={path.width}
                strokeOpacity={path.opacity ?? (path.highlighter ? 0.35 : 0.9)}
                strokeDasharray={path.tool === 'dashed' ? `${path.width * 2.5} ${path.width * 2}` : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          )}
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
            return (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`${p.kind}: ${item.title}`}
                className={`dp-decor-item ${p.locked ? 'locked' : ''}`}
                style={{
                  left: `${curX * 100}%`,
                  top: `${curY * 100}%`,
                  transform: `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}deg)`,
                  opacity: p.opacity,
                  zIndex: p.zIndex,
                  outline: isSel ? '2px dashed var(--dp-accent)' : undefined,
                  borderRadius: 6,
                  pointerEvents: inkMode ? 'none' : 'auto',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(item.id);
                }}
                onPointerDown={(e) => {
                  if (inkMode) return;
                  e.stopPropagation();
                  setSelectedId(item.id);
                  if (p.locked) return;
                  draggingRef.current = {
                    id: item.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origRelX: p.relX,
                    origRelY: p.relY,
                    curRelX: p.relX,
                    curRelY: p.relY,
                  };
                }}
                onKeyDown={(e) => {
                  if (p.locked) return;
                  const step = e.shiftKey ? 0.05 : 0.015;
                  if (e.key === 'ArrowLeft') { e.preventDefault(); void updateRecord<DecorItemPayload>(item.id, (c) => ({ ...c, payload: { ...c.payload, relX: Math.max(0.02, c.payload.relX - step) } })); }
                  if (e.key === 'ArrowRight') { e.preventDefault(); void updateRecord<DecorItemPayload>(item.id, (c) => ({ ...c, payload: { ...c.payload, relX: Math.min(0.95, c.payload.relX + step) } })); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); void updateRecord<DecorItemPayload>(item.id, (c) => ({ ...c, payload: { ...c.payload, relY: Math.max(0.02, c.payload.relY - step) } })); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); void updateRecord<DecorItemPayload>(item.id, (c) => ({ ...c, payload: { ...c.payload, relY: Math.min(0.95, c.payload.relY + step) } })); }
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
            fontSize: '0.78rem',
          }}
        >
          <strong>{selectedItem.title}</strong>
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

      {/* Sticker Book, Washi, Stamps & Sticky Notes Modal */}
      <ModalDialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Stationery Decor Studio (208 Built-In Stickers + Custom)" wide>
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
              placeholder="Search all 208 built-in stickers…"
              value={stickerSearch}
              onChange={(e) => setStickerSearch(e.target.value)}
            />
            <label className="dp-row" style={{ fontSize: '0.82rem' }}>
              <input type="checkbox" checked={dieCutBorder} onChange={(e) => setDieCutBorder(e.target.checked)} />
              <span>White die-cut border</span>
            </label>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => customInputRef.current?.click()}>
              <Upload size={13} /> Upload PNG/SVG
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
