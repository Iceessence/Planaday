import { scopeKey, withScopedRecords } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Plus,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, updateRecord } from '../../core/repository';
import { DecorCanvasOverlay } from '../../components/Decor/DecorCanvas';
import { SafeInput, SafeTextarea } from '../../components/Common/SafeTextEditor';
import type { CalendarEventPayload, ChorePayload, LifeRecord, TaskPayload } from '../../core/types';

export type PlannerPageTemplate =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'annual'
  | 'contacts'
  | 'goals_resolutions'
  | 'us_map'
  | 'travel'
  | 'finance'
  | 'habit_grid'
  | 'project'
  | 'lined'
  | 'blank';

export interface PlannerNavTab {
  id: string;
  label: string;
  emoji?: string;
  color: string;
  rounded: boolean;
  showText: boolean;
  targetPageIndex: number;
  placement: 'side' | 'top';
}

export interface PlannerPageDef {
  id: string;
  title: string;
  template: PlannerPageTemplate;
  paperColor: string;
  paperPattern: 'blank' | 'lined' | 'dot' | 'grid';
  lineSpacingPx: number;
  lineColor: string;
  daysOnPage: number;
  syncLiveData: boolean;
  dateIso?: string;
  typedText: string;
  visitedStates?: string[];
  sections?: Record<string, string>;
}

export interface PlannerBookPayload {
  subtitle: string;
  orientation: 'portrait' | 'landscape';
  frontCoverColor: string;
  backCoverColor: string;
  coverPattern: 'solid' | 'leather' | 'linen' | 'dots' | 'stripes';
  coverBorder: 'gold' | 'double' | 'none';
  bindingStyle: 'spiral' | 'rings' | 'book' | 'none';
  bindingColor: string;
  ringCount: number;
  bindingWidthPx: number;
  pages: PlannerPageDef[];
  tabs: PlannerNavTab[];
}

/**
 * Pure helper (Section 15.6 & 15.7): Visually moves side tabs and top bookmarks
 * between the Left side (earlier pages) and Right side (current & upcoming pages)
 * as the user turns pages!
 */
export function partitionTabsByPage(
  tabs: PlannerNavTab[],
  currentPageIdx: number,
  placement: 'side' | 'top'
): { left: PlannerNavTab[]; right: PlannerNavTab[] } {
  const filtered = tabs.filter((t) => t.placement === placement);
  return {
    left: filtered.filter((t) => t.targetPageIndex < currentPageIdx),
    right: filtered.filter((t) => t.targetPageIndex >= currentPageIdx),
  };
}

const US_STATES_GRID: Array<[string, number, number]> = [
  ['AK', 0, 0], ['ME', 10, 0],
  ['WA', 1, 1], ['MT', 2, 1], ['ND', 3, 1], ['MN', 4, 1], ['WI', 5, 1], ['MI', 6, 1], ['VT', 9, 1], ['NH', 10, 1],
  ['OR', 1, 2], ['ID', 2, 2], ['WY', 3, 2], ['SD', 4, 2], ['IA', 5, 2], ['IL', 6, 2], ['IN', 7, 2], ['OH', 8, 2], ['PA', 9, 2], ['NY', 10, 2], ['MA', 11, 2],
  ['CA', 1, 3], ['NV', 2, 3], ['UT', 3, 3], ['CO', 4, 3], ['NE', 5, 3], ['MO', 6, 3], ['KY', 7, 3], ['WV', 8, 3], ['VA', 9, 3], ['MD', 10, 3], ['NJ', 11, 3], ['CT', 11, 1], ['RI', 11, 0],
  ['AZ', 2, 4], ['NM', 3, 4], ['KS', 4, 4], ['AR', 5, 4], ['TN', 6, 4], ['NC', 7, 4], ['SC', 8, 4], ['DE', 10, 4],
  ['HI', 0, 5], ['OK', 4, 5], ['LA', 5, 5], ['MS', 6, 5], ['AL', 7, 5], ['GA', 8, 5],
  ['TX', 4, 6], ['FL', 8, 6],
];

const PAGE_TEMPLATES: Array<{ id: PlannerPageTemplate; label: string }> = [
  { id: 'daily', label: 'Daily Planning Page' },
  { id: 'weekly', label: 'Weekly Overview Spread' },
  { id: 'monthly', label: 'Monthly Calendar' },
  { id: 'annual', label: 'Annual Calendar' },
  { id: 'goals_resolutions', label: "Top Goals & New Year's Resolutions" },
  { id: 'contacts', label: 'Contacts & Address Book' },
  { id: 'us_map', label: 'Interactive US Travel Map' },
  { id: 'travel', label: 'Travel Planning Page' },
  { id: 'finance', label: 'Financial Planning Page' },
  { id: 'habit_grid', label: 'Habit Tracker Grid' },
  { id: 'project', label: 'Project Planning Page' },
  { id: 'lined', label: 'Lined Notebook Page' },
  { id: 'blank', label: 'Completely Blank Canvas' },
];

