import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, PenTool, RotateCw, Sparkles, Stamp, StickyNote, Trash2, Unlock, Upload } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { BUILTIN_STICKERS, STICKER_CATEGORIES, type StickerCategory } from '../../data/stickers';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { getBlobObjectUrl, storeBlob } from '../../core/db';
import { sanitizeSvgMarkup } from '../../core/sanitizer';
import { ModalDialog } from '../Common/ModalDialog';
import type { DecorItemPayload, LifeRecord } from '../../core/types';

const WASHI_COLORS = ['#c96f53', '#5e8c78', '#c79b43', '#6b5ca5', '#3b6ea5', '#d98a9c'];
const RUBBER_STAMPS = ['DONE', 'PRIORITY', 'MOVED', 'CANCELED'] as const;

/**
 * Freeform Anchored Sticker, Washi Tape, Sticky Note, Rubber Stamp & Stylus Ink Canvas (Section 14.04).
 * Stores normalized anchor coordinates `{anchorId, relX, relY, scale, rotation, zIndex}` so layouts reflow cleanly across phone/tablet/desktop.
 */
export const DecorCanvasOverlay: React.FC<{ spreadKey: string }> = ({ spreadKey }) => {
  const { settings, patchSettings, records, pushToast } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [inkMode, setInkMode] = useState(false);
  const [inkColor, setInkColor] = useState('#a97434');
  const [inkHighlighter, setInkHighlighter] = useState(false);
  const [activeCat, setActiveCat] = useState<StickerCategory | 'Favorites' | 'Recents' | 'Custom'>('Planning');
  const [stickerSearch, setStickerSearch] = useState('');
  const [dieCutBorder, setDieCutBorder] = useState(true);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const layerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origRelX: number; origRelY: number } | null>(null);
  const inkPointsRef = useRef<Array<[number, number]>>([]);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const decorItems = useMemo(
    () =>
      (records.filter(
        (r) => r.type === 'decor_item' && (r.payload as DecorItemPayload).spreadKey === spreadKey
      ) as Array<LifeRecord<DecorItemPayload>>).sort((a, b) => (a.payload.zIndex ?? 1) - (b.payload.zIndex ?? 1)),
    [records, spreadKey]
  );

  const customStickers = useMemo(
    () => records.filter((r) => r.type === 'custom_sticker'),
    [records]
  );

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

  const placeDecor = async (partial: Partial<DecorItemPayload>, title: string) => {
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
    setSelectedId(created.id);
    setDrawerOpen(false);
    pushToast(`Placed "${title}" — drag or use arrow keys to position`, { canUndo: true });
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

      // Photo-to-die-cut cropper with optional crisp white die-cut border
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
      {/* Subtle compact decor launcher button in top corner of spread */}
      <div className="dp-no-print" style={{ position: 'absolute', top: 8, insetInlineEnd: 10, zIndex: 11, display: 'flex', gap: 4 }}>
        <button
          type="button"
          className="dp-btn dp-btn-sm"
          style={{ padding: '2px 8px', fontSize: '0.75rem', opacity: 0.85 }}
          onClick={() => setDrawerOpen(true)}
          title="Open 208 Built-In Stickers, Washi Tape, Sticky Notes & Stamps"
        >
          <Sparkles size={12} /> Decor
        </button>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${inkMode ? 'dp-btn-primary' : ''}`}
          style={{ padding: '2px 8px', fontSize: '0.75rem', opacity: 0.85 }}
          onClick={() => setInkMode((v) => !v)}
          title="Toggle Stylus / Mouse Ink & Highlighter Layer"
        >
          <PenTool size={12} /> {inkMode ? 'Ink On' : 'Ink'}
        </button>
      </div>

      {/* Freeform Decor & Ink Layer */}
      <div
        ref={layerRef}
        className="dp-decor-layer"
        style={{ pointerEvents: inkMode ? 'auto' : 'none', cursor: inkMode ? 'crosshair' : 'default' }}
        onPointerMove={(e) => {
          if (inkMode && inkPointsRef.current.length > 0 && layerRef.current) {
            const rect = layerRef.current.getBoundingClientRect();
            inkPointsRef.current.push([
              Number(((e.clientX - rect.left) / rect.width).toFixed(4)),
              Number(((e.clientY - rect.top) / rect.height).toFixed(4)),
            ]);
            return;
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
          void updateRecord<DecorItemPayload>(
            drag.id,
            (c) => ({ ...c, payload: { ...c.payload, relX, relY } }),
            { skipUndo: true }
          );
        }}
        onPointerDown={(e) => {
          if (!inkMode || !layerRef.current) return;
          const rect = layerRef.current.getBoundingClientRect();
          inkPointsRef.current = [[(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]];
        }}
        onPointerUp={async () => {
          draggingRef.current = null;
          if (inkMode && inkPointsRef.current.length > 2) {
            const pts = [...inkPointsRef.current];
            inkPointsRef.current = [];
            await placeDecor(
              {
                kind: 'ink',
                relX: 0,
                relY: 0,
                inkPaths: [{ color: inkColor, width: inkHighlighter ? 14 : 2.5, highlighter: inkHighlighter, points: pts }],
              },
              inkHighlighter ? 'Highlighter Stroke' : 'Ink Stroke'
            );
          } else {
            inkPointsRef.current = [];
          }
        }}
      >
        {/* SVG Ink / Highlighter strokes */}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {decorItems
            .filter((d) => d.payload.kind === 'ink' && d.payload.inkPaths?.length)
            .map((d) =>
              d.payload.inkPaths!.map((path, idx) => (
                <polyline
                  key={`${d.id}-${idx}`}
                  fill="none"
                  stroke={path.color}
                  strokeWidth={path.width}
                  strokeOpacity={path.highlighter ? 0.35 : 0.88}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={path.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}
                />
              ))
            )}
        </svg>

        {/* Anchored Stickers, Washi Tape, Sticky Notes & Rubber Stamps */}
        {decorItems
          .filter((d) => d.payload.kind !== 'ink')
          .map((item) => {
            const p = item.payload;
            const isSel = selectedId === item.id;
            return (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`${p.kind}: ${item.title}`}
                className={`dp-decor-item ${p.locked ? 'locked' : ''}`}
                style={{
                  left: `${p.relX * 100}%`,
                  top: `${p.relY * 100}%`,
                  transform: `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}deg)`,
                  opacity: p.opacity,
                  zIndex: p.zIndex,
                  outline: isSel ? '2px dashed var(--dp-accent)' : undefined,
                  borderRadius: 6,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(item.id);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(item.id);
                  if (p.locked) return;
                  draggingRef.current = {
                    id: item.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origRelX: p.relX,
                    origRelY: p.relY,
                  };
                }}
                onKeyDown={(e) => {
                  // Full keyboard alternative for moving/rotating stickers (Section 14.07 Accessibility)
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

      {/* Sticker Book, Washi, Stamps, Sticky Notes & Ink Palette Modal */}
      <ModalDialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Stationery Decor Studio (208 Built-In Stickers + Custom)" wide>
        <div className="dp-stack">
          {/* Washi Tape, Rubber Stamps, Sticky Notes & Ink Controls */}
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
              <strong style={{ fontSize: '0.84rem' }}><StickyNote size={13} /> Sticky Notes & Ink</strong>
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
                  Snap
                </label>
                <input type="color" aria-label="Ink color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} />
                <label className="dp-row" style={{ fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={inkHighlighter} onChange={(e) => setInkHighlighter(e.target.checked)} />
                  Hi-Lite
                </label>
              </div>
            </div>
          </div>

          {/* Search & 16 Categories + Favorites / Recents / Custom */}
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
