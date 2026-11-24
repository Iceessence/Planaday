import React, { useRef, useState } from 'react';
import { useApp } from '../../core/AppContext';
import {
  computeGuardedTheme,
  parseThemePack,
  serializeThemePack,
  THEME_PRESETS,
  type DensityMode,
  type FontPairing,
  type PaperMaterial,
  type ThemeTokens,
} from '../../data/themes';
import {
  exportFullJsonBackup,
  exportFullZipBackup,
  importJsonBackup,
  importZipBackup,
  saveDirectToDiskFolder,
  triggerBrowserDownload,
} from '../../core/backup';
import { resolveConflict } from '../../core/sync';
import { wipeSampleData } from '../../core/repository';
import { applyOnboardingPreset, ONBOARDING_PRESETS } from '../../data/sampleData';
import type { ModuleId, OperatingMode } from '../../core/types';

const PAPER_OPTIONS: Array<{ id: PaperMaterial; label: string }> = [
  { id: 'dot-grid-5mm', label: '5mm Dot-Grid' },
  { id: 'warm-cream', label: 'Warm Cream' },
  { id: 'kraft', label: 'Kraft Paper' },
  { id: 'charcoal-dot', label: 'Charcoal Dot-Grid' },
  { id: 'graph', label: 'Graph Grid' },
  { id: 'college-ruled', label: 'College Ruled' },
  { id: 'wide-ruled', label: 'Wide Ruled' },
  { id: 'blank', label: 'Blank Archival' },
];

const MODULE_META: Array<{ id: ModuleId; label: string; group: string; optional?: boolean }> = [
  { id: 'calendar', label: 'Flow Calendar', group: 'Core' },
  { id: 'tasks', label: 'Tasks & Subtasks', group: 'Core' },
  { id: 'chores', label: 'Completion-Based Chores', group: 'Core' },
  { id: 'notes', label: 'Rich Notes & WikiLinks', group: 'Core' },
  { id: 'thoughts', label: 'Thought Inbox', group: 'Core' },
  { id: 'diary', label: 'Diary & Reflection', group: 'Core' },
  { id: 'events', label: 'Birthdays & Countdowns', group: 'Core' },
  { id: 'time', label: 'Time Suite (Clock/Timers/Alarms)', group: 'Core' },
  { id: 'kitchen', label: 'Kitchen OS (Recipes/Pantry/Meals)', group: 'Core' },
  { id: 'goals', label: 'Goals & Milestones', group: 'Optional Life-OS', optional: true },
  { id: 'habits', label: 'Habits & Routines', group: 'Optional Life-OS', optional: true },
  { id: 'household', label: 'Household & Effort Fairness', group: 'Optional Life-OS', optional: true },
  { id: 'health', label: 'Health, Medication & Fitness', group: 'Optional Life-OS', optional: true },
  { id: 'finance', label: 'Personal Finance, Bills & Warranties', group: 'Optional Life-OS', optional: true },
  { id: 'learning', label: 'Spaced Review & Learning', group: 'Optional Life-OS', optional: true },
  { id: 'media', label: 'Media Shelf & Hobby Projects', group: 'Optional Life-OS', optional: true },
  { id: 'travel', label: 'Travel, Packing & Party Hosting', group: 'Optional Life-OS', optional: true },
  { id: 'people', label: 'People, Keep-in-Touch & Gifts', group: 'Optional Life-OS', optional: true },
  { id: 'home_assets', label: 'Home Assets, Vehicles, Pets, Plants & Storage', group: 'Optional Life-OS', optional: true },
  { id: 'ai', label: 'Optional Local / BYOK AI Assistant', group: 'Optional Life-OS', optional: true },
];

