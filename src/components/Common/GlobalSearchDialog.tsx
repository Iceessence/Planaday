import React, { useEffect, useMemo, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { useApp } from '../../core/AppContext';
import { globalSearchIndex } from '../../core/searchIndex';
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
    case 'habit': case 'routine': return 'habits';
    case 'alarm': return 'alarms';
    case 'timer': case 'interval_preset': return 'timers';
    case 'medication': case 'workout': case 'wellness_log': return 'health';
    case 'food_log': return 'meals';
    case 'media_item': case 'hobby_project': return 'media';
    case 'review_card': return 'learning';
    case 'household_member': return 'household';
    case 'custom_space': return 'spaces';
    case 'automation_rule': return 'automations';
    case 'planner_book': case 'planner_page': return 'digital_planner';
    case 'period_reflection': return 'planner';
    case 'quick_capture': return 'quick_glance';
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
    case 'calc_saved':
      return 'calculator';
    case 'spreadsheet':
      return 'spreadsheets';
    case 'presentation':
      return 'presentations';
    case 'project':
    case 'custom_schema':
    case 'custom_entity':
      return 'projects';
    case 'game_project':
    case 'game_entity':
      return 'game_dev';
    case 'book_project':
    case 'book_chapter':
    case 'book_entity':
      return 'book_writing';
    case 'kanban_board':
    case 'kanban_card':
      return 'kanban';
    case 'whiteboard':
      return 'whiteboard';
    case 'code_project':
    case 'code_snippet':
      return 'code_studio';
    case 'photo_asset':
      return 'photo_studio';
    case 'pdf_doc':
      return 'pdf_studio';
    case 'scanned_doc':
      return 'scanner';
    case 'file_folder':
      return 'files';
    case 'lab_sample':
    case 'lab_subcontract':
    case 'lab_inventory':
    case 'lab_order':
    case 'lab_budget':
    case 'lab_price_entry':
    case 'lab_price_template':
    case 'lab_research':
    case 'lab_email_draft':
    case 'lab_task':
    case 'lab_meeting':
    case 'lab_calibration':
    case 'lab_wet_nir':
    case 'lab_work_hour':
    case 'lab_qms_item':
      return 'lab';
    default:
      return 'today';
  }
}

