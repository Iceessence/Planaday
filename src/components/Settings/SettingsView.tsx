import React, { useEffect, useRef, useState } from 'react';
import { Bell, Plus, Trash2, Users, Volume2 } from 'lucide-react';
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
import {
  fetchServerStorageInfo,
  normalizeServerUrl,
  resolveConflict,
  testServerConnection,
  triggerServerSqliteBackup,
  type ServerStorageInfo,
} from '../../core/sync';
import { compactOutbox, wipeSampleData } from '../../core/repository';
import { applyOnboardingPreset, ONBOARDING_PRESETS } from '../../data/sampleData';
import { audioEngine } from '../../core/audio';
import {
  detectRuntimePlatform,
  requestAlarmNotificationPermission,
  syncPushConfigToServer,
} from '../../core/nativeAlarms';
import type { ChimeStyle, FamilyProfile, ModuleId, NavView, OperatingMode } from '../../core/types';

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

const QUICK_ACCENTS = ['#a97434', '#4f7a65', '#3b6ea5', '#b5453a', '#6b5ca5', '#c96f53', '#2f7a78', '#b05a84'];

const CHIME_STYLES: Array<{ id: ChimeStyle; label: string }> = [
  { id: 'bell', label: 'Warm Bell (2-tone)' },
  { id: 'soft', label: 'Soft Chime (1-tone)' },
  { id: 'marimba', label: 'Warm Marimba Arpeggio' },
  { id: 'classic_alarm', label: 'Classic Beep Alarm (Loud)' },
  { id: 'woodblock', label: 'Crisp Woodblock' },
  { id: 'bright', label: 'Bright Rising Chime' },
];

