import React from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from 'lucide-react';

export interface SortOption {
  value: string;
  label: string;
}

export interface FilterChipOption {
  value: string;
  label: string;
}

export interface ExtraSelectFilter {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

interface SortFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  sortBy: string;
  onSortByChange: (val: string) => void;
  sortOptions: SortOption[];
  sortDir: 'asc' | 'desc';
  onSortDirToggle: () => void;
  chips?: FilterChipOption[];
  activeChip?: string;
  onChipChange?: (val: string) => void;
  extraFilters?: ExtraSelectFilter[];
  totalCount: number;
  shownCount: number;
  onReset?: () => void;
}

export const SortFilterBar: React.FC<SortFilterBarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Filter items…',
  sortBy,
  onSortByChange,
  sortOptions,
  sortDir,
  onSortDirToggle,
  chips,
  activeChip,
  onChipChange,
  extraFilters,
  totalCount,
  shownCount,
  onReset,
}) => {
  const searchRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      className="dp-card dp-stack"
      style={{
        padding: '10px 12px',
        gap: 8,
        background: 'var(--dp-surface-2)',
      }}
    >
      <div className="dp-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Input */}
        <div
          className="dp-row"
          style={{
            flex: '1 1 180px',
            minWidth: 160,
            background: 'var(--dp-surface)',
            border: '1px solid var(--dp-border)',
            borderRadius: 'var(--dp-radius-sm)',
            padding: '0 8px',
            gap: 6,
          }}
        >
          <Search size={14} className="dp-muted" />
          <input
            ref={searchRef}
            type="search"
            aria-label={searchPlaceholder}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: 'var(--dp-ink)',
              padding: '6px 0',
              fontSize: '0.86rem',
              outlineOffset: 2,
              minWidth: 80,
            }}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22, border: 'none' }}
              aria-label="Clear search"
              onClick={() => { onSearchChange(''); searchRef.current?.focus(); }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Optional Extra Dropdown Filters */}
        {(extraFilters ?? []).map((flt) => (
          <select
            key={flt.label}
            aria-label={flt.label}
            className="dp-select"
            style={{ width: 'auto', minWidth: 115, padding: '6px 8px', fontSize: '0.83rem' }}
            value={flt.value}
            onChange={(e) => flt.onChange(e.target.value)}
          >
            {flt.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}

        {/* Sort By Selector + Asc/Desc Toggle */}
        <div className="dp-row" style={{ gap: 4 }}>
          <select
            aria-label="Sort by"
            className="dp-select"
            style={{ width: 'auto', padding: '6px 8px', fontSize: '0.83rem' }}
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={onSortDirToggle}
            title={sortDir === 'asc' ? 'Ascending (click to reverse)' : 'Descending (click to reverse)'}
            aria-label={sortDir === 'asc' ? 'Sort descending (currently ascending)' : 'Sort ascending (currently descending)'}
          >
            {sortDir === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
          </button>
        </div>

        {/* Count Badge + Reset */}
        <span className="dp-muted" aria-live="polite" aria-atomic="true" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
          {shownCount}/{totalCount}
        </span>
        {onReset && (
          <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      {/* Filter Chips Row */}
      {chips && chips.length > 0 && onChipChange && (
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className="dp-chip"
              data-active={activeChip === chip.value}
              aria-pressed={activeChip === chip.value}
              onClick={() => onChipChange(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
