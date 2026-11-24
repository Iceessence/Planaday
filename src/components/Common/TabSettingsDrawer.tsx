import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Settings, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../core/AppContext';

interface TabSettingsDrawerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Collapsible inline "Tab Settings" drawer that surfaces global & tab-specific defaults
 * right inside the active tab so users never have to hunt through the main Settings page.
 */
export const TabSettingsDrawer: React.FC<TabSettingsDrawerProps> = ({ title, subtitle, children }) => {
  const { setActiveView } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ width: '100%' }}>
      <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${open ? 'dp-btn-primary' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={13} /> {title} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {open && (
        <div
          className="dp-card dp-stack"
          style={{
            marginTop: 8,
            padding: 14,
            gap: 10,
            background: 'var(--dp-surface-2)',
            borderColor: 'var(--dp-accent)',
          }}
        >
          <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
            <div>
              <strong style={{ fontSize: '0.9rem' }}>⚙️ {title}</strong>
              {subtitle && (
                <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                  {subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              className="dp-btn dp-btn-ghost dp-btn-sm"
              onClick={() => setActiveView('settings')}
            >
              <Settings size={13} /> All Global Settings
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
};