const MODULE_META: Array<{ id: ModuleId; label: string; group: string; optional?: boolean }> = [
  { id: 'calendar', label: 'Flow Calendar', group: 'Core' },
  { id: 'quick_glance', label: 'Quick Glance Dashboard', group: 'Core' },
  { id: 'task_calendar', label: 'Intelligent Task Calendar', group: 'Core' },
  { id: 'digital_planner', label: 'Physical-Style Digital Planner', group: 'Core' },
  { id: 'reports', label: 'Advanced Reports & Analytics', group: 'Core' },
  { id: 'lab', label: 'Comprehensive Laboratory Management', group: 'Professional Workspace' },
  { id: 'calculator', label: 'Calculator, Lab Math, 2D/3D Graph & Converters', group: 'Create & Math' },
  { id: 'spreadsheets', label: 'Integrated Spreadsheets & Live Data Sheets', group: 'Create & Math' },
  { id: 'presentations', label: 'Presentation Creator & Presenter View', group: 'Create & Math' },
  { id: 'kanban', label: 'Universal Kanban Boards (Live Tasks + Custom)', group: 'Create & Math' },
  { id: 'whiteboard', label: 'Infinite Whiteboard & Visual Canvas', group: 'Create & Math' },
  { id: 'projects', label: 'Creative Projects & Custom Record Builder', group: 'Create & Math' },
  { id: 'game_dev', label: 'Game Development Workspace', group: 'Create & Math' },
  { id: 'book_writing', label: 'Book Writing & Story Continuity Studio', group: 'Create & Math' },
  { id: 'code_studio', label: 'Sandboxed Code Editor & Unit Test Runner', group: 'Create & Math' },
  { id: 'photo_studio', label: 'Camera, Photo Library & Non-Destructive Editor', group: 'Create & Math' },
  { id: 'files', label: 'Universal Document & File Hub', group: 'Create & Math' },
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
    openCustomTab,
  } = useApp();

  const [tab, setTab] = useState<'theme' | 'notifications' | 'profiles' | 'modules' | 'sync' | 'export' | 'schedule'>('theme');
  const [newWsName, setNewWsName] = useState('');
  const [newProfName, setNewProfName] = useState('');
  const [newProfEmoji, setNewProfEmoji] = useState('😊');
  const [newProfColor, setNewProfColor] = useState('#4f7a65');
  const [newProfRole, setNewProfRole] = useState<FamilyProfile['role']>('member');
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('🏷️');
  const [newCatColor, setNewCatColor] = useState('#3b6ea5');
  const [newTabName, setNewTabName] = useState('');
  const [newTabEmoji, setNewTabEmoji] = useState('✨');
  const [newTabColor, setNewTabColor] = useState('#a97434');
  const [syncPrimaryDraft, setSyncPrimaryDraft] = useState(settings.syncServerUrl || '');
  const [syncFallbackDraft, setSyncFallbackDraft] = useState(settings.syncFallbackUrl || '');
  const [syncTestOutput, setSyncTestOutput] = useState('');
  const [syncTesting, setSyncTesting] = useState(false);
  const [serverStorage, setServerStorage] = useState<ServerStorageInfo | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'sync') return;
    let cancelled = false;
    void fetchServerStorageInfo().then((info) => {
      if (!cancelled) setServerStorage(info);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, syncState.lastSyncAt, settings.syncServerUrl]);

  const importBackupRef = useRef<HTMLInputElement | null>(null);
  const importThemeRef = useRef<HTMLInputElement | null>(null);

  const guarded = computeGuardedTheme(settings.customTokens, settings.contrastLevel === 'AAA' ? 7.0 : 4.5);
  const runtimeInfo = detectRuntimePlatform();
  const np = settings.notificationPrefs;

  const updateNotif = (patch: Partial<typeof np>) => {
    void patchSettings({ notificationPrefs: { ...np, ...patch } });
  };

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
          <h2>Settings, Notifications, Family Profiles &amp; Personalization</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            Zero localStorage · Unlimited IndexedDB + Blob storage · Automatic OKLCH WCAG contrast guard
          </p>
        </div>
        <div className="dp-row" style={{ gap: 5 }}>
          {(
            [
              ['theme', 'Theme & Style'],
              ['notifications', 'Notifications & Sound'],
              ['profiles', 'Family Profiles'],
              ['modules', 'Tabs & Modules'],
              ['sync', '3-Mode Sync'],
              ['schedule', 'Clock & Rollover'],
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

      {/* --- TAB: NOTIFICATIONS, VOLUME, LEAD TIMES & CHIME STYLES --- */}
      {tab === 'notifications' && (
        <div className="dp-stack">
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <div className="dp-between">
              <h4><Bell size={16} /> Master Notification &amp; Sound Controls</h4>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={async () => {
                  const ok = await requestAlarmNotificationPermission();
                  pushToast(ok ? 'OS Notifications enabled!' : 'Browser denied notification permission — check site settings.');
                }}
              >
                Enable OS / Lock-Screen Notifications
              </button>
            </div>

            <div className="dp-row" style={{ gap: 16 }}>
              <label className="dp-row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={np.enabled && settings.notificationsEnabled}
                  onChange={(e) => {
                    void patchSettings({
                      notificationsEnabled: e.target.checked,
                      notificationPrefs: { ...np, enabled: e.target.checked },
                    });
                  }}
                />
                <strong>Enable All Alerts</strong>
              </label>
              <label className="dp-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={np.soundEnabled} onChange={(e) => updateNotif({ soundEnabled: e.target.checked })} />
                <span>Play Sound Chime</span>
              </label>
              <label className="dp-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={np.osPushEnabled} onChange={(e) => updateNotif({ osPushEnabled: e.target.checked })} />
                <span>Show OS / System Banner</span>
              </label>
              <label className="dp-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={np.vibrateEnabled !== false} onChange={(e) => updateNotif({ vibrateEnabled: e.target.checked })} />
                <span>Vibrate on Phone</span>
              </label>
            </div>

            {/* Quiet Hours + Live Test Notification */}
            <div className="dp-card dp-between" style={{ padding: 10, background: 'var(--dp-surface-2)', flexWrap: 'wrap', gap: 8 }}>
              <div className="dp-row" style={{ gap: 8, flexWrap: 'wrap', fontSize: '0.84rem' }}>
                <label className="dp-row" style={{ cursor: 'pointer', gap: 5 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(np.quietHoursEnabled)}
                    onChange={(e) => updateNotif({ quietHoursEnabled: e.target.checked })}
                  />
                  <strong>🌙 Quiet Hours (silences non-alarm alerts):</strong>
                </label>
                <input
                  type="time"
                  aria-label="Quiet hours start"
                  className="dp-input"
                  style={{ width: 118 }}
                  value={np.quietHoursStart || '22:00'}
                  onChange={(e) => updateNotif({ quietHoursStart: e.target.value })}
                />
                <span className="dp-muted">to</span>
                <input
                  type="time"
                  aria-label="Quiet hours end"
                  className="dp-input"
                  style={{ width: 118 }}
                  value={np.quietHoursEnd || '07:00'}
                  onChange={(e) => updateNotif({ quietHoursEnd: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  audioEngine.playChime(np.chimeStyle, Math.max(0.05, np.volume / 100));
                  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try {
                      new Notification('Planaday Test Alert', { body: 'Notifications and sound are working on this device!' });
                    } catch {
                      // fallback toast below
                    }
                  }
                  pushToast('🔔 Test notification fired! (Check OS banner & volume)');
                }}
              >
                🔔 Send Test Notification
              </button>
            </div>

            <div className="dp-grid-2" style={{ gap: 12 }}>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">
                  <Volume2 size={14} style={{ verticalAlign: '-2px' }} /> Alarm &amp; Notification Loudness: <strong>{np.volume}%</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={np.volume}
                  onChange={(e) => updateNotif({ volume: Number(e.target.value) })}
                />
              </label>

              <div className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Alert Sound Style</span>
                <div className="dp-row">
                  <select
                    aria-label="Chime style"
                    className="dp-select"
                    style={{ flex: 1 }}
                    value={np.chimeStyle}
                    onChange={(e) => updateNotif({ chimeStyle: e.target.value as ChimeStyle })}
                  >
                    {CHIME_STYLES.map((cs) => (
                      <option key={cs.id} value={cs.id}>{cs.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => audioEngine.playChime(np.chimeStyle, Math.max(0.05, np.volume / 100))}
                  >
                    ▶ Preview ({np.volume}%)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>What Notifies You &amp; How Much Before</h4>
            <div className="dp-grid-2" style={{ gap: 12 }}>
              <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
                <label className="dp-between" style={{ cursor: 'pointer' }}>
                  <strong>📅 Calendar Events</strong>
                  <input type="checkbox" checked={np.notifyEvents} onChange={(e) => updateNotif({ notifyEvents: e.target.checked })} />
                </label>
                <label className="dp-row" style={{ fontSize: '0.84rem' }}>
                  <span className="dp-muted">Notify before event:</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    className="dp-input"
                    style={{ width: 72 }}
                    value={np.eventLeadMinutes}
                    onChange={(e) => updateNotif({ eventLeadMinutes: Math.max(0, Math.min(180, Number(e.target.value) || 0)) })}
                  />
                  <span>min before</span>
                </label>
                <div className="dp-row" style={{ gap: 4 }}>
                  {[0, 5, 10, 15, 30, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`dp-btn dp-btn-sm ${np.eventLeadMinutes === m ? 'dp-btn-primary' : ''}`}
                      onClick={() => updateNotif({ eventLeadMinutes: m })}
                    >
                      {m === 0 ? 'At start' : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
                <label className="dp-between" style={{ cursor: 'pointer' }}>
                  <strong>🧹 Due &amp; Overdue Chores</strong>
                  <input type="checkbox" checked={np.notifyChores} onChange={(e) => updateNotif({ notifyChores: e.target.checked })} />
                </label>
                <label className="dp-row" style={{ fontSize: '0.84rem' }}>
                  <span className="dp-muted">Daily chore reminder time:</span>
                  <input
                    type="time"
                    className="dp-input"
                    style={{ width: 124 }}
                    value={np.choreReminderTime}
                    onChange={(e) => updateNotif({ choreReminderTime: e.target.value })}
                  />
                </label>
              </div>

              <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
                <label className="dp-between" style={{ cursor: 'pointer' }}>
                  <strong>⏱️ Stopwatch Milestones</strong>
                  <input type="checkbox" checked={np.notifyStopwatch} onChange={(e) => updateNotif({ notifyStopwatch: e.target.checked })} />
                </label>
                <label className="dp-row" style={{ fontSize: '0.84rem' }}>
                  <span className="dp-muted">Chime every:</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    className="dp-input"
                    style={{ width: 72 }}
                    value={np.stopwatchIntervalMin}
                    onChange={(e) => updateNotif({ stopwatchIntervalMin: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <span>min (0 = off)</span>
                </label>
              </div>

              <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
                <label className="dp-between" style={{ cursor: 'pointer' }}>
                  <strong>⏲️ Timers &amp; Pomodoros</strong>
                  <input type="checkbox" checked={np.notifyTimers} onChange={(e) => updateNotif({ notifyTimers: e.target.checked })} />
                </label>
                <label className="dp-between" style={{ cursor: 'pointer' }}>
                  <strong>⏰ Smart Alarms &amp; Medications</strong>
                  <input type="checkbox" checked={np.notifyAlarms} onChange={(e) => updateNotif({ notifyAlarms: e.target.checked })} />
                </label>
              </div>
            </div>
          </div>

          <div className="dp-card dp-stack" style={{ padding: 14, background: 'var(--dp-surface-2)' }}>
            <strong>
              Background Push Relay ({runtimeInfo.canWakeWhenBrowserClosed ? 'Native App Active ✓' : 'Works When Chrome Is Closed via Docker + ntfy'})
            </strong>
            <div className="dp-row">
              <input
                className="dp-input"
                style={{ flex: 2 }}
                placeholder="https://ntfy.sh/your-private-topic"
                value={settings.ntfyPushUrl || ''}
                onChange={(e) => void patchSettings({ ntfyPushUrl: e.target.value })}
              />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={async () => {
                  const ok = await syncPushConfigToServer(settings.syncServerUrl, settings.ntfyPushUrl || '', settings.defaultTimeZone, np);
                  pushToast(ok ? 'Synced notification preferences & push URL to Docker server!' : 'Saved locally (connect Docker server to push when Chrome is closed).');
                }}
              >
                Sync Rules to Docker Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB: FAMILY MEMBER PROFILES & SHARING --- */}
      {tab === 'profiles' && (
        <div className="dp-stack">
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4><Users size={16} /> Family Member Profiles &amp; Cross-Profile Sharing</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              Create profiles for everyone in your household. Switch between <strong>Everyone (Family)</strong> or an individual profile from the Top Bar.
              Items marked <strong>🏡 Share with Family</strong> appear across all shared profiles, and <strong>★ Important</strong> items pin to the top of Home &amp; Today!
            </p>

            <form
              className="dp-row"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newProfName.trim();
                if (!name) return;
                const prof: FamilyProfile = {
                  id: `prof_${Date.now().toString(36)}`,
                  name,
                  emoji: newProfEmoji.trim() || '😊',
                  color: newProfColor,
                  role: newProfRole,
                };
                void patchSettings({ familyProfiles: [...settings.familyProfiles, prof] });
                setNewProfName('');
                pushToast(`Added family profile "${prof.name}"`);
              }}
            >
              <input className="dp-input" style={{ width: 52, textAlign: 'center' }} value={newProfEmoji} onChange={(e) => setNewProfEmoji(e.target.value)} aria-label="Profile emoji" />
              <input className="dp-input" style={{ flex: 2 }} placeholder="Family member name (e.g., Sarah, Leo, Dad)…" value={newProfName} onChange={(e) => setNewProfName(e.target.value)} />
              <select aria-label="Role" className="dp-select" style={{ width: 'auto' }} value={newProfRole} onChange={(e) => setNewProfRole(e.target.value as FamilyProfile['role'])}>
                <option value="parent">Parent / Admin</option>
                <option value="member">Member</option>
                <option value="kid">Kid</option>
              </select>
              <input type="color" aria-label="Profile color" value={newProfColor} onChange={(e) => setNewProfColor(e.target.value)} />
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Profile</button>
            </form>

            <div className="dp-grid-2" style={{ gap: 10 }}>
              {settings.familyProfiles.map((prof) => {
                const isActive = settings.activeProfileId === prof.id;
                return (
                  <div key={prof.id} className="dp-card dp-between" style={{ padding: 12, borderInlineStart: `4px solid ${prof.color}` }}>
                    <div>
                      <strong>{prof.emoji} {prof.name}</strong>{' '}
                      <span className="dp-pill">{prof.role}</span>
                      {isActive && <span className="dp-pill highlight" style={{ marginInlineStart: 6 }}>Active</span>}
                    </div>
                    <div className="dp-row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className={`dp-btn dp-btn-sm ${isActive ? 'dp-btn-primary' : ''}`}
                        onClick={() => void patchSettings({ activeProfileId: isActive ? 'all' : prof.id })}
                      >
                        {isActive ? 'Viewing' : 'Switch To'}
                      </button>
                      {settings.familyProfiles.length > 1 && (
                        <button
                          type="button"
                          className="dp-icon-btn"
                          title="Delete profile"
                          onClick={() => {
                            const next = settings.familyProfiles.filter((p) => p.id !== prof.id);
                            void patchSettings({
                              familyProfiles: next,
                              activeProfileId: settings.activeProfileId === prof.id ? 'all' : settings.activeProfileId,
                            });
                            pushToast(`Removed profile "${prof.name}"`);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>Workspaces (Separate Planners like Personal / Work / Home)</h4>
            <div className="dp-row">
              {settings.workspaces.map((ws) => (
                <span key={ws.id} className="dp-pill">
                  {ws.emoji} {ws.name}
                  {settings.workspaces.length > 1 && ws.id !== settings.activeWorkspaceId && (
                    <button
                      type="button"
                      className="dp-btn dp-btn-ghost dp-btn-sm"
                      style={{ padding: '0 4px', marginInlineStart: 4 }}
                      onClick={() => void patchSettings({ workspaces: settings.workspaces.filter((x) => x.id !== ws.id) })}
                    >
                      ×
                    </button>
                  )}
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
        </div>
      )}

      {/* --- TAB: THEME, BRANDING, EVENT CATEGORIES & PERSONALIZATION --- */}
      {tab === 'theme' && (
        <div className="dp-stack">
          {/* Custom Planner Name, Card Roundness & Quick Accent Swatches */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>Personal Branding, Shape &amp; Accent</h4>
            <div className="dp-grid-3" style={{ gap: 10 }}>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Custom Planner Name</span>
                <input
                  className="dp-input"
                  value={settings.plannerTitle}
                  onChange={(e) => void patchSettings({ plannerTitle: e.target.value })}
                  placeholder="Planaday"
                />
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Card Corner Style</span>
                <select
                  className="dp-select"
                  value={settings.cardRadius}
                  onChange={(e) => void patchSettings({ cardRadius: e.target.value as 'sharp' | 'soft' | 'cozy' })}
                >
                  <option value="sharp">Crisp Archival Paper</option>
                  <option value="soft">Soft Rounded (Default)</option>
                  <option value="cozy">Cozy Pill Curves</option>
                </select>
              </label>
              <div className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Quick Accent Color</span>
                <div className="dp-row" style={{ gap: 5 }}>
                  {QUICK_ACCENTS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      aria-label={`Set accent ${col}`}
                      onClick={() => updateToken('primaryAccent', col)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: col,
                        border: settings.customTokens.primaryAccent === col ? '2px solid var(--dp-ink)' : '1px solid var(--dp-border)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom accent color"
                    value={settings.customTokens.primaryAccent}
                    onChange={(e) => updateToken('primaryAccent', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

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
              <h4>Paper Surface &amp; Tactile Details</h4>
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
                <input type="checkbox" checked={settings.paperGrain} onChange={(e) => void patchSettings({ paperGrain: e.target.checked })} />
                <span>Subtle SVG paper grain texture</span>
              </label>
              <label className="dp-row">
                <input type="checkbox" checked={settings.bookSpineShadow} onChange={(e) => void patchSettings({ bookSpineShadow: e.target.checked })} />
                <span>Open-book center spine shadow</span>
              </label>
              <label className="dp-row">
                <input type="checkbox" checked={settings.binderTabs} onChange={(e) => void patchSettings({ binderTabs: e.target.checked })} />
                <span>Colored binder divider tabs</span>
              </label>
              <label className="dp-row">
                <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => void patchSettings({ reducedMotion: e.target.checked })} />
                <span>Reduced motion</span>
              </label>
              <label className="dp-row">
                <input type="checkbox" checked={settings.rtl} onChange={(e) => void patchSettings({ rtl: e.target.checked })} />
                <span>Right-to-Left (RTL) layout mirroring</span>
              </label>
            </div>

            <div className="dp-card dp-stack">
              <h4>Typography, Density &amp; Color Scheme</h4>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Color Scheme</span>
                <select className="dp-select" value={settings.colorScheme} onChange={(e) => void patchSettings({ colorScheme: e.target.value as 'light' | 'dark' | 'system' })}>
                  <option value="system">System Automatic</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Font Pairing</span>
                <select className="dp-select" value={settings.fontPairing} onChange={(e) => void patchSettings({ fontPairing: e.target.value as FontPairing })}>
                  <option value="editorial-serif">Editorial Serif + Sans</option>
                  <option value="neo-grotesk">Neo-Grotesk Modern</option>
                  <option value="friendly-rounded">Friendly Rounded</option>
                  <option value="cozy-handwritten">Cozy Handwritten Headings</option>
                  <option value="crisp-monospace">Crisp Monospace</option>
                </select>
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Global Font Scale: {settings.fontSizePx} px (12–24 px)</span>
                <input type="range" min={12} max={24} value={settings.fontSizePx} onChange={(e) => void patchSettings({ fontSizePx: Number(e.target.value) })} />
              </label>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted">Density Mode</span>
                <select className="dp-select" value={settings.density} onChange={(e) => void patchSettings({ density: e.target.value as DensityMode })}>
                  <option value="airy">Airy</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>
          </div>

          {/* Event Categories Manager */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>Custom Event Categories ({settings.eventCategories.length})</h4>
            <div className="dp-row" style={{ gap: 6 }}>
              {settings.eventCategories.map((cat) => (
                <span key={cat.id} className="dp-pill" style={{ borderInlineStart: `3px solid ${cat.color}` }}>
                  {cat.emoji} {cat.name}
                  {settings.eventCategories.length > 1 && (
                    <button
                      type="button"
                      className="dp-btn dp-btn-ghost dp-btn-sm"
                      style={{ padding: '0 4px', marginInlineStart: 4 }}
                      onClick={() => void patchSettings({ eventCategories: settings.eventCategories.filter((c) => c.id !== cat.id) })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="dp-row">
              <input className="dp-input" style={{ width: 52, textAlign: 'center' }} value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} aria-label="New category emoji" />
              <input className="dp-input" style={{ flex: 1 }} placeholder="Add event category (e.g., Kids Sports, Appointments)…" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
              <input type="color" aria-label="New category color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={() => {
                  const nm = newCatName.trim();
                  if (!nm) return;
                  void patchSettings({
                    eventCategories: [...settings.eventCategories, { id: `cat_${Date.now().toString(36)}`, name: nm, emoji: newCatEmoji.trim() || '🏷️', color: newCatColor }],
                  });
                  setNewCatName('');
                  pushToast(`Added event category "${nm}"`);
                }}
              >
                + Add Category
              </button>
            </div>
          </div>

          <details className="dp-details">
            <summary>Custom Color Tokens &amp; .dmtheme Export / Import</summary>
            <div className="dp-grid-3" style={{ marginTop: 12 }}>
              {(Object.keys(settings.customTokens) as Array<keyof ThemeTokens>).map((tok) => (
                <label key={tok} className="dp-between" style={{ fontSize: '0.85rem' }}>
                  <span>{tok}</span>
                  <input type="color" value={settings.customTokens[tok]} onChange={(e) => updateToken(tok, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="dp-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const text = serializeThemePack(settings.themePresetId, settings.customTokens, settings.paperMaterial);
                  triggerBrowserDownload(text, `planaday-${settings.themePresetId}.dmtheme`, 'application/json');
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

      {/* --- TAB: CUSTOM SIDEBAR TABS & MODULE TOGGLES --- */}
      {tab === 'modules' && (
        <div className="dp-stack">
          {/* Custom Sidebar Tabs Creator */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>My Custom Sidebar Tabs ({settings.customTabs.length})</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
              Build your own standalone tabs that live directly in your sidebar with filtered Events, Tasks, Chores, Notes, Trackers, Timers &amp; Links.
            </p>
            <div className="dp-row">
              <input className="dp-input" style={{ width: 52, textAlign: 'center' }} value={newTabEmoji} onChange={(e) => setNewTabEmoji(e.target.value)} aria-label="Custom tab emoji" />
              <input className="dp-input" style={{ flex: 2 }} placeholder="New custom tab name (e.g., Fitness Hub, School, Garden)…" value={newTabName} onChange={(e) => setNewTabName(e.target.value)} />
              <input type="color" aria-label="Custom tab color" value={newTabColor} onChange={(e) => setNewTabColor(e.target.value)} />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={() => {
                  const nm = newTabName.trim();
                  if (!nm) return;
                  const id = `ctab_${Date.now().toString(36)}`;
                  void patchSettings({
                    customTabs: [
                      ...settings.customTabs,
                      {
                        id,
                        name: nm,
                        emoji: newTabEmoji.trim() || '✨',
                        color: newTabColor,
                        layout: 'grid',
                        widgets: [
                          { id: `wid_${Date.now().toString(36)}_1`, type: 'tasks', title: `${nm} Checklist` },
                          { id: `wid_${Date.now().toString(36)}_2`, type: 'note', title: `${nm} Scratchpad`, noteContent: '' },
                        ],
                      },
                    ],
                  });
                  setNewTabName('');
                  openCustomTab(id);
                  pushToast(`Created custom tab "${nm}"!`);
                }}
              >
                <Plus size={14} /> Create Custom Tab
              </button>
            </div>
            {settings.customTabs.length > 0 && (
              <div className="dp-row" style={{ gap: 6 }}>
                {settings.customTabs.map((ct) => (
                  <div key={ct.id} className="dp-pill" style={{ borderInlineStart: `3px solid ${ct.color}` }}>
                    <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" style={{ padding: 0 }} onClick={() => openCustomTab(ct.id)}>
                      {ct.emoji} {ct.name}
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-ghost dp-btn-sm"
                      style={{ padding: '0 4px', marginInlineStart: 4 }}
                      onClick={() => void patchSettings({ customTabs: settings.customTabs.filter((x) => x.id !== ct.id) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="dp-muted" style={{ margin: 0 }}>
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

          {/* 4 User-Selectable Mobile Layout Modes & Scaling */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>📱 Phone &amp; Tablet Layout Mode + Interface Scale</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Choose how Planaday behaves on phones and remember it automatically across sessions.
            </p>
            <div className="dp-grid-2" style={{ gap: 8 }}>
              {(
                [
                  ['adaptive', '📱 Adaptive Mobile (Default)', 'Automatically adapts to screen width with thumb-friendly controls & full-width editors.'],
                  ['portrait', '↕️ Portrait Only', 'Locks into a clean vertical single-column phone experience even if rotated.'],
                  ['portrait_landscape', '🔄 Portrait & Landscape', 'Stacks vertically in portrait and switches to side-by-side split view in landscape.'],
                  ['desktop_zoom', '🖥️ Desktop Layout (Pinch-to-Zoom)', 'Shows the full desktop sidebar & wide multi-column workspace with pinch-to-zoom and panning.'],
                ] as const
              ).map(([modeId, title, desc]) => (
                <button
                  key={modeId}
                  type="button"
                  className="dp-card"
                  style={{
                    textAlign: 'start',
                    padding: 10,
                    cursor: 'pointer',
                    borderColor: (settings.mobileLayoutMode ?? 'adaptive') === modeId ? 'var(--dp-accent)' : undefined,
                    borderWidth: (settings.mobileLayoutMode ?? 'adaptive') === modeId ? 2 : 1,
                  }}
                  onClick={() => {
                    void patchSettings({ mobileLayoutMode: modeId });
                    pushToast(`Layout mode set to ${title}`);
                  }}
                >
                  <strong style={{ fontSize: '0.88rem' }}>{title}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>{desc}</div>
                </button>
              ))}
            </div>
            <label className="dp-row" style={{ gap: 10, fontSize: '0.84rem', marginTop: 4 }}>
              <span className="dp-muted">Interface Scale: <strong>{settings.uiScalePct ?? 100}%</strong></span>
              <input
                type="range"
                min={80}
                max={130}
                step={5}
                style={{ flex: 1, maxWidth: 240 }}
                value={settings.uiScalePct ?? 100}
                onChange={(e) => void patchSettings({ uiScalePct: Number(e.target.value) })}
              />
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void patchSettings({ uiScalePct: 100 })}>
                Reset 100%
              </button>
            </label>
          </div>

          {/* Phone Bottom Navigation Bar Customizer */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <h4>Phone Bottom Tab Bar (Pick Your 4 Favorite Quick Tabs)</h4>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Choose which 4 tabs appear along the bottom of your phone app next to Menu.
            </p>
            <div className="dp-grid-2" style={{ gap: 8 }}>
              {[0, 1, 2, 3].map((slotIdx) => (
                <label key={slotIdx} className="dp-between" style={{ fontSize: '0.84rem' }}>
                  <span className="dp-muted">Phone Tab #{slotIdx + 1}</span>
                  <select
                    className="dp-select"
                    style={{ width: 'auto' }}
                    value={settings.mobilePrimaryTabs[slotIdx] ?? 'today'}
                    onChange={(e) => {
                      const next = [...settings.mobilePrimaryTabs];
                      next[slotIdx] = e.target.value as NavView;
                      void patchSettings({ mobilePrimaryTabs: next });
                    }}
                  >
                    <option value="home">Home</option>
                    <option value="quick_glance">Quick Glance</option>
                    <option value="today">Today</option>
                    <option value="digital_planner">Physical Planner</option>
                    <option value="calendar">Calendar</option>
                    <option value="task_calendar">Task Calendar</option>
                    <option value="tasks">Tasks</option>
                    <option value="chores">Chores</option>
                    <option value="lab">Lab Workspace</option>
                    <option value="reports">Reports</option>
                    <option value="timers">Timers</option>
                    <option value="notes">Notes</option>
                    <option value="recipes">Kitchen</option>
                    <option value="all_in_one">All-in-One</option>
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Phase 6: Creation Disclosure Mode & Schedule-Based Automatic Workspace Layouts (Sections 18.3 & 18.4) */}
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 10 }}>
            <h4>🧩 Creation Complexity Mode &amp; Schedule-Based Workspace Switching</h4>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10, fontSize: '0.84rem' }}>
              <label className="dp-row" style={{ gap: 6 }}>
                <span className="dp-muted">Creation Mode:</span>
                <select
                  className="dp-select"
                  style={{ width: 'auto' }}
                  value={settings.creationMode ?? 'standard'}
                  onChange={(e) => void patchSettings({ creationMode: e.target.value as 'simple' | 'standard' | 'advanced' })}
                >
                  <option value="simple">Simple (Minimal fields by default)</option>
                  <option value="standard">Standard (Expandable advanced options)</option>
                  <option value="advanced">Advanced (Show full fields immediately)</option>
                </select>
              </label>
              <label className="dp-row" style={{ gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.autoWorkspaceScheduleEnabled)}
                  onChange={(e) => void patchSettings({ autoWorkspaceScheduleEnabled: e.target.checked, manualWorkspaceOverrideId: null })}
                />
                <span>Auto-switch Workspace by Time-of-Day Schedule</span>
              </label>
              {settings.manualWorkspaceOverrideId && (
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => void patchSettings({ manualWorkspaceOverrideId: null })}>
                  Clear Manual Override
                </button>
              )}
            </div>
            <div className="dp-grid-2" style={{ gap: 8 }}>
              {(settings.workspaceSchedules ?? []).map((sch) => (
                <div key={sch.id} className="dp-card dp-between" style={{ padding: 10, gap: 8, borderInlineStart: `4px solid ${sch.color}` }}>
                  <div style={{ fontSize: '0.82rem' }}>
                    <strong>{sch.emoji} {sch.name}</strong>
                    <div className="dp-muted">
                      {sch.startTime}–{sch.endTime} · Workspace: {settings.workspaces.find((w) => w.id === sch.workspaceId)?.name ?? sch.workspaceId}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`dp-btn dp-btn-sm ${settings.manualWorkspaceOverrideId === sch.id ? 'dp-btn-primary' : ''}`}
                    onClick={() => {
                      void patchSettings({
                        activeWorkspaceId: sch.workspaceId,
                        manualWorkspaceOverrideId: sch.id,
                        ...(sch.clockDesign && settings.clockConfig ? { clockConfig: { ...settings.clockConfig, design: sch.clockDesign } } : {}),
                      });
                      pushToast(`Activated "${sch.name}" layout (manual override)`);
                    }}
                  >
                    Activate Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Hide Individual Extra Sidebar Items */}
          <details className="dp-details">
            <summary>Hide / Show Individual Utility Sidebar Links</summary>
            <div className="dp-row" style={{ marginTop: 10, gap: 8 }}>
              {(['all_in_one', 'history', 'spaces', 'rituals', 'insights', 'automations', 'guide'] as NavView[]).map((v) => {
                const hidden = settings.hiddenSidebarViews.includes(v);
                return (
                  <label key={v} className="dp-row" style={{ cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? settings.hiddenSidebarViews.filter((x) => x !== v)
                          : [...settings.hiddenSidebarViews, v];
                        void patchSettings({ hiddenSidebarViews: next });
                      }}
                    />
                    <span style={{ textTransform: 'capitalize' }}>{v.replace('_', ' ')}</span>
                  </label>
                );
              })}
            </div>
          </details>

          <div className="dp-card dp-stack">
            <h4>Curated Starter Presets &amp; Sample Data</h4>
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
              <h4>Sync Status &amp; LAN + Tailscale Failover</h4>
              <span className="dp-pill">
                Status: {syncState.status}
                {syncState.activeServerUrl ? ` (${syncState.activeServerUrl})` : ''} · Queued ops: {syncState.pendingCount}
              </span>
            </div>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              For the <strong>Android APK</strong> or <strong>Windows Desktop App</strong>, enter your Docker server&apos;s LAN IP below
              (e.g. <code>http://192.168.88.31:3000</code>) and optionally its <strong>Tailscale IP</strong> (e.g. <code>http://100.x.y.z:3000</code>) as a fallback so it syncs seamlessly both at home and away!
            </p>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">
                Primary Server URL (Home Wi-Fi / LAN — leave blank only when opened in a browser served directly by Docker)
              </span>
              <input
                className="dp-input"
                placeholder="http://192.168.88.31:3000"
                value={syncPrimaryDraft}
                onChange={(e) => setSyncPrimaryDraft(e.target.value)}
              />
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">
                Fallback / Tailscale Server URL (auto-used whenever you are away from home Wi-Fi)
              </span>
              <input
                className="dp-input"
                placeholder="http://100.x.y.z:3000 or https://your-host.ts.net"
                value={syncFallbackDraft}
                onChange={(e) => setSyncFallbackDraft(e.target.value)}
              />
            </label>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                disabled={syncTesting}
                onClick={async () => {
                  setSyncTesting(true);
                  setSyncTestOutput('');
                  const normP = normalizeServerUrl(syncPrimaryDraft);
                  const normF = normalizeServerUrl(syncFallbackDraft);
                  setSyncPrimaryDraft(normP);
                  setSyncFallbackDraft(normF);
                  await patchSettings({
                    operatingMode: 'docker-sync',
                    syncServerUrl: normP,
                    syncFallbackUrl: normF,
                  });
                  const urls = [normP, normF].filter(Boolean);
                  const report: string[] = [];
                  if (urls.length === 0) {
                    const r = await testServerConnection('');
                    report.push(r.ok ? `✓ Same-origin connected (${r.latencyMs}ms)` : `✕ ${r.error}`);
                  } else {
                    for (const u of urls) {
                      const r = await testServerConnection(u);
                      report.push(
                        r.ok
                          ? `✓ ${r.normalizedUrl} — Connected (${r.latencyMs}ms · ${r.recordCount ?? 0} records)`
                          : `✕ ${r.normalizedUrl} — ${r.error}`
                      );
                    }
                  }
                  setSyncTestOutput(report.join('\n'));
                  await triggerSyncNow();
                  setSyncTesting(false);
                }}
              >
                {syncTesting ? 'Testing…' : 'Save & Test Connection'}
              </button>
              <button type="button" className="dp-btn" onClick={() => void triggerSyncNow()}>
                Sync Now
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={async () => {
                  const res = await compactOutbox();
                  pushToast(`Compacted queue: ${res.before} → ${res.after} ops (${res.removed} redundant removed)`);
                  await triggerSyncNow();
                }}
              >
                Compact Queue
              </button>
              {syncState.lastSyncAt && (
                <span className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  Last synced: {new Date(syncState.lastSyncAt).toLocaleString()}
                  {typeof syncState.lastSyncDurationMs === 'number' ? ` (${syncState.lastSyncDurationMs}ms)` : ''}
                </span>
              )}
              {syncState.errorMessage && (
                <span style={{ color: 'var(--dp-danger)', fontSize: '0.82rem' }}>{syncState.errorMessage}</span>
              )}
            </div>
            <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap', fontSize: '0.78rem' }}>
              <span className="dp-pill">Queue Size: {syncState.pendingCount} ops ({((syncState.queueBytesEstimate ?? 0) / 1024).toFixed(1)} KB)</span>
              {typeof syncState.lastSyncedOpsCount === 'number' && (
                <span className="dp-pill">Last Push: {syncState.lastSyncedOpsCount} op(s)</span>
              )}
              {(syncState.compactedOpsTotal ?? 0) > 0 && (
                <span className="dp-pill highlight">Coalesced {syncState.compactedOpsTotal} duplicate ops</span>
              )}
            </div>
            {syncTestOutput && (
              <pre className="dp-card" style={{ margin: 0, padding: 10, whiteSpace: 'pre-wrap', fontSize: '0.8rem', background: 'var(--dp-surface-2)' }}>
                {syncTestOutput}
              </pre>
            )}
          </div>

          {/* Live Storage & Backup Architecture Dashboard (Local Device vs Docker + TrueNAS) */}
          <div className="dp-card dp-stack" style={{ padding: 14 }}>
            <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h4>Where Your Data Is Stored &amp; Server SQLite Backups</h4>
                <p className="dp-muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                  Local edits save first to your device&apos;s IndexedDB, then sync to your self-hosted Docker SQLite + TrueNAS blob mount.
                </p>
              </div>
              <div className="dp-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => void fetchServerStorageInfo().then(setServerStorage)}
                >
                  Refresh Info
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  disabled={backupBusy || !serverStorage}
                  onClick={async () => {
                    setBackupBusy(true);
                    const res = await triggerServerSqliteBackup();
                    setBackupBusy(false);
                    if (res.ok) {
                      pushToast(`Backed up SQLite snapshot (${((res.sizeBytes ?? 0) / 1024).toFixed(1)} KB) to TrueNAS blobs/db-backups!`);
                      void fetchServerStorageInfo().then(setServerStorage);
                    } else {
                      pushToast(res.error || 'Backup failed', { tone: 'warn' });
                    }
                  }}
                >
                  {backupBusy ? 'Backing up…' : 'Backup SQLite to TrueNAS Now'}
                </button>
              </div>
            </div>

            <div className="dp-grid-2" style={{ gap: 10, fontSize: '0.82rem' }}>
              <div className="dp-card dp-stack" style={{ padding: 10, gap: 4, background: 'var(--dp-surface-2)' }}>
                <strong>📱 This Device (Offline-First IndexedDB)</strong>
                <span className="dp-muted">Database: <code>dayplana-v2</code> (Zero localStorage)</span>
                {storageHealth && (
                  <span className="dp-muted">
                    Persistent: {storageHealth.persisted ? 'Granted ✓' : 'Best-Effort'} · Used:{' '}
                    {(storageHealth.usageBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                )}
                <span className="dp-muted">Survives app crashes, restarts &amp; offline travel.</span>
              </div>

              <div className="dp-card dp-stack" style={{ padding: 10, gap: 4, background: 'var(--dp-surface-2)' }}>
                <strong>🗄️ Server (Docker Volume + TrueNAS Blobs)</strong>
                {serverStorage ? (
                  <>
                    <span className="dp-muted">
                      SQLite: <code>{serverStorage.sqlitePath}</code> ({(serverStorage.sqliteSizeBytes / 1024).toFixed(1)} KB · {serverStorage.recordCount} records)
                    </span>
                    <span className="dp-muted">
                      Blobs (TrueNAS): <code>{serverStorage.blobsDir}</code> ({serverStorage.blobCount} files · {(serverStorage.blobTotalBytes / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                    <span className="dp-muted">
                      Connected Live Devices (SSE): <strong>{serverStorage.sseClientCount}</strong> · Auto-backups saved: <strong>{serverStorage.backups.length}</strong>
                    </span>
                  </>
                ) : (
                  <span className="dp-muted">Connect your Docker server above to inspect live SQLite &amp; TrueNAS backup paths.</span>
                )}
              </div>
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
              Current logical Today: <strong>{logicalToday}</strong>. Recomputes live on timer tick &amp; tab focus.
            </p>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Rollover Hour</span>
              <select className="dp-select" value={settings.dayBoundaryHour} onChange={(e) => void patchSettings({ dayBoundaryHour: Number(e.target.value) })}>
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
              <input type="range" min={3} max={14} value={settings.dailyCapacityHours} onChange={(e) => void patchSettings({ dailyCapacityHours: Number(e.target.value) })} />
            </label>
          </div>

          <div className="dp-card dp-stack">
            <h4>Calendar &amp; Locale Formatting</h4>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Week Starts On</span>
              <select className="dp-select" value={settings.weekStartsOn} onChange={(e) => void patchSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Time Display</span>
              <select className="dp-select" value={settings.timeFormat} onChange={(e) => void patchSettings({ timeFormat: e.target.value as '12h' | '24h' })}>
                <option value="12h">12-Hour (AM/PM)</option>
                <option value="24h">24-Hour</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span>Locale (MM/DD vs DD/MM)</span>
              <select className="dp-select" value={settings.locale} onChange={(e) => void patchSettings({ locale: e.target.value })}>
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
              Export or restore your entire database—including unlimited long notes, revisions, time logs, and binary blobs.
            </p>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={async () => {
                  const zip = await exportFullZipBackup();
                  triggerBrowserDownload(zip, `planaday-full-backup-${logicalToday}.zip`, 'application/zip');
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
                  triggerBrowserDownload(json, `planaday-backup-${logicalToday}.json`, 'application/json');
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
