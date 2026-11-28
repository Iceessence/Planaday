import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { useApp } from '../../core/AppContext';
import { THEME_PRESETS } from '../../data/themes';
import type { NavView } from '../../core/types';

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  run: () => void | Promise<unknown>;
}

export const CommandPalette: React.FC = () => {
  const {
    paletteOpen,
    setPaletteOpen,
    setActiveView,
    setQuickCaptureOpen,
    setSearchOpen,
    setZenOpen,
    patchSettings,
    settings,
    startCountdownTimer,
    undo,
    redo,
    setActiveDate,
    logicalToday,
    triggerSyncNow,
    pushToast,
  } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const busy = useRef(false);
  const resultRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (!paletteOpen) { setQuery(''); setSelected(0); } }, [paletteOpen]);

  const actions = useMemo<PaletteAction[]>(() => {
    const navItems: Array<[NavView, string]> = [
      ['all_in_one', 'Go to All-in-One Scroll (Every Tab on One Page)'],
      ['home', 'Go to Home Dashboard'],
      ['today', 'Go to Today Open-Book Spread'],
      ['calendar', 'Go to Flow Calendar'],
      ['tasks', 'Go to Tasks'],
      ['chores', 'Go to Chores'],
      ['history', 'Go to Completion History & Event Reviews'],
      ['notes', 'Go to Rich Notes & Knowledge Graph'],
      ['thoughts', 'Go to Thought Inbox'],
      ['diary', 'Go to Diary & Reflection'],
      ['events', 'Go to Birthdays & Life Events'],
      ['clock', 'Go to Clock & World Clock Slider'],
      ['alarms', 'Go to Smart Alarms'],
      ['timers', 'Go to Timers, Pomodoro & Soundscapes'],
      ['stopwatch', 'Go to Stopwatch & Time Ledger'],
      ['recipes', 'Go to Kitchen Recipes'],
      ['pantry', 'Go to Lot-Based Pantry Inventory'],
      ['meals', 'Go to Meal Planner'],
      ['shopping', 'Go to Smart Grocery List'],
      ['goals', 'Go to Goals & Milestones'],
      ['habits', 'Go to Habits & Routines'],
      ['rituals', 'Go to Planning Rituals'],
      ['insights', 'Go to Insights & Heatmaps'],
      ['automations', 'Go to Local Automations'],
      ['guide', 'Go to App Guide & Documentation'],
      ['trash', 'Go to 30-Day Trash Bin'],
      ['settings', 'Go to Settings & Theme Studio'],
      ['quick_glance', 'Go to Quick Glance'], ['digital_planner', 'Go to Digital Planner'],
      ['planner', 'Go to Planner'], ['task_calendar', 'Go to Task Calendar'], ['reports', 'Go to Reports'],
      ['learning', 'Go to Learning'], ['countdown', 'Go to Countdown'], ['household', 'Go to Household'],
      ['people', 'Go to People'], ['health', 'Go to Health'], ['finance', 'Go to Finance'],
      ['media', 'Go to Media'], ['travel', 'Go to Travel'], ['home_assets', 'Go to Home Assets'],
      ['lab', 'Go to Laboratory'], ['calculator', 'Go to Calculator'], ['spreadsheets', 'Go to Spreadsheets'],
      ['presentations', 'Go to Presentations'], ['projects', 'Go to Projects'], ['game_dev', 'Go to Game Development'],
      ['book_writing', 'Go to Book Writing'], ['kanban', 'Go to Kanban'], ['whiteboard', 'Go to Whiteboard'],
      ['code_studio', 'Go to Code Studio'], ['photo_studio', 'Go to Photo Studio'], ['files', 'Go to Files'],
      ['scanner', 'Go to Note Scanner & OCR'], ['pdf_studio', 'Go to PDF Reader & Editor'], ['spaces', 'Go to Spaces'],
    ];

    const list: PaletteAction[] = [
      { id: 'act-capture', group: 'Quick Actions', label: 'New Quick Capture (N)', run: () => setQuickCaptureOpen(true) },
      { id: 'act-search', group: 'Quick Actions', label: 'Global Fuzzy Search (/)', run: () => setSearchOpen(true) },
      { id: 'act-today', group: 'Quick Actions', label: 'Jump to Today (T)', run: () => { setActiveDate(logicalToday); setActiveView('today'); } },
      { id: 'act-zen', group: 'Modes', label: 'Open Distraction-Free Zen Sheet', run: () => setZenOpen(true) },
      {
        id: 'act-low-energy',
        group: 'Modes',
        label: settings.lowEnergyMode ? 'Disable Low-Energy / Overwhelmed Mode' : 'Enable Low-Energy / Overwhelmed Mode',
        run: () => patchSettings({ lowEnergyMode: !settings.lowEnergyMode }),
      },
      { id: 'act-pomo', group: 'Timers', label: 'Start 25m Deep Focus Pomodoro Timer', run: () => startCountdownTimer('Deep Focus Pomodoro', 25 * 60, 'pomodoro') },
      { id: 'act-t10', group: 'Timers', label: 'Start Gentle 10m Timer', run: () => startCountdownTimer('Gentle 10m Sprint', 10 * 60, 'countdown') },
      { id: 'act-undo', group: 'History', label: 'Undo Last Action (Ctrl/Cmd+Z)', run: () => undo() },
      { id: 'act-redo', group: 'History', label: 'Redo Last Action (Ctrl/Cmd+Shift+Z)', run: () => redo() },
      { id: 'act-sync', group: 'Sync', label: 'Run Sync Cycle Now', run: () => triggerSyncNow() },
      ...navItems.map(([view, label]) => ({
        id: `nav-${view}`,
        group: 'Navigate',
        label,
        run: () => setActiveView(view),
      })),
      ...THEME_PRESETS.map((preset) => ({
        id: `theme-${preset.id}`,
        group: 'Themes',
        label: `Switch Theme → ${preset.name}`,
        run: () =>
          patchSettings({
            themePresetId: preset.id,
            customTokens: { ...preset.tokens },
            paperMaterial: preset.defaultPaper,
            colorScheme: preset.isDark ? 'dark' : 'light',
          }),
      })),
    ];
    return list;
  }, [
    setActiveView,
    setQuickCaptureOpen,
    setSearchOpen,
    setZenOpen,
    patchSettings,
    settings.lowEnergyMode,
    startCountdownTimer,
    undo,
    redo,
    setActiveDate,
    logicalToday,
    triggerSyncNow,
  ]);

  const filtered = useMemo(() => {
    if (!paletteOpen) return [];
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    const tokens = q.split(/\s+/);
    return actions.flatMap((action, index) => {
      const label = action.label.toLowerCase();
      const text = `${label} ${action.group.toLowerCase()} ${action.id.replace(/[-_]/g, ' ')}`;
      if (!tokens.every((token) => text.includes(token))) return [];
      const score = (label.startsWith(q) ? 30 : 0) + (label.includes(q) ? 20 : 0) +
        tokens.reduce((sum, token) => sum + (label.includes(token) ? 5 : 1), 0);
      return [{ action, score, index }];
    }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ action }) => action);
  }, [actions, query, paletteOpen]);
  const active = Math.min(selected, Math.max(0, filtered.length - 1));
  const run = async (action: PaletteAction) => {
    if (busy.current) return;
    busy.current = true;
    setPaletteOpen(false);
    setQuery('');
    try { await action.run(); }
    catch { pushToast(`Could not complete: ${action.label}`, { tone: 'danger' }); }
    finally { busy.current = false; }
  };
  const move = (index: number) => {
    if (!filtered.length) return;
    const next = (index + filtered.length) % filtered.length;
    setSelected(next);
    resultRefs.current.get(filtered[next].id)?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <ModalDialog open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Command Palette (Ctrl/Cmd+K)">
      <div className="dp-stack">
        <input autoFocus className="dp-input" aria-label="Search commands"
          placeholder="Jump to a module, switch theme, start timer…" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault(); move(active + (e.key === 'ArrowDown' ? 1 : -1));
            } else if (e.key === 'Enter' && filtered[active]) {
              e.preventDefault(); void run(filtered[active]);
            }
          }} />
        <div className="dp-between dp-muted" style={{ fontSize: '0.78rem' }}>
          <span aria-live="polite">{filtered.length} commands</span><span>↑ ↓ Navigate · Enter Run</span>
        </div>
        <div className="dp-stack" style={{ gap: 6, maxHeight: '50dvh', overflowY: 'auto' }}>
          {filtered.length === 0 && <p className="dp-muted">No commands match. Try a different term.</p>}
          {filtered.map((a, index) => (
            <button key={a.id} ref={(el) => { if (el) resultRefs.current.set(a.id, el); else resultRefs.current.delete(a.id); }}
              type="button" className={`dp-btn${index === active ? ' dp-btn-primary' : ''}`}
              style={{ justifyContent: 'space-between', textAlign: 'start' }}
              onFocus={() => setSelected(index)} onClick={() => void run(a)}>
              <span>{a.label}</span><span className="dp-pill">{a.group}</span>
            </button>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
};
