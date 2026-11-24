import React from 'react';
import {
  Command,
  Feather,
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
        onClick={() => setActiveView('settings')}
        title="Settings & Theme Studio"
        aria-label="Open Settings"
      >
        <Settings size={17} />
      </button>
    </header>
  );
};
