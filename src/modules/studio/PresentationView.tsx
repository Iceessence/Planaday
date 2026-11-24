import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Code,
  Copy,
  Download,
  Image as ImageIcon,
  Layers,
  Lock,
  Play,
  Plus,
  Presentation,
  Printer,
  Sigma,
  Square,
  Table,
  Trash2,
  Type,
  Unlock,
  X,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId, getBlobObjectUrl, storeBlob } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { triggerBrowserDownload } from '../../core/backup';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import type { LifeRecord } from '../../core/types';

interface SlideElement {
  id: string;
  kind: 'text' | 'shape' | 'code' | 'equation' | 'table' | 'sticker' | 'image';
  x: number; // % 0..100
  y: number; // % 0..100
  w: number; // % 5..100
  h: number; // % 5..100
  content: string;
  bgColor?: string;
  textColor?: string;
  fontSize?: number;
  rotate?: number;
  opacity?: number;
  locked?: boolean;
  blobHash?: string;
}

interface SlideDef {
  id: string;
  title: string;
  background: string;
  transition: 'none' | 'fade' | 'slide' | 'zoom';
  speakerNotes: string;
  elements: SlideElement[];
}

interface PresentationPayload {
  theme: string;
  aspect: '16:9' | '4:3';
  slides: SlideDef[];
}

const SLIDE_THEMES: Record<string, { label: string; bg: string; fg: string; accent: string }> = {
  paper: { label: 'Classic Editorial Paper', bg: '#fbf8f1', fg: '#2b241d', accent: '#a97434' },
  slate: { label: 'Midnight Slate', bg: '#161b26', fg: '#f4f6fb', accent: '#5fa8d3' },
  botanical: { label: 'Botanical Sage', bg: '#eff5f0', fg: '#1f3327', accent: '#4f7a65' },
  navy: { label: 'Executive Navy', bg: '#102136', fg: '#f1f5f9', accent: '#e09f3e' },
  terracotta: { label: 'Warm Terracotta', bg: '#fdf4ef', fg: '#3b1f16', accent: '#c96f53' },
};

function createStarterPresentation(themeKey = 'paper'): PresentationPayload {
  const th = SLIDE_THEMES[themeKey] ?? SLIDE_THEMES.paper;
  return {
    theme: themeKey,
    aspect: '16:9',
    slides: [
      {
        id: createId('sl'),
        title: 'Title Slide',
        background: th.bg,
        transition: 'fade',
        speakerNotes: 'Welcome everyone. Outline key goals and milestones.',
        elements: [
          {
            id: createId('el'),
            kind: 'text',
            x: 8,
            y: 22,
            w: 84,
            h: 22,
            content: 'Planaday Presentation Title',
            textColor: th.fg,
            fontSize: 32,
          },
          {
            id: createId('el'),
            kind: 'text',
            x: 8,
            y: 50,
            w: 70,
            h: 16,
            content: 'Subtitle, Presenter Name & Date',
            textColor: th.accent,
            fontSize: 18,
          },
        ],
      },
      {
        id: createId('sl'),
        title: 'Key Takeaways',
        background: th.bg,
        transition: 'slide',
        speakerNotes: 'Highlight top 3 metrics and next actions.',
        elements: [
          {
            id: createId('el'),
            kind: 'text',
            x: 7,
            y: 10,
            w: 85,
            h: 14,
            content: 'Key Takeaways & Summary',
            textColor: th.fg,
            fontSize: 26,
          },
          {
            id: createId('el'),
            kind: 'text',
            x: 7,
            y: 28,
            w: 84,
            h: 54,
            content: '• Objective 1: Integrated workflow across Notes, Sheets & Lab\n• Objective 2: Visual slide design with live presenter timer\n• Objective 3: Offline-first local storage & sync',
            textColor: th.fg,
            fontSize: 16,
          },
        ],
      },
    ],
  };
}

