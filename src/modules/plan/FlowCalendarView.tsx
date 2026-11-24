import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Copy,
  Download,
  List,
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
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { DecorCanvasOverlay } from '../../components/Decor/DecorCanvas';
import { ALARM_RINGTONES, audioEngine } from '../../core/audio';
import { createId } from '../../core/db';
import type { CalendarEventPayload, CalendarLayerDef, CalendarViewPrefs, LifeRecord, RecurrenceRule } from '../../core/types';

const EVENT_TEMPLATES = [
  { name: 'Work Meeting', emoji: '💼', category: 'Work', duration: 45, color: '#3b6ea5', style: 'soft' as const },
  { name: 'Focus Block', emoji: '🧠', category: 'Focus', duration: 90, color: '#4f7a65', style: 'filled' as const },
  { name: 'Appointment', emoji: '🏥', category: 'Health & Medical', duration: 60, color: '#a84f48', style: 'soft' as const },
  { name: 'Family Visit', emoji: '🏡', category: 'Family', duration: 120, color: '#c96f53', style: 'soft' as const },
  { name: 'Workout', emoji: '🏋️', category: 'Health & Medical', duration: 45, color: '#6b5ca5', style: 'filled' as const },
  { name: 'Birthday', emoji: '🎂', category: 'Social & Fun', duration: 60, color: '#b47438', style: 'outline' as const },
];

const ZOOM_STEPS = [1, 2, 5, 10, 15, 20, 30, 45, 60, 120, 180, 240] as const;

function computePxPerHour(intervalMin: number): number {
  if (intervalMin <= 1) return 720;
  if (intervalMin <= 2) return 420;
  if (intervalMin <= 5) return 216;
  if (intervalMin <= 10) return 144;
  if (intervalMin <= 15) return 96;
  if (intervalMin <= 20) return 78;
  if (intervalMin <= 30) return 60;
  if (intervalMin <= 45) return 48;
  if (intervalMin <= 60) return 40;
  if (intervalMin <= 120) return 26;
  if (intervalMin <= 180) return 20;
  return 16; // 4-hour macro view!
}

