import React from 'react';
import {
  Command,
  Download,
  Feather,
  HelpCircle,
  Plus,
  Redo2,
  Search,
  Settings,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';

export const TopBar: React.FC = () => {
  const {
    settings,
    patchSettings,
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
  } = useApp();

  const syncLabel =
    syncState.status === 'synced'
      ? 'Synced'
      : syncState.status === 'syncing'
        ? 'Syncing…'
        : syncState.status === 'offline'
          ? `Offline (${syncState.pendingCount})`
          : syncState.status === 'error'
            ? 'Sync Retry'
            : settings.operatingMode === 'offline-phone'
              ? 'Offline Phone'
              : 'Offline Local';

  return (
    <header className="dp-topbar">
      <select
        aria-label="Active workspace profile"
        className="dp-workspace-select"
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
        className="dp-workspace-select"
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
        className="dp-btn dp-btn-sm"
        onClick={() => setSearchOpen(true)}
        title="Global Fuzzy Search (/)"
      >
        <Search size={15} />
        <span className="dp-hide-xs">Search</span>
      </button>

      <button
        type="button"
        className="dp-btn dp-btn-primary dp-btn-sm"
        onClick={() => setQuickCaptureOpen(true)}
        title="Quick Capture (N)"
      >
        <Plus size={15} />
        <span>Capture</span>
      </button>

      <button
        type="button"
        className="dp-icon-btn"
        onClick={() => setPaletteOpen(true)}
        title="Command Palette (Ctrl/Cmd+K)"
        aria-label="Open Command Palette"
      >
        <Command size={16} />
      </button>

      <div className="dp-topbar-spacer" />

      {canInstallPwa && (
        <button
          type="button"
          className="dp-btn dp-btn-primary dp-btn-sm"
          onClick={() => void triggerInstallPwa()}
          title="Install Dayplana as a standalone app"
        >
          <Download size={14} />
          <span className="dp-hide-xs">Install App</span>
        </button>
      )}

      <button
        type="button"
        className="dp-icon-btn"
        onClick={() => void undo()}
        title="Undo (Ctrl/Cmd+Z)"
        aria-label="Undo"
      >
        <Undo2 size={16} />
      </button>

      <button
        type="button"
        className="dp-icon-btn"
        onClick={() => void redo()}
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo"
      >
        <Redo2 size={16} />
      </button>

      <button
        type="button"
        className={`dp-btn dp-btn-sm ${settings.lowEnergyMode ? 'dp-btn-primary' : ''}`}
        onClick={() => void patchSettings({ lowEnergyMode: !settings.lowEnergyMode })}
        title="Toggle Low-Energy / Overwhelmed Mode"
      >
        <Sparkles size={14} />
        <span className="dp-hide-xs">{settings.lowEnergyMode ? 'Calm Mode On' : 'Calm'}</span>
      </button>

      <button
        type="button"
        className="dp-icon-btn"
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
        onClick={() => (settings.operatingMode === 'docker-sync' ? void triggerSyncNow() : setActiveView('settings'))}
        title="Save & Sync Status"
      >
        <span className="dp-sync-dot" aria-hidden="true" />
        <span className="dp-hide-xs">{syncLabel}</span>
      </button>

      <button
        type="button"
        className="dp-icon-btn"
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
        <Settings size={17} />
      </button>
    </header>
  );
};