export const PresentationView: React.FC = () => {
  const { records, pushToast } = useApp();
  const decks = useMemo(
    () =>
      records
        .filter((r) => r.type === 'presentation' && !r.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const activeDeck: LifeRecord | null = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? decks[0] ?? null,
    [decks, selectedDeckId]
  );
  const payload = activeDeck?.payload as PresentationPayload | undefined;

  const [slideIdx, setSlideIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presenterView, setPresenterView] = useState(true);
  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ elId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const slides = payload?.slides ?? [];
  const safeSlideIdx = Math.max(0, Math.min(slideIdx, Math.max(0, slides.length - 1)));
  const activeSlide = slides[safeSlideIdx] ?? null;
  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElId) ?? null;
  const themeDef = SLIDE_THEMES[payload?.theme ?? 'paper'] ?? SLIDE_THEMES.paper;

  useEffect(() => {
    if (!timerRunning) return;
    const t = window.setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [timerRunning]);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setSlideIdx((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setSlideIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') {
        setPresenting(false);
        setTimerRunning(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, slides.length]);

  // Hydrate image blobs used across slides
  useEffect(() => {
    const hashes = new Set<string>();
    slides.forEach((s) => s.elements.forEach((el) => el.blobHash && hashes.add(el.blobHash)));
    hashes.forEach((h) => {
      if (!blobUrls[h]) {
        void getBlobObjectUrl(h, false).then((url) => {
          if (url) setBlobUrls((prev) => ({ ...prev, [h]: url }));
        });
      }
    });
  }, [slides, blobUrls]);

  const mutateDeck = async (updater: (p: PresentationPayload) => PresentationPayload) => {
    if (!activeDeck) return;
    await updateRecord<PresentationPayload>(activeDeck.id, (cur) => ({ ...cur, payload: updater(cur.payload) }));
  };

  const mutateActiveSlide = async (updater: (s: SlideDef) => SlideDef) => {
    if (!activeSlide) return;
    await mutateDeck((p) => ({
      ...p,
      slides: p.slides.map((s) => (s.id === activeSlide.id ? updater(s) : s)),
    }));
  };

  const addElement = async (kind: SlideElement['kind'], extra?: Partial<SlideElement>) => {
    const el: SlideElement = {
      id: createId('el'),
      kind,
      x: 12,
      y: 26,
      w: kind === 'sticker' ? 14 : 46,
      h: kind === 'sticker' ? 18 : 22,
      content:
        kind === 'text'
          ? 'Double-click or edit in inspector'
          : kind === 'equation'
          ? 'E = mc²   |   C₁V₁ = C₂V₂'
          : kind === 'code'
          ? 'function planDay(tasks) {\n  return tasks.filter(t => !t.done);\n}'
          : kind === 'table'
          ? 'Metric,Target,Actual\nSpeed,100,112\nQuality,95%,98%'
          : kind === 'sticker'
          ? '🚀'
          : 'Callout Shape',
      bgColor: kind === 'shape' ? themeDef.accent : kind === 'code' ? '#1e2430' : kind === 'equation' ? 'rgba(59,110,165,0.12)' : undefined,
      textColor: kind === 'shape' || kind === 'code' ? '#ffffff' : themeDef.fg,
      fontSize: kind === 'sticker' ? 42 : kind === 'code' ? 13 : 18,
      opacity: 1,
      rotate: 0,
      ...extra,
    };
    await mutateActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }));
    setSelectedElId(el.id);
  };

  const updateElement = async (elId: string, patch: Partial<SlideElement>) => {
    await mutateActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === elId ? { ...el, ...patch } : el)),
    }));
  };

  const exportHtmlDeck = () => {
    if (!activeDeck || !payload) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(activeDeck.title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#111;color:#fff}section{width:100vw;height:100vh;position:relative;box-sizing:border-box;page-break-after:always;overflow:hidden}</style></head><body>
${payload.slides
  .map(
    (s) =>
      `<section style="background:${s.background}">${s.elements
        .map(
          (el) =>
            `<div style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;color:${el.textColor || '#222'};background:${el.bgColor || 'transparent'};font-size:${el.fontSize || 18}px;padding:8px;white-space:pre-wrap;border-radius:6px">${esc(el.content)}</div>`
        )
        .join('')}</section>`
  )
  .join('')}</body></html>`;
    triggerBrowserDownload(`${activeDeck.title}.html`, html, 'text/html');
    pushToast('Exported standalone HTML slideshow (also printable to PDF or importable to PowerPoint)', { tone: 'ok' });
  };

  const renderElementBody = (el: SlideElement) => {
    if (el.kind === 'image' && el.blobHash && blobUrls[el.blobHash]) {
      return <img src={blobUrls[el.blobHash]} alt={el.content} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />;
    }
    if (el.kind === 'table') {
      const rows = el.content.split(/\r?\n/).map((r) => r.split(','));
      return (
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: Math.max(10, (el.fontSize ?? 14) - 2) }}>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={{ border: '1px solid currentColor', padding: '2px 5px', fontWeight: ri === 0 ? 700 : 400 }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          fontFamily: el.kind === 'code' ? 'monospace' : el.kind === 'equation' ? 'serif' : 'inherit',
          display: el.kind === 'sticker' || el.kind === 'shape' ? 'flex' : 'block',
          alignItems: 'center',
          justifyContent: el.kind === 'sticker' || el.kind === 'shape' ? 'center' : 'flex-start',
        }}
      >
        {el.content}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Header */}
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Presentation size={20} /> Presentation Creator
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Interactive slides, custom themes, drag-and-drop canvas elements, speaker notes, full-screen presenter timer & Planaday content insertion.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dp-select" value={activeDeck?.id ?? ''} onChange={(e) => { setSelectedDeckId(e.target.value); setSlideIdx(0); }}>
            {decks.length === 0 && <option value="">No presentations yet</option>}
            {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={async () => {
              const rec = await createRecord('presentation', `Presentation ${decks.length + 1}`, createStarterPresentation('paper'));
              setSelectedDeckId(rec.id);
              setSlideIdx(0);
              pushToast('Created new presentation', { tone: 'ok' });
            }}
          >
            <Plus size={14} /> New Deck
          </button>
          {activeDeck && (
            <>
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={() => {
                  setPresenting(true);
                  setTimerSec(0);
                  setTimerRunning(true);
                }}
              >
                <Play size={14} /> Present
              </button>
              <button type="button" className="dp-btn" onClick={exportHtmlDeck}>
                <Download size={14} /> HTML Deck
              </button>
              <button type="button" className="dp-btn" onClick={() => window.print()}>
                <Printer size={14} /> Print / PDF
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  await softDeleteRecord(activeDeck.id);
                  setSelectedDeckId(null);
                  pushToast('Moved presentation to Trash', { tone: 'info' });
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {!activeDeck || !payload || !activeSlide ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Click "+ New Deck" above to start designing your first presentation.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 210px) 1fr minmax(230px, 270px)', gap: '0.8rem' }}>
          {/* Slide Filmstrip */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 620, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.84rem' }}>Slides ({slides.length})</strong>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  const ns: SlideDef = {
                    id: createId('sl'),
                    title: `Slide ${slides.length + 1}`,
                    background: themeDef.bg,
                    transition: 'fade',
                    speakerNotes: '',
                    elements: [
                      { id: createId('el'), kind: 'text', x: 8, y: 12, w: 84, h: 16, content: `Slide ${slides.length + 1} Heading`, textColor: themeDef.fg, fontSize: 26 },
                    ],
                  };
                  await mutateDeck((p) => ({ ...p, slides: [...p.slides, ns] }));
                  setSlideIdx(slides.length);
                }}
              >
                <Plus size={13} />
              </button>
            </div>
            {slides.map((s, idx) => (
              <div
                key={s.id}
                onClick={() => { setSlideIdx(idx); setSelectedElId(null); }}
                style={{
                  padding: '0.45rem',
                  borderRadius: 'var(--dp-radius)',
                  border: idx === safeSlideIdx ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                  background: s.background,
                  color: themeDef.fg,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ fontWeight: 700 }}>{idx + 1}. {s.title}</div>
                <div style={{ opacity: 0.7, fontSize: '0.7rem' }}>{s.elements.length} elements · {s.transition}</div>
                <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.3rem' }}>
                  <button
                    type="button"
                    className="dp-btn"
                    style={{ padding: '0.15rem 0.3rem' }}
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const copy = [...slides];
                      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                      void mutateDeck((p) => ({ ...p, slides: copy }));
                      setSlideIdx(idx - 1);
                    }}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    className="dp-btn"
                    style={{ padding: '0.15rem 0.3rem' }}
                    disabled={idx === slides.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      const copy = [...slides];
                      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                      void mutateDeck((p) => ({ ...p, slides: copy }));
                      setSlideIdx(idx + 1);
                    }}
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    type="button"
                    className="dp-btn"
                    style={{ padding: '0.15rem 0.3rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const dup: SlideDef = { ...JSON.parse(JSON.stringify(s)), id: createId('sl'), title: `${s.title} (Copy)` };
                      void mutateDeck((p) => ({ ...p, slides: [...p.slides.slice(0, idx + 1), dup, ...p.slides.slice(idx + 1)] }));
                    }}
                  >
                    <Copy size={11} />
                  </button>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      className="dp-btn"
                      style={{ padding: '0.15rem 0.3rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void mutateDeck((p) => ({ ...p, slides: p.slides.filter((x) => x.id !== s.id) }));
                        setSlideIdx(Math.max(0, idx - 1));
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Center Slide Canvas & Element Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div className="dp-card" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.5rem 0.7rem' }}>
              <button type="button" className="dp-btn" onClick={() => void addElement('text')}><Type size={13} /> Text</button>
              <button type="button" className="dp-btn" onClick={() => void addElement('shape')}><Square size={13} /> Shape</button>
              <button type="button" className="dp-btn" onClick={() => void addElement('table')}><Table size={13} /> Table</button>
              <button type="button" className="dp-btn" onClick={() => void addElement('equation')}><Sigma size={13} /> Equation</button>
              <button type="button" className="dp-btn" onClick={() => void addElement('code')}><Code size={13} /> Code</button>
              <button type="button" className="dp-btn" onClick={() => void addElement('sticker')}>✨ Sticker</button>
              <button type="button" className="dp-btn" onClick={() => imgInputRef.current?.click()}><ImageIcon size={13} /> Image</button>
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const blob = await storeBlob(f, f.name);
                  await addElement('image', { content: f.name, blobHash: blob.hash, w: 40, h: 40 });
                  e.target.value = '';
                }}
              />
              <select
                className="dp-select"
                defaultValue=""
                onChange={async (e) => {
                  const note = records.find((r) => r.id === e.target.value);
                  if (note) {
                    const txt = String((note.payload as { content?: string }).content ?? '').slice(0, 260);
                    await addElement('text', { content: `${note.title}\n\n${txt}`, w: 72, h: 42, fontSize: 15 });
                  }
                  e.target.value = '';
                }}
              >
                <option value="">+ Insert Note…</option>
                {records.filter((r) => r.type === 'note' && !r.deletedAt).slice(0, 25).map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
            </div>

            {/* Interactive Draggable Slide Canvas */}
            <div
              ref={canvasRef}
              onPointerMove={(e) => {
                if (!dragRef.current || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const dxPct = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
                const dyPct = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
                const nx = Math.max(0, Math.min(92, Math.round(dragRef.current.origX + dxPct)));
                const ny = Math.max(0, Math.min(92, Math.round(dragRef.current.origY + dyPct)));
                void updateElement(dragRef.current.elId, { x: nx, y: ny });
              }}
              onPointerUp={() => { dragRef.current = null; }}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: payload.aspect === '4:3' ? '4 / 3' : '16 / 9',
                background: activeSlide.background,
                border: '1px solid var(--dp-border)',
                borderRadius: 'var(--dp-radius)',
                overflow: 'hidden',
                boxShadow: '0 6px 22px rgba(0,0,0,0.08)',
              }}
            >
              {activeSlide.elements.map((el) => {
                const isSel = el.id === selectedElId;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedElId(el.id);
                      if (!el.locked) {
                        dragRef.current = { elId: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: `${el.x}%`,
                      top: `${el.y}%`,
                      width: `${el.w}%`,
                      height: `${el.h}%`,
                      background: el.bgColor || 'transparent',
                      color: el.textColor || themeDef.fg,
                      fontSize: el.fontSize ?? 18,
                      opacity: el.opacity ?? 1,
                      transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
                      border: isSel ? '2px dashed var(--dp-accent)' : '1px solid transparent',
                      borderRadius: 6,
                      padding: 6,
                      cursor: el.locked ? 'not-allowed' : 'move',
                      userSelect: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    {renderElementBody(el)}
                  </div>
                );
              })}
            </div>

            {/* Speaker Notes */}
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.82rem' }}>Speaker Notes (visible in Presenter View)</strong>
              <SafeTextarea
                recordKey={`slide-notes:${activeDeck.id}:${activeSlide.id}`}
                externalValue={activeSlide.speakerNotes}
                onCommit={(next) => void mutateActiveSlide((s) => ({ ...s, speakerNotes: next }))}
                className="dp-textarea"
                placeholder="Type talking points, cues, and timing notes..."
              />
            </div>
          </div>

          {/* Right Inspector Panel */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <h4 style={{ margin: 0 }}>Deck & Element Inspector</h4>
            <label style={{ fontSize: '0.76rem' }}>
              Presentation Title
              <input
                className="dp-input"
                value={activeDeck.title}
                onChange={(e) => void updateRecord(activeDeck.id, { title: e.target.value })}
              />
            </label>
            <label style={{ fontSize: '0.76rem' }}>
              Theme
              <select
                className="dp-select"
                value={payload.theme}
                onChange={(e) => {
                  const th = SLIDE_THEMES[e.target.value] ?? SLIDE_THEMES.paper;
                  void mutateDeck((p) => ({
                    ...p,
                    theme: e.target.value,
                    slides: p.slides.map((s) => ({ ...s, background: th.bg })),
                  }));
                }}
              >
                {Object.entries(SLIDE_THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem' }}>
                Aspect
                <select className="dp-select" value={payload.aspect} onChange={(e) => void mutateDeck((p) => ({ ...p, aspect: e.target.value as '16:9' | '4:3' }))}>
                  <option value="16:9">16:9 Wide</option>
                  <option value="4:3">4:3 Classic</option>
                </select>
              </label>
              <label style={{ fontSize: '0.75rem' }}>
                Transition
                <select
                  className="dp-select"
                  value={activeSlide.transition}
                  onChange={(e) => void mutateActiveSlide((s) => ({ ...s, transition: e.target.value as SlideDef['transition'] }))}
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option>
                </select>
              </label>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--dp-border)', margin: '0.2rem 0' }} />

            {selectedEl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.82rem' }}>Selected ({selectedEl.kind})</strong>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button type="button" className="dp-btn" onClick={() => void updateElement(selectedEl.id, { locked: !selectedEl.locked })}>
                      {selectedEl.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <button
                      type="button"
                      className="dp-btn"
                      onClick={() =>
                        void mutateActiveSlide((s) => ({
                          ...s,
                          elements: [...s.elements.filter((x) => x.id !== selectedEl.id), selectedEl],
                        }))
                      }
                      title="Bring to front"
                    >
                      <Layers size={12} />
                    </button>
                    <button
                      type="button"
                      className="dp-btn"
                      onClick={() => {
                        void mutateActiveSlide((s) => ({ ...s, elements: s.elements.filter((x) => x.id !== selectedEl.id) }));
                        setSelectedElId(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <textarea
                  className="dp-textarea"
                  rows={4}
                  value={selectedEl.content}
                  onChange={(e) => void updateElement(selectedEl.id, { content: e.target.value })}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.73rem' }}>W %<input className="dp-input" type="number" min={5} max={100} value={selectedEl.w} onChange={(e) => void updateElement(selectedEl.id, { w: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.73rem' }}>H %<input className="dp-input" type="number" min={5} max={100} value={selectedEl.h} onChange={(e) => void updateElement(selectedEl.id, { h: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.73rem' }}>Font px<input className="dp-input" type="number" min={10} max={72} value={selectedEl.fontSize ?? 18} onChange={(e) => void updateElement(selectedEl.id, { fontSize: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.73rem' }}>Rotate°<input className="dp-input" type="number" min={-180} max={180} value={selectedEl.rotate ?? 0} onChange={(e) => void updateElement(selectedEl.id, { rotate: Number(e.target.value) })} /></label>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.73rem' }}>Text <input type="color" value={selectedEl.textColor || '#222222'} onChange={(e) => void updateElement(selectedEl.id, { textColor: e.target.value })} /></label>
                  <label style={{ fontSize: '0.73rem' }}>Fill <input type="color" value={selectedEl.bgColor || '#ffffff'} onChange={(e) => void updateElement(selectedEl.id, { bgColor: e.target.value })} /></label>
                  <label style={{ fontSize: '0.73rem', flex: 1 }}>Opacity <input type="range" min={0.1} max={1} step={0.05} value={selectedEl.opacity ?? 1} onChange={(e) => void updateElement(selectedEl.id, { opacity: Number(e.target.value) })} style={{ width: '100%' }} /></label>
                </div>
              </div>
            ) : (
              <p className="dp-muted" style={{ fontSize: '0.78rem' }}>Click any slide element to edit text, size, colors, rotation, layering, or lock state. Drag elements directly on the canvas to reposition.</p>
            )}
          </div>
        </div>
      )}

      {/* Full-Screen Presentation & Presenter View Modal */}
      {presenting && activeSlide && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#0f1218',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <strong>{activeDeck?.title}</strong>
              <span className="dp-badge">Slide {safeSlideIdx + 1} / {slides.length}</span>
              <span className="dp-badge">⏱ {Math.floor(timerSec / 60).toString().padStart(2, '0')}:{(timerSec % 60).toString().padStart(2, '0')}</span>
              <button type="button" className="dp-btn" onClick={() => setTimerRunning((r) => !r)}>{timerRunning ? 'Pause Timer' : 'Resume Timer'}</button>
              <button type="button" className="dp-btn" onClick={() => setPresenterView((p) => !p)}>{presenterView ? 'Audience Fullscreen' : 'Show Presenter Notes'}</button>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" className="dp-btn" disabled={safeSlideIdx === 0} onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}><ArrowLeft size={14} /> Prev</button>
              <button type="button" className="dp-btn" disabled={safeSlideIdx >= slides.length - 1} onClick={() => setSlideIdx((i) => Math.min(slides.length - 1, i + 1))}>Next <ArrowRight size={14} /></button>
              <button type="button" className="dp-btn" onClick={() => { setPresenting(false); setTimerRunning(false); }}><X size={14} /> Exit</button>
            </div>
          </div>

          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: presenterView ? '2fr 1fr' : '1fr', gap: '1rem', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 1080,
                  aspectRatio: payload?.aspect === '4:3' ? '4 / 3' : '16 / 9',
                  background: activeSlide.background,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {activeSlide.elements.map((el) => (
                  <div
                    key={el.id}
                    style={{
                      position: 'absolute',
                      left: `${el.x}%`,
                      top: `${el.y}%`,
                      width: `${el.w}%`,
                      height: `${el.h}%`,
                      background: el.bgColor || 'transparent',
                      color: el.textColor || themeDef.fg,
                      fontSize: el.fontSize ?? 18,
                      opacity: el.opacity ?? 1,
                      transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
                      padding: 8,
                      borderRadius: 6,
                      boxSizing: 'border-box',
                    }}
                  >
                    {renderElementBody(el)}
                  </div>
                ))}
              </div>
            </div>

            {presenterView && (
              <div style={{ background: '#1a202c', borderRadius: 10, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ margin: 0 }}>Speaker Notes</h4>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, opacity: 0.92 }}>
                  {activeSlide.speakerNotes || 'No speaker notes on this slide.'}
                </div>
                {slides[safeSlideIdx + 1] && (
                  <div style={{ marginTop: 'auto', padding: '0.6rem', background: '#111620', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Up Next:</div>
                    <strong>{slides[safeSlideIdx + 1].title}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