function createDefaultBookPayload(todayIso: string): PlannerBookPayload {
  return {
    subtitle: `Handcrafted Personal Edition · ${todayIso.slice(0, 4)}`,
    orientation: 'landscape',
    frontCoverColor: '#4c3828',
    backCoverColor: '#3b2b1e',
    coverPattern: 'leather',
    coverBorder: 'gold',
    bindingStyle: 'rings',
    bindingColor: '#c7a25a',
    ringCount: 6,
    bindingWidthPx: 28,
    pages: [
      { id: 'pg_daily', title: `Daily Plan — ${todayIso}`, template: 'daily', paperColor: '#fcf9f2', paperPattern: 'dot', lineSpacingPx: 26, lineColor: '#d9d0c1', daysOnPage: 1, syncLiveData: true, dateIso: todayIso, typedText: '' },
      { id: 'pg_weekly', title: 'Weekly Overview', template: 'weekly', paperColor: '#fcf9f2', paperPattern: 'lined', lineSpacingPx: 26, lineColor: '#d9d0c1', daysOnPage: 7, syncLiveData: true, typedText: '' },
      { id: 'pg_monthly', title: 'Monthly Calendar', template: 'monthly', paperColor: '#fcf9f2', paperPattern: 'grid', lineSpacingPx: 24, lineColor: '#d9d0c1', daysOnPage: 30, syncLiveData: true, typedText: '' },
      { id: 'pg_goals', title: "Top Goals & New Year's Resolutions", template: 'goals_resolutions', paperColor: '#fdfaf3', paperPattern: 'lined', lineSpacingPx: 28, lineColor: '#dfd4c0', daysOnPage: 1, syncLiveData: false, typedText: '' },
      { id: 'pg_map', title: 'United States Travel Map', template: 'us_map', paperColor: '#fcf9f2', paperPattern: 'blank', lineSpacingPx: 24, lineColor: '#d9d0c1', daysOnPage: 1, syncLiveData: false, typedText: 'Click states to mark visited places!', visitedStates: [] },
      { id: 'pg_contacts', title: 'Contacts & Personal Reference', template: 'contacts', paperColor: '#fcf9f2', paperPattern: 'lined', lineSpacingPx: 26, lineColor: '#d9d0c1', daysOnPage: 1, syncLiveData: false, typedText: '' },
    ],
    tabs: [
      { id: 'tb_day', label: 'Daily', emoji: '☀️', color: '#a97434', rounded: true, showText: true, targetPageIndex: 0, placement: 'side' },
      { id: 'tb_wk', label: 'Week', emoji: '📅', color: '#4f7a65', rounded: true, showText: true, targetPageIndex: 1, placement: 'side' },
      { id: 'tb_mo', label: 'Month', emoji: '🗓️', color: '#3b6ea5', rounded: true, showText: true, targetPageIndex: 2, placement: 'side' },
      { id: 'tb_goals', label: 'Goals', emoji: '🎯', color: '#b5453a', rounded: true, showText: true, targetPageIndex: 3, placement: 'side' },
      { id: 'tb_map', label: 'US Map', emoji: '🗺️', color: '#6b5ca5', rounded: true, showText: true, targetPageIndex: 4, placement: 'side' },
      { id: 'bm_today', label: 'Today', emoji: '🔖', color: '#c96f53', rounded: true, showText: true, targetPageIndex: 0, placement: 'top' },
      { id: 'bm_ref', label: 'Contacts', emoji: '📇', color: '#2f7a78', rounded: false, showText: true, targetPageIndex: 5, placement: 'top' },
    ],
  };
}

/**
 * Dedicated Customizable Physical-Style Digital Planner (Section 15.1–15.8):
 * Front/Back Covers, Spiral/Ring/Book/None Binding, Dynamic Left/Right Side Tabs & Top Bookmarks,
 * Unlimited Page Designer, Special Pages (US Map, Calendars, Contacts, Habits, Blank), Ink, Stickers & Optional Live Sync.
 */
