import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Command,
  Download,
  Feather,
  HelpCircle,
  Menu,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Undo2,
  Wifi,
} from 'lucide-react';
import { useApp, useSyncState } from '../../core/AppContext';
import { normalizeServerUrl, testServerConnection } from '../../core/sync';
import { ModalDialog } from '../Common/ModalDialog';
import type { NavView } from '../../core/types';

const VIEW_TITLES: Record<NavView, string> = {
  all_in_one: 'All-in-One',
  quick_glance: 'Quick Glance',
  home: 'Home',
  today: 'Today',
  digital_planner: 'Physical Planner',
  planner: 'Week / Month',
  calendar: 'Calendar',
  task_calendar: 'Task Calendar',
  tasks: 'Tasks',
  chores: 'Chores',
  history: 'History',
  reports: 'Reports & Stats',
  lab: 'Lab Management',
  calculator: 'Calculator & Math',
  spreadsheets: 'Spreadsheets',
  presentations: 'Presentations',
  projects: 'Projects & Records',
  game_dev: 'Game Dev Studio',
  book_writing: 'Book Studio',
  kanban: 'Kanban Boards',
  whiteboard: 'Infinite Whiteboard',
  code_studio: 'Code Sandbox',
  photo_studio: 'Photo Studio',
  scanner: 'Note Scanner & OCR',
  pdf_studio: 'PDF Reader & Editor',
  files: 'Universal Files',
  events: 'Life Events',
  notes: 'Notes',
  thoughts: 'Thoughts',
  diary: 'Diary',
  learning: 'Review Deck',
  clock: 'Clock',
  alarms: 'Alarms',
  timers: 'Timers',
  stopwatch: 'Stopwatch',
  countdown: 'Countdowns',
  recipes: 'Recipes',
  pantry: 'Pantry',
  meals: 'Meals',
  shopping: 'Groceries',
  goals: 'Goals',
  habits: 'Habits',
  household: 'Household',
  people: 'People',
  health: 'Health & Meds',
  finance: 'Finance',
  media: 'Media Shelf',
  travel: 'Travel',
  home_assets: 'Home Assets',
  spaces: 'Spaces',
  custom_tab: 'Custom Tab',
  insights: 'Insights',
  rituals: 'Rituals',
  automations: 'Automations',
  guide: 'Guide & Help',
  trash: 'Trash',
  settings: 'Settings',
};

