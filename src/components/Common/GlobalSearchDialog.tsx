import React, { useMemo, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { useApp } from '../../core/AppContext';
import { fuzzySearchRecords } from '../../core/search';
import type { NavView, RecordType } from '../../core/types';

function recordTypeToView(type: RecordType): NavView {
  switch (type) {
    case 'event':
    case 'timeblock':
      return 'calendar';
    case 'task':
      return 'tasks';
    case 'chore':
      return 'chores';
    case 'note':
    case 'notebook':
      return 'notes';
    case 'thought':
    case 'triage_item':
      return 'thoughts';
    case 'diary':
      return 'diary';
    case 'life_event':
      return 'events';
    case 'countdown':
      return 'countdown';
    case 'recipe':
      return 'recipes';
    case 'pantry_lot':
    case 'pantry_zone':
      return 'pantry';
    case 'meal_plan':
      return 'meals';
    case 'grocery_item':
      return 'shopping';
    case 'goal':
      return 'goals';
    case 'habit':
      return 'habits';
    case 'person':
    case 'gift':
      return 'people';
    case 'home_asset':
    case 'vehicle':
    case 'pet_plant':
    case 'storage_item':
      return 'home_assets';
    case 'bill':
    case 'budget_envelope':
    case 'expense':
    case 'warranty':
    case 'wishlist_item':
      return 'finance';
    case 'trip':
    case 'party':
    case 'packing_template':
      return 'travel';
    default:
      return 'today';
  }
}

export const GlobalSearchDialog: React.FC = () => {
  const { searchOpen, setSearchOpen, records, settings, setActiveView, setActiveDate, setSelectedNoteId } = useApp();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);

  // Hide records belonging to toggled-off modules from search filters (Section 02.04)
  const hiddenTypes = useMemo<RecordType[]>(() => {
    const h: RecordType[] = [];
    const em = settings.enabledModules;
    if (!em.goals) h.push('goal');
    if (!em.habits) h.push('habit');
    if (!em.finance) h.push('bill', 'budget_envelope', 'expense', 'warranty', 'wishlist_item');
    if (!em.health) h.push('medication', 'workout', 'wellness_log');
    if (!em.travel) h.push('trip', 'packing_template', 'party');
    if (!em.people) h.push('person', 'gift');
    if (!em.home_assets) h.push('home_asset', 'vehicle', 'pet_plant', 'storage_item');
    if (!em.media) h.push('media_item', 'hobby_project');
    if (!em.learning) h.push('review_card');
    return h;
  }, [settings.enabledModules]);

  const result = useMemo(() => {
    return fuzzySearchRecords(
      records,
      query,
      {
        types: typeFilter === 'all' ? undefined : [typeFilter as RecordType],
        tag: tagFilter.trim() || undefined,
        hiddenTypes,
      },
      page,
      20
    );
  }, [records, query, typeFilter, tagFilter, hiddenTypes, page]);

  return (
    <ModalDialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Global Fuzzy Search" wide>
      <div className="dp-stack">
        <div className="dp-row">
          <input
            autoFocus
            className="dp-input"
            style={{ flex: 2 }}
            placeholder="Typo-tolerant search across tasks, notes, recipes, pantry bins, storage…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Filter by record type"
            className="dp-select"
            style={{ flex: 1, minWidth: 140 }}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All modules</option>
            <option value="task">Tasks</option>
            <option value="event">Events</option>
            <option value="chore">Chores</option>
            <option value="note">Notes</option>
            <option value="thought">Thoughts</option>
            <option value="diary">Diary</option>
            <option value="recipe">Recipes</option>
            <option value="pantry_lot">Pantry</option>
            <option value="storage_item">Storage Bins</option>
            <option value="person">People</option>
          </select>
          <input
            className="dp-input"
            style={{ width: 130 }}
            placeholder="#tag filter"
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="dp-between" style={{ fontSize: '0.82rem' }}>
          <span className="dp-muted">
            {result.total} matches (page {result.page} of {result.pageCount}) — no 100-hit cap
          </span>
          <div className="dp-row">
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={result.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={result.page >= result.pageCount}
              onClick={() => setPage((p) => Math.min(result.pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>

        {result.hits.length === 0 ? (
          <div className="dp-empty">
            <p className="dp-muted">No matches for "{query}". Try a broader term or clear filters.</p>
          </div>
        ) : (
          <div className="dp-stack" style={{ gap: 8, maxHeight: '52dvh', overflowY: 'auto' }}>
            {result.hits.map((hit) => (
              <button
                key={hit.record.id}
                type="button"
                className="dp-card"
                style={{ textAlign: 'start', cursor: 'pointer', padding: 12 }}
                onClick={() => {
                  if (hit.jumpDate) setActiveDate(hit.jumpDate);
                  if (hit.record.type === 'note') setSelectedNoteId(hit.record.id);
                  setActiveView(recordTypeToView(hit.record.type));
                  setSearchOpen(false);
                }}
              >
                <div className="dp-between">
                  <strong>{hit.record.title}</strong>
                  <div className="dp-row">
                    <span className="dp-pill">{hit.record.type}</span>
                    {hit.jumpDate && <span className="dp-pill">📅 {hit.jumpDate}</span>}
                  </div>
                </div>
                {hit.snippet && (
                  <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                    {hit.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