export const SettingsView: React.FC = () => {
  const {
    settings,
    patchSettings,
    syncState,
    triggerSyncNow,
    openConflicts,
    storageHealth,
    pushToast,
    logicalToday,
  } = useApp();

  const [tab, setTab] = useState<'theme' | 'modules' | 'sync' | 'export' | 'schedule'>('theme');
  const [newWsName, setNewWsName] = useState('');
  const importBackupRef = useRef<HTMLInputElement | null>(null);
  const importThemeRef = useRef<HTMLInputElement | null>(null);

  const guarded = computeGuardedTheme(settings.customTokens, settings.contrastLevel === 'AAA' ? 7.0 : 4.5);

  const updateToken = (key: keyof ThemeTokens, value: string) => {
    void patchSettings({
      customTokens: { ...settings.customTokens, [key]: value },
    });
  };

  const handleBackupImport = async (file: File) => {
    try {
      if (file.name.endsWith('.zip')) {
        const res = await importZipBackup(file);
        pushToast(`Imported ${res.importedRecords} records & ${res.importedBlobs} binary blobs from ZIP.`);
      } else {
        const txt = await file.text();
        const res = await importJsonBackup(txt);
        pushToast(`Imported ${res.importedRecords} records from JSON backup.`);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Backup import failed', { tone: 'danger' });
    }
  };

  const handleThemeImport = async (file: File) => {
    try {
      const txt = await file.text();
      const pack = parseThemePack(txt);
      await patchSettings({
        customTokens: pack.tokens,
        paperMaterial: pack.paper ?? settings.paperMaterial,
      });
      pushToast(`Applied theme pack "${pack.name}"`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Invalid .dmtheme file', { tone: 'danger' });
    }
  };

  return (
    <div className="dp-paper-sheet" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ marginBottom: 16 }}>
        <div>
          <h2>Settings, Personalization & Three-Mode Sync</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            Zero localStorage · Unlimited IndexedDB + Blob storage · Automatic OKLCH WCAG contrast guard
          </p>
        </div>
        <div className="dp-row">
          {(
            [
              ['theme', 'Theme & Paper'],
              ['modules', 'Module Toggles'],
              ['sync', '3-Mode Sync'],
              ['schedule', 'Clock & Day Rollover'],
              ['export', 'Backup & Export'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dp-btn dp-btn-sm ${tab === id ? 'dp-btn-primary' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'theme' && (
        <div className="dp-stack">
          <div className="dp-section-title">
            <span>Theme Studio Presets (8 Built-in + OKLCH Contrast Guard)</span>
            <div className="dp-row">
              <span className="dp-pill">Paper Contrast: {guarded.paperContrast.toFixed(1)}:1</span>
              <span className="dp-pill">Button Contrast: {guarded.accentContrast.toFixed(1)}:1</span>
              <select
                aria-label="WCAG contrast target"
                className="dp-select"
                style={{ width: 'auto', padding: '3px 8px' }}
                value={settings.contrastLevel}
                onChange={(e) => void patchSettings({ contrastLevel: e.target.value as 'AA' | 'AAA' })}
              >
                <option value="AA">WCAG AA (4.5:1)</option>
                <option value="AAA">WCAG AAA (7.0:1)</option>
              </select>
            </div>
          </div>

          <div className="dp-grid-3">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  cursor: 'pointer',
                  borderColor: settings.themePresetId === preset.id ? 'var(--dp-accent)' : undefined,
                  borderWidth: settings.themePresetId === preset.id ? 2 : 1,
                }}
                onClick={() =>
                  void patchSettings({
                    themePresetId: preset.id,
                    customTokens: { ...preset.tokens },
                    paperMaterial: preset.defaultPaper,
                    colorScheme: preset.isDark ? 'dark' : 'light',
                  })
                }
              >
                <div className="dp-between" style={{ marginBottom: 6 }}>
                  <strong>{preset.name}</strong>
                  <div className="dp-row" style={{ gap: 4 }}>
                    {[preset.tokens.paper, preset.tokens.primaryAccent, preset.tokens.secondaryAccent].map((c, i) => (
                      <span
                        key={i}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: c,
                          border: '1px solid var(--dp-border)',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  {preset.description}
                </div>
              </button>
            ))}
          </div>

          <div className="dp-grid-2">
            <div className="dp-card dp-stack">
              <h4>Paper Surface & Tactile Details</h4>
              <div className="dp-row">
                {PAPER_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`dp-btn dp-btn-sm ${settings.paperMaterial === p.id ? 'dp-btn-primary' : ''}`}
                    onClick={() => void patchSettings({ paperMaterial: p.id })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="dp-row">
                <input
                  type="checkbox"
                  checked={settings.paperGrain}
                  onChange={(e) => void patchSettings({ paperGrain: e.target.checked })}
                />
                <span>Subtle SVG paper grain texture</span>
              </label>
              <label className="dp-row">
                <input
                  type="checkbox"
                  checked={settings.bookSpineShadow}
                  onChange={(e) => void patchSettings({ bookSpineShadow: e.target.checked })}
                />
                <span>Open-book center spine shadow</span>
              </label>
              <label className="dp-row">
                <input
                  type="checkbox"
                  checked={settings.binderTabs}
                  onChange={(e) => void patchSettings({ binderTabs: e.target.checked })}
                />
                <span>Colored binder divider tabs</span>
              </label>
              <label className="dp-row">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => void patchSettings({ reducedMotion: e.target.checked })}
                />
                <span>Reduced motion</span>
              </label>
              <label className="dp-row">
                <input
                  type="checkbox"
                  checked={settings.rtl}
                  onChange={(e) => void patchSettings({ rtl: e.target.checked })}
                />
                <span>Right-to-Left (RTL) layout mirroring</span>
              </label>
            </div>

            <div className="dp-card dp-stack">
              <h4>Typography, Density & Color Scheme</h4>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Color Scheme</span>
                <select
                  className="dp-select"
                  value={settings.colorScheme}
                  onChange={(e) => void patchSettings({ colorScheme: e.target.value as 'light' | 'dark' | 'system' })}
                >
                  <option value="system">System Automatic</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Font Pairing</span>
                <select
                  className="dp-select"
                  value={settings.fontPairing}
                  onChange={(e) => void patchSettings({ fontPairing: e.target.value as FontPairing })}
                >
                  <option value="editorial-serif">Editorial Serif + Sans</option>
                  <option value="neo-grotesk">Neo-Grotesk Modern</option>
                  <option value="friendly-rounded">Friendly Rounded</option>
                  <option value="cozy-handwritten">Cozy Handwritten Headings</option>
                  <option value="crisp-monospace">Crisp Monospace</option>
                </select>
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Global Font Scale: {settings.fontSizePx}px (12–24px)</span>
                <input
                  type="range"
                  min={12}
                  max={24}
                  value={settings.fontSizePx}
                  onChange={(e) => void patchSettings({ fontSizePx: Number(e.target.value) })}
                />
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Density Mode</span>
                <select
                  className="dp-select"
                  value={settings.density}
                  onChange={(e) => void patchSettings({ density: e.target.value as DensityMode })}
                >
                  <option value="airy">Airy</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>
          </div>

          <details className="dp-details">
            <summary>Custom Color Tokens & .dmtheme Export / Import</summary>
            <div className="dp-grid-3" style={{ marginTop: 12 }}>
              {(Object.keys(settings.customTokens) as Array<keyof ThemeTokens>).map((tok) => (
                <label key={tok} className="dp-between" style={{ fontSize: '0.85rem' }}>
                  <span>{tok}</span>
                  <input
                    type="color"
                    value={settings.customTokens[tok]}
                    onChange={(e) => updateToken(tok, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="dp-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const text = serializeThemePack(settings.themePresetId, settings.customTokens, settings.paperMaterial);
                  triggerBrowserDownload(text, `dayplana-${settings.themePresetId}.dmtheme`, 'application/json');
                }}
              >
                Export .dmtheme Pack
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => importThemeRef.current?.click()}>
                Import .dmtheme Pack
              </button>
              <input
                ref={importThemeRef}
                type="file"
                accept=".dmtheme,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleThemeImport(f);
                  e.target.value = '';
                }}
              />
            </div>
          </details>
        </div>
      )}

      {tab === 'modules' && (
        <div className="dp-stack">
          <p className="dp-muted">
            Hide any module in 1 click without deleting underlying data. Active timers or alarms remain running in the mini-bar.
          </p>
          <div className="dp-grid-2">
            {MODULE_META.map((m) => (
              <label key={m.id} className="dp-card dp-between" style={{ padding: 12, cursor: 'pointer' }}>
                <div>
                  <strong>{m.label}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    {m.group}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enabledModules[m.id] !== false}
                  onChange={(e) =>
                    void patchSettings({
                      enabledModules: { ...settings.enabledModules, [m.id]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
          </div>

          <div className="dp-card dp-stack">
            <h4>Workspaces & Profiles</h4>
            <div className="dp-row">
              {settings.workspaces.map((ws) => (
                <span key={ws.id} className="dp-pill">
                  {ws.emoji} {ws.name}
                </span>
              ))}
            </div>
            <div className="dp-row">
              <input
                className="dp-input"
                style={{ maxWidth: 260 }}
                placeholder="New workspace name (e.g., Studio)"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
              />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={() => {
                  const name = newWsName.trim();
                  if (!name) return;
                  const id = `ws_${Date.now().toString(36)}`;
                  void patchSettings({
                    workspaces: [...settings.workspaces, { id, name, emoji: '📒', color: '#4f7a65' }],
                    activeWorkspaceId: id,
                  });
                  setNewWsName('');
                  pushToast(`Created workspace "${name}"`);
                }}
              >
                Add Workspace
              </button>
            </div>
          </div>

          <div className="dp-card dp-stack">
            <h4>Curated Starter Presets & Sample Data</h4>
            <div className="dp-row">
              {ONBOARDING_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={async () => {
                    await applyOnboardingPreset(p.id, { loadSamples: false, logicalToday });
                    pushToast(`Applied "${p.name}" preset`);
                  }}
                >
                  Apply {p.name}
                </button>
              ))}
              <button
                type="button"
                className="dp-btn dp-btn-danger dp-btn-sm"
                onClick={async () => {
                  const removed = await wipeSampleData();
                  pushToast(`Removed ${removed} sample records (your own data was untouched).`);
                }}
              >
                1-Click Wipe Sample Data
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="dp-stack">
          <div className="dp-grid-3">
            {(
              [
                [
                  'docker-sync',
                  'Mode 1 — Docker Sync Server',
                  'Auto-sync phone & computer over LAN/Tailscale/HTTPS via /data SQLite + SSE live push + CORS-free recipe proxy.',
                ],
                [
                  'offline-phone',
                  'Mode 2 — Offline Phone PWA',
                  '100% standalone on-device IndexedDB + blobs with offline change queueing when no server is configured.',
                ],
                [
                  'offline-computer',
                  'Mode 3 — Offline Computer',
                  '100% standalone desktop operation with direct disk folder backup and 1-click JSON/ZIP export, no Docker required.',
                ],
              ] as Array<[OperatingMode, string, string]>
            ).map(([mode, title, desc]) => (
              <button
                key={mode}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  cursor: 'pointer',
                  borderColor: settings.operatingMode === mode ? 'var(--dp-accent)' : undefined,
                  borderWidth: settings.operatingMode === mode ? 2 : 1,
                }}
                onClick={() => void patchSettings({ operatingMode: mode })}
              >
                <strong>{title}</strong>
                <p className="dp-muted" style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
                  {desc}
                </p>
              </button>
            ))}
          </div>

          <div className="dp-card dp-stack">
            <div className="dp-between">
              <h4>Sync Status & Connection</h4>
              <span className="dp-pill">
                Status: {syncState.status} · Queued ops: {syncState.pendingCount}
              </span>
            </div>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">
                Docker Sync Server URL (leave blank when served directly from your Docker container, or enter e.g.{' '}
                <code>http://192.168.1.50:3000</code> or your Tailscale URL)
              </span>
              <input
                className="dp-input"
                placeholder="(same origin) or http://your-docker-host:3000"
                value={settings.syncServerUrl}
                onChange={(e) => void patchSettings({ syncServerUrl: e.target.value })}
              />
            </label>
            <div className="dp-row">
              <button type="button" className="dp-btn dp-btn-primary" onClick={() => void triggerSyncNow()}>
                Sync Now
              </button>
              {syncState.lastSyncAt && (
                <span className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  Last synced: {new Date(syncState.lastSyncAt).toLocaleString()}
                </span>
              )}
              {syncState.errorMessage && (
                <span style={{ color: 'var(--dp-danger)', fontSize: '0.82rem' }}>{syncState.errorMessage}</span>
              )}
            </div>
          </div>

          {openConflicts.length > 0 && (
            <div className="dp-card dp-stack" style={{ borderColor: 'var(--dp-warn)' }}>
              <h4>Sync Conflicts ({openConflicts.length}) — Side-by-Side Merge</h4>
              {openConflicts.map((c) => (
                <div key={c.id} className="dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)', borderRadius: 8 }}>
                  <strong>{c.localRecord.title}</strong>
                  <div className="dp-grid-2">
                    <div>
                      <div className="dp-pill">This Device ({c.localRecord.updatedAt.slice(0, 19)})</div>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                        {JSON.stringify(c.localRecord.payload, null, 2).slice(0, 400)}
                      </pre>
                    </div>
                    <div>
                      <div className="dp-pill">Other Device ({c.remoteRecord.updatedAt.slice(0, 19)})</div>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                        {JSON.stringify(c.remoteRecord.payload, null, 2).slice(0, 400)}
                      </pre>
                    </div>
                  </div>
                  <div className="dp-row">
                    <button type="button" className="dp-btn dp-btn-sm" onClick={() => void resolveConflict(c.id, 'keep-local')}>
                      Keep This Device
                    </button>
                    <button type="button" className="dp-btn dp-btn-sm" onClick={() => void resolveConflict(c.id, 'keep-remote')}>
                      Keep Other Device
                    </button>
                    <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void resolveConflict(c.id, 'keep-both')}>
                      Keep Both (Save Conflict Copy)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {storageHealth && (
            <div className="dp-card dp-between">
              <div>
                <strong>On-Device IndexedDB Storage Health</strong>
                <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  Persistent Storage: {storageHealth.persisted ? 'Granted' : 'Best-Effort'} · Used:{' '}
                  {(storageHealth.usageBytes / (1024 * 1024)).toFixed(2)} MB /{' '}
                  {storageHealth.quotaBytes > 0 ? `${(storageHealth.quotaBytes / (1024 * 1024)).toFixed(0)} MB` : 'Unlimited'}
                </div>
              </div>
              <span className="dp-pill">Zero localStorage verified</span>
            </div>
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="dp-grid-2">
          <div className="dp-card dp-stack">
            <h4>Logical Day Boundary (Night Owl Rollover)</h4>
            <p className="dp-muted" style={{ fontSize: '0.84rem', margin: 0 }}>
              Current logical Today: <strong>{logicalToday}</strong>. Recomputes live on timer tick & tab focus.
            </p>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Rollover Hour</span>
              <select
                className="dp-select"
                value={settings.dayBoundaryHour}
                onChange={(e) => void patchSettings({ dayBoundaryHour: Number(e.target.value) })}
              >
                <option value={0}>Midnight (00:00)</option>
                <option value={1}>1:00 AM</option>
                <option value={2}>2:00 AM</option>
                <option value={3}>3:00 AM (Night Owl)</option>
                <option value={4}>4:00 AM (Night Owl)</option>
                <option value={5}>5:00 AM</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Daily Capacity Warning Threshold: {settings.dailyCapacityHours} hrs</span>
              <input
                type="range"
                min={3}
                max={14}
                value={settings.dailyCapacityHours}
                onChange={(e) => void patchSettings({ dailyCapacityHours: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="dp-card dp-stack">
            <h4>Calendar & Locale Formatting</h4>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Week Starts On</span>
              <select
                className="dp-select"
                value={settings.weekStartsOn}
                onChange={(e) => void patchSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Time Display</span>
              <select
                className="dp-select"
                value={settings.timeFormat}
                onChange={(e) => void patchSettings({ timeFormat: e.target.value as '12h' | '24h' })}
              >
                <option value="12h">12-Hour (AM/PM)</option>
                <option value="24h">24-Hour</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Locale (MM/DD vs DD/MM)</span>
              <select
                className="dp-select"
                value={settings.locale}
                onChange={(e) => void patchSettings({ locale: e.target.value })}
              >
                <option value="en-US">English (US — MM/DD/YYYY)</option>
                <option value="en-GB">English (UK — DD/MM/YYYY)</option>
                <option value="de-DE">Deutsch (DD.MM.YYYY)</option>
                <option value="fr-FR">Français (DD/MM/YYYY)</option>
                <option value="ja-JP">日本語 (YYYY/MM/DD)</option>
                <option value="ar-EG">العربية (RTL)</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="dp-stack">
          <div className="dp-card dp-stack">
            <h4>Portable Export Center (Works Across All 3 Operating Modes)</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              Export or restore your entire Dayplana database—including unlimited long notes, revisions, time logs, and binary blobs.
            </p>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={async () => {
                  const zip = await exportFullZipBackup();
                  triggerBrowserDownload(zip, `dayplana-full-backup-${logicalToday}.zip`, 'application/zip');
                  pushToast('Downloaded full ZIP backup (records + blobs).');
                }}
              >
                1-Click Full ZIP Backup (with Blobs)
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  const json = await exportFullJsonBackup();
                  triggerBrowserDownload(json, `dayplana-backup-${logicalToday}.json`, 'application/json');
                  pushToast('Downloaded JSON backup.');
                }}
              >
                1-Click JSON Export
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  try {
                    const res = await saveDirectToDiskFolder();
                    pushToast(`Saved ${res.filename} (${res.method})`);
                  } catch {
                    pushToast('Folder selection canceled');
                  }
                }}
              >
                Direct Disk Folder Backup (Desktop)
              </button>
              <button type="button" className="dp-btn" onClick={() => importBackupRef.current?.click()}>
                Import JSON / ZIP Backup
              </button>
              <input
                ref={importBackupRef}
                type="file"
                accept=".json,.zip"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleBackupImport(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="dp-card dp-stack">
            <h4>Print-to-Paper</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
              Print any Today, Week, Month, Recipe Card, or Packing List with ink-friendly margins and zero clipped UI chrome.
            </p>
            <div>
              <button type="button" className="dp-btn" onClick={() => window.print()}>
                Print Current View / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
