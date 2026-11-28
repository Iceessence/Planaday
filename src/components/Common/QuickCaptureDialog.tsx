import React, { useMemo, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { useApp } from '../../core/AppContext';
import { parseQuickCapture } from '../../core/capture';
import { createRecord } from '../../core/repository';
import { addDaysIso } from '../../core/temporal';
import type {
  CalendarEventPayload,
  ChorePayload,
  GroceryItemPayload,
  HabitPayload,
  NotePayload,
  RecipePayload,
  RecordType,
  TaskPayload,
  ThoughtPayload,
} from '../../core/types';

export const QuickCaptureDialog: React.FC = () => {
  const {
    quickCaptureOpen,
    setQuickCaptureOpen,
    logicalToday,
    settings,
    pushToast,
    startCountdownTimer,
    setActiveView,
  } = useApp();

  const [input, setInput] = useState('');
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [overrideType, setOverrideType] = useState<RecordType | 'timer' | 'auto'>('auto');

  const parsed = useMemo(() => parseQuickCapture(input, logicalToday), [input, logicalToday]);
  const requestedType = overrideType === 'auto' ? parsed.targetType : overrideType;
  const finalType = requestedType === 'person' ? 'thought' : requestedType;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {

      if (finalType === 'timer') {
        const totalSec = parsed.durationSec ?? (parsed.durationMin ? parsed.durationMin * 60 : 15 * 60);
        await startCountdownTimer(parsed.title, totalSec, 'countdown');
        setInput('');
        setOverrideType('auto');
        setQuickCaptureOpen(false);
        return;
      }

      if (finalType === 'task') {
        await createRecord<TaskPayload>(
          'task',
          parsed.title,
          { subtasks: [], boardColumn: 'next', sourceProvenance: 'quick_capture' },
          {
            doDate: parsed.date ?? logicalToday,
            estimateMin: parsed.durationMin ?? null,
            tags: parsed.tags,
            recurrence: parsed.recurrence ?? null,
          }
        );
      } else if (finalType === 'event') {
        const startDate = parsed.date ?? logicalToday;
        const startTime = parsed.startTime ?? '09:00';
        const dur = parsed.durationMin ?? 45;
        const [h, m] = startTime.split(':').map(Number);
        const endTotal = h * 60 + m + dur;
        const endH = String(Math.floor(endTotal / 60) % 24).padStart(2, '0');
        const endM = String(endTotal % 60).padStart(2, '0');
        await createRecord<CalendarEventPayload>(
          'event',
          parsed.title,
          {
            startDate,
            endDate: parsed.startTime ? addDaysIso(startDate, Math.floor(endTotal / 1440)) : startDate,
            startTime: parsed.startTime ? startTime : undefined,
            endTime: parsed.startTime ? `${endH}:${endM}` : undefined,
            allDay: !parsed.startTime,
            floating: !parsed.startTime,
            timeZone: settings.defaultTimeZone,
            style: 'soft',
            eventStatus: 'confirmed',
            location: parsed.location,
          },
          { tags: parsed.tags, recurrence: parsed.recurrence ?? null }
        );
      } else if (finalType === 'chore') {
        await createRecord<ChorePayload>(
          'chore',
          parsed.title,
          {
            room: parsed.location || 'General',
            choreMode: 'after_completion',
            intervalDays: 7,
            difficulty: 2,
            checklist: [],
            linkedSupplies: [],
            nextDueDate: parsed.date ?? logicalToday,
            completions: [],
          },
          { tags: parsed.tags, estimateMin: parsed.durationMin ?? 15 }
        );
      } else if (finalType === 'recipe') {
        await createRecord<RecipePayload>(
          'recipe',
          parsed.title,
          {
            mealTypes: ['Dinner'],
            dietaryBadges: [],
            allergens: [],
            servings: 4,
            prepMin: 15,
            cookMin: 25,
            restMin: 0,
            difficulty: 'medium',
            rating: 0,
            madeCount: 0,
            equipment: [],
            ingredients: [],
            steps: [],
          },
          { tags: parsed.tags }
        );
      } else if (finalType === 'grocery_item') {
        await createRecord<GroceryItemPayload>(
          'grocery_item',
          parsed.title,
          {
            canonicalName: parsed.title.toLowerCase(),
            quantity: 1,
            unit: 'item',
            aisle: 'Pantry',
            store: 'Local Market',
            checked: false,
          },
          { tags: parsed.tags }
        );
      } else if (finalType === 'note') {
        await createRecord<NotePayload>(
          'note',
          parsed.title,
          {
            notebookId: 'nb_personal',
            writtenForDate: parsed.date ?? logicalToday,
            content: '',
            touchedDates: [logicalToday],
          },
          { tags: parsed.tags }
        );
      } else if (finalType === 'habit') {
        await createRecord<HabitPayload>(
          'habit',
          parsed.title,
          { scheduleType: 'daily', logs: {} },
          { tags: parsed.tags }
        );
      } else if (finalType === 'countdown') {
        await createRecord(
          'countdown',
          parsed.title,
          { targetDate: parsed.date ?? addDaysIso(logicalToday, 14), mode: 'days' },
          { tags: parsed.tags }
        );
      } else {
        await createRecord<ThoughtPayload>(
          'thought',
          parsed.title.slice(0, 64),
          { content: input.trim(), source: 'quick_capture' },
          { tags: parsed.tags }
        );
      }

      pushToast(`Captured ${finalType}: ${parsed.title}`, { canUndo: true });
      setInput('');
      setOverrideType('auto');
      setQuickCaptureOpen(false);
    } catch {
      setError('Capture could not be saved. Your input is still here. Check storage and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalDialog
      open={quickCaptureOpen}
      onClose={() => { if (!savingRef.current) setQuickCaptureOpen(false); }}
      dismissible={!saving}
      title="Universal Quick Capture"
      sheet
    >
      <form className="dp-stack" onSubmit={handleSave}>
        <label className="dp-stack" style={{ gap: 6 }}>
          <span className="dp-muted" style={{ fontSize: '0.84rem' }}>
            Use natural language or prefixes (<code>t:</code> task, <code>e:</code> event, <code>c:</code> chore,{' '}
            <code>r:</code> recipe, <code>g:</code> grocery, <code>n:</code> note, <code>timer 15m</code>)
          </span>
          <input
            autoFocus
            disabled={saving}
            aria-label="Quick capture text"
            className="dp-input"
            placeholder='e.g., Pilates every Tue & Thu 6pm for 45m @Studio #wellness'
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>

        {input.trim() && (
          <div className="dp-card" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
            <div className="dp-between" style={{ marginBottom: 6 }}>
              <strong>Parsed Preview</strong>
              <select
                disabled={saving}
                aria-label="Override capture type"
                className="dp-select"
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.82rem' }}
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value as RecordType | 'timer' | 'auto')}
              >
                <option value="auto">Auto ({parsed.targetType === 'person' ? 'thought inbox' : parsed.targetType})</option>
                <option value="thought">Thought</option>
                <option value="task">Task</option>
                <option value="event">Event</option>
                <option value="chore">Chore</option>
                <option value="note">Note</option>
                <option value="recipe">Recipe</option>
                <option value="grocery_item">Grocery</option>
                <option value="habit">Habit</option>
                <option value="countdown">Countdown</option>
                <option value="timer">Timer</option>
              </select>
            </div>
            <div className="dp-row" style={{ fontSize: '0.84rem' }}>
              <span className="dp-pill highlight">{finalType}</span>
              <span>
                <strong>{parsed.title}</strong>
              </span>
              {parsed.date && <span className="dp-pill">📅 {parsed.date}</span>}
              {parsed.startTime && <span className="dp-pill">🕒 {parsed.startTime}</span>}
              {parsed.durationSec ? (
                <span className="dp-pill">
                  ⏱ {parsed.durationSec >= 60 ? `${Math.floor(parsed.durationSec / 60)}m ${parsed.durationSec % 60}s` : `${parsed.durationSec}s`}
                </span>
              ) : parsed.durationMin ? (
                <span className="dp-pill">⏱ {parsed.durationMin}m</span>
              ) : null}
              {parsed.location && <span className="dp-pill">📍 {parsed.location}</span>}
              {parsed.recurrence && <span className="dp-pill">🔁 {parsed.recurrence.freq}</span>}
              {parsed.tags.map((t) => (
                <span key={t} className="dp-pill">
                  #{t}
                </span>
              ))}
            </div>
            {parsed.ambiguousNotes.length > 0 && (
              <p className="dp-muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
                Note: {parsed.ambiguousNotes.join(' ')}
              </p>
            )}
          </div>
        )}

        {error && <p role="alert" style={{ color: 'var(--dp-warn)' }}>{error}</p>}
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            disabled={saving}
            className="dp-btn dp-btn-ghost dp-btn-sm"
            onClick={() => {
              setQuickCaptureOpen(false);
              setActiveView('thoughts');
            }}
          >
            Open Triage / Thought Inbox
          </button>
          <div className="dp-row">
            <button type="button" disabled={saving} className="dp-btn" onClick={() => setQuickCaptureOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !input.trim()} className="dp-btn dp-btn-primary">
              {saving ? 'Saving…' : 'Save Capture'}
            </button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
};
