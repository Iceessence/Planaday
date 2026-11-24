import React, { useState } from 'react';
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
import { useApp } from '../../core/AppContext';
import { normalizeServerUrl, testServerConnection } from '../../core/sync';
import { ModalDialog } from '../Common/ModalDialog';
import type { NavView } from '../../core/types';

const VIEW_TITLES: Record<NavView, string> = {
  all_in_one: 'All-in-One',
  home: 'Home',
  today: 'Today',
  planner: 'Week / Month',
  calendar: 'Calendar',
  tasks: 'Tasks',
  chores: 'Chores',
  history: 'History',
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

export const TopBar: React.FC = () => {
  const {
    settings,
    patchSettings,
    activeView,
    activeCustomTabId,
    syncState,
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

  const openSyncModal = () => {
    setPrimaryInput(settings.syncServerUrl || '');
    setFallbackInput(settings.syncFallbackUrl || '');
    setTestMsg('');
    setSyncModalOpen(true);
  };

  const syncLabel =
    syncState.status === 'synced'
      ? 'Synced'
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
    setTesting(true);
    setTestMsg('');
    const normPrimary = normalizeServerUrl(primaryInput);
    const normFallback = normalizeServerUrl(fallbackInput);
    setPrimaryInput(normPrimary);
    setFallbackInput(normFallback);

    await patchSettings({
      operatingMode: 'docker-sync',
      syncServerUrl: normPrimary,
      syncFallbackUrl: normFallback,
    });

    const targets = [normPrimary, normFallback].filter(Boolean);
    if (targets.length === 0) {
      const sameOrigin = await testServerConnection('');
      setTestMsg(
        sameOrigin.ok
          ? `✓ Connected to same-origin server (${sameOrigin.latencyMs}ms)`
          : 'Enter your Docker LAN IP (e.g. http://192.168.88.31:3000) or Tailscale IP (http://100.x.y.z:3000).'
      );
      setTesting(false);
      return;
    }

    const lines: string[] = [];
    let anyOk = false;
    for (const url of targets) {
      const res = await testServerConnection(url);
      if (res.ok) {
        anyOk = true;
        lines.push(`✓ ${res.normalizedUrl} — Connected (${res.latencyMs}ms · ${res.recordCount ?? 0} records)`);
      } else {
        lines.push(`✕ ${res.normalizedUrl} — ${res.error}`);
      }
    }
    setTestMsg(lines.join('\n'));
    if (anyOk) {
      await triggerSyncNow();
      pushToast('Connected & synced with Planaday server!');
    }
    setTesting(false);
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
        <div className="dp-mobile-title dp-mobile-only" onClick={() => setMobileMenuOpen(true)}>
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
      <ModalDialog open={syncModalOpen} onClose={() => setSyncModalOpen(false)} title="Docker & Tailscale Sync Connection">
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
              Must include port <code>:3000</code> — e.g. <code>http://192.168.88.31:3000</code>
            </span>
            <input
              className="dp-input"
              placeholder="http://192.168.88.31:3000"
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
              value={fallbackInput}
              onChange={(e) => setFallbackInput(e.target.value)}
            />
          </label>

          {testMsg && (
            <pre
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
              onClick={async () => {
                await patchSettings({ operatingMode: 'offline-phone' });
                setSyncModalOpen(false);
                pushToast('Switched to Standalone Offline Mode');
              }}
            >
              Use Offline Only
            </button>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => void triggerSyncNow()}
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
};
