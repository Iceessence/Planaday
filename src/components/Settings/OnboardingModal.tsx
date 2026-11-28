import React, { useRef, useState } from 'react';
import { ModalDialog } from '../Common/ModalDialog';
import { useApp } from '../../core/AppContext';
import { applyOnboardingPreset, ONBOARDING_PRESETS, type OnboardingPreset } from '../../data/sampleData';

export const OnboardingModal: React.FC = () => {
  const { ready, settings, patchSettings, logicalToday, pushToast } = useApp();
  const [selected, setSelected] = useState<OnboardingPreset['id']>('tactile-paper');
  const [loadSamples, setLoadSamples] = useState(true);
  const [dayBoundary, setDayBoundary] = useState(ONBOARDING_PRESETS.find((p) => p.id === 'tactile-paper')?.dayBoundaryHour ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  if (!ready || settings.onboardingCompleted) return null;

  const finish = async (skip = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (skip) await patchSettings({ onboardingCompleted: true });
      else {
        await applyOnboardingPreset(selected, { loadSamples, dayBoundaryHour: dayBoundary, logicalToday });
        pushToast('Welcome to Planaday! Your customizable workspace is ready.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup could not finish. Please try again.';
      setError(message);
      pushToast(message, { tone: 'warn' });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      open={!settings.onboardingCompleted}
      onClose={() => { if (!lock.current) void finish(true); }}
      dismissible={!busy}
      title="Welcome to Planaday — 30-Second Setup"
      wide
    >
      <p className="dp-muted" style={{ margin: 0 }}>
        Pick your starting tactile preset. Every theme, paper surface, and module can be customized anytime in one click.
      </p>

      <div className="dp-grid-2">
        {ONBOARDING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="dp-card"
            disabled={busy}
            aria-pressed={selected === preset.id}
            style={{
              textAlign: 'start',
              cursor: 'pointer',
              borderColor: selected === preset.id ? 'var(--dp-accent)' : undefined,
              borderWidth: selected === preset.id ? 2 : 1,
            }}
            onClick={() => {
              setSelected(preset.id);
              setDayBoundary(preset.dayBoundaryHour);
            }}
          >
            <strong>{preset.name}</strong>
            <p className="dp-muted" style={{ margin: '6px 0 0', fontSize: '0.84rem' }}>
              {preset.tagline}
            </p>
          </button>
        ))}
      </div>

      <div className="dp-between" style={{ paddingTop: 4 }}>
        <label className="dp-row">
          <input type="checkbox" disabled={busy} checked={loadSamples} onChange={(e) => setLoadSamples(e.target.checked)} />
          <span>Load removable starter sample data (1-click clean wipe anytime)</span>
        </label>
        <label className="dp-row">
          <span className="dp-muted">Day starts at:</span>
          <select
            className="dp-select"
            style={{ width: 'auto' }}
            disabled={busy}
            value={dayBoundary}
            onChange={(e) => setDayBoundary(Number(e.target.value))}
          >
            <option value={0}>Midnight</option>
            <option value={3}>3:00 AM</option>
            <option value={4}>4:00 AM</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" style={{ color: 'var(--dp-danger)' }}>{error}</p>}
      <div className="dp-between">
        <button
          type="button"
          className="dp-btn dp-btn-ghost"
          disabled={busy}
          onClick={() => void finish(true)}
        >
          Skip for now
        </button>
        <button type="button" className="dp-btn dp-btn-primary" disabled={busy} onClick={() => void finish()}>
          {busy ? 'Setting up…' : 'Open My Planner'}
        </button>
      </div>
    </ModalDialog>
  );
};
