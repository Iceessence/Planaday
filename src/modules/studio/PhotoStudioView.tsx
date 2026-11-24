import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Heart,
  Image as ImageIcon,
  RotateCw,
  Sliders,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId, getBlobObjectUrl, storeBlob } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import type { LifeRecord } from '../../core/types';

interface PhotoVersion {
  id: string;
  label: string;
  blobHash: string;
  createdAt: string;
}

interface PhotoAssetPayload {
  originalBlobHash: string; // NEVER overwritten — non-destructive editing (§36.2)!
  album: string;
  caption: string;
  favorite: boolean;
  sizeBytes: number;
  editedVersions: PhotoVersion[];
}

export const PhotoStudioView: React.FC = () => {
  const { records, pushToast, setActiveView, setSelectedNoteId } = useApp();
  const photos = useMemo(
    () => records.filter((r) => r.type === 'photo_asset' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const [albumFilter, setAlbumFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activePhoto: LifeRecord | null = useMemo(
    () => photos.find((p) => p.id === selectedId) ?? photos[0] ?? null,
    [photos, selectedId]
  );
  const pPayload = activePhoto?.payload as PhotoAssetPayload | undefined;

  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [showOriginal, setShowOriginal] = useState(false);

  // Non-destructive Editor Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [blurPx, setBlurPx] = useState(0);
  const [filterPreset, setFilterPreset] = useState<'none' | 'grayscale' | 'sepia' | 'warm' | 'cool'>('none');
  const [rotateDeg, setRotateDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [cropInsetPct, setCropInsetPct] = useState(0);
  const [overlayText, setOverlayText] = useState('');
  const [overlaySticker, setOverlaySticker] = useState('');
  const [newAlbum, setNewAlbum] = useState('General');

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const albums = useMemo(
    () => ['All', 'Favorites', ...Array.from(new Set(photos.map((p) => (p.payload as PhotoAssetPayload).album || 'General')))],
    [photos]
  );

  const filteredPhotos = useMemo(
    () =>
      photos.filter((p) => {
        const pl = p.payload as PhotoAssetPayload;
        if (albumFilter === 'Favorites') return Boolean(pl.favorite);
        if (albumFilter !== 'All') return (pl.album || 'General') === albumFilter;
        return true;
      }),
    [photos, albumFilter]
  );

  // Hydrate photo URLs cleanly
  useEffect(() => {
    const hashes = new Set<string>();
    photos.forEach((p) => {
      const pl = p.payload as PhotoAssetPayload;
      if (pl.originalBlobHash) hashes.add(pl.originalBlobHash);
      (pl.editedVersions ?? []).forEach((v) => hashes.add(v.blobHash));
    });
    hashes.forEach((h) => {
      if (!blobUrls[h]) {
        void getBlobObjectUrl(h, false).then((url) => {
          if (url) setBlobUrls((prev) => ({ ...prev, [h]: url }));
        });
      }
    });
  }, [photos, blobUrls]);

  const resetAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setBlurPx(0);
    setFilterPreset('none');
    setRotateDeg(0);
    setFlipH(false);
    setFlipV(false);
    setCropInsetPct(0);
    setOverlayText('');
    setOverlaySticker('');
  };

  const ingestFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    let lastId: string | null = null;
    for (const file of arr) {
      const stored = await storeBlob(file, file.name);
      const rec = await createRecord<PhotoAssetPayload>('photo_asset', file.name.replace(/\.[^.]+$/, ''), {
        originalBlobHash: stored.hash,
        album: newAlbum.trim() || 'General',
        caption: '',
        favorite: false,
        sizeBytes: stored.size,
        editedVersions: [],
      });
      lastId = rec.id;
    }
    if (lastId) {
      setSelectedId(lastId);
      resetAdjustments();
    }
    pushToast(`Imported ${arr.length} photo(s) into deduplicated Photo Library`, { tone: 'ok' });
  };

  const cssFilter = useMemo(() => {
    if (showOriginal) return 'none';
    const parts = [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
    ];
    if (blurPx > 0) parts.push(`blur(${blurPx}px)`);
    if (filterPreset === 'grayscale') parts.push('grayscale(100%)');
    else if (filterPreset === 'sepia') parts.push('sepia(85%)');
    else if (filterPreset === 'warm') parts.push('sepia(30%) saturate(130%)');
    else if (filterPreset === 'cool') parts.push('hue-rotate(185deg) saturate(85%)');
    return parts.join(' ');
  }, [showOriginal, brightness, contrast, saturation, blurPx, filterPreset]);

  const handleSaveEditedCopy = async () => {
    if (!activePhoto || !pPayload) return;
    const srcUrl = blobUrls[pPayload.originalBlobHash];
    if (!srcUrl) return;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image load failed'));
        img.src = srcUrl;
      });
      const insetX = (img.naturalWidth * cropInsetPct) / 100;
      const insetY = (img.naturalHeight * cropInsetPct) / 100;
      const cw = Math.max(32, img.naturalWidth - insetX * 2);
      const ch = Math.max(32, img.naturalHeight - insetY * 2);
      const swapped = rotateDeg % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = swapped ? ch : cw;
      canvas.height = swapped ? cw : ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.filter = cssFilter;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, insetX, insetY, cw, ch, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();

      if (overlayText.trim()) {
        ctx.font = `bold ${Math.max(20, Math.round(canvas.width * 0.045))}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 4;
        ctx.strokeText(overlayText, 24, canvas.height - 28);
        ctx.fillText(overlayText, 24, canvas.height - 28);
      }
      if (overlaySticker.trim()) {
        ctx.font = `${Math.max(36, Math.round(canvas.width * 0.1))}px serif`;
        ctx.fillText(overlaySticker, canvas.width - 96, 86);
      }

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
      if (!blob) return;
      const stored = await storeBlob(blob, `${activePhoto.title}-edited.png`);
      const ver: PhotoVersion = {
        id: createId('pv'),
        label: `Edited Copy ${(pPayload.editedVersions?.length ?? 0) + 1}`,
        blobHash: stored.hash,
        createdAt: new Date().toISOString(),
      };
      await updateRecord<PhotoAssetPayload>(activePhoto.id, (c) => ({
        ...c,
        payload: {
          ...c.payload,
          editedVersions: [ver, ...(Array.isArray(c.payload.editedVersions) ? c.payload.editedVersions : [])],
        },
      }));
      pushToast('Saved non-destructive edited copy (original photo untouched!)', { tone: 'ok' });
    } catch {
      pushToast('Could not render edited copy in this environment.', { tone: 'warn' });
    }
  };

  const totalKb = Math.round(photos.reduce((s, p) => s + ((p.payload as PhotoAssetPayload).sizeBytes || 0), 0) / 1024);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) void ingestFiles(files);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void ingestFiles(e.dataTransfer.files);
      }}
    >
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Camera size={20} /> Camera, Photo Library & Non-Destructive Editor
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Capture or drop/paste images, organize into albums, edit non-destructively with Before/After preview, and reuse deduplicated photos everywhere.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="dp-badge">{photos.length} photos · {totalKb.toLocaleString()} KB</span>
          <input className="dp-input" placeholder="Import Album" value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} style={{ width: 115 }} />
          <button type="button" className="dp-btn dp-btn-primary" onClick={() => cameraInputRef.current?.click()}>
            <Camera size={14} /> Take Photo
          </button>
          <button type="button" className="dp-btn" onClick={() => uploadInputRef.current?.click()}>
            <Upload size={14} /> Import Photos
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => e.target.files && void ingestFiles(e.target.files)} />
          <input ref={uploadInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && void ingestFiles(e.target.files)} />
        </div>
      </div>

      {/* Album Filter Pills */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {albums.map((al) => (
          <button key={al} type="button" className={`dp-btn ${albumFilter === al ? 'dp-btn-primary' : ''}`} onClick={() => setAlbumFilter(al)}>
            {al}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 270px) 1fr', gap: '0.85rem' }}>
        {/* Photo Library Grid */}
        <div className="dp-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', alignContent: 'start', maxHeight: 580, overflowY: 'auto' }}>
          {filteredPhotos.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1.5rem' }} className="dp-muted">
              Drag & drop, paste (Ctrl+V), import, or capture a photo with your camera.
            </div>
          ) : (
            filteredPhotos.map((ph) => {
              const pl = ph.payload as PhotoAssetPayload;
              const url = blobUrls[pl.originalBlobHash];
              return (
                <div
                  key={ph.id}
                  onClick={() => { setSelectedId(ph.id); resetAdjustments(); }}
                  style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: ph.id === activePhoto?.id ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                    cursor: 'pointer',
                    background: 'var(--dp-paper-alt)',
                  }}
                >
                  {url ? (
                    <img src={url} alt={ph.title} style={{ width: '100%', height: 92, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={20} /></div>
                  )}
                  <div style={{ padding: '0.25rem 0.4rem', fontSize: '0.73rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pl.favorite ? '❤️ ' : ''}{ph.title}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Non-Destructive Editor & Metadata */}
        {activePhoto && pPayload ? (
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
              <input
                className="dp-input"
                value={activePhoto.title}
                onChange={(e) => void updateRecord(activePhoto.id, { title: e.target.value })}
                style={{ fontWeight: 700, flex: 1, minWidth: 160 }}
              />
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`dp-btn ${pPayload.favorite ? 'dp-btn-primary' : ''}`}
                  onClick={() => void updateRecord<PhotoAssetPayload>(activePhoto.id, (c) => ({ ...c, payload: { ...c.payload, favorite: !c.payload.favorite } }))}
                >
                  <Heart size={13} /> Fav
                </button>
                <button type="button" className={`dp-btn ${showOriginal ? 'dp-btn-primary' : ''}`} onClick={() => setShowOriginal((s) => !s)}>
                  {showOriginal ? 'Showing Original' : 'Before / After'}
                </button>
                <button type="button" className="dp-btn dp-btn-primary" onClick={() => void handleSaveEditedCopy()}>
                  <Copy size={13} /> Save Edited Copy
                </button>
                <button
                  type="button"
                  className="dp-btn"
                  onClick={async () => {
                    const note = await createRecord('note', `Photo Note: ${activePhoto.title}`, {
                      notebookId: 'nb_personal',
                      writtenForDate: new Date().toISOString().slice(0, 10),
                      content: `# ${activePhoto.title}\n\n${pPayload.caption || 'Attached from Planaday Photo Library.'}`,
                      citations: [],
                      attachmentBlobIds: [pPayload.editedVersions?.[0]?.blobHash ?? pPayload.originalBlobHash],
                      voiceMemoBlobIds: [],
                      touchedDates: [new Date().toISOString().slice(0, 10)],
                    });
                    setSelectedNoteId(note.id);
                    setActiveView('notes');
                    pushToast('Attached photo to a new Note (original remains safe in Photo Library)', { tone: 'ok' });
                  }}
                >
                  Attach to Note
                </button>
                <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activePhoto.id); setSelectedId(null); }} title="Move original photo to Trash">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Live Preview Stage */}
            <div style={{ position: 'relative', minHeight: 240, maxHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12141a', borderRadius: 8, overflow: 'hidden' }}>
              {blobUrls[pPayload.originalBlobHash] && (
                <img
                  src={blobUrls[pPayload.originalBlobHash]}
                  alt={activePhoto.title}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 320,
                    filter: cssFilter,
                    transform: showOriginal
                      ? 'none'
                      : `rotate(${rotateDeg}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    clipPath: showOriginal || cropInsetPct === 0 ? undefined : `inset(${cropInsetPct}%)`,
                    transition: 'transform 140ms ease',
                  }}
                />
              )}
              {!showOriginal && overlayText && (
                <div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontWeight: 700, fontSize: '1.15rem', textShadow: '0 2px 6px #000' }}>{overlayText}</div>
              )}
              {!showOriginal && overlaySticker && (
                <div style={{ position: 'absolute', top: 14, right: 18, fontSize: '2.2rem' }}>{overlaySticker}</div>
              )}
            </div>

            {/* Editor Sliders & Tools */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.5rem', fontSize: '0.76rem' }}>
              <label><Sliders size={11} /> Brightness ({brightness}%)<input type="range" min={30} max={200} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} style={{ width: '100%' }} /></label>
              <label>Contrast ({contrast}%)<input type="range" min={30} max={200} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} style={{ width: '100%' }} /></label>
              <label>Saturation ({saturation}%)<input type="range" min={0} max={220} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} style={{ width: '100%' }} /></label>
              <label>Blur ({blurPx}px)<input type="range" min={0} max={10} value={blurPx} onChange={(e) => setBlurPx(Number(e.target.value))} style={{ width: '100%' }} /></label>
              <label>Crop Inset ({cropInsetPct}%)<input type="range" min={0} max={35} value={cropInsetPct} onChange={(e) => setCropInsetPct(Number(e.target.value))} style={{ width: '100%' }} /></label>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="dp-select" value={filterPreset} onChange={(e) => setFilterPreset(e.target.value as typeof filterPreset)}>
                <option value="none">Filter: Natural</option>
                <option value="grayscale">Grayscale</option>
                <option value="sepia">Sepia</option>
                <option value="warm">Warm Film</option>
                <option value="cool">Cool Studio</option>
              </select>
              <button type="button" className="dp-btn" onClick={() => setRotateDeg((d) => (d + 90) % 360)}><RotateCw size={13} /> Rotate 90°</button>
              <button type="button" className={`dp-btn ${flipH ? 'dp-btn-primary' : ''}`} onClick={() => setFlipH((f) => !f)}><FlipHorizontal size={13} /> Flip H</button>
              <button type="button" className={`dp-btn ${flipV ? 'dp-btn-primary' : ''}`} onClick={() => setFlipV((f) => !f)}><FlipVertical size={13} /> Flip V</button>
              <input className="dp-input" placeholder="Text overlay..." value={overlayText} onChange={(e) => setOverlayText(e.target.value)} style={{ width: 140 }} />
              <input className="dp-input" placeholder="Sticker e.g. ⭐" value={overlaySticker} onChange={(e) => setOverlaySticker(e.target.value)} style={{ width: 95 }} />
              <button type="button" className="dp-btn" onClick={resetAdjustments}>Reset Edits</button>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <input
                className="dp-input"
                placeholder="Caption / description..."
                value={pPayload.caption ?? ''}
                onChange={(e) => void updateRecord<PhotoAssetPayload>(activePhoto.id, (c) => ({ ...c, payload: { ...c.payload, caption: e.target.value } }))}
                style={{ flex: 1 }}
              />
              <input
                className="dp-input"
                placeholder="Album"
                value={pPayload.album ?? 'General'}
                onChange={(e) => void updateRecord<PhotoAssetPayload>(activePhoto.id, (c) => ({ ...c, payload: { ...c.payload, album: e.target.value } }))}
                style={{ width: 130 }}
              />
            </div>

            {(pPayload.editedVersions ?? []).length > 0 && (
              <div>
                <strong style={{ fontSize: '0.8rem' }}>Saved Non-Destructive Copies ({pPayload.editedVersions.length})</strong>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {pPayload.editedVersions.map((ver) => (
                    <div key={ver.id} style={{ width: 96, border: '1px solid var(--dp-border)', borderRadius: 6, overflow: 'hidden', fontSize: '0.7rem', textAlign: 'center' }}>
                      {blobUrls[ver.blobHash] && <img src={blobUrls[ver.blobHash]} alt={ver.label} style={{ width: '100%', height: 64, objectFit: 'cover' }} />}
                      <div style={{ padding: 2 }}>{ver.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
            <p className="dp-muted">Import or capture a photo to open the non-destructive canvas editor.</p>
          </div>
        )}
      </div>
    </div>
  );
};