export const DigitalPlannerView: React.FC = () => {
  const { settings, records, activeDate, logicalToday, pushToast } = useApp();
  const [viewSurface, setViewSurface] = useState<'front_cover' | 'pages' | 'back_cover'>('pages');
  const [spreadMode, setSpreadMode] = useState<'single' | 'spread'>('spread');
  const [pageIdx, setPageIdx] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [designerOpen, setDesignerOpen] = useState(false);

  // Add page / tab inputs
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageTpl, setNewPageTpl] = useState<PlannerPageTemplate>('daily');
  const [newTabLabel, setNewTabLabel] = useState('');
  const [newTabEmoji, setNewTabEmoji] = useState('🔖');
  const [newTabColor, setNewTabColor] = useState('#a97434');
  const [newTabPlacement, setNewTabPlacement] = useState<'side' | 'top'>('side');
  const [newTabTarget, setNewTabTarget] = useState(0);

  const books = useMemo(
    () => records.filter((r) => r.type === 'planner_book') as Array<LifeRecord<PlannerBookPayload>>,
    [records]
  );

  const activeBook = books[0] ?? null;
  const defaultBook = useMemo(() => createDefaultBookPayload(logicalToday), [logicalToday]);
  const bookPayload: PlannerBookPayload = activeBook?.payload ?? defaultBook;

  const saveBook = async (updater: (cur: PlannerBookPayload) => PlannerBookPayload, propagateError = false) => {
    try { await withScopedRecords(settings, 'planner_book', async fresh => {
      const current = activeBook ? fresh.find(b => b.id === activeBook.id) : fresh[0];
      if (current) await updateRecord<PlannerBookPayload>(current.id, c => ({ ...c, payload: updater(c.payload) }), { skipUndo: true });
      else if (!activeBook) await createRecord<PlannerBookPayload>('planner_book', `${settings.plannerTitle} Physical Planner`, updater(defaultBook), { workspaceId: settings.activeWorkspaceId, ownerProfileId: settings.activeProfileId === 'all' ? null : settings.activeProfileId });
      else throw new Error('Planner no longer exists.');
    }); } catch (error) { pushToast(error instanceof Error ? error.message : 'Planner save failed', { tone: 'warn' }); if (propagateError) throw error; }
  };

  const pages = bookPayload.pages;
  const safeIdx = Math.max(0, Math.min(pageIdx, Math.max(0, pages.length - 1)));
  const visiblePages = spreadMode === 'spread' ? [pages[safeIdx], pages[safeIdx + 1]].filter(Boolean) : [pages[safeIdx]].filter(Boolean);

  const sideTabs = useMemo(() => partitionTabsByPage(bookPayload.tabs, safeIdx, 'side'), [bookPayload.tabs, safeIdx]);
  const topBookmarks = useMemo(() => partitionTabsByPage(bookPayload.tabs, safeIdx, 'top'), [bookPayload.tabs, safeIdx]);

  // Live data for pages where syncLiveData === true
  const liveEvents = useMemo(
    () => (records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>).filter((e) => e.payload.startDate === activeDate),
    [records, activeDate]
  );
  const liveTasks = useMemo(
    () => (records.filter((r) => r.type === 'task' && r.status === 'active') as Array<LifeRecord<TaskPayload>>).slice(0, 8),
    [records]
  );
  const liveChores = useMemo(
    () => (records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<LifeRecord<ChorePayload>>).slice(0, 5),
    [records]
  );

  const updatePage = (id: string, patch: Partial<PlannerPageDef>, propagateError = false) => saveBook((b) => ({ ...b, pages: b.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), propagateError);

  const renderPaperBg = (pg: PlannerPageDef): React.CSSProperties => {
    const sp = Math.max(14, pg.lineSpacingPx || 26);
    const lc = pg.lineColor || '#d9d0c1';
    if (pg.paperPattern === 'lined') {
      return { backgroundColor: pg.paperColor, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${sp - 1}px, ${lc} ${sp - 1}px ${sp}px)` };
    }
    if (pg.paperPattern === 'grid') {
      return {
        backgroundColor: pg.paperColor,
        backgroundImage: `linear-gradient(to right, ${lc} 1px, transparent 1px), linear-gradient(to bottom, ${lc} 1px, transparent 1px)`,
        backgroundSize: `${sp}px ${sp}px`,
      };
    }
    if (pg.paperPattern === 'dot') {
      return {
        backgroundColor: pg.paperColor,
        backgroundImage: `radial-gradient(${lc} 1.2px, transparent 1.2px)`,
        backgroundSize: `${sp}px ${sp}px`,
      };
    }
    return { backgroundColor: pg.paperColor };
  };

  const renderPageInterior = (pg: PlannerPageDef, idx: number) => (
    <div
      key={pg.id}
      style={{
        ...renderPaperBg(pg),
        position: 'relative',
        minHeight: bookPayload.orientation === 'portrait' ? 540 : 420,
        padding: 18,
        borderRadius: 8,
        border: '1px solid var(--dp-border)',
        boxShadow: 'inset 0 0 18px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Full Handwriting Ink, Highlighter, Shapes & Sticker Layer on EVERY Planner Page */}
      <DecorCanvasOverlay spreadKey={`digiplanner:${activeBook?.id ?? 'default'}:${pg.id}`} />

      <div className="dp-between" style={{ paddingInlineEnd: 110, flexWrap: 'wrap', gap: 6 }}>
        <SafeInput
          recordKey={`digipg:${scopeKey(settings)}:${pg.id}:title`}
          className="dp-input"
          style={{ fontWeight: 700, fontSize: '1.02rem', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--dp-border)', borderRadius: 0, padding: '2px 4px', flex: 1 }}
          externalValue={pg.title}
          onCommit={val => updatePage(pg.id, { title: val }, true)}
          aria-label="Planner page title"
        />
        <span className="dp-pill" style={{ fontSize: '0.7rem' }}>p.{idx + 1} · {pg.template.replace('_', ' ')}</span>
      </div>

      {/* Per-page mini controls (Paper Pattern, Live Sync toggle, Duplicate, Delete) */}
      <div className="dp-row dp-no-print" style={{ gap: 6, flexWrap: 'wrap', fontSize: '0.74rem' }}>
        <select
          aria-label="Page pattern"
          className="dp-select"
          style={{ width: 'auto', padding: '1px 5px', fontSize: '0.74rem' }}
          value={pg.paperPattern}
          onChange={(e) => updatePage(pg.id, { paperPattern: e.target.value as PlannerPageDef['paperPattern'] })}
        >
          <option value="dot">Dot Grid</option>
          <option value="lined">Lined</option>
          <option value="grid">Graph Grid</option>
          <option value="blank">Blank</option>
        </select>
        <input
          type="color"
          aria-label="Page paper color"
          value={pg.paperColor}
          onChange={(e) => updatePage(pg.id, { paperColor: e.target.value })}
          style={{ width: 20, height: 20, border: 'none', padding: 0 }}
        />
        <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={pg.syncLiveData}
            onChange={(e) => updatePage(pg.id, { syncLiveData: e.target.checked })}
          />
          <span>Sync Live Data</span>
        </label>
        <button
          type="button"
          className="dp-btn dp-btn-ghost dp-btn-sm"
          style={{ padding: '4px 8px', fontSize: '0.74rem', minHeight: 28 }}
          onClick={() => {
            void saveBook((b) => ({
              ...b,
              pages: [...b.pages.slice(0, idx + 1), { ...pg, id: createId('pg'), title: `${pg.title} (Copy)` }, ...b.pages.slice(idx + 1)],
            }));
            pushToast('Duplicated planner page!');
          }}
        >
          <Copy size={12} /> Duplicate
        </button>
        {pages.length > 1 && (
          <button
            type="button"
            className="dp-btn dp-btn-ghost dp-btn-sm"
            aria-label={`Delete page ${pg.title}`}
            title={`Delete page ${pg.title}`}
            style={{ padding: '4px 8px', fontSize: '0.74rem', minHeight: 28, minWidth: 28, color: 'var(--dp-danger)' }}
            onClick={() => {
              void saveBook((b) => {
                const removed = b.pages.findIndex(x => x.id === pg.id);
                if (removed < 0 || b.pages.length <= 1) return b;
                const pages = b.pages.filter(x => x.id !== pg.id);
                return { ...b, pages, tabs: b.tabs.map(t => ({ ...t, targetPageIndex: Math.max(0, Math.min(pages.length - 1, t.targetPageIndex > removed ? t.targetPageIndex - 1 : t.targetPageIndex)) })) };
              }).catch(error => pushToast(String(error), { tone: 'warn' }));
              setPageIdx((i) => Math.max(0, i - 1));
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Special Page Content */}
      {pg.template === 'us_map' ? (
        <div className="dp-stack" style={{ gap: 6 }}>
          <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
            Visited States: <strong>{(pg.visitedStates ?? []).length} / 50</strong> — click any state tile to toggle visited!
          </div>
          <svg viewBox="0 0 365 215" style={{ width: '100%', maxHeight: 240 }}>
            {US_STATES_GRID.map(([code, col, row]) => {
              const visited = (pg.visitedStates ?? []).includes(code);
              return (
                <g
                  key={code}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const cur = pg.visitedStates ?? [];
                    const next = visited ? cur.filter((x) => x !== code) : [...cur, code];
                    updatePage(pg.id, { visitedStates: next });
                  }}
                >
                  <rect x={col * 30 + 4} y={row * 30 + 4} width={26} height={26} rx={4} fill={visited ? '#4f7a65' : '#e9e1d2'} stroke="#8b7d6b" />
                  <text x={col * 30 + 17} y={row * 30 + 21} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={visited ? '#fff' : '#3a3025'}>
                    {code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : pg.template === 'monthly' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: '0.72rem' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontWeight: 700 }}>{d}</div>)}
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} style={{ minHeight: 38, border: '1px solid var(--dp-border)', borderRadius: 4, padding: 3 }}>
              <span className="dp-muted">{i < 31 ? i + 1 : ''}</span>
            </div>
          ))}
        </div>
      ) : pg.template === 'habit_grid' ? (
        <div className="dp-stack" style={{ gap: 4, fontSize: '0.76rem' }}>
          {['Hydration', 'Exercise', 'Reading', 'Sleep 8h', 'Mindfulness'].map((h) => (
            <div key={h} className="dp-between" style={{ padding: '4px 6px', borderBottom: '1px dashed var(--dp-border)' }}>
              <strong>{h}</strong>
              <div className="dp-row" style={{ gap: 3 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, di) => (
                  <span key={di} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--dp-border)', display: 'grid', placeItems: 'center', fontSize: '0.66rem' }}>{d}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Optional Live Planaday Data Overlay (when user turns on syncLiveData!) */}
      {pg.syncLiveData && (pg.template === 'daily' || pg.template === 'weekly') && (
        <div className="dp-grid-2" style={{ gap: 8, fontSize: '0.78rem', padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.45)', border: '1px dashed var(--dp-border)' }}>
          <div>
            <strong>📅 Events ({liveEvents.length})</strong>
            {liveEvents.slice(0, 4).map((e) => <div key={e.id}>{e.payload.startTime || 'All day'} · {e.title}</div>)}
          </div>
          <div>
            <strong>✅ Tasks ({liveTasks.length}) &amp; 🧹 Chores ({liveChores.length})</strong>
            {liveTasks.slice(0, 4).map((t) => <div key={t.id}>☐ {t.title}</div>)}
          </div>
        </div>
      )}

      {/* Freeform Handwritten / Typed Area */}
      <SafeTextarea
        recordKey={`digipg:${scopeKey(settings)}:${pg.id}:body`}
        externalValue={pg.typedText ?? ''}
        onCommit={(val) => updatePage(pg.id, { typedText: val }, true)}
        className="dp-textarea"
        style={{ flex: 1, minHeight: 160, background: 'transparent', border: 'none', lineHeight: `${pg.lineSpacingPx || 26}px` }}
        placeholder="Type directly onto the stationery page, or click Ink / Decor above to handwrite, highlight, draw shapes, and place stickers…"
      />
    </div>
  );

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 14 }}>
      {/* Header Toolbar */}
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2>
            <BookOpen size={20} style={{ verticalAlign: '-3px' }} /> Physical-Style Digital Planner
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Customizable covers, spiral/ring/book binding, dynamic left/right side tabs &amp; top bookmarks, unlimited pages, ink &amp; optional live data sync.
          </p>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className={`dp-btn dp-btn-sm ${viewSurface === 'front_cover' ? 'dp-btn-primary' : ''}`} onClick={() => setViewSurface('front_cover')}>Front Cover</button>
          <button type="button" className={`dp-btn dp-btn-sm ${viewSurface === 'pages' ? 'dp-btn-primary' : ''}`} onClick={() => setViewSurface('pages')}>Pages ({pages.length})</button>
          <button type="button" className={`dp-btn dp-btn-sm ${viewSurface === 'back_cover' ? 'dp-btn-primary' : ''}`} onClick={() => setViewSurface('back_cover')}>Back Cover</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setSpreadMode((m) => (m === 'spread' ? 'single' : 'spread'))}>
            <Layers size={13} /> {spreadMode === 'spread' ? '2-Page Spread' : 'Single Page'}
          </button>
          <button type="button" className="dp-btn dp-btn-sm" aria-label="Zoom out planner" title="Zoom out planner" onClick={() => setZoomPct((z) => Math.max(60, z - 15))}><ZoomOut size={13} /></button>
          <span className="dp-pill">{zoomPct}%</span>
          <button type="button" className="dp-btn dp-btn-sm" aria-label="Zoom in planner" title="Zoom in planner" onClick={() => setZoomPct((z) => Math.min(180, z + 15))}><ZoomIn size={13} /></button>
          <button type="button" className={`dp-btn dp-btn-sm ${designerOpen ? 'dp-btn-primary' : ''}`} onClick={() => setDesignerOpen((v) => !v)}>
            <Settings2 size={13} /> Customize Book, Tabs &amp; Pages
          </button>
        </div>
      </div>

      {/* Book, Cover, Binding, Side Tabs, Bookmarks & Page Designer Drawer */}
      {designerOpen && (
        <div className="dp-card dp-stack" style={{ padding: 14, gap: 12, background: 'var(--dp-surface-2)', fontSize: '0.82rem' }}>
          <div className="dp-grid-3" style={{ gap: 10 }}>
            <div className="dp-stack" style={{ gap: 6 }}>
              <strong>Cover &amp; Orientation</strong>
              <SafeInput recordKey={`digibook:${scopeKey(settings)}:subtitle`} className="dp-input" externalValue={bookPayload.subtitle} onCommit={value => saveBook(b => ({ ...b, subtitle: value }), true)} placeholder="Cover subtitle…" />
              <div className="dp-row" style={{ gap: 6 }}>
                <label className="dp-row" style={{ gap: 4 }}>Front <input type="color" value={bookPayload.frontCoverColor} onChange={(e) => { const value = e.target.value; void saveBook(b => ({ ...b, frontCoverColor: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }} /></label>
                <label className="dp-row" style={{ gap: 4 }}>Back <input type="color" value={bookPayload.backCoverColor} onChange={(e) => { const value = e.target.value; void saveBook(b => ({ ...b, backCoverColor: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }} /></label>
                <select className="dp-select" style={{ width: 'auto' }} value={bookPayload.orientation} onChange={(e) => { const value = e.target.value as 'portrait' | 'landscape'; void saveBook(b => ({ ...b, orientation: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }}>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
              <select className="dp-select" value={bookPayload.coverPattern} onChange={(e) => { const value = e.target.value as PlannerBookPayload['coverPattern']; void saveBook(b => ({ ...b, coverPattern: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }}>
                <option value="leather">Texture: Classic Leather</option>
                <option value="linen">Texture: Woven Linen</option>
                <option value="dots">Pattern: Polka Dots</option>
                <option value="stripes">Pattern: Stationery Stripes</option>
                <option value="solid">Solid Matte</option>
              </select>
            </div>

            <div className="dp-stack" style={{ gap: 6 }}>
              <strong>Center Binding</strong>
              <select className="dp-select" value={bookPayload.bindingStyle} onChange={(e) => { const value = e.target.value as PlannerBookPayload['bindingStyle']; void saveBook(b => ({ ...b, bindingStyle: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }}>
                <option value="rings">Ring Binder</option>
                <option value="spiral">Spiral Wire Coil</option>
                <option value="book">Traditional Book Spine</option>
                <option value="none">Binding-Free</option>
              </select>
              <div className="dp-row" style={{ gap: 8 }}>
                <label className="dp-row" style={{ gap: 4 }}>Color <input type="color" value={bookPayload.bindingColor} onChange={(e) => { const value = e.target.value; void saveBook(b => ({ ...b, bindingColor: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }} /></label>
                <label className="dp-row" style={{ gap: 4 }}>Rings <input type="number" min={2} max={24} className="dp-input" style={{ width: 60 }} value={bookPayload.ringCount} onChange={(e) => { const value = Math.max(2, Math.min(24, Number(e.target.value) || 6)); void saveBook(b => ({ ...b, ringCount: value })).catch(error => pushToast(String(error), { tone: 'warn' })); }} /></label>
              </div>
            </div>

            <div className="dp-stack" style={{ gap: 6 }}>
              <strong>Add Special / Custom Page</strong>
              <input className="dp-input" placeholder="Page title…" value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} />
              <div className="dp-row" style={{ gap: 6 }}>
                <select className="dp-select" style={{ flex: 1 }} value={newPageTpl} onChange={(e) => setNewPageTpl(e.target.value as PlannerPageTemplate)}>
                  {PAGE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => {
                    const tplLabel = PAGE_TEMPLATES.find((x) => x.id === newPageTpl)?.label ?? 'Page';
                    const newPg: PlannerPageDef = {
                      id: createId('pg'),
                      title: newPageTitle.trim() || tplLabel,
                      template: newPageTpl,
                      paperColor: '#fcf9f2',
                      paperPattern: newPageTpl === 'blank' ? 'blank' : newPageTpl === 'lined' ? 'lined' : 'dot',
                      lineSpacingPx: 26,
                      lineColor: '#d9d0c1',
                      daysOnPage: 1,
                      syncLiveData: newPageTpl === 'daily' || newPageTpl === 'weekly',
                      typedText: '',
                      visitedStates: [],
                    };
                    void saveBook((b) => ({ ...b, pages: [...b.pages, newPg] }));
                    setPageIdx(pages.length);
                    setViewSurface('pages');
                    setNewPageTitle('');
                    pushToast(`Added "${newPg.title}"!`);
                  }}
                >
                  <Plus size={13} /> Add Page
                </button>
              </div>
            </div>
          </div>

          {/* Add Unlimited Side Tabs & Top Bookmarks */}
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, borderTop: '1px dashed var(--dp-border)', paddingTop: 8 }}>
            <strong><Bookmark size={13} /> Add Tab / Bookmark:</strong>
            <input className="dp-input" style={{ width: 42 }} value={newTabEmoji} onChange={(e) => setNewTabEmoji(e.target.value)} aria-label="Tab icon" />
            <input className="dp-input" style={{ width: 140 }} placeholder="Label (e.g., Jan, Q2, Lab)…" value={newTabLabel} onChange={(e) => setNewTabLabel(e.target.value)} />
            <select className="dp-select" style={{ width: 'auto' }} value={newTabPlacement} onChange={(e) => setNewTabPlacement(e.target.value as 'side' | 'top')}>
              <option value="side">Side Tab</option>
              <option value="top">Top Bookmark</option>
            </select>
            <select className="dp-select" style={{ width: 'auto' }} value={newTabTarget} onChange={(e) => setNewTabTarget(Number(e.target.value))}>
              {pages.map((p, idx) => <option key={p.id} value={idx}>Page {idx + 1}: {p.title.slice(0, 22)}</option>)}
            </select>
            <input type="color" aria-label="New tab color" value={newTabColor} onChange={(e) => setNewTabColor(e.target.value)} />
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => {
                if (!newTabLabel.trim()) return;
                void saveBook((b) => ({
                  ...b,
                  tabs: [
                    ...b.tabs,
                    { id: createId('tb'), label: newTabLabel.trim(), emoji: newTabEmoji, color: newTabColor, rounded: true, showText: true, targetPageIndex: newTabTarget, placement: newTabPlacement },
                  ],
                }));
                setNewTabLabel('');
                pushToast(`Added ${newTabPlacement} tab!`);
              }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {/* Physical Book Viewport with Zoom & Dynamic Left/Right Tabs & Top Bookmarks */}
      <div style={{ overflow: 'auto', padding: 8 }}>
        <div style={{ transform: `scale(${zoomPct / 100})`, transformOrigin: 'top center', transition: 'transform 160ms ease' }}>
          {viewSurface === 'front_cover' || viewSurface === 'back_cover' ? (
            <div
              onClick={() => setViewSurface('pages')}
              style={{
                maxWidth: 520,
                minHeight: 460,
                margin: '0 auto',
                borderRadius: 14,
                padding: 36,
                backgroundColor: viewSurface === 'front_cover' ? bookPayload.frontCoverColor : bookPayload.backCoverColor,
                backgroundImage:
                  bookPayload.coverPattern === 'dots'
                    ? 'radial-gradient(rgba(255,255,255,0.16) 2px, transparent 2px)'
                    : bookPayload.coverPattern === 'stripes'
                      ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 12px, transparent 12px 24px)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(0,0,0,0.22))',
                backgroundSize: bookPayload.coverPattern === 'dots' ? '22px 22px' : undefined,
                color: '#f8f2e4',
                border: bookPayload.coverBorder === 'gold' ? '4px solid #c7a25a' : bookPayload.coverBorder === 'double' ? '6px double #e5d2aa' : 'none',
                boxShadow: '0 18px 36px rgba(0,0,0,0.28)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '2.2rem', fontFamily: 'var(--dp-font-heading)', fontWeight: 700, letterSpacing: '0.04em' }}>
                {viewSurface === 'front_cover' ? `${settings.plannerTitle} Planner` : 'Back Cover'}
              </div>
              <p style={{ opacity: 0.85, marginTop: 8 }}>{bookPayload.subtitle}</p>
              <span className="dp-pill" style={{ marginTop: 24, background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
                Click to Open Planner Pages →
              </span>
            </div>
          ) : (
            <div className="dp-stack" style={{ gap: 6 }}>
              {/* Dynamic Top Bookmarks Row — Left Bookmarks (earlier pages) vs Right Bookmarks (current/later pages) */}
              <div className="dp-between" style={{ paddingInline: 28, flexWrap: 'wrap', gap: 6 }}>
                <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {topBookmarks.left.map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => setPageIdx(bm.targetPageIndex)}
                      style={{
                        background: bm.color,
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: bm.rounded ? '8px 8px 0 0' : '2px 2px 0 0',
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {bm.emoji} {bm.showText ? bm.label : ''}
                    </button>
                  ))}
                </div>
                <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {topBookmarks.right.map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => setPageIdx(bm.targetPageIndex)}
                      style={{
                        background: bm.color,
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: bm.rounded ? '8px 8px 0 0' : '2px 2px 0 0',
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {bm.emoji} {bm.showText ? bm.label : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Physical Open Book Row: Left Dynamic Side Tabs | Left Page | Custom Binding | Right Page | Right Dynamic Side Tabs */}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                {/* Left Side Tabs (sections BEFORE current page) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 14, minWidth: sideTabs.left.length ? 54 : 0 }}>
                  {sideTabs.left.map((tb) => (
                    <button
                      key={tb.id}
                      type="button"
                      onClick={() => setPageIdx(tb.targetPageIndex)}
                      style={{
                        background: tb.color,
                        color: '#fff',
                        border: 'none',
                        padding: '7px 6px',
                        borderRadius: tb.rounded ? '8px 0 0 8px' : '2px 0 0 2px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textAlign: 'center',
                      }}
                    >
                      <div>{tb.emoji}</div>
                      {tb.showText && <div>{tb.label}</div>}
                    </button>
                  ))}
                </div>

                {/* Open Book Pages + Center Binding */}
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns:
                      spreadMode === 'spread' && visiblePages.length === 2
                        ? `minmax(0, 1fr) ${bookPayload.bindingStyle === 'none' ? '8px' : `${bookPayload.bindingWidthPx}px`} minmax(0, 1fr)`
                        : 'minmax(0, 1fr)',
                    gap: 4,
                    padding: 8,
                    borderRadius: 12,
                    background: bookPayload.frontCoverColor,
                    boxShadow: '0 10px 26px rgba(0,0,0,0.18)',
                  }}
                >
                  {visiblePages[0] && renderPageInterior(visiblePages[0], safeIdx)}
                  {spreadMode === 'spread' && visiblePages.length === 2 && (
                    <div
                      aria-label={`Binding: ${bookPayload.bindingStyle}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-around',
                        alignItems: 'center',
                        paddingBlock: 22,
                        background:
                          bookPayload.bindingStyle === 'book'
                            ? `linear-gradient(to right, rgba(0,0,0,0.28), ${bookPayload.bindingColor}, rgba(0,0,0,0.28))`
                            : 'transparent',
                        borderRadius: 4,
                      }}
                    >
                      {(bookPayload.bindingStyle === 'rings' || bookPayload.bindingStyle === 'spiral') &&
                        Array.from({ length: bookPayload.ringCount }, (_, ri) => (
                          <div
                            key={ri}
                            style={{
                              width: bookPayload.bindingStyle === 'spiral' ? 24 : 22,
                              height: bookPayload.bindingStyle === 'spiral' ? 7 : 12,
                              borderRadius: 999,
                              background: bookPayload.bindingColor,
                              boxShadow: '0 2px 3px rgba(0,0,0,0.35)',
                              transform: bookPayload.bindingStyle === 'spiral' ? 'rotate(-16deg)' : undefined,
                            }}
                          />
                        ))}
                    </div>
                  )}
                  {spreadMode === 'spread' && visiblePages[1] && renderPageInterior(visiblePages[1], safeIdx + 1)}
                </div>

                {/* Right Side Tabs (sections AT OR AFTER current page) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 14, minWidth: sideTabs.right.length ? 54 : 0 }}>
                  {sideTabs.right.map((tb) => (
                    <button
                      key={tb.id}
                      type="button"
                      onClick={() => setPageIdx(tb.targetPageIndex)}
                      style={{
                        background: tb.color,
                        color: '#fff',
                        border: 'none',
                        padding: '7px 6px',
                        borderRadius: tb.rounded ? '0 8px 8px 0' : '0 2px 2px 0',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textAlign: 'center',
                        outline: tb.targetPageIndex === safeIdx ? '2px solid var(--dp-ink)' : undefined,
                      }}
                    >
                      <div>{tb.emoji}</div>
                      {tb.showText && <div>{tb.label}</div>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page Flipper Controls */}
              <div className="dp-between" style={{ paddingInline: 28 }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  disabled={safeIdx === 0}
                  onClick={() => setPageIdx((i) => Math.max(0, i - (spreadMode === 'spread' ? 2 : 1)))}
                >
                  <ChevronLeft size={14} /> Previous Page
                </button>
                <span className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  Showing Page {safeIdx + 1}{spreadMode === 'spread' && visiblePages[1] ? `–${safeIdx + 2}` : ''} of {pages.length}
                </span>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  disabled={safeIdx + (spreadMode === 'spread' ? 2 : 1) >= pages.length}
                  onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + (spreadMode === 'spread' ? 2 : 1)))}
                >
                  Next Page <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
