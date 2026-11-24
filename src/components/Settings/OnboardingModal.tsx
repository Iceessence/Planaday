import React, { useState } from 'react';
import { ModalDialog } from '../Common/ModalDialog';
import { useApp } from '../../core/AppContext';
import { applyOnboardingPreset, ONBOARDING_PRESETS, type OnboardingPreset } from '../../data/sampleData';

export const OnboardingModal: React.FC = () => {
  const { ready, settings, patchSettings, logicalToday, pushToast } = useApp();
  const [selected, setSelected] = useState<OnboardingPreset['id']>('tactile-paper');
  const [loadSamples, setLoadSamples] = useState(true);
  const [dayBoundary, setDayBoundary] = useState(0);

  if (!ready || settings.onboardingCompleted) return null;

  const handleFinish = async () => {
    await applyOnboardingPreset(selected, {
      loadSamples,
      dayBoundaryHour: selected === 'night-owl' && dayBoundary === 0 ? 4 : dayBoundary,
      logicalToday,
    });
    pushToast('Welcome to Dayplana! Your stationery workspace is ready.');
  };

  return (
    <ModalDialog
      open={!settings.onboardingCompleted}
      onClose={() => void patchSettings({ onboardingCompleted: true })}
      title="Welcome to Dayplana — 30-Second Setup"
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
          <input type="checkbox" checked={loadSamples} onChange={(e) => setLoadSamples(e.target.checked)} />
          <span>Load removable starter sample data (1-click clean wipe anytime)</span>
        </label>
        <label className="dp-row">
          <span className="dp-muted">Day starts at:</span>
          <select
            className="dp-select"
            style={{ width: 'auto' }}
            value={dayBoundary}
            onChange={(e) => setDayBoundary(Number(e.target.value))}
          >
            <option value={0}>Midnight</option>
            <option value={3}>3:00 AM</option>
            <option value={4}>4:00 AM</option>
          </select>
        </label>
      </div>

      <div className="dp-between">
        <button
          type="button"
          className="dp-btn dp-btn-ghost"
          onClick={() => void patchSettings({ onboardingCompleted: true })}
        >
          Skip for now
        </button>
        <button type="button" className="dp-btn dp-btn-primary" onClick={() => void handleFinish()}>
          Open My Planner
        </button>
      </div>
    </ModalDialog>
  );
};
