import React, { useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, updateRecord } from '../../core/repository';
import { createId, storeBlob } from '../../core/db';
import { triggerBrowserDownload } from '../../core/backup';
import { addDaysIso, formatDateLocalized } from '../../core/temporal';
import type { DiaryPayload, LifeRecord } from '../../core/types';

const PROMPTS = [
  'What gave you the most calm energy today?',
  'What small win deserves appreciation tonight?',
  'What felt heavy today, and what can wait until tomorrow?',
  'Who made your day a little warmer?',
  'What is one thing you learned or noticed today?',
];

const DEFAULT_MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'];
const EMOTION_TAGS = ['Calm', 'Grateful', 'Focused', 'Energized', 'Tired', 'Anxious', 'Inspired', 'Cozy'];

export const DiaryView: React.FC = () => {
  const { settings, records, activeDate, setActiveDate, logicalToday, pushToast } = useApp();
  const [promptIdx, setPromptIdx] = useState(0);
  const [customMood, setCustomMood] = useState('');
  const [extraEntryText, setExtraEntryText] = useState('');
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const diaries = useMemo(
    () =>
      (records.filter((r) => r.type === 'diary') as Array<LifeRecord<DiaryPayload>>).sort((a, b) =>
        b.payload.date.localeCompare(a.payload.date)
      ),
    [records]
  );

  const todayDiaryRec = diaries.find((d) => d.payload.date === activeDate);
  const entry: DiaryPayload = todayDiaryRec?.payload ?? { date: activeDate, emotions: [], extraEntries: [] };

  const saveDiary = async (patch: Partial<DiaryPayload>) => {
    if (todayDiaryRec) {
      await updateRecord<DiaryPayload>(
        todayDiaryRec.id,
        (c) => ({ ...c, payload: { ...c.payload, ...patch } }),
        { skipUndo: true }
      );
    } else {
      await createRecord<DiaryPayload>(
        'diary',
        `Daily Reflection — ${activeDate}`,
        { date: activeDate, ...patch },
        { category: 'Diary', tags: ['reflection'] },
        { skipUndo: true }
      );
    }
  };

  const exportMarkdown = () => {
    const md = [...diaries]
      .reverse()
      .map((d) => {
        const p = d.payload;
        return [
          `# ${p.date} — Mood: ${p.mood || 'Unset'}`,
          `Energy: ${p.energy ?? '-'}/5 · Stress: ${p.stress ?? '-'}/5 · Sleep: ${p.sleepHours ?? '-'}h`,
          p.summary ? `\n## Summary\n${p.summary}` : '',
          p.wins ? `\n## Wins\n${p.wins}` : '',
          p.challenges ? `\n## Challenges\n${p.challenges}` : '',
          p.learned ? `\n## Learned\n${p.learned}` : '',
          p.gratitude ? `\n## Gratitude\n${p.gratitude}` : '',
          p.narrative ? `\n## Journal\n${p.narrative}` : '',
          ...(p.extraEntries ?? []).map((ex) => `\n### ${ex.time}\n${ex.text}`),
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n---\n\n');
    triggerBrowserDownload(md, `dayplana-diary-${logicalToday}.md`, 'text/markdown');
    pushToast('Exported chronological Diary Markdown');
  };

  const last28 = useMemo(() => Array.from({ length: 28 }, (_, i) => addDaysIso(logicalToday, i - 27)), [logicalToday]);
  const byDate = useMemo(() => new Map(diaries.map((d) => [d.payload.date, d.payload])), [diaries]);

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>Diary & Personal Reflection</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            {formatDateLocalized(activeDate, settings.locale)} · Unified live with Today spread · Zero password barriers
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -1))}>←</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>Today</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 1))}>→</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => void saveDiary({ blankMode: !entry.blankMode })}>
            {entry.blankMode ? 'Structured Mode' : 'Blank Narrative Mode'}
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={exportMarkdown}>
            <Download size={14} /> Export .md
          </button>
        </div>
      </div>

      {/* Mood & Emotions Strip */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <div className="dp-row">
          <strong>Mood:</strong>
          {DEFAULT_MOODS.map((m) => (
            <button key={m} type="button" className={`dp-btn dp-btn-sm ${entry.mood === m ? 'dp-btn-primary' : ''}`} onClick={() => void saveDiary({ mood: m })}>
              {m}
            </button>
          ))}
          <input
            className="dp-input"
            style={{ width: 130, padding: '3px 8px', fontSize: '0.82rem' }}
            placeholder="Custom mood…"
            value={customMood}
            onChange={(e) => setCustomMood(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customMood.trim()) {
                void saveDiary({ mood: customMood.trim() });
                setCustomMood('');
              }
            }}
          />
        </div>
        <div className="dp-row">
          <span className="dp-muted" style={{ fontSize: '0.82rem' }}>Emotions:</span>
          {EMOTION_TAGS.map((tag) => {
            const active = (entry.emotions ?? []).includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`dp-btn dp-btn-sm ${active ? 'dp-btn-primary' : ''}`}
                onClick={() => {
                  const next = active ? (entry.emotions ?? []).filter((x) => x !== tag) : [...(entry.emotions ?? []), tag];
                  void saveDiary({ emotions: next });
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <div className="dp-grid-3" style={{ fontSize: '0.84rem' }}>
          <label className="dp-between">
            <span>Energy ({entry.energy ?? 3}/5)</span>
            <input type="range" min={1} max={5} value={entry.energy ?? 3} onChange={(e) => void saveDiary({ energy: Number(e.target.value) })} />
          </label>
          <label className="dp-between">
            <span>Stress ({entry.stress ?? 2}/5)</span>
            <input type="range" min={1} max={5} value={entry.stress ?? 2} onChange={(e) => void saveDiary({ stress: Number(e.target.value) })} />
          </label>
          <label className="dp-between">
            <span>Sleep Quality ({entry.sleepQuality ?? 4}/5)</span>
            <input type="range" min={1} max={5} value={entry.sleepQuality ?? 4} onChange={(e) => void saveDiary({ sleepQuality: Number(e.target.value) })} />
          </label>
        </div>
      </div>

      {/* Rotating Prompt Deck */}
      <div className="dp-card dp-between" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
        <span style={{ fontSize: '0.88rem' }}>
          <Sparkles size={14} style={{ verticalAlign: '-2px' }} /> Prompt: <em>{PROMPTS[promptIdx % PROMPTS.length]}</em>
        </span>
        <button type="button" className="dp-btn dp-btn-sm" onClick={() => setPromptIdx((n) => n + 1)}>
          Next Prompt
        </button>
      </div>

      {!entry.blankMode ? (
        <div className="dp-grid-2">
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Summary</strong>
            <textarea className="dp-textarea" value={entry.summary ?? ''} onChange={(e) => void saveDiary({ summary: e.target.value })} />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Gratitude</strong>
            <textarea className="dp-textarea" value={entry.gratitude ?? ''} onChange={(e) => void saveDiary({ gratitude: e.target.value })} />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Wins</strong>
            <textarea className="dp-textarea" value={entry.wins ?? ''} onChange={(e) => void saveDiary({ wins: e.target.value })} />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Challenges & Learned</strong>
            <textarea className="dp-textarea" value={entry.learned ?? ''} onChange={(e) => void saveDiary({ learned: e.target.value })} />
          </label>
        </div>
      ) : null}

      <label className="dp-stack" style={{ gap: 6 }}>
        <div className="dp-between">
          <strong>Narrative Journal</strong>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => mediaInputRef.current?.click()}>
            <ImageIcon size={14} /> Add Photo/Audio Memory Capsule
          </button>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,audio/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const stored = await storeBlob(f, f.name);
              await saveDiary({ mediaBlobIds: [...(entry.mediaBlobIds ?? []), stored.hash] });
              pushToast(`Saved memory capsule "${f.name}"`);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          className="dp-textarea"
          style={{ minHeight: 180, lineHeight: 1.7 }}
          placeholder="Write freely without limits…"
          value={entry.narrative ?? ''}
          onChange={(e) => void saveDiary({ narrative: e.target.value })}
        />
      </label>

      {/* Multiple entries per day support */}
      <div className="dp-card dp-stack" style={{ padding: 12 }}>
        <strong>Timestamped Check-In Entries ({entry.extraEntries?.length ?? 0})</strong>
        <div className="dp-row">
          <input
            className="dp-input"
            style={{ flex: 1 }}
            placeholder="Add another timestamped moment for today…"
            value={extraEntryText}
            onChange={(e) => setExtraEntryText(e.target.value)}
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm dp-btn-primary"
            onClick={() => {
              if (!extraEntryText.trim()) return;
              const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              void saveDiary({
                extraEntries: [...(entry.extraEntries ?? []), { id: createId('de'), time, text: extraEntryText.trim(), mood: entry.mood }],
              });
              setExtraEntryText('');
            }}
          >
            <Plus size={14} /> Add Entry
          </button>
        </div>
        {(entry.extraEntries ?? []).map((ex) => (
          <div key={ex.id} style={{ fontSize: '0.88rem', borderInlineStart: '2px solid var(--dp-accent)', paddingInlineStart: 10 }}>
            <strong>{ex.time}</strong> {ex.mood ? `(${ex.mood})` : ''} — {ex.text}
          </div>
        ))}
      </div>

      {/* 28-Day Mood Heatmap */}
      <div className="dp-card dp-stack" style={{ padding: 12 }}>
        <strong>28-Day Mood Heatmap</strong>
        <div className="dp-row" style={{ gap: 5 }}>
          {last28.map((d) => {
            const m = byDate.get(d)?.mood;
            const bg = !m ? 'transparent' : m === 'Great' ? '#3e7a5d' : m === 'Good' ? '#76a882' : m === 'Okay' ? '#d4b46a' : '#c96f53';
            return (
              <button
                key={d}
                type="button"
                title={`${d}: ${m ?? 'No entry'}`}
                onClick={() => setActiveDate(d)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 5,
                  border: '1px solid var(--dp-border)',
                  background: bg,
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                }}
              >
                {d.slice(8)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