export const TopBar: React.FC = React.memo(() => {
  const syncState = useSyncState();
  const {
    settings,
    patchSettings,
    activeView,
    activeCustomTabId,
    triggerSyncNow,
    setQuickCaptureOpen,
    setSearchOpen,
    setPaletteOpen,
    setActiveView,
    setZenOpen,
    undo,
    redo,
    canInstallPwa,
    triggerInstallPwa,
    setMobileMenuOpen,
    pushToast,
  } = useApp();

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [primaryInput, setPrimaryInput] = useState(settings.syncServerUrl || '');
  const [fallbackInput, setFallbackInput] = useState(settings.syncFallbackUrl || '');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string>('');
  const testingRef = useRef(false);

  const openSyncModal = () => {
    setPrimaryInput(settings.syncServerUrl || '');
    setFallbackInput(settings.syncFallbackUrl || '');
    setTestMsg('');
    setSyncModalOpen(true);
  };

  const syncLabel =
    syncState.status === 'synced'
      ? 'Synced'
      : syncState.status === 'deferred'
        ? `Saved locally (${syncState.pendingCount})`
      : syncState.status === 'syncing'
        ? 'Syncing…'
        : syncState.status === 'offline'
          ? `Offline (${syncState.pendingCount})`
          : syncState.status === 'error'
            ? 'Sync Setup'
            : settings.operatingMode === 'offline-phone'
              ? 'Offline'
              : 'Local Only';

  const currentMobileTitle =
    activeView === 'custom_tab'
      ? settings.customTabs.find((t) => t.id === activeCustomTabId)?.name || 'Custom Tab'
      : VIEW_TITLES[activeView] || settings.plannerTitle;

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (testingRef.current) return;
    testingRef.current = true;
    setTesting(true); setTestMsg('');
    try {
      const normPrimary = normalizeServerUrl(primaryInput);
      const normFallback = normalizeServerUrl(fallbackInput);
      for (const url of [normPrimary, normFallback].filter(Boolean)) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
          throw new Error('Use an HTTP(S) server URL without credentials, query parameters or fragments.');
        }
      }
      setPrimaryInput(normPrimary); setFallbackInput(normFallback);
      const targets = Array.from(new Set([normPrimary, normFallback].filter(Boolean)));
      const results = await Promise.all((targets.length ? targets : ['']).map((url) => testServerConnection(url)));
      setTestMsg(results.map((r) => r.ok
        ? `✓ ${r.normalizedUrl || 'Same origin'} — Connected (${r.latencyMs}ms · ${r.recordCount ?? 0} records)`
        : `✕ ${r.normalizedUrl || 'Same origin'} — ${r.error}`).join('\n'));
      if (!results.some((r) => r.ok)) {
        setTestMsg((msg) => `${msg}\nExisting settings retained. Check the address and try again.`);
        return;
      }
      // Do not forward a previous server's bearer token to a newly configured address.
      const changed = normPrimary !== normalizeServerUrl(settings.syncServerUrl || '') || normFallback !== normalizeServerUrl(settings.syncFallbackUrl || '');
      await patchSettings({ operatingMode: 'docker-sync', syncServerUrl: normPrimary, syncFallbackUrl: normFallback,
        ...(changed ? { syncAuthToken: '' } : {}) });
      await triggerSyncNow();
      pushToast(changed && settings.syncAuthToken ? 'Server changed. Pair this device again in Settings if required.' : 'Server connection saved; sync requested.');
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Connection setup failed.');
    } finally { testingRef.current = false; setTesting(false); }
  };

  return (
    <>
      <header className="dp-topbar">
        {/* Native-Style Mobile Header Left: Drawer Menu + Page Title */}
        <button
          type="button"
          className="dp-icon-btn dp-mobile-only"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={21} />
        </button>
        <div className="dp-mobile-title dp-mobile-only" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMobileMenuOpen(true); } }} onClick={() => setMobileMenuOpen(true)}>
          <strong>{currentMobileTitle}</strong>
          {settings.activeProfileId !== 'all' && (
            <span className="dp-pill" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {settings.familyProfiles.find((p) => p.id === settings.activeProfileId)?.emoji}
            </span>
          )}
        </div>

        {/* Desktop Switchers & Quick Actions */}
        <select
          aria-label="Active workspace profile"
          className="dp-workspace-select dp-desktop-only"
          value={settings.activeWorkspaceId}
          onChange={(e) => void patchSettings({ activeWorkspaceId: e.target.value })}
        >
          {settings.workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.emoji} {ws.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Active family member profile"
          className="dp-workspace-select dp-desktop-only"
          value={settings.activeProfileId}
          onChange={(e) => void patchSettings({ activeProfileId: e.target.value })}
          title="Switch between Combined Family view or a specific family member profile"
        >
          <option value="all">🏡 Everyone (Family)</option>
          {settings.familyProfiles.map((prof) => (
            <option key={prof.id} value={prof.id}>
              {prof.emoji} {prof.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="dp-btn dp-btn-sm dp-desktop-only"
          onClick={() => setSearchOpen(true)}
          title="Global Fuzzy Search (/)"
        >
          <Search size={15} />
          <span>Search</span>
        </button>

        <button
          type="button"
          className="dp-btn dp-btn-primary dp-btn-sm dp-desktop-only"
          onClick={() => setQuickCaptureOpen(true)}
          title="Quick Capture (N)"
        >
          <Plus size={15} />
          <span>Capture</span>
        </button>

        <button
          type="button"
          className="dp-icon-btn dp-desktop-only"
          onClick={() => setPaletteOpen(true)}
          title="Command Palette (Ctrl/Cmd+K)"
          aria-label="Open Command Palette"
        >
          <Command size={16} />
        </button>

        <div className="dp-topbar-spacer" />

        {/* Mobile quick search button */}
        <button
          type="button"
          className="dp-icon-btn dp-mobile-only"
          onClick={() => setSearchOpen(true)}
          aria-label="Search planner"
        >
          <Search size={19} />
        </button>

        {canInstallPwa && (
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm dp-desktop-only"
            onClick={() => void triggerInstallPwa()}
            title="Install Planaday as a standalone app"
          >
            <Download size={14} />
            <span>Install App</span>
          </button>
        )}

        <button
          type="button"
          className="dp-icon-btn dp-desktop-only"
          onClick={() => void undo()}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>

        <button
          type="button"
          className="dp-icon-btn dp-desktop-only"
          onClick={() => void redo()}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>

        <button
          type="button"
          className={`dp-btn dp-btn-sm dp-desktop-only ${settings.lowEnergyMode ? 'dp-btn-primary' : ''}`}
          onClick={() => void patchSettings({ lowEnergyMode: !settings.lowEnergyMode })}
          aria-pressed={settings.lowEnergyMode}
          title="Toggle Low-Energy / Overwhelmed Mode"
        >
          <Sparkles size={14} />
          <span>{settings.lowEnergyMode ? 'Calm Mode On' : 'Calm'}</span>
        </button>

        <button
          type="button"
          className="dp-icon-btn dp-desktop-only"
          onClick={() => setZenOpen(true)}
          title="Distraction-Free Zen Sheet"
          aria-label="Open Zen Sheet"
        >
          <Feather size={16} />
        </button>

        <button
          type="button"
          className="dp-sync-pill"
          data-status={syncState.status}
          onClick={openSyncModal}
          title="Sync Status & Server Connection Settings"
        >
          <span className="dp-sync-dot" aria-hidden="true" />
          <span>{syncLabel}</span>
        </button>

        <button
          type="button"
          className="dp-icon-btn dp-desktop-only"
          onClick={() => setActiveView('guide')}
          title="App Guide & Documentation"
          aria-label="Open App Guide"
        >
          <HelpCircle size={17} />
        </button>

        <button
          type="button"
          className="dp-icon-btn"
          onClick={() => setActiveView('settings')}
          title="Settings & Theme Studio"
          aria-label="Open Settings"
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Quick Server Sync & Tailscale Connection Wizard Modal */}
      <ModalDialog open={syncModalOpen} dismissible={!testing} onClose={() => { if (!testingRef.current) setSyncModalOpen(false); }} title="Docker & Tailscale Sync Connection">
        <form className="dp-stack" onSubmit={handleSaveAndTest}>
          <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)', gap: 6 }}>
            <div className="dp-between">
              <strong className="dp-row">
                <Wifi size={15} /> Current Status: {syncLabel}
              </strong>
              {syncState.activeServerUrl && <span className="dp-pill highlight">Via {syncState.activeServerUrl}</span>}
            </div>
            {syncState.errorMessage && (
              <div style={{ fontSize: '0.82rem', color: 'var(--dp-danger)' }}>{syncState.errorMessage}</div>
            )}
            {syncState.lastSyncAt && (
              <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                Last synced: {new Date(syncState.lastSyncAt).toLocaleString()} · Queued changes: {syncState.pendingCount}
              </div>
            )}
          </div>

          <label className="dp-stack" style={{ gap: 4 }}>
            <strong style={{ fontSize: '0.86rem' }}>1. Primary Server URL (Home Wi-Fi / LAN)</strong>
            <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
              Include the port if your server uses a non-default port — e.g. <code>http://192.168.88.31:3000</code>
            </span>
            <input
              className="dp-input"
              placeholder="http://192.168.88.31:3000"
              disabled={testing}
              inputMode="url" autoCapitalize="none" spellCheck={false}
              value={primaryInput}
              onChange={(e) => setPrimaryInput(e.target.value)}
            />
          </label>

          <label className="dp-stack" style={{ gap: 4 }}>
            <strong style={{ fontSize: '0.86rem' }}>2. Fallback Server URL (Tailscale IP / Remote)</strong>
            <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
              Used automatically when away from home! Use your Docker host&apos;s Tailscale IP: <code>http://100.x.y.z:3000</code> or MagicDNS <code>http://servername:3000</code>
            </span>
            <input
              className="dp-input"
              placeholder="http://100.x.y.z:3000 (optional Tailscale fallback)"
              disabled={testing}
              inputMode="url" autoCapitalize="none" spellCheck={false}
              value={fallbackInput}
              onChange={(e) => setFallbackInput(e.target.value)}
            />
          </label>

          {testMsg && (
            <pre
              role="status"
              className="dp-card"
              style={{
                margin: 0,
                padding: 10,
                whiteSpace: 'pre-wrap',
                fontSize: '0.8rem',
                background: 'var(--dp-surface-2)',
              }}
            >
              {testMsg}
            </pre>
          )}

          <div className="dp-between">
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={testing}
              onClick={async () => {
                if (testingRef.current) return;
                testingRef.current = true; setTesting(true);
                try { await patchSettings({ operatingMode: 'offline-phone' }); setSyncModalOpen(false); pushToast('Switched to Standalone Offline Mode'); }
                catch { setTestMsg('Could not switch mode. Please retry.'); }
                finally { testingRef.current = false; setTesting(false); }
              }}
            >
              Use Offline Only
            </button>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                disabled={testing || syncState.status === 'syncing'}
                onClick={() => void triggerSyncNow().catch(() => setTestMsg('Sync request failed.'))}
              >
                <RefreshCw size={13} /> Sync Now
              </button>
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm" disabled={testing}>
                <CheckCircle2 size={14} /> {testing ? 'Testing…' : 'Save & Test Connection'}
              </button>
            </div>
          </div>
        </form>
      </ModalDialog>
    </>
  );
});
