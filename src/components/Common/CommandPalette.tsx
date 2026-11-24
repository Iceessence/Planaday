import React, { useMemo, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { useApp } from '../../core/AppContext';
import { THEME_PRESETS } from '../../data/themes';
import type { NavView } from '../../core/types';

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  run: () => void | Promise<void>;
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
  } = useApp();
  const [query, setQuery] = useState('');

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
      ['trash', 'Go to 30-Day Trash Bin'],
      ['settings', 'Go to Settings & Theme Studio'],
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
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 18);
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q));
  }, [actions, query]);

  return (
    <ModalDialog open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Command Palette (Ctrl/Cmd+K)">
      <div className="dp-stack">
        <input
          autoFocus
          className="dp-input"
          placeholder="Jump to a module, switch theme, start timer, toggle Zen Mode…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dp-stack" style={{ gap: 6, maxHeight: '50dvh', overflowY: 'auto' }}>
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              className="dp-btn"
              style={{ justifyContent: 'space-between' }}
              onClick={() => {
                setPaletteOpen(false);
                setQuery('');
                void a.run();
              }}
            >
              <span>{a.label}</span>
              <span className="dp-pill">{a.group}</span>
            </button>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
};