export const GlobalSearchDialog: React.FC = () => {
  const {
    searchOpen,
    setSearchOpen,
    records,
    settings,
    setActiveView,
    setActiveDate,
    setSelectedNoteId,
    openPdfInStudio,
  } = useApp();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [settledQuery, setSettledQuery] = useState(query);
  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => setSettledQuery(query), 140);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);
  const pending = query !== settledQuery;

  // Hide records belonging to toggled-off modules from search filters (Section 02.04)
  const hiddenTypes = useMemo<RecordType[]>(() => {
    const h: RecordType[] = [];
    const em = settings.enabledModules;
    if (!em.goals) h.push('goal');
    if (!em.habits) h.push('habit', 'routine');
    if (!em.tasks) h.push('task');
    if (!em.chores) h.push('chore');
    if (!em.notes) h.push('note', 'notebook');
    if (!em.thoughts) h.push('thought', 'triage_item');
    if (!em.diary) h.push('diary');
    if (!em.calendar) h.push('event', 'timeblock');
    if (!em.events) h.push('life_event');
    if (!em.time) h.push('alarm', 'timer', 'interval_preset', 'countdown');
    if (!em.kitchen) h.push('recipe', 'pantry_lot', 'pantry_zone', 'meal_plan', 'grocery_item', 'food_log');
    if (!em.household) h.push('household_member');
    if (!em.calculator) h.push('calc_saved');
    if (!em.spreadsheets) h.push('spreadsheet');
    if (!em.presentations) h.push('presentation');
    if (!em.projects) h.push('project', 'custom_schema', 'custom_entity');
    if (!em.game_dev) h.push('game_project', 'game_entity');
    if (!em.book_writing) h.push('book_project', 'book_chapter', 'book_entity');
    if (!em.kanban) h.push('kanban_board', 'kanban_card');
    if (!em.whiteboard) h.push('whiteboard');
    if (!em.code_studio) h.push('code_project', 'code_snippet');
    if (!em.photo_studio) h.push('photo_asset');
    if (!em.files) h.push('file_folder');
    if (!em.scanner) h.push('scanned_doc');
    if (!em.pdf_studio) h.push('pdf_doc');
    if (!em.lab) h.push('lab_sample', 'lab_subcontract', 'lab_inventory', 'lab_order', 'lab_budget', 'lab_price_entry', 'lab_price_template', 'lab_research', 'lab_email_draft', 'lab_task', 'lab_meeting', 'lab_calibration', 'lab_wet_nir', 'lab_work_hour', 'lab_qms_item');
    if (!em.finance) h.push('bill', 'budget_envelope', 'expense', 'warranty', 'wishlist_item');
    if (!em.health) h.push('medication', 'workout', 'wellness_log');
    if (!em.travel) h.push('trip', 'packing_template', 'party');
    if (!em.people) h.push('person', 'gift');
    if (!em.home_assets) h.push('home_asset', 'vehicle', 'pet_plant', 'storage_item');
    if (!em.media) h.push('media_item', 'hobby_project');
    if (!em.learning) h.push('review_card');
    return h;
  }, [settings.enabledModules]);

  useMemo(() => { if (searchOpen) globalSearchIndex.syncFromArray(records); }, [searchOpen, records]);
  const result = useMemo(() => {
    if (!searchOpen) return { hits: [], total: 0, page: 1, pageCount: 1 };
    return globalSearchIndex.search(
      settledQuery,
      {
        types: typeFilter === 'all' ? undefined : [typeFilter as RecordType],
        tag: tagFilter.trim().replace(/^#/, '') || undefined,
        hiddenTypes,
      },
      page,
      20
    );
  }, [searchOpen, records, settledQuery, typeFilter, tagFilter, hiddenTypes, page]);

  const types = useMemo(() => {
    if (!searchOpen) return [];
    const hidden = new Set(hiddenTypes);
    return [...new Set(records.filter(r => !r.deletedAt && !hidden.has(r.type)).map(r => r.type))].sort();
  }, [searchOpen, records, hiddenTypes]);
  useEffect(() => {
    if (searchOpen && typeFilter !== 'all' && !types.includes(typeFilter as RecordType)) { setTypeFilter('all'); setPage(1); }
  }, [searchOpen, types, typeFilter]);
  return (
    <ModalDialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Global Fuzzy Search" wide>
      <div className="dp-stack">
        <div className="dp-row" style={{ flexWrap: 'wrap' }}>
          <input
            autoFocus
            aria-label="Search all records"
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
            {types.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
          </select>
          <input
            className="dp-input"
            style={{ width: 130 }}
            aria-label="Filter by tag"
            placeholder="#tag filter"
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="dp-between" style={{ fontSize: '0.82rem' }}>
          <span className="dp-muted" role="status">
            {pending ? 'Searching…' : `${result.total} matches (page ${result.page} of ${result.pageCount})`}
          </span>
          <div className="dp-row">
            {(query || tagFilter || typeFilter !== 'all') && <button type="button" className="dp-btn dp-btn-sm" onClick={() => { setQuery(''); setTagFilter(''); setTypeFilter('all'); setPage(1); }}>Clear</button>}
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={pending || result.page <= 1}
              onClick={() => setPage(Math.max(1, result.page - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={pending || result.page >= result.pageCount}
              onClick={() => setPage(Math.min(result.pageCount, result.page + 1))}
            >
              Next
            </button>
          </div>
        </div>

        {pending ? <p className="dp-muted">Updating results…</p> : result.hits.length === 0 ? (
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
                  if (hit.record.type === 'pdf_doc') {
                    openPdfInStudio(hit.record.id);
                  } else {
                    setActiveView(recordTypeToView(hit.record.type));
                  }
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