export const FlowCalendarView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, pushToast, selectedEventId, setSelectedEventId } = useApp();

  const calPrefs: CalendarViewPrefs = settings.calendarPrefs ?? {
    intervalMin: 15,
    majorGridIntervalMin: 60,
    showMajorGrid: true,
    showMinorGrid: true,
    gridThicknessPx: 1,
    majorLineColor: '#b7a995',
    minorLineColor: '#dfd5c6',
    gridOpacity: 0.75,
    gridLineStyle: 'solid',
    timeLabelEveryMin: 60,
    adaptiveText: true,
    minFontPx: 10,
    maxFontPx: 14,
    visibleStartHour: 0,
    visibleEndHour: 24,
    overlapPolicy: 'side_by_side',
    dayMinWidthPx: 145,
  };
  const calendars: CalendarLayerDef[] = settings.calendars ?? [
    { id: 'cal_personal', name: 'Personal', emoji: '🌿', color: '#4f7a65', visible: true },
    { id: 'cal_work', name: 'Work', emoji: '💼', color: '#3b6ea5', visible: true },
    { id: 'cal_lab', name: 'Laboratory', emoji: '🧪', color: '#2f7a78', visible: true },
    { id: 'cal_family', name: 'Family', emoji: '🏡', color: '#c96f53', visible: true },
    { id: 'cal_tasks', name: 'Tasks & Chores', emoji: '✅', color: '#a97434', visible: true },
  ];

  const updateCalPrefs = (patch: Partial<CalendarViewPrefs>) => {
    void patchSettings({ calendarPrefs: { ...calPrefs, ...patch } });
  };

  // Range, view mode (Timeline / Agenda / Month), positioning, zoom & filter/sort state
  const [calendarMode, setCalendarMode] = useState<'timeline' | 'agenda' | 'month'>('timeline');
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [positionMode, setPositionMode] = useState<'ahead' | 'around' | 'before'>('ahead');
  const gridStepMin = Math.max(1, Math.min(240, calPrefs.intervalMin || 15));
  const setGridStepMin = (next: number) => updateCalPrefs({ intervalMin: Math.max(1, Math.min(240, next)) });
  const [overlapMode, setOverlapMode] = useState<OverlapMode>('equal_split');
  const [showDualTz, setShowDualTz] = useState(false);
  const [showCalDecor, setShowCalDecor] = useState(false);
  const [newCalName, setNewCalName] = useState('');
  const [newCalEmoji, setNewCalEmoji] = useState('📆');
  const [newCalColor, setNewCalColor] = useState('#6b5ca5');
  const [selectedCalId, setSelectedCalId] = useState('cal_personal');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [icsFeedUrl, setIcsFeedUrl] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Calendar Search, Category/Chip Filter & Sort
  const [calSearch, setCalSearch] = useState('');
  const [calCategoryFilter, setCalCategoryFilter] = useState('all');
  const [calChipFilter, setCalChipFilter] = useState<'all' | 'upcoming' | 'shared' | 'important' | 'recurring'>('all');
  const [calSortBy, setCalSortBy] = useState<'date' | 'title' | 'category' | 'duration'>('date');
  const [calSortDir, setCalSortDir] = useState<'asc' | 'desc'>('asc');

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
  const [reminderLeadMin, setReminderLeadMin] = useState<number>(settings.notificationPrefs.eventLeadMinutes);
  const [evNotifyEnabled, setEvNotifyEnabled] = useState<boolean>(true);
  const [evCustomSound, setEvCustomSound] = useState<string>('default');
  const [evCustomVolume, setEvCustomVolume] = useState<string>(''); // '' = default global volume
  const [sharedWithAll, setSharedWithAll] = useState(false);
  const [sharedWithProfileIds, setSharedWithProfileIds] = useState<string[]>([]);
  const [isImportant, setIsImportant] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('🏷️');
  const [showAddCat, setShowAddCat] = useState(false);

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

  const visibleCalendarIds = useMemo(
    () => new Set(calendars.filter((c) => c.visible).map((c) => c.id)),
    [calendars]
  );

  const filteredEvents = useMemo(() => {
    const q = calSearch.trim().toLowerCase();
    return events.filter((ev) => {
      if (ev.payload.calendarId && visibleCalendarIds.size > 0 && !visibleCalendarIds.has(ev.payload.calendarId)) {
        return false;
      }
      if (calCategoryFilter !== 'all' && (ev.category || 'Personal') !== calCategoryFilter) return false;
      if (calChipFilter === 'upcoming' && ev.payload.startDate < logicalToday && !ev.recurrence) return false;
      if (calChipFilter === 'shared' && !ev.sharedWithAll && !(ev.sharedWithProfileIds?.length)) return false;
      if (calChipFilter === 'important' && !ev.isImportant && ev.payload.importance !== 'must_do') return false;
      if (calChipFilter === 'recurring' && !ev.recurrence) return false;
      if (q) {
        const hay = `${ev.title} ${ev.category ?? ''} ${ev.payload.location ?? ''} ${ev.payload.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, calSearch, calCategoryFilter, calChipFilter, logicalToday]);

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

  // Expand recurring & multi-day filtered events across visible range
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ event: LifeRecord<CalendarEventPayload>; occurrenceDate: string }>>();
    for (const d of dayColumns) map.set(d, []);

    for (const ev of filteredEvents) {
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
  }, [filteredEvents, dayColumns, rangeStart, rangeEnd]);

  // Month Grid cells for Month view (42-day 6x7 grid centered on activeDate's month)
  const monthGridDays = useMemo(() => {
    const [yStr, mStr] = activeDate.split('-');
    const year = Number(yStr) || 2026;
    const monthIdx = (Number(mStr) || 1) - 1;
    const first = new Date(year, monthIdx, 1);
    const startPad = (first.getDay() - settings.weekStartsOn + 7) % 7;
    const firstCellDate = new Date(year, monthIdx, 1 - startPad);
    return Array.from({ length: 42 }, (_, i) => {
      const dt = new Date(firstCellDate);
      dt.setDate(firstCellDate.getDate() + i);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      return { iso, inMonth: dt.getMonth() === monthIdx, dayNum: dt.getDate() };
    });
  }, [activeDate, settings.weekStartsOn]);

  const monthEventsByDay = useMemo(() => {
    const map = new Map<string, Array<LifeRecord<CalendarEventPayload>>>();
    if (calendarMode !== 'month') return map;
    const mStart = monthGridDays[0].iso;
    const mEnd = monthGridDays[monthGridDays.length - 1].iso;
    for (const cell of monthGridDays) map.set(cell.iso, []);
    for (const ev of filteredEvents) {
      if (ev.recurrence) {
        const occ = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, { rangeStart: mStart, rangeEnd: mEnd, maxCount: 60 });
        for (const d of occ) map.get(d)?.push(ev);
      } else {
        const s = ev.payload.startDate;
        const e = ev.payload.endDate || s;
        for (const cell of monthGridDays) {
          if (cell.iso >= s && cell.iso <= e) map.get(cell.iso)?.push(ev);
        }
      }
    }
    return map;
  }, [calendarMode, monthGridDays, filteredEvents]);

  // Sorted Agenda occurrences across a 90-day lookahead window (or all filtered events)
  const agendaOccurrences = useMemo(() => {
    const list: Array<{ event: LifeRecord<CalendarEventPayload>; occurrenceDate: string; durationMin: number }> = [];
    const aStart = addDaysIso(activeDate, -14);
    const aEnd = addDaysIso(activeDate, 90);
    for (const ev of filteredEvents) {
      const dur = ev.payload.allDay
        ? 1440
        : Math.max(15, timeToMinutes(ev.payload.endTime || '10:00') - timeToMinutes(ev.payload.startTime || '09:00'));
      if (ev.recurrence) {
        const occ = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, { rangeStart: aStart, rangeEnd: aEnd, maxCount: 25 });
        for (const d of occ) list.push({ event: ev, occurrenceDate: d, durationMin: dur });
      } else {
        list.push({ event: ev, occurrenceDate: ev.payload.startDate, durationMin: dur });
      }
    }
    const dir = calSortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (calSortBy === 'title') return a.event.title.localeCompare(b.event.title) * dir;
      if (calSortBy === 'category') return (a.event.category || 'Personal').localeCompare(b.event.category || 'Personal') * dir;
      if (calSortBy === 'duration') return (a.durationMin - b.durationMin) * dir;
      const cmpD = a.occurrenceDate.localeCompare(b.occurrenceDate);
      if (cmpD !== 0) return cmpD * dir;
      return (a.event.payload.startTime || '00:00').localeCompare(b.event.payload.startTime || '00:00') * dir;
    });
  }, [filteredEvents, activeDate, calSortBy, calSortDir]);

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

  // Visible hours window & pixels-per-hour zoom scaling (1m to 4h + custom intervals!)
  const visibleStartHour = Math.max(0, Math.min(23, calPrefs.visibleStartHour ?? 0));
  const visibleEndHour = Math.max(visibleStartHour + 1, Math.min(24, calPrefs.visibleEndHour ?? 24));
  const visibleHours = visibleEndHour - visibleStartHour;
  const visibleStartMin = visibleStartHour * 60;
  const visibleTotalMin = visibleHours * 60;
  const pxPerHour = computePxPerHour(gridStepMin);
  const totalGridHeight = visibleHours * pxPerHour;
  const adaptiveFontPx = calPrefs.adaptiveText
    ? Math.max(
        calPrefs.minFontPx ?? 10,
        Math.min(calPrefs.maxFontPx ?? 14, Math.round(9 + Math.min(5, pxPerHour / 26)))
      )
    : 12;

  const changeZoom = (dir: -1 | 1) => {
    const nearestIdx = ZOOM_STEPS.reduce(
      (best, val, i) => (Math.abs(val - gridStepMin) < Math.abs(ZOOM_STEPS[best] - gridStepMin) ? i : best),
      0
    );
    const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, nearestIdx + dir));
    if (nextIdx === nearestIdx && ZOOM_STEPS[nearestIdx] === gridStepMin) return;
    const scroller = scrollRef.current;
    const anchorRatio = scroller ? scroller.scrollTop / Math.max(1, totalGridHeight) : 0;
    const nextStep = ZOOM_STEPS[nextIdx];
    setGridStepMin(nextStep);
    requestAnimationFrame(() => {
      if (scroller) {
        const nextPx = computePxPerHour(nextStep);
        scroller.scrollTop = anchorRatio * visibleHours * nextPx;
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
    setReminderLeadMin(settings.notificationPrefs.eventLeadMinutes);
    setEvNotifyEnabled(true);
    setEvCustomSound('default');
    setEvCustomVolume('');
    setSharedWithAll(false);
    setSharedWithProfileIds([]);
    setIsImportant(false);
    setShowAddCat(false);
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
    setReminderLeadMin(ev.payload.remindersMin?.[0] ?? settings.notificationPrefs.eventLeadMinutes);
    setEvNotifyEnabled(ev.payload.notifyEnabled !== false);
    setEvCustomSound(ev.payload.customSound || 'default');
    setEvCustomVolume(typeof ev.payload.customVolume === 'number' ? String(ev.payload.customVolume) : '');
    setSharedWithAll(Boolean(ev.sharedWithAll));
    setSharedWithProfileIds(ev.sharedWithProfileIds ?? []);
    setIsImportant(Boolean(ev.isImportant));
    setShowAddCat(false);
    setEditorOpen(true);
  };

  // Auto-open specific event when clicked from Today Spread, Home, or History!
  useEffect(() => {
    if (!selectedEventId) return;
    const found = events.find((ev) => ev.id === selectedEventId);
    if (found) {
      openEditEvent(found, activeDate || found.payload.startDate);
      setSelectedEventId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events]);

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
      remindersMin: reminderLeadMin >= 0 ? [reminderLeadMin] : [],
      notifyEnabled: evNotifyEnabled,
      customSound: evCustomSound !== 'default' ? evCustomSound : undefined,
      customVolume: evCustomVolume !== '' ? Math.max(0, Math.min(100, Number(evCustomVolume) || 0)) : null,
      buffers:
        prepMin || travelMin || decompressMin
          ? { prepMin: prepMin || undefined, travelMin: travelMin || undefined, decompressMin: decompressMin || undefined }
          : undefined,
      calendarId: selectedCalId || 'cal_personal',
    };

    // Enforce optional Overlap Prevention / Conflict Warning policy (Section 8.4)
    if (!allDay && (calPrefs.overlapPolicy === 'prevent' || calPrefs.overlapPolicy === 'warn')) {
      const sMin = timeToMinutes(startTime);
      const eMin = timeToMinutes(endTime);
      const conflictEv = events.find(
        (ev) =>
          ev.id !== editingId &&
          !ev.payload.allDay &&
          ev.payload.startDate === startDate &&
          timeToMinutes(ev.payload.startTime || '09:00') < eMin &&
          timeToMinutes(ev.payload.endTime || '10:00') > sMin
      );
      if (conflictEv) {
        if (calPrefs.overlapPolicy === 'prevent') {
          pushToast(
            `Overlap blocked: conflicts with "${conflictEv.title}" (${conflictEv.payload.startTime}–${conflictEv.payload.endTime}). Switch Overlap Policy to Allow/Warn in Calendar Settings if intended.`,
            { tone: 'warn' }
          );
          return;
        }
        pushToast(`Warning: overlaps "${conflictEv.title}" (${conflictEv.payload.startTime}–${conflictEv.payload.endTime})`, { tone: 'warn' });
      }
    }

    if (editingId) {
      const existing = events.find((ev) => ev.id === editingId);
      if (existing?.recurrence) {
        setEditorOpen(false);
        setPendingScopeEdit({ masterId: editingId, occDate: editingOccDate, patch: { ...payload, title: title.trim() } });
        return;
      }
      await updateRecord<CalendarEventPayload>(
        editingId,
        {
          title: title.trim(),
          color,
          category,
          recurrence: builtRecurrence,
          sharedWithAll,
          sharedWithProfileIds,
          isImportant,
          payload,
        },
        { undoLabel: `Updated event "${title.trim()}"` }
      );
      pushToast(`Saved "${title.trim()}"`, { canUndo: true });
    } else {
      await createRecord<CalendarEventPayload>('event', title.trim(), payload, {
        color,
        category,
        recurrence: builtRecurrence,
        sharedWithAll,
        sharedWithProfileIds,
        isImportant,
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
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <h2 style={{ fontSize: '1.2rem' }}>Flow Calendar</h2>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => setActiveDate(addDaysIso(activeDate, calendarMode === 'month' ? -30 : -rangeDays))}
            >
              ←
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>
              Today
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => setActiveDate(addDaysIso(activeDate, calendarMode === 'month' ? 30 : rangeDays))}
            >
              →
            </button>
            <input
              type="date"
              aria-label="Jump to date"
              className="dp-input"
              style={{ width: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}
              value={activeDate}
              onChange={(e) => e.target.value && setActiveDate(e.target.value)}
            />
            <span className="dp-muted" style={{ fontSize: '0.82rem' }}>
              {calendarMode === 'month'
                ? formatDateLocalized(activeDate, settings.locale, { month: 'long', year: 'numeric' })
                : `${rangeStart} → ${rangeEnd}`}
            </span>
          </div>

          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <div className="dp-row" style={{ gap: 4 }}>
              <button
                type="button"
                className={`dp-btn dp-btn-sm ${calendarMode === 'timeline' ? 'dp-btn-primary' : ''}`}
                onClick={() => setCalendarMode('timeline')}
              >
                Timeline
              </button>
              <button
                type="button"
                className={`dp-btn dp-btn-sm ${calendarMode === 'month' ? 'dp-btn-primary' : ''}`}
                onClick={() => setCalendarMode('month')}
              >
                <CalendarIcon size={13} /> Month
              </button>
              <button
                type="button"
                className={`dp-btn dp-btn-sm ${calendarMode === 'agenda' ? 'dp-btn-primary' : ''}`}
                onClick={() => setCalendarMode('agenda')}
              >
                <List size={13} /> Agenda ({agendaOccurrences.length})
              </button>
            </div>
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

        {/* In-Tab Calendar Settings Drawer (syncs with Global Settings defaults!) */}
        <TabSettingsDrawer
          title="Calendar Settings"
          subtitle="Defaults for all events — you can still override sound, volume, lead time & timezone on any individual event."
        >
          <div className="dp-grid-3" style={{ gap: 8, fontSize: '0.83rem' }}>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">Week Starts On</span>
              <select
                className="dp-select"
                value={settings.weekStartsOn}
                onChange={(e) => void patchSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">Time Format</span>
              <select
                className="dp-select"
                value={settings.timeFormat}
                onChange={(e) => void patchSettings({ timeFormat: e.target.value as '12h' | '24h' })}
              >
                <option value="12h">12-Hour (AM/PM)</option>
                <option value="24h">24-Hour</option>
              </select>
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <span className="dp-muted">Default Event Lead Time</span>
              <select
                className="dp-select"
                value={settings.notificationPrefs.eventLeadMinutes}
                onChange={(e) =>
                  void patchSettings({
                    notificationPrefs: { ...settings.notificationPrefs, eventLeadMinutes: Number(e.target.value) },
                  })
                }
              >
                <option value={0}>At start time</option>
                <option value={5}>5 min before</option>
                <option value={10}>10 min before</option>
                <option value={15}>15 min before</option>
                <option value={30}>30 min before</option>
                <option value={60}>1 hour before</option>
              </select>
            </label>
          </div>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.83rem' }}>
            <label className="dp-row" style={{ gap: 5 }}>
              <input
                type="checkbox"
                checked={settings.notificationPrefs.notifyEvents}
                onChange={(e) =>
                  void patchSettings({
                    notificationPrefs: { ...settings.notificationPrefs, notifyEvents: e.target.checked },
                  })
                }
              />
              <span>Notify for Upcoming Events (Global Default)</span>
            </label>
            <label className="dp-row" style={{ gap: 5 }}>
              <span className="dp-muted">Primary TZ:</span>
              <select
                className="dp-select"
                style={{ width: 'auto' }}
                value={settings.defaultTimeZone}
                onChange={(e) => void patchSettings({ defaultTimeZone: e.target.value })}
              >
                {COMMON_TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="dp-row" style={{ gap: 5 }}>
              <span className="dp-muted">Secondary TZ:</span>
              <select
                className="dp-select"
                style={{ width: 'auto' }}
                value={settings.secondaryTimeZone}
                onChange={(e) => void patchSettings({ secondaryTimeZone: e.target.value })}
              >
                {COMMON_TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>
        </TabSettingsDrawer>

        {/* Quick 1-Tap Event Templates */}
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span className="dp-muted">Quick Template:</span>
          {EVENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              className="dp-chip"
              onClick={() => {
                openNewEvent(activeDate, '10:00');
                setTitle(tpl.name);
                setEmoji(tpl.emoji);
                setCategory(tpl.category);
                setColor(tpl.color);
                setStyle(tpl.style);
                setEndTime(minutesToTime(timeToMinutes('10:00') + tpl.duration));
              }}
            >
              {tpl.emoji} {tpl.name} ({tpl.duration}m)
            </button>
          ))}
        </div>

        {/* Easy Search, Category Filter, Status Filter & Sort Bar */}
        <SortFilterBar
          search={calSearch}
          onSearchChange={setCalSearch}
          searchPlaceholder="Search events, locations, notes…"
          sortBy={calSortBy}
          onSortByChange={(v) => setCalSortBy(v as typeof calSortBy)}
          sortOptions={[
            { value: 'date', label: 'Date & Time' },
            { value: 'title', label: 'Title (A–Z)' },
            { value: 'category', label: 'Category' },
            { value: 'duration', label: 'Duration' },
          ]}
          sortDir={calSortDir}
          onSortDirToggle={() => setCalSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          chips={[
            { value: 'all', label: 'All' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'important', label: '★ Important' },
            { value: 'shared', label: '🏡 Shared' },
            { value: 'recurring', label: '🔁 Recurring' },
          ]}
          activeChip={calChipFilter}
          onChipChange={(v) => setCalChipFilter(v as typeof calChipFilter)}
          extraFilters={[
            {
              label: 'Filter by category',
              value: calCategoryFilter,
              onChange: setCalCategoryFilter,
              options: [
                { value: 'all', label: 'All Categories' },
                ...Array.from(
                  new Set([
                    ...settings.eventCategories.map((c) => c.name),
                    ...events.map((e) => e.category || 'Personal'),
                  ])
                ).map((cat) => ({ value: cat, label: cat })),
              ],
            },
          ]}
          totalCount={events.length}
          shownCount={filteredEvents.length}
          onReset={() => {
            setCalSearch('');
            setCalCategoryFilter('all');
            setCalChipFilter('all');
          }}
        />

        {/* Multi-Calendar Layer Chips (Toggle Independent or Combined Calendars — Section 8.5) */}
        <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span className="dp-muted">Calendars:</span>
          {calendars.map((cal) => (
            <button
              key={cal.id}
              type="button"
              className={`dp-chip ${cal.visible ? 'active' : ''}`}
              style={{
                borderColor: cal.visible ? cal.color : undefined,
                opacity: cal.visible ? 1 : 0.45,
              }}
              onClick={() =>
                void patchSettings({
                  calendars: calendars.map((c) => (c.id === cal.id ? { ...c, visible: !c.visible } : c)),
                })
              }
            >
              {cal.emoji} {cal.name}
            </button>
          ))}
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${showCalDecor ? 'dp-btn-primary' : ''}`}
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setShowCalDecor((v) => !v)}
            title="Toggle optional Ink & Stickers overlay on the Calendar"
          >
            ✨ {showCalDecor ? 'Hide Ink/Stickers' : 'Calendar Ink/Stickers'}
          </button>
        </div>

        {/* Advanced Gridlines, Adaptive Text, Overlap Policy, Visible Hours & Custom Calendars Drawer */}
        <TabSettingsDrawer
          title="Calendar Zoom, Gridlines, Text Scaling, Overlap Rules & Multi-Calendars"
          subtitle="Customize 1m–4h intervals, major/minor horizontal gridlines, text sizing, overlap prevention, visible hours, and custom calendars."
        >
          <div className="dp-stack" style={{ gap: 10, fontSize: '0.82rem' }}>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Interval:</span>
                <select
                  className="dp-select"
                  style={{ width: 'auto' }}
                  value={gridStepMin}
                  onChange={(e) => setGridStepMin(Number(e.target.value) || 15)}
                >
                  {ZOOM_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step < 60 ? `${step} min` : `${step / 60} hr`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Custom (m):</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  className="dp-input"
                  style={{ width: 68 }}
                  value={gridStepMin}
                  onChange={(e) => setGridStepMin(Number(e.target.value) || 15)}
                />
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Hours:</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  className="dp-input"
                  style={{ width: 54 }}
                  value={visibleStartHour}
                  onChange={(e) => updateCalPrefs({ visibleStartHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                />
                <span>–</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  className="dp-input"
                  style={{ width: 54 }}
                  value={visibleEndHour}
                  onChange={(e) => updateCalPrefs({ visibleEndHour: Math.max(1, Math.min(24, Number(e.target.value) || 24)) })}
                />
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Overlap Policy:</span>
                <select
                  className="dp-select"
                  style={{ width: 'auto' }}
                  value={calPrefs.overlapPolicy}
                  onChange={(e) => {
                    const pol = e.target.value as CalendarViewPrefs['overlapPolicy'];
                    updateCalPrefs({ overlapPolicy: pol });
                    if (pol === 'side_by_side' || pol === 'auto_resize') setOverlapMode('equal_split');
                    else if (pol === 'stack') setOverlapMode('layered_stagger');
                    else if (pol === 'condensed') setOverlapMode('offset_columns');
                  }}
                >
                  <option value="side_by_side">Side-by-Side</option>
                  <option value="auto_resize">Auto-Resize</option>
                  <option value="allow">Allow Overlap</option>
                  <option value="warn">Warn on Conflict</option>
                  <option value="prevent">Prevent Overlapping Events</option>
                  <option value="stack">Stack Conflicting Items</option>
                  <option value="condensed">Condensed Summaries</option>
                </select>
              </label>
            </div>

            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="dp-row" style={{ gap: 4 }}>
                <input type="checkbox" checked={calPrefs.showMajorGrid} onChange={(e) => updateCalPrefs({ showMajorGrid: e.target.checked })} />
                <span>Major Grid</span>
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <input type="checkbox" checked={calPrefs.showMinorGrid} onChange={(e) => updateCalPrefs({ showMinorGrid: e.target.checked })} />
                <span>Minor Grid ({gridStepMin}m)</span>
              </label>
              <select
                aria-label="Gridline style"
                className="dp-select"
                style={{ width: 'auto' }}
                value={calPrefs.gridLineStyle}
                onChange={(e) => updateCalPrefs({ gridLineStyle: e.target.value as 'solid' | 'dashed' })}
              >
                <option value="solid">Solid Lines</option>
                <option value="dashed">Dashed Lines</option>
              </select>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Thickness:</span>
                <input type="range" min={1} max={3} value={calPrefs.gridThicknessPx} onChange={(e) => updateCalPrefs({ gridThicknessPx: Number(e.target.value) })} />
                <span>{calPrefs.gridThicknessPx}px</span>
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Opacity:</span>
                <input type="range" min={20} max={100} value={Math.round(calPrefs.gridOpacity * 100)} onChange={(e) => updateCalPrefs({ gridOpacity: Number(e.target.value) / 100 })} />
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Major Color:</span>
                <input type="color" value={calPrefs.majorLineColor} onChange={(e) => updateCalPrefs({ majorLineColor: e.target.value })} />
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <input type="checkbox" checked={calPrefs.adaptiveText} onChange={(e) => updateCalPrefs({ adaptiveText: e.target.checked })} />
                <span>Adaptive Text ({calPrefs.minFontPx}–{calPrefs.maxFontPx}px)</span>
              </label>
              <label className="dp-row" style={{ gap: 4 }}>
                <span className="dp-muted">Day Width:</span>
                <input type="range" min={90} max={260} value={calPrefs.dayMinWidthPx} onChange={(e) => updateCalPrefs({ dayMinWidthPx: Number(e.target.value) })} />
                <span>{calPrefs.dayMinWidthPx}px</span>
              </label>
            </div>

            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <strong>Add Custom Calendar:</strong>
              <input className="dp-input" style={{ width: 44 }} value={newCalEmoji} onChange={(e) => setNewCalEmoji(e.target.value)} aria-label="Calendar emoji" />
              <input className="dp-input" style={{ flex: 1, minWidth: 140 }} placeholder="Calendar name (e.g., Lab QA, Spouse, Workouts)…" value={newCalName} onChange={(e) => setNewCalName(e.target.value)} />
              <input type="color" value={newCalColor} onChange={(e) => setNewCalColor(e.target.value)} aria-label="Calendar color" />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={() => {
                  if (!newCalName.trim()) return;
                  void patchSettings({
                    calendars: [...calendars, { id: createId('cal'), name: newCalName.trim(), emoji: newCalEmoji || '📆', color: newCalColor, visible: true }],
                  });
                  setNewCalName('');
                  pushToast('Added new calendar layer!');
                }}
              >
                + Add Calendar
              </button>
            </div>
          </div>
        </TabSettingsDrawer>

        {/* Range presets (1..62d), positioning, 4-mode overlap, zoom, dual TZ */}
        <div className="dp-row" style={{ fontSize: '0.82rem' }}>
          <div className="dp-row" style={{ gap: 4 }}>
            {[1, 3, 5, 7, 14, 30].map((n) => (
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
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => changeZoom(1)} title="Zoom out (up to 4h)">
              <ZoomOut size={13} />
            </button>
            <select
              aria-label="Timeline interval zoom"
              className="dp-select"
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.78rem' }}
              value={ZOOM_STEPS.includes(gridStepMin as (typeof ZOOM_STEPS)[number]) ? gridStepMin : ''}
              onChange={(e) => e.target.value && setGridStepMin(Number(e.target.value))}
            >
              {ZOOM_STEPS.map((s) => (
                <option key={s} value={s}>{s < 60 ? `${s}m` : `${s / 60}h`} grid</option>
              ))}
              {!ZOOM_STEPS.includes(gridStepMin as (typeof ZOOM_STEPS)[number]) && (
                <option value="">{gridStepMin}m custom</option>
              )}
            </select>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => changeZoom(-1)} title="Zoom in (down to 1m)">
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

      {/* View 1: Month Grid View */}
      {calendarMode === 'month' && (
        <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--dp-muted)' }}>
            {(settings.weekStartsOn === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((wd) => (
              <div key={wd}>{wd}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {monthGridDays.map((cell) => {
              const dayEvs = monthEventsByDay.get(cell.iso) ?? [];
              const isToday = cell.iso === logicalToday;
              const isActive = cell.iso === activeDate;
              return (
                <div
                  key={cell.iso}
                  onClick={() => setActiveDate(cell.iso)}
                  onDoubleClick={() => openNewEvent(cell.iso)}
                  style={{
                    minHeight: 82,
                    padding: 6,
                    borderRadius: 8,
                    cursor: 'pointer',
                    opacity: cell.inMonth ? 1 : 0.45,
                    border: isActive ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                    background: isToday ? 'color-mix(in oklch, var(--dp-highlight) 45%, var(--dp-surface))' : 'var(--dp-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div className="dp-between" style={{ fontSize: '0.78rem' }}>
                    <strong style={{ color: isToday ? 'var(--dp-accent)' : undefined }}>{cell.dayNum}</strong>
                    <button
                      type="button"
                      className="dp-icon-btn"
                      style={{ width: 18, height: 18, border: 'none' }}
                      aria-label={`Add on ${cell.iso}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openNewEvent(cell.iso);
                      }}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  {dayEvs.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditEvent(ev, cell.iso);
                      }}
                      style={{
                        fontSize: '0.7rem',
                        padding: '1px 4px',
                        borderRadius: 4,
                        background: `color-mix(in oklch, ${ev.color || 'var(--dp-accent)'} 22%, var(--dp-surface))`,
                        borderInlineStart: `3px solid ${ev.color || 'var(--dp-accent)'}`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ev.payload.emoji ? `${ev.payload.emoji} ` : ''}{ev.title}
                    </div>
                  ))}
                  {dayEvs.length > 3 && (
                    <span className="dp-muted" style={{ fontSize: '0.68rem' }}>+{dayEvs.length - 3} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View 2: Clean Sortable Agenda List View (Super Friendly on Phones & Desktops!) */}
      {calendarMode === 'agenda' && (
        <div className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
          {agendaOccurrences.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0 }}>No events match your current search or filters.</p>
          ) : (
            agendaOccurrences.map((item, idx) => {
              const ev = item.event;
              return (
                <div
                  key={`${ev.id}-${item.occurrenceDate}-${idx}`}
                  className="dp-card dp-between"
                  style={{
                    padding: '10px 12px',
                    borderInlineStart: `4px solid ${ev.color || 'var(--dp-accent)'}`,
                    flexWrap: 'wrap',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => openEditEvent(ev, item.occurrenceDate)}
                >
                  <div className="dp-stack" style={{ gap: 2 }}>
                    <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <strong>
                        {ev.isImportant ? '★ ' : ''}
                        {ev.payload.emoji ? `${ev.payload.emoji} ` : ''}
                        {ev.title}
                      </strong>
                      <span className="dp-pill">{ev.category || 'Personal'}</span>
                      {ev.recurrence && <span className="dp-pill">🔁 {ev.recurrence.freq}</span>}
                      {(ev.sharedWithAll || (ev.sharedWithProfileIds?.length ?? 0) > 0) && <span className="dp-pill">🏡 Shared</span>}
                    </div>
                    <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                      {formatDateLocalized(item.occurrenceDate, settings.locale, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                      {ev.payload.allDay
                        ? 'All Day'
                        : `${formatTimeDisplay(ev.payload.startTime || '09:00', settings.timeFormat)} – ${formatTimeDisplay(ev.payload.endTime || '10:00', settings.timeFormat)} (${item.durationMin}m)`}
                      {ev.payload.location ? ` · 📍 ${ev.payload.location}` : ''}
                    </div>
                  </div>
                  <div className="dp-row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={async () => {
                        await createRecord<CalendarEventPayload>(
                          'event',
                          `${ev.title} (Copy)`,
                          { ...ev.payload, startDate: item.occurrenceDate, endDate: item.occurrenceDate },
                          { color: ev.color, category: ev.category, sharedWithAll: ev.sharedWithAll, isImportant: ev.isImportant }
                        );
                        pushToast(`Duplicated "${ev.title}"`, { canUndo: true });
                      }}
                    >
                      <Copy size={13} /> Duplicate
                    </button>
                    <button type="button" className="dp-btn dp-btn-sm" onClick={() => openEditEvent(ev, item.occurrenceDate)}>
                      Edit
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* View 3: Main Multi-Day Virtualized Flow Grid */}
      {calendarMode === 'timeline' && (
      <div className="dp-flow-shell" style={{ position: 'relative' }}>
        {showCalDecor && <DecorCanvasOverlay spreadKey={`calendar:${activeDate}`} />}
        <div className="dp-flow-scroll" ref={scrollRef}>
          <div
            className="dp-flow-grid"
            style={{
              gridTemplateColumns: `${showDualTz ? 112 : 64}px repeat(${dayColumns.length}, minmax(${calPrefs.dayMinWidthPx || 145}px, 1fr))`,
              minWidth: `${(showDualTz ? 112 : 64) + dayColumns.length * (calPrefs.dayMinWidthPx || 145)}px`,
            }}
          >
            {/* Corner */}
            <div className="dp-flow-day-header dp-flow-ruler" style={{ zIndex: 8 }}>
              Time
            </div>

            {/* Day Headers + Daily Planned Hours Badge + All-Day strip */}
            {dayColumns.map((d) => {
              const dayList = eventsByDay.get(d) ?? [];
              const allDayEvs = dayList.filter((x) => x.event.payload.allDay);
              const totalPlannedMin = dayList
                .filter((x) => !x.event.payload.allDay)
                .reduce(
                  (acc, x) =>
                    acc + Math.max(0, timeToMinutes(x.event.payload.endTime || '10:00') - timeToMinutes(x.event.payload.startTime || '09:00')),
                  0
                );
              const plannedHrsLabel = totalPlannedMin > 0 ? `${(totalPlannedMin / 60).toFixed(1).replace(/\.0$/, '')}h` : '';
              return (
                <div
                  key={d}
                  className="dp-flow-day-header"
                  style={{
                    background: d === logicalToday ? 'color-mix(in oklch, var(--dp-highlight) 50%, var(--dp-surface-2))' : undefined,
                  }}
                >
                  <div className="dp-between">
                    <span>
                      {formatDateLocalized(d, settings.locale, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {plannedHrsLabel && (
                        <span className="dp-muted" style={{ fontSize: '0.7rem', marginInlineStart: 5 }}>({plannedHrsLabel})</span>
                      )}
                    </span>
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

            {/* Sticky Time Ruler (honors visibleStartHour..visibleEndHour & sub-hour labels when zoomed in!) */}
            <div className="dp-flow-ruler" style={{ height: totalGridHeight, position: 'sticky' }}>
              {Array.from({ length: visibleHours }, (_, idx) => {
                const h = visibleStartHour + idx;
                const hhmm = `${String(h).padStart(2, '0')}:00`;
                const secondary = showDualTz
                  ? convertEventTimeZone(activeDate, hhmm, settings.defaultTimeZone, settings.secondaryTimeZone).timeHHMM
                  : null;
                return (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: idx * pxPerHour,
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

            {/* Day Columns with Customizable Major + Minor Interval Gridlines */}
            {dayColumns.map((d) => {
              const layout = dayLayouts.get(d);
              const positioned = layout?.positioned ?? [];
              const minorStepPx = Math.max(6, (gridStepMin / 60) * pxPerHour);
              const majorStepPx = Math.max(12, ((calPrefs.majorGridIntervalMin || 60) / 60) * pxPerHour);
              const thick = calPrefs.gridThicknessPx || 1;
              const bgLayers: string[] = [];
              if (calPrefs.showMajorGrid) {
                bgLayers.push(
                  `repeating-linear-gradient(to bottom, ${calPrefs.majorLineColor} 0 ${thick}px, transparent ${thick}px ${majorStepPx}px)`
                );
              }
              if (calPrefs.showMinorGrid && gridStepMin < (calPrefs.majorGridIntervalMin || 60)) {
                bgLayers.push(
                  `repeating-linear-gradient(to bottom, ${calPrefs.minorLineColor} 0 1px, transparent 1px ${minorStepPx}px)`
                );
              }
              return (
                <div
                  key={`col-${d}`}
                  style={{
                    position: 'relative',
                    height: totalGridHeight,
                    borderInlineEnd: `1px ${calPrefs.gridLineStyle || 'solid'} var(--dp-border)`,
                    backgroundImage: bgLayers.join(', ') || undefined,
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const rawMin = visibleStartMin + Math.floor(((y / totalGridHeight) * visibleTotalMin) / gridStepMin) * gridStepMin;
                    openNewEvent(d, minutesToTime(rawMin));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = Math.max(0, e.clientY - rect.top);
                    const snappedMin = visibleStartMin + Math.floor(((y / totalGridHeight) * visibleTotalMin) / gridStepMin) * gridStepMin;
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
                  {d === logicalToday && (() => {
                    const curM = new Date().getHours() * 60 + new Date().getMinutes();
                    if (curM < visibleStartMin || curM > visibleStartMin + visibleTotalMin) return null;
                    return (
                      <div
                        className="dp-now-line"
                        style={{ top: ((curM - visibleStartMin) / visibleTotalMin) * totalGridHeight }}
                      />
                    );
                  })()}

                  {positioned.map((pos) => {
                    if (pos.endMin <= visibleStartMin || pos.startMin >= visibleStartMin + visibleTotalMin) return null;
                    const topPx = ((pos.startMin - visibleStartMin) / visibleTotalMin) * totalGridHeight + pos.topOffsetPx;
                    const heightPx = Math.max(
                      gridStepMin >= 120 ? 22 : 34,
                      ((pos.endMin - pos.startMin) / visibleTotalMin) * totalGridHeight
                    );
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
                            fontSize: `${adaptiveFontPx}px`,
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
                              {pos.event.isImportant ? '★ ' : ''}
                              {pos.event.payload.emoji ? `${pos.event.payload.emoji} ` : ''}
                              {pos.event.title}
                              {(pos.event.sharedWithAll || (pos.event.sharedWithProfileIds?.length ?? 0) > 0) ? ' 🏡' : ''}
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
      )}

      {/* ICS Interoperability Bar (Section 08.04) */}
      <div className="dp-card dp-between" style={{ padding: 10 }}>
        <div className="dp-row">
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              const ics = exportEventsToIcs(events);
              triggerBrowserDownload(ics, `planaday-calendar-${logicalToday}.ics`, 'text/calendar');
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

          {/* Visual Selectable Event Category Chips + Custom Category Creator */}
          <div className="dp-stack" style={{ gap: 6 }}>
            <div className="dp-between">
              <span className="dp-muted" style={{ fontSize: '0.82rem' }}>Category (pick a preset below or type any custom category)</span>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setShowAddCat((v) => !v)}>
                + Save New Preset
              </button>
            </div>
            <input
              list="dp-event-cats"
              className="dp-input"
              placeholder="Pick or type any category…"
              value={category}
              onChange={(e) => {
                const val = e.target.value;
                setCategory(val);
                const match = settings.eventCategories.find((c) => c.name.toLowerCase() === val.toLowerCase());
                if (match) {
                  setColor(match.color);
                  setEmoji(match.emoji);
                }
              }}
            />
            <datalist id="dp-event-cats">
              {settings.eventCategories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
            <div className="dp-row" style={{ gap: 5 }}>
              {settings.eventCategories.map((cat) => {
                const active = category === cat.name;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`dp-btn dp-btn-sm ${active ? 'dp-btn-primary' : ''}`}
                    style={
                      active
                        ? { background: cat.color, borderColor: cat.color, color: '#fff' }
                        : { borderInlineStart: `3px solid ${cat.color}` }
                    }
                    onClick={() => {
                      setCategory(cat.name);
                      setColor(cat.color);
                      setEmoji(cat.emoji);
                    }}
                  >
                    {cat.emoji} {cat.name}
                  </button>
                );
              })}
            </div>
            {showAddCat && (
              <div className="dp-row" style={{ gap: 6 }}>
                <input
                  className="dp-input"
                  style={{ width: 52, textAlign: 'center' }}
                  value={newCatEmoji}
                  onChange={(e) => setNewCatEmoji(e.target.value)}
                  aria-label="Category emoji"
                />
                <input
                  className="dp-input"
                  style={{ flex: 1 }}
                  placeholder="New category name (e.g., Kids Sports)…"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => {
                    const nm = newCatName.trim();
                    if (!nm) return;
                    const created = {
                      id: `cat_${Date.now().toString(36)}`,
                      name: nm,
                      emoji: newCatEmoji.trim() || '🏷️',
                      color,
                    };
                    void patchSettings({ eventCategories: [...settings.eventCategories, created] });
                    setCategory(created.name);
                    setEmoji(created.emoji);
                    setNewCatName('');
                    setShowAddCat(false);
                    pushToast(`Added category "${created.name}"`);
                  }}
                >
                  Save Category
                </button>
              </div>
            )}
          </div>

          <div className="dp-row">
            <label className="dp-row" style={{ gap: 5, fontSize: '0.84rem' }}>
              <span className="dp-muted">Color:</span>
              <input type="color" aria-label="Event color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="dp-row" style={{ gap: 5, fontSize: '0.84rem' }}>
              <span className="dp-muted">Remind:</span>
              <select
                aria-label="Event notification lead time"
                className="dp-select"
                style={{ width: 'auto', padding: '3px 8px' }}
                value={reminderLeadMin}
                onChange={(e) => setReminderLeadMin(Number(e.target.value))}
              >
                <option value={-1}>No reminder</option>
                <option value={0}>At start time</option>
                <option value={5}>5 min before</option>
                <option value={10}>10 min before</option>
                <option value={15}>15 min before</option>
                <option value={30}>30 min before</option>
                <option value={60}>1 hour before</option>
              </select>
            </label>
            <label className="dp-row">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>All-day</span>
            </label>
          </div>

          {/* Per-Event Specific Notification & Sound Overrides (Defaults to Global Settings) */}
          <div className="dp-card dp-stack" style={{ padding: 10, gap: 6, background: 'var(--dp-surface-2)' }}>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10, fontSize: '0.82rem' }}>
              <label className="dp-row" style={{ gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={evNotifyEnabled} onChange={(e) => setEvNotifyEnabled(e.target.checked)} />
                <strong>Notify for this event</strong>
              </label>
              <label className="dp-row" style={{ gap: 5 }}>
                <span className="dp-muted">Sound:</span>
                <select
                  aria-label="Per-event alert sound"
                  className="dp-select"
                  style={{ width: 'auto', padding: '3px 8px' }}
                  value={evCustomSound}
                  onChange={(e) => setEvCustomSound(e.target.value)}
                >
                  <option value="default">Use Default ({settings.notificationPrefs.chimeStyle})</option>
                  <option value="bell">🔔 Bell Chime</option>
                  <option value="soft">🌿 Soft Tone</option>
                  <option value="marimba">🎵 Marimba</option>
                  <option value="bright">✨ Bright Chime</option>
                  <option value="classic_alarm">⏰ Classic Alarm</option>
                  {ALARM_RINGTONES.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.emoji} {rt.name}</option>
                  ))}
                  {(settings.customRingtones ?? []).map((cr) => (
                    <option key={cr.hash} value={`blob:${cr.hash}`}>🎶 {cr.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    const vol = (evCustomVolume !== '' ? Number(evCustomVolume) : settings.notificationPrefs.volume) / 100;
                    const snd = evCustomSound === 'default' ? settings.notificationPrefs.chimeStyle : evCustomSound;
                    if (['soft', 'bell', 'marimba', 'classic_alarm', 'woodblock', 'bright'].includes(snd)) {
                      audioEngine.playChime(snd as 'bell', vol);
                    } else {
                      void audioEngine.playRingtoneOnce(snd, vol);
                    }
                  }}
                >
                  ▶
                </button>
              </label>
              <label className="dp-row" style={{ gap: 5 }}>
                <span className="dp-muted">Vol % (blank = default {settings.notificationPrefs.volume}%):</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={String(settings.notificationPrefs.volume)}
                  className="dp-input"
                  style={{ width: 68, padding: '3px 6px' }}
                  value={evCustomVolume}
                  onChange={(e) => setEvCustomVolume(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Family Sharing & Important Notice Controls */}
          <div className="dp-card dp-stack" style={{ padding: 10, gap: 6, background: 'var(--dp-surface-2)' }}>
            <div className="dp-row" style={{ gap: 12 }}>
              <label className="dp-row" style={{ fontSize: '0.84rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={sharedWithAll} onChange={(e) => setSharedWithAll(e.target.checked)} />
                <span>🏡 Share with Everyone (Family)</span>
              </label>
              <label className="dp-row" style={{ fontSize: '0.84rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} />
                <span>★ Mark Important Notice</span>
              </label>
            </div>
            {!sharedWithAll && settings.familyProfiles.length > 1 && (
              <div className="dp-row" style={{ gap: 6, fontSize: '0.8rem' }}>
                <span className="dp-muted">Or share with specific members:</span>
                {settings.familyProfiles.map((prof) => {
                  const checked = sharedWithProfileIds.includes(prof.id);
                  return (
                    <label key={prof.id} className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSharedWithProfileIds((prev) =>
                            e.target.checked ? [...prev, prof.id] : prev.filter((id) => id !== prof.id)
                          )
                        }
                      />
                      <span>{prof.emoji} {prof.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
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

          <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            {editingId ? (
              <div className="dp-row" style={{ gap: 6 }}>
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
                <button
                  type="button"
                  className="dp-btn"
                  onClick={async () => {
                    await createRecord<CalendarEventPayload>(
                      'event',
                      `${title.trim() || 'Event'} (Copy)`,
                      {
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
                        remindersMin: reminderLeadMin >= 0 ? [reminderLeadMin] : [],
                      },
                      { color, category, sharedWithAll, sharedWithProfileIds, isImportant }
                    );
                    setEditorOpen(false);
                    pushToast(`Duplicated "${title.trim()}"`, { canUndo: true });
                  }}
                >
                  <Copy size={14} /> Duplicate
                </button>
              </div>
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
