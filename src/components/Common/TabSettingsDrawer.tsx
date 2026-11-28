import React, { useId, useState } from 'react';
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
  const panelId = useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div style={{ width: '100%' }}>
      <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${open ? 'dp-btn-primary' : ''}`}
          onClick={() => setOpen((v) => !v)}
          ref={buttonRef}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <SlidersHorizontal size={13} /> {title} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={title}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              event.stopPropagation(); setOpen(false); buttonRef.current?.focus();
            }
          }}
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
