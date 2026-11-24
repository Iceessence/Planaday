import React, { useEffect, useState } from 'react';
import type { ClockDesignId, ClockVisualConfig } from '../../core/types';

export const CLOCK_DESIGN_OPTIONS: Array<{ id: ClockDesignId; label: string }> = [
  { id: 'analog_traditional', label: 'Traditional Analog' },
  { id: 'analog_minimal', label: 'Minimal Analog' },
  { id: 'digital', label: 'Digital' },
  { id: 'retro_digital', label: 'Retro LED Digital' },
  { id: 'modern_minimal', label: 'Modern Minimalist' },
  { id: 'decorative', label: 'Decorative Ornate' },
];

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export const ClockWidget: React.FC<{
  config: ClockVisualConfig;
  timeFormat: '12h' | '24h';
  timeZone?: string;
  label?: string;
}> = ({ config, timeFormat, timeZone, label }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Extract hours/minutes/seconds in optional target timeZone
  const parts = React.useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || undefined,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const out = fmt.formatToParts(now);
      const get = (t: string) => Number(out.find((x) => x.type === t)?.value ?? 0);
      return { h: get('hour') % 24, m: get('minute'), s: get('second') };
    } catch {
      return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
    }
  }, [now, timeZone]);

  const displayHour = timeFormat === '12h' ? parts.h % 12 || 12 : parts.h;
  const ampm = timeFormat === '12h' ? (parts.h >= 12 ? 'PM' : 'AM') : '';
  const hh = String(displayHour).padStart(2, '0');
  const mm = String(parts.m).padStart(2, '0');
  const ss = String(parts.s).padStart(2, '0');
  const size = Math.max(84, Math.min(260, config.sizePx || 148));
  const accent = config.accentColor || 'var(--dp-accent)';
  const bg = config.bgColor || 'var(--dp-surface)';

  const isAnalog =
    config.design === 'analog_traditional' ||
    config.design === 'analog_minimal' ||
    config.design === 'decorative';

  if (isAnalog) {
    const secDeg = parts.s * 6;
    const minDeg = parts.m * 6 + parts.s * 0.1;
    const hrDeg = (parts.h % 12) * 30 + parts.m * 0.5;
    const isDecorative = config.design === 'decorative';
    const isMinimal = config.design === 'analog_minimal';
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          role="img"
          aria-label={`Clock showing ${hh}:${mm}${config.showSeconds ? `:${ss}` : ''} ${ampm}`}
        >
          <circle
            cx="60"
            cy="60"
            r="55"
            fill={bg}
            stroke={accent}
            strokeWidth={config.borderStyle === 'none' ? 0 : isDecorative ? 4 : 2.5}
          />
          {config.borderStyle === 'double' || isDecorative ? (
            <circle cx="60" cy="60" r="49" fill="none" stroke={accent} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray={isDecorative ? '3 3' : undefined} />
          ) : null}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const tx = 60 + Math.cos(angle) * 41;
            const ty = 60 + Math.sin(angle) * 41;
            const x1 = 60 + Math.cos(angle) * 48;
            const y1 = 60 + Math.sin(angle) * 48;
            const x2 = 60 + Math.cos(angle) * 52;
            const y2 = 60 + Math.sin(angle) * 52;
            if (config.numberStyle === 'none' || isMinimal) {
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={i % 3 === 0 ? 2 : 1} opacity={0.7} />;
            }
            if (config.numberStyle === 'dots') {
              return <circle key={i} cx={tx} cy={ty} r={i % 3 === 0 ? 2.4 : 1.4} fill={accent} />;
            }
            const lbl = config.numberStyle === 'roman' || isDecorative ? ROMAN[i] : String(i === 0 ? 12 : i);
            return (
              <text
                key={i}
                x={tx}
                y={ty + 3}
                textAnchor="middle"
                fontSize={isDecorative ? '7.5' : '8.5'}
                fontWeight="600"
                fill="currentColor"
              >
                {lbl}
              </text>
            );
          })}
          {/* Hour hand */}
          <line
            x1="60"
            y1="60"
            x2={60 + Math.sin((hrDeg * Math.PI) / 180) * 26}
            y2={60 - Math.cos((hrDeg * Math.PI) / 180) * 26}
            stroke="currentColor"
            strokeWidth={isMinimal ? 2.5 : 3.5}
            strokeLinecap="round"
          />
          {/* Minute hand */}
          <line
            x1="60"
            y1="60"
            x2={60 + Math.sin((minDeg * Math.PI) / 180) * 38}
            y2={60 - Math.cos((minDeg * Math.PI) / 180) * 38}
            stroke="currentColor"
            strokeWidth={isMinimal ? 1.8 : 2.4}
            strokeLinecap="round"
          />
          {/* Second hand */}
          {config.showSeconds && (
            <line
              x1="60"
              y1="66"
              x2={60 + Math.sin((secDeg * Math.PI) / 180) * 43}
              y2={60 - Math.cos((secDeg * Math.PI) / 180) * 43}
              stroke={accent}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          )}
          <circle cx="60" cy="60" r="3" fill={accent} />
        </svg>
        {label && <span className="dp-muted" style={{ fontSize: '0.78rem' }}>{label}</span>}
      </div>
    );
  }

  if (config.design === 'retro_digital') {
    return (
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 18px',
          borderRadius: 10,
          background: '#161b18',
          color: '#7cff8e',
          border: config.borderStyle === 'none' ? 'none' : `2px solid ${accent}`,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '0.08em',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ fontSize: Math.round(size * 0.22), fontWeight: 700, textShadow: '0 0 8px rgba(124,255,142,0.55)' }}>
          {hh}:{mm}
          {config.showSeconds && <span style={{ fontSize: '0.7em', opacity: 0.85 }}>:{ss}</span>}
          {ampm && <span style={{ fontSize: '0.45em', marginInlineStart: 6 }}>{ampm}</span>}
        </div>
        {label && <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{label}</span>}
      </div>
    );
  }

  if (config.design === 'modern_minimal') {
    return (
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '8px 14px',
          borderInlineStart: `4px solid ${accent}`,
          background: bg,
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: Math.round(size * 0.24), fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          {hh}
          <span style={{ color: accent }}>:</span>
          {mm}
          {config.showSeconds && <span className="dp-muted" style={{ fontSize: '0.55em' }}>:{ss}</span>}
          {ampm && <span className="dp-muted" style={{ fontSize: '0.42em', marginInlineStart: 5 }}>{ampm}</span>}
        </div>
        {label && <span className="dp-muted" style={{ fontSize: '0.76rem' }}>{label}</span>}
      </div>
    );
  }

  // Standard Digital
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 16px',
        borderRadius: 10,
        background: bg,
        border: config.borderStyle === 'none' ? 'none' : config.borderStyle === 'double' ? `3px double ${accent}` : `1px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: Math.round(size * 0.22), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {hh}:{mm}
        {config.showSeconds && <span style={{ opacity: 0.72, fontSize: '0.76em' }}>:{ss}</span>}
        {ampm && <span style={{ fontSize: '0.48em', marginInlineStart: 5, color: accent }}>{ampm}</span>}
      </div>
      {label && <span className="dp-muted" style={{ fontSize: '0.76rem' }}>{label}</span>}
    </div>
  );
};
