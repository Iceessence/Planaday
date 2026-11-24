import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Plus,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import {
  addDaysIso,
  COMMON_TIMEZONES,
  convertEventTimeZone,
  formatDateLocalized,
  formatTimeDisplay,
  shiftZonedEventByMinutes,
  validateZonedEventTime,
} from '../../core/temporal';
import { expandRecurrenceDates, previewNextOccurrences } from '../../core/recurrence';
import {
  applyRecurringEventEdit,
  completeActionAtomically,
  layoutDayEvents,
  minutesToTime,
  scheduleActionOnCalendar,
  timeToMinutes,
  type OverlapMode,
  type RecurringEditScope,
} from '../../core/planActions';
import { exportEventsToIcs, parseIcsCalendar } from '../../core/ics';
import { triggerBrowserDownload } from '../../core/backup';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type { CalendarEventPayload, LifeRecord, RecurrenceRule } from '../../core/types';

const EVENT_TEMPLATES = [
  { name: 'Work Meeting', emoji: '💼', duration: 45, color: '#3b6ea5', style: 'soft' as const },
  { name: 'Focus Block', emoji: '🧠', duration: 90, color: '#4f7a65', style: 'filled' as const },
  { name: 'Family Visit', emoji: '🏡', duration: 120, color: '#c96f53', style: 'soft' as const },
  { name: 'Birthday', emoji: '🎂', duration: 60, color: '#b47438', style: 'outline' as const },
  { name: 'Workout', emoji: '🏋️', duration: 45, color: '#6b5ca5', style: 'filled' as const },
];

const ZOOM_STEPS = [5, 10, 15, 30, 60] as const;

export const FlowCalendarView: React.FC = () => {
  const { settings, records, activeDate, setActiveDate, logicalToday, pushToast } = useApp();

  // Range, positioning, zoom & 4-mode overlap state (Sections 07.01, 07.02)
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [positionMode, setPositionMode] = useState<'ahead' | 'around' | 'before'>('ahead');
  const [gridStepMin, setGridStepMin] = useState<(typeof ZOOM_STEPS)[number]>(15);
  const [overlapMode, setOverlapMode] = useState<OverlapMode>('equal_split');
  const [showDualTz, setShowDualTz] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [icsFeedUrl, setIcsFeedUrl] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Event Editor state (Progressive Disclosure — Section 08.01)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOccDate, setEditingOccDate] = useState<string>(activeDate);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(activeDate);
  const [endDate, setEndDate] = useState(activeDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState('#a97434');
  const [category, setCategory] = useState('Personal');
  const [allDay, setAllDay] = useState(false);
  const [floating, setFloating] = useState(false);
  const [timeZone, setTimeZone] = useState(settings.defaultTimeZone);
  const [style, setStyle] = useState<'soft' | 'filled' | 'outline'>('soft');
  const [emoji, setEmoji] = useState('📌');
  const [eventStatus, setEventStatus] = useState<'confirmed' | 'tentative' | 'canceled'>('confirmed');
  const [importance, setImportance] = useState<'normal' | 'must_do' | 'optional'>('normal');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [prepMin, setPrepMin] = useState(0);
  const [travelMin, setTravelMin] = useState(0);
  const [decompressMin, setDecompressMin] = useState(0);
  const [recurFreq, setRecurFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>([1, 3, 5]);
  const [recurSkipWeekends, setRecurSkipWeekends] = useState(false);
  const [recurUntil, setRecurUntil] = useState('');

  // Recurring Scope Prompt Modal (Section 08.03)
  const [pendingScopeEdit, setPendingScopeEdit] = useState<{
    masterId: string;
    occDate: string;
    patch: Partial<CalendarEventPayload> & { title?: string };
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const icsInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const events = useMemo(
    () => records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>,
    [records]
  );

  const unscheduledActions = useMemo(
    () => records.filter((r) => (r.type === 'task' || r.type === 'chore') && r.status === 'active').slice(0, 10),
    [records]
  );

  // Compute day columns (up to 62 days)
  const dayColumns = useMemo(() => {
    const clamped = Math.max(1, Math.min(62, rangeDays));
    const offsetStart =
      positionMode === 'ahead' ? 0 : positionMode === 'before' ? -(clamped - 1) : -Math.floor(clamped / 2);
    return Array.from({ length: clamped }, (_, i) => addDaysIso(activeDate, offsetStart + i));
  }, [activeDate, rangeDays, positionMode]);

  const rangeStart = dayColumns[0];
  const rangeEnd = dayColumns[dayColumns.length - 1];

  // Expand recurring & multi-day events across visible range
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ event: LifeRecord<CalendarEventPayload>; occurrenceDate: string }>>();
    for (const d of dayColumns) map.set(d, []);

    for (const ev of events) {
      if (ev.recurrence) {
        const occDates = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, {
          rangeStart,
          rangeEnd,
          maxCount: 120,
        });
        for (const d of occDates) {
          map.get(d)?.push({ event: ev, occurrenceDate: d });
        }
      } else {
        const s = ev.payload.startDate;
        const e = ev.payload.endDate || s;
        for (const d of dayColumns) {
          if (d >= s && d <= e) {
            map.get(d)?.push({ event: ev, occurrenceDate: d });
          }
        }
      }
    }
    return map;
  }, [events, dayColumns, rangeStart, rangeEnd]);

  const dayLayouts = useMemo(() => {
    const out = new Map<string, ReturnType<typeof layoutDayEvents>>();
    for (const d of dayColumns) {
      out.set(d, layoutDayEvents(eventsByDay.get(d) ?? [], overlapMode));
    }
    return out;
  }, [dayColumns, eventsByDay, overlapMode]);

  const allConflicts = useMemo(
    () => Array.from(dayLayouts.values()).flatMap((l) => l.conflicts),
    [dayLayouts]
  );

  // Pixels per hour depends on zoom step (scroll-anchor preserved!)
  const pxPerHour = gridStepMin === 5 ? 168 : gridStepMin === 10 ? 120 : gridStepMin === 15 ? 84 : gridStepMin === 30 ? 60 : 44;
  const totalGridHeight = 24 * pxPerHour;

  const changeZoom = (dir: -1 | 1) => {
    const idx = ZOOM_STEPS.indexOf(gridStepMin);
    const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir));
    if (nextIdx === idx) return;
    const scroller = scrollRef.current;
    const anchorRatio = scroller ? scroller.scrollTop / Math.max(1, totalGridHeight) : 0;
    const nextStep = ZOOM_STEPS[nextIdx];
    setGridStepMin(nextStep);
    requestAnimationFrame(() => {
      if (scroller) {
        const nextPx = nextStep === 5 ? 168 : nextStep === 10 ? 120 : nextStep === 15 ? 84 : nextStep === 30 ? 60 : 44;
        scroller.scrollTop = anchorRatio * 24 * nextPx;
      }
    });
  };

  const openNewEvent = (dateIso: string, timeStr = '09:00') => {
    setEditingId(null);
    setEditingOccDate(dateIso);
    setTitle('');
    setStartDate(dateIso);
    setEndDate(dateIso);
    setStartTime(timeStr);
    setEndTime(minutesToTime(timeToMinutes(timeStr) + 60));
    setColor('#a97434');
    setCategory('Personal');
    setAllDay(false);
    setFloating(false);
    setTimeZone(settings.defaultTimeZone);
    setStyle('soft');
    setEmoji('📌');
    setEventStatus('confirmed');
    setImportance('normal');
    setLocation('');
    setUrl('');
    setNotes('');
    setPrepMin(0);
    setTravelMin(0);
    setDecompressMin(0);
    setRecurFreq('none');
    setRecurInterval(1);
    setRecurSkipWeekends(false);
    setRecurUntil('');
    setEditorOpen(true);
  };

  const openEditEvent = (ev: LifeRecord<CalendarEventPayload>, occDate: string) => {
    setEditingId(ev.id);
    setEditingOccDate(occDate);
    setTitle(ev.title);
    setStartDate(occDate);
    setEndDate(ev.payload.endDate === ev.payload.startDate ? occDate : ev.payload.endDate);
    setStartTime(ev.payload.startTime || '09:00');
    setEndTime(ev.payload.endTime || '10:00');
    setColor(ev.color || '#a97434');
    setCategory(ev.category || 'Personal');
    setAllDay(ev.payload.allDay);
    setFloating(ev.payload.floating);
    setTimeZone(ev.payload.timeZone || settings.defaultTimeZone);
    setStyle(ev.payload.style || 'soft');
    setEmoji(ev.payload.emoji || '📌');
    setEventStatus(ev.payload.eventStatus || 'confirmed');
    setImportance(ev.payload.importance || 'normal');
    setLocation(ev.payload.location || '');
    setUrl(ev.payload.url || '');
    setNotes(ev.payload.notes || '');
    setPrepMin(ev.payload.buffers?.prepMin ?? 0);
    setTravelMin(ev.payload.buffers?.travelMin ?? 0);
    setDecompressMin(ev.payload.buffers?.decompressMin ?? 0);
    setRecurFreq(ev.recurrence?.freq ?? 'none');
    setRecurInterval(ev.recurrence?.interval ?? 1);
    setRecurWeekdays(ev.recurrence?.byWeekday ?? [1, 3, 5]);
    setRecurSkipWeekends(Boolean(ev.recurrence?.skipWeekends));
    setRecurUntil(ev.recurrence?.until ?? '');
    setEditorOpen(true);
  };

  const dstCheck = useMemo(() => {
    if (allDay || floating) return null;
    try {
      return validateZonedEventTime(startDate, startTime, timeZone);
    } catch {
      return null;
    }
  }, [allDay, floating, startDate, startTime, timeZone]);

  const builtRecurrence: RecurrenceRule | null =
    recurFreq === 'none'
      ? null
      : {
          freq: recurFreq,
          interval: Math.max(1, recurInterval),
          byWeekday: recurFreq === 'weekly' ? recurWeekdays : undefined,
          skipWeekends: recurSkipWeekends,
          until: recurUntil || null,
        };

  const recurPreview = useMemo(
    () => (builtRecurrence ? previewNextOccurrences(startDate, builtRecurrence, 5) : []),
    [builtRecurrence, startDate]
  );

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload: CalendarEventPayload = {
      startDate,
      endDate: endDate >= startDate ? endDate : startDate,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      allDay,
      floating,
      timeZone,
      style,
      emoji,
      eventStatus,
      importance,
      location: location.trim() || undefined,
      url: url.trim() || undefined,
      notes: notes.trim() || undefined,
      buffers:
        prepMin || travelMin || decompressMin
          ? { prepMin: prepMin || undefined, travelMin: travelMin || undefined, decompressMin: decompressMin || undefined }
          : undefined,
    };

    if (editingId) {
      const existing = events.find((ev) => ev.id === editingId);
      if (existing?.recurrence) {
        setEditorOpen(false);
        setPendingScopeEdit({ masterId: editingId, occDate: editingOccDate, patch: { ...payload, title: title.trim() } });
        return;
      }
      await updateRecord<CalendarEventPayload>(
        editingId,
        { title: title.trim(), color, category, recurrence: builtRecurrence, payload },
        { undoLabel: `Updated event "${title.trim()}"` }
      );
      pushToast(`Saved "${title.trim()}"`, { canUndo: true });
    } else {
      await createRecord<CalendarEventPayload>('event', title.trim(), payload, {
        color,
        category,
        recurrence: builtRecurrence,
      });
      pushToast(`Created event "${title.trim()}"`, { canUndo: true });
    }
    setEditorOpen(false);
  };

  // Power-user nudge / drag drop handler (supports Alt+Drag copy & recurring scope prompt)
  const moveEventToSlot = async (
    ev: LifeRecord<CalendarEventPayload>,
    occDate: string,
    targetDate: string,
    targetStartTime: string,
    copyMode = false
  ) => {
    const oldStartMin = timeToMinutes(ev.payload.startTime || '09:00');
    const oldEndMin = timeToMinutes(ev.payload.endTime || '10:00');
    const durMin = Math.max(15, oldEndMin - oldStartMin);
    const newEndTime = minutesToTime(timeToMinutes(targetStartTime) + durMin);

    if (copyMode) {
      await createRecord<CalendarEventPayload>(
        'event',
        `${ev.title} (Copy)`,
        { ...ev.payload, startDate: targetDate, endDate: targetDate, startTime: targetStartTime, endTime: newEndTime },
        { color: ev.color, category: ev.category, tags: [...ev.tags] }
      );
      pushToast(`Copied "${ev.title}" to ${targetDate} ${targetStartTime}`, { canUndo: true });
      return;
    }

    const patch: Partial<CalendarEventPayload> = {
      startDate: targetDate,
      endDate: targetDate,
      startTime: targetStartTime,
      endTime: newEndTime,
    };

    if (ev.recurrence) {
      setPendingScopeEdit({ masterId: ev.id, occDate, patch });
      return;
    }

    await updateRecord<CalendarEventPayload>(
      ev.id,
      (c) => ({ ...c, payload: { ...c.payload, ...patch } }),
      { undoLabel: `Moved "${ev.title}"` }
    );
    pushToast(`Moved "${ev.title}" to ${targetDate} ${targetStartTime}`, { canUndo: true });
  };

  const handleBatchShift = async (deltaDays: number) => {
    for (const id of selectedIds) {
      const ev = events.find((x) => x.id === id);
      if (!ev) continue;
      await updateRecord<CalendarEventPayload>(id, (c) => ({
        ...c,
        payload: {
          ...c.payload,
          startDate: addDaysIso(c.payload.startDate, deltaDays),
          endDate: addDaysIso(c.payload.endDate || c.payload.startDate, deltaDays),
        },
      }));
    }
    pushToast(`Shifted ${selectedIds.size} events by ${deltaDays}d`, { canUndo: true });
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await softDeleteRecord(id);
    }
    pushToast(`Moved ${selectedIds.size} events to Trash`, { canUndo: true });
    setSelectedIds(new Set());
  };

  const handleImportIcs = async (icsText: string) => {
    const parsed = parseIcsCalendar(icsText, settings.defaultTimeZone);
    const existingUids = new Set(events.map((e) => e.payload.icsUid).filter(Boolean));
    let imported = 0;
    for (const item of parsed) {
      if (existingUids.has(item.uid)) continue;
      await createRecord<CalendarEventPayload>('event', item.title, item.payload, {
        recurrence: item.recurrence,
        category: 'Imported',
        color: '#3b6ea5',
      });
      imported++;
    }
    pushToast(`Imported ${imported} event(s) from .ics (${parsed.length - imported} deduplicated by UID).`);
  };

  return (
    <div className="dp-stack">
      {/* Flow Calendar Control Strip */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
        <div className="dp-between">
          <div className="dp-row">
            <h2 style={{ fontSize: '1.2rem' }}>Flow Calendar</h2>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -rangeDays))}>
              ←
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>
              Today
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, rangeDays))}>
              →
            </button>
            <span className="dp-muted" style={{ fontSize: '0.84rem' }}>
              {rangeStart} → {rangeEnd}
            </span>
          </div>

          <div className="dp-row">
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => openNewEvent(activeDate)}>
              <Plus size={14} /> New Event
            </button>
            {allConflicts.length > 0 && (
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                style={{ borderColor: 'var(--dp-warn)', color: 'var(--dp-warn)' }}
                onClick={() => setConflictOpen(true)}
              >
                <AlertCircle size={14} /> Conflicts ({allConflicts.length})
              </button>
            )}
          </div>
        </div>

        {/* Range presets (1..62d), positioning, 4-mode overlap, zoom, dual TZ */}
        <div className="dp-row" style={{ fontSize: '0.82rem' }}>
          <div className="dp-row" style={{ gap: 4 }}>
            {[1, 3, 7, 14, 28].map((n) => (
              <button
                key={n}
                type="button"
                className={`dp-btn dp-btn-sm ${rangeDays === n ? 'dp-btn-primary' : ''}`}
                onClick={() => setRangeDays(n)}
              >
                {n}d
              </button>
            ))}
            <input
              aria-label="Custom range days (1 to 62)"
              type="number"
              min={1}
              max={62}
              className="dp-input"
              style={{ width: 62, padding: '3px 6px' }}
              value={rangeDays}
              onChange={(e) => setRangeDays(Math.max(1, Math.min(62, Number(e.target.value) || 7)))}
            />
          </div>

          <select
            aria-label="Timeline positioning"
            className="dp-select"
            style={{ width: 'auto', padding: '4px 8px' }}
            value={positionMode}
            onChange={(e) => setPositionMode(e.target.value as 'ahead' | 'around' | 'before')}
          >
            <option value="ahead">Ahead</option>
            <option value="around">Before & After</option>
            <option value="before">Before</option>
          </select>

          <select
            aria-label="Overlap layout mode"
            className="dp-select"
            style={{ width: 'auto', padding: '4px 8px' }}
            value={overlapMode}
            onChange={(e) => setOverlapMode(e.target.value as OverlapMode)}
          >
            <option value="equal_split">Overlap: Equal Split</option>
            <option value="layered_stagger">Overlap: Layered Stagger</option>
            <option value="expand_columns">Overlap: Expand Columns</option>
            <option value="offset_columns">Overlap: Offset Columns</option>
          </select>

          <div className="dp-row" style={{ gap: 4 }}>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => changeZoom(1)} title="Zoom out">
              <ZoomOut size={13} />
            </button>
            <span className="dp-pill">{gridStepMin}m grid</span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => changeZoom(-1)} title="Zoom in">
              <ZoomIn size={13} />
            </button>
          </div>

          <label className="dp-row" style={{ gap: 4 }}>
            <input type="checkbox" checked={showDualTz} onChange={(e) => setShowDualTz(e.target.checked)} />
            <span>Dual TZ ({settings.secondaryTimeZone})</span>
          </label>
        </div>

        {/* Batch selection toolbar (Shift+Click) */}
        {selectedIds.size > 0 && (
          <div className="dp-row" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 8 }}>
            <strong>{selectedIds.size} selected</strong>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleBatchShift(1)}>
              Shift +1d
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void handleBatchShift(-1)}>
              Shift −1d
            </button>
            <button type="button" className="dp-btn dp-btn-danger dp-btn-sm" onClick={() => void handleBatchDelete()}>
              Trash Selected
            </button>
            <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
          </div>
        )}

        {/* Drag-Anything-to-Timeline Task/Chore Tray (Section 03.02) */}
        {unscheduledActions.length > 0 && (
          <div className="dp-row" style={{ gap: 6, fontSize: '0.8rem' }}>
            <span className="dp-muted">Drag onto timeline:</span>
            {unscheduledActions.map((act) => (
              <span
                key={act.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-dayplana-action', act.id);
                }}
                className="dp-pill"
                style={{ cursor: 'grab' }}
                title="Drag onto any day column slot to create a linked time block"
              >
                {act.type === 'chore' ? '🧹' : '✅'} {act.title.slice(0, 26)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Multi-Day Virtualized Flow Grid */}
      <div className="dp-flow-shell">
        <div className="dp-flow-scroll" ref={scrollRef}>
          <div
            className="dp-flow-grid"
            style={{
              gridTemplateColumns: `${showDualTz ? 112 : 64}px repeat(${dayColumns.length}, minmax(145px, 1fr))`,
              minWidth: `${(showDualTz ? 112 : 64) + dayColumns.length * 145}px`,
            }}
          >
            {/* Corner */}
            <div className="dp-flow-day-header dp-flow-ruler" style={{ zIndex: 8 }}>
              Time
            </div>

            {/* Day Headers + All-Day strip */}
            {dayColumns.map((d) => {
              const allDayEvs = (eventsByDay.get(d) ?? []).filter((x) => x.event.payload.allDay);
              return (
                <div
                  key={d}
                  className="dp-flow-day-header"
                  style={{
                    background: d === logicalToday ? 'color-mix(in oklch, var(--dp-highlight) 50%, var(--dp-surface-2))' : undefined,
                  }}
                >
                  <div className="dp-between">
                    <span>{formatDateLocalized(d, settings.locale, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <button
                      type="button"
                      className="dp-icon-btn"
                      style={{ width: 22, height: 22 }}
                      aria-label={`Add event on ${d}`}
                      onClick={() => openNewEvent(d)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {allDayEvs.map(({ event }) => (
                    <div
                      key={event.id}
                      onClick={() => openEditEvent(event, d)}
                      style={{
                        marginTop: 3,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: event.color || 'var(--dp-accent)',
                        color: 'var(--dp-on-accent)',
                        fontSize: '0.73rem',
                        cursor: 'pointer',
                      }}
                    >
                      {event.payload.emoji || ''} {event.title}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Sticky Time Ruler */}
            <div className="dp-flow-ruler" style={{ height: totalGridHeight, position: 'sticky' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const hhmm = `${String(h).padStart(2, '0')}:00`;
                const secondary = showDualTz
                  ? convertEventTimeZone(activeDate, hhmm, settings.defaultTimeZone, settings.secondaryTimeZone).timeHHMM
                  : null;
                return (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: h * pxPerHour,
                      insetInline: 4,
                      fontSize: '0.72rem',
                      color: 'var(--dp-muted)',
                      borderTop: '1px solid var(--dp-border)',
                      paddingTop: 2,
                    }}
                  >
                    <div>{formatTimeDisplay(hhmm, settings.timeFormat)}</div>
                    {secondary && <div style={{ opacity: 0.7 }}>{secondary}</div>}
                  </div>
                );
              })}
            </div>

            {/* Day Columns */}
            {dayColumns.map((d) => {
              const layout = dayLayouts.get(d);
              const positioned = layout?.positioned ?? [];
              return (
                <div
                  key={`col-${d}`}
                  style={{
                    position: 'relative',
                    height: totalGridHeight,
                    borderInlineEnd: '1px solid var(--dp-border)',
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--dp-border) 0 1px, transparent 1px ${pxPerHour}px)`,
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const rawMin = Math.floor(((y / totalGridHeight) * 1440) / gridStepMin) * gridStepMin;
                    openNewEvent(d, minutesToTime(rawMin));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = Math.max(0, e.clientY - rect.top);
                    const snappedMin = Math.floor(((y / totalGridHeight) * 1440) / gridStepMin) * gridStepMin;
                    const slotTime = minutesToTime(snappedMin);

                    const actionId = e.dataTransfer.getData('application/x-dayplana-action');
                    if (actionId) {
                      await scheduleActionOnCalendar(actionId, d, slotTime);
                      pushToast(`Scheduled onto ${d} at ${slotTime}`, { canUndo: true });
                      return;
                    }

                    const rawEv = e.dataTransfer.getData('application/x-dayplana-event');
                    if (rawEv) {
                      const { id, occDate } = JSON.parse(rawEv) as { id: string; occDate: string };
                      const found = events.find((x) => x.id === id);
                      if (found) {
                        await moveEventToSlot(found, occDate, d, slotTime, e.altKey);
                      }
                    }
                  }}
                >
                  {/* Live Now line on today's column */}
                  {d === logicalToday && (
                    <div
                      className="dp-now-line"
                      style={{ top: ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * totalGridHeight }}
                    />
                  )}

                  {positioned.map((pos) => {
                    const topPx = (pos.startMin / 1440) * totalGridHeight + pos.topOffsetPx;
                    const heightPx = Math.max(47, ((pos.endMin - pos.startMin) / 1440) * totalGridHeight);
                    const evColor = pos.event.color || 'var(--dp-accent)';
                    const isFilled = pos.event.payload.style === 'filled';
                    const isOutline = pos.event.payload.style === 'outline';
                    const prepPx = ((pos.event.payload.buffers?.prepMin ?? 0) / 60) * pxPerHour;
                    const decompPx = ((pos.event.payload.buffers?.decompressMin ?? 0) / 60) * pxPerHour;

                    return (
                      <React.Fragment key={pos.id}>
                        {prepPx > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: Math.max(0, topPx - prepPx),
                              height: prepPx,
                              left: `${pos.leftPct}%`,
                              width: `${pos.widthPct}%`,
                              background: `color-mix(in oklch, ${evColor} 22%, transparent)`,
                              borderInlineStart: `2px dashed ${evColor}`,
                              fontSize: '0.66rem',
                              paddingInline: 4,
                              pointerEvents: 'none',
                            }}
                          >
                            Prep {pos.event.payload.buffers?.prepMin}m
                          </div>
                        )}

                        <div
                          draggable
                          tabIndex={0}
                          className={`dp-flow-event ${selectedIds.has(pos.event.id) ? 'selected' : ''}`}
                          style={{
                            top: topPx,
                            height: heightPx,
                            left: `${pos.leftPct}%`,
                            width: `calc(${pos.widthPct}% - 3px)`,
                            zIndex: pos.zIndex,
                            background: isFilled
                              ? evColor
                              : isOutline
                                ? 'var(--dp-paper)'
                                : `color-mix(in oklch, ${evColor} 22%, var(--dp-paper))`,
                            color: isFilled ? '#ffffff' : 'var(--dp-ink)',
                            borderColor: evColor,
                            borderWidth: isOutline ? 2 : 1,
                            opacity: pos.event.status === 'done' ? 0.65 : 1,
                          }}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              'application/x-dayplana-event',
                              JSON.stringify({ id: pos.event.id, occDate: pos.occurrenceDate })
                            );
                          }}
                          onTouchStart={() => {
                            // Touch-safe 350ms long-press activation; movement cancels so scrolling stays fluid
                            longPressTimerRef.current = window.setTimeout(() => {
                              setSelectedIds((prev) => new Set(prev).add(pos.event.id));
                            }, 350);
                          }}
                          onTouchMove={() => {
                            if (longPressTimerRef.current) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onTouchEnd={() => {
                            if (longPressTimerRef.current) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onKeyDown={(e) => {
                            // Alt+Arrow keyboard nudge by grid step (Section 04.05)
                            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                              e.preventDefault();
                              const delta = e.key === 'ArrowUp' ? -gridStepMin : gridStepMin;
                              const shifted = shiftZonedEventByMinutes(
                                pos.occurrenceDate,
                                pos.event.payload.startTime || '09:00',
                                pos.event.payload.timeZone || settings.defaultTimeZone,
                                delta
                              );
                              void moveEventToSlot(pos.event, pos.occurrenceDate, shifted.dateIso, shifted.timeHHMM);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (e.shiftKey) {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(pos.event.id)) next.delete(pos.event.id);
                                else next.add(pos.event.id);
                                return next;
                              });
                              return;
                            }
                            openEditEvent(pos.event, pos.occurrenceDate);
                          }}
                        >
                          <div className="dp-between" style={{ gap: 4 }}>
                            <strong style={{ textDecoration: pos.event.status === 'done' ? 'line-through' : undefined }}>
                              {pos.event.payload.emoji ? `${pos.event.payload.emoji} ` : ''}
                              {pos.event.title}
                            </strong>
                            {pos.event.payload.linkedActionId && (
                              <input
                                type="checkbox"
                                checked={pos.event.status === 'done'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => void completeActionAtomically(pos.event.id, { completedDateIso: d })}
                              />
                            )}
                          </div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                            {pos.labelShifted ? '↪ ' : ''}
                            {formatTimeDisplay(pos.event.payload.startTime || '09:00', settings.timeFormat)} –{' '}
                            {formatTimeDisplay(pos.event.payload.endTime || '10:00', settings.timeFormat)}
                          </div>
                          <div
                            className="dp-flow-resize-handle"
                            title="Click to extend +15m"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextEnd = minutesToTime(pos.endMin + gridStepMin);
                              if (pos.event.recurrence) {
                                setPendingScopeEdit({
                                  masterId: pos.event.id,
                                  occDate: pos.occurrenceDate,
                                  patch: { endTime: nextEnd },
                                });
                              } else {
                                void updateRecord<CalendarEventPayload>(pos.event.id, (c) => ({
                                  ...c,
                                  payload: { ...c.payload, endTime: nextEnd },
                                }));
                              }
                            }}
                          />
                        </div>

                        {decompPx > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: topPx + heightPx,
                              height: decompPx,
                              left: `${pos.leftPct}%`,
                              width: `${pos.widthPct}%`,
                              background: `color-mix(in oklch, ${evColor} 16%, transparent)`,
                              borderInlineStart: `2px dashed ${evColor}`,
                              fontSize: '0.66rem',
                              paddingInline: 4,
                              pointerEvents: 'none',
                            }}
                          >
                            Decompress {pos.event.payload.buffers?.decompressMin}m
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ICS Interoperability Bar (Section 08.04) */}
      <div className="dp-card dp-between" style={{ padding: 10 }}>
        <div className="dp-row">
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              const ics = exportEventsToIcs(events);
              triggerBrowserDownload(ics, `dayplana-calendar-${logicalToday}.ics`, 'text/calendar');
              pushToast(`Exported ${events.length} events to .ics`);
            }}
          >
            <Download size={14} /> Export .ics
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => icsInputRef.current?.click()}>
            <Upload size={14} /> Import .ics
          </button>
          <input
            ref={icsInputRef}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await handleImportIcs(await f.text());
              e.target.value = '';
            }}
          />
        </div>
        <div className="dp-row">
          <input
            className="dp-input"
            style={{ width: 240, padding: '4px 8px', fontSize: '0.82rem' }}
            placeholder="Subscribe read-only ICS feed URL…"
            value={icsFeedUrl}
            onChange={(e) => setIcsFeedUrl(e.target.value)}
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={async () => {
              if (!icsFeedUrl.trim()) return;
              try {
                const res = await fetch(`${settings.syncServerUrl.replace(/\/+$/, '')}/api/proxy/ics`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: icsFeedUrl.trim() }),
                });
                const json = (await res.json()) as { ok?: boolean; icsText?: string; error?: string };
                if (json.ok && json.icsText) await handleImportIcs(json.icsText);
                else pushToast(json.error || 'Connect Docker Sync mode to proxy external ICS feeds', { tone: 'warn' });
              } catch {
                pushToast('External ICS proxy requires Docker Sync server; you can still import local .ics files offline.', { tone: 'warn' });
              }
            }}
          >
            Fetch ICS Feed
          </button>
        </div>
      </div>

      {/* Event Editor Modal — Progressive Disclosure (Section 08.01) */}
      <ModalDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit Calendar Event' : 'New Calendar Event'}
      >
        <form className="dp-stack" onSubmit={handleSaveEvent}>
          {/* Editable Templates */}
          <div className="dp-row" style={{ gap: 6 }}>
            {EVENT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  if (!title) setTitle(tpl.name);
                  setEmoji(tpl.emoji);
                  setColor(tpl.color);
                  setStyle(tpl.style);
                  setEndTime(minutesToTime(timeToMinutes(startTime) + tpl.duration));
                }}
              >
                {tpl.emoji} {tpl.name}
              </button>
            ))}
          </div>

          {/* Basic Fields Upfront */}
          <input
            autoFocus
            required
            className="dp-input"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="dp-grid-2" style={{ gap: 10 }}>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">Start Date</span>
              <input type="date" className="dp-input" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">End Date</span>
              <input type="date" className="dp-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          {!allDay && (
            <div className="dp-row">
              <input type="time" className="dp-input" style={{ width: 130 }} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <span>→</span>
              <input type="time" className="dp-input" style={{ width: 130 }} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => setEndTime(minutesToTime(timeToMinutes(startTime) + d))}
                >
                  {d}m
                </button>
              ))}
            </div>
          )}

          {dstCheck?.ambiguousOrSkipped && (
            <div className="dp-banner" style={{ margin: 0 }}>
              ⚠️ {dstCheck.warning} Will resolve safely to {dstCheck.resolvedTime}.
            </div>
          )}

          <div className="dp-row">
            <input className="dp-input" style={{ flex: 1 }} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input type="color" aria-label="Event color" value={color} onChange={(e) => setColor(e.target.value)} />
            <label className="dp-row">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>All-day</span>
            </label>
          </div>

          {/* Progressive Disclosure: Advanced Fields Behind More Options */}
          <details className="dp-details">
            <summary>More options (Recurrence, IANA Timezone, Buffer Wings, Style, Location & Notes)</summary>
            <div className="dp-stack" style={{ marginTop: 12 }}>
              <div className="dp-grid-3" style={{ gap: 8 }}>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Style</span>
                  <select className="dp-select" value={style} onChange={(e) => setStyle(e.target.value as 'soft' | 'filled' | 'outline')}>
                    <option value="soft">Soft</option>
                    <option value="filled">Filled</option>
                    <option value="outline">Outline</option>
                  </select>
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Status</span>
                  <select className="dp-select" value={eventStatus} onChange={(e) => setEventStatus(e.target.value as 'confirmed' | 'tentative' | 'canceled')}>
                    <option value="confirmed">Confirmed</option>
                    <option value="tentative">Tentative</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Importance</span>
                  <select className="dp-select" value={importance} onChange={(e) => setImportance(e.target.value as 'normal' | 'must_do' | 'optional')}>
                    <option value="normal">Normal</option>
                    <option value="must_do">Must-Do (Calm Mode)</option>
                    <option value="optional">Optional</option>
                  </select>
                </label>
              </div>

              <div className="dp-grid-2" style={{ gap: 8 }}>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">IANA Timezone</span>
                  <select className="dp-select" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} disabled={floating}>
                    {COMMON_TIMEZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label className="dp-row" style={{ alignSelf: 'end', paddingBottom: 8 }}>
                  <input type="checkbox" checked={floating} onChange={(e) => setFloating(e.target.checked)} />
                  <span>Floating local date (never shifts when traveling)</span>
                </label>
              </div>

              <div className="dp-grid-3" style={{ gap: 8 }}>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Prep Buffer (m)</span>
                  <input type="number" min={0} max={180} className="dp-input" value={prepMin} onChange={(e) => setPrepMin(Number(e.target.value) || 0)} />
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Travel Buffer (m)</span>
                  <input type="number" min={0} max={180} className="dp-input" value={travelMin} onChange={(e) => setTravelMin(Number(e.target.value) || 0)} />
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Decompress (m)</span>
                  <input type="number" min={0} max={180} className="dp-input" value={decompressMin} onChange={(e) => setDecompressMin(Number(e.target.value) || 0)} />
                </label>
              </div>

              <div className="dp-grid-2" style={{ gap: 8 }}>
                <input className="dp-input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
                <input className="dp-input" placeholder="HTTPS URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>

              {/* Recurrence Builder with live 5-occurrence preview */}
              <div className="dp-card dp-stack" style={{ padding: 10 }}>
                <div className="dp-row">
                  <select
                    aria-label="Recurrence frequency"
                    className="dp-select"
                    style={{ width: 'auto' }}
                    value={recurFreq}
                    onChange={(e) => setRecurFreq(e.target.value as typeof recurFreq)}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  {recurFreq !== 'none' && (
                    <>
                      <span>Every</span>
                      <input type="number" min={1} max={99} className="dp-input" style={{ width: 64 }} value={recurInterval} onChange={(e) => setRecurInterval(Number(e.target.value) || 1)} />
                      <label className="dp-row">
                        <input type="checkbox" checked={recurSkipWeekends} onChange={(e) => setRecurSkipWeekends(e.target.checked)} />
                        <span>Skip weekends</span>
                      </label>
                      <input type="date" aria-label="Repeat until" className="dp-input" style={{ width: 'auto' }} value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} />
                    </>
                  )}
                </div>
                {recurFreq === 'weekly' && (
                  <div className="dp-row">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((lbl, idx) => (
                      <button
                        key={lbl}
                        type="button"
                        className={`dp-btn dp-btn-sm ${recurWeekdays.includes(idx) ? 'dp-btn-primary' : ''}`}
                        onClick={() =>
                          setRecurWeekdays((prev) =>
                            prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort()
                          )
                        }
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
                {recurPreview.length > 0 && (
                  <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                    Next 5 occurrences: {recurPreview.join(' · ')}
                  </div>
                )}
              </div>

              <textarea className="dp-textarea" placeholder="Notes / agenda…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </details>

          <div className="dp-between">
            {editingId ? (
              <button
                type="button"
                className="dp-btn dp-btn-danger"
                onClick={async () => {
                  await softDeleteRecord(editingId);
                  setEditorOpen(false);
                  pushToast('Moved event to Trash', { canUndo: true });
                }}
              >
                Move to Trash
              </button>
            ) : (
              <span />
            )}
            <div className="dp-row">
              <button type="button" className="dp-btn" onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="dp-btn dp-btn-primary">
                Save Event
              </button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Recurring Scope Prompt Modal (Section 08.03) */}
      <ModalDialog
        open={Boolean(pendingScopeEdit)}
        onClose={() => setPendingScopeEdit(null)}
        title="Edit Recurring Event — Choose Scope"
      >
        <p className="dp-muted" style={{ margin: 0 }}>
          Apply this change to just this occurrence ({pendingScopeEdit?.occDate}), this and all following occurrences, or the entire series?
        </p>
        <div className="dp-stack">
          {(
            [
              ['this', 'This occurrence only'],
              ['following', 'This and following occurrences'],
              ['series', 'Entire series'],
            ] as Array<[RecurringEditScope, string]>
          ).map(([scope, label]) => (
            <button
              key={scope}
              type="button"
              className="dp-btn"
              onClick={async () => {
                if (!pendingScopeEdit) return;
                await applyRecurringEventEdit(
                  pendingScopeEdit.masterId,
                  pendingScopeEdit.occDate,
                  scope,
                  pendingScopeEdit.patch
                );
                setPendingScopeEdit(null);
                pushToast(`Updated recurring event (${label})`, { canUndo: true });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </ModalDialog>

      {/* Conflict Inspector Modal (Section 07.02) */}
      <ModalDialog open={conflictOpen} onClose={() => setConflictOpen(false)} title="Conflict Inspector">
        {allConflicts.length === 0 ? (
          <p className="dp-muted">No overlapping time windows in the current range.</p>
        ) : (
          <div className="dp-stack">
            {allConflicts.map((c, idx) => (
              <div key={idx} className="dp-card dp-between" style={{ padding: 10 }}>
                <div>
                  <strong>{c.titles.join(' ↔ ')}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                    {c.dateIso} · Overlap window: {minutesToTime(c.startMin)} – {minutesToTime(c.endMin)}
                  </div>
                </div>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    const ev = events.find((e) => e.id === c.eventIds[0]);
                    if (ev) {
                      setConflictOpen(false);
                      openEditEvent(ev, c.dateIso);
                    }
                  }}
                >
                  Edit Event
                </button>
              </div>
            ))}
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
