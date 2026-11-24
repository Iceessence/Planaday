import React, { useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Plus, Save, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { createId, storeBlob } from '../../core/db';
import { triggerBrowserDownload } from '../../core/backup';
import { addDaysIso, formatDateLocalized } from '../../core/temporal';
import { DIARY_PROMPTS, getDiaryPromptCategories } from '../../data/prompts';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { SafeTextarea, type LocalSaveState } from '../../components/Common/SafeTextEditor';
import type { DiaryPayload, LifeRecord, PaperMaterial } from '../../core/types';

const DEFAULT_MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'];
const EMOTION_TAGS = ['Calm', 'Grateful', 'Focused', 'Energized', 'Tired', 'Anxious', 'Inspired', 'Cozy'];

export const DiaryView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, pushToast, syncState } = useApp();
  const [diarySaveState, setDiarySaveState] = useState<LocalSaveState>('clean');
  const [promptCategory, setPromptCategory] = useState('All');
  const [promptIdx, setPromptIdx] = useState(0);
  const [customMood, setCustomMood] = useState('');
  const [customPromptInput, setCustomPromptInput] = useState('');
  const [extraEntryText, setExtraEntryText] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyMoodFilter, setHistoryMoodFilter] = useState('all');
  const [historySortBy, setHistorySortBy] = useState<'date' | 'energy' | 'sleep' | 'stress'>('date');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const allMoods = useMemo(
    () => Array.from(new Set([...DEFAULT_MOODS, ...(settings.customMoods ?? [])])),
    [settings.customMoods]
  );

  const promptCategories = useMemo(
    () => getDiaryPromptCategories(settings.customDiaryPrompts),
    [settings.customDiaryPrompts]
  );

  const filteredPrompts = useMemo(() => {
    const customWrapped = (settings.customDiaryPrompts ?? []).map((text) => ({ category: 'My Prompts', text }));
    const combined = [...DIARY_PROMPTS, ...customWrapped];
    if (promptCategory === 'All') return combined;
    const subset = combined.filter((p) => p.category === promptCategory);
    return subset.length > 0 ? subset : combined;
  }, [settings.customDiaryPrompts, promptCategory]);

  const activePrompt = filteredPrompts[promptIdx % filteredPrompts.length] ?? DIARY_PROMPTS[0];

  const diaries = useMemo(
    () =>
      (records.filter((r) => r.type === 'diary') as Array<LifeRecord<DiaryPayload>>).sort((a, b) =>
        b.payload.date.localeCompare(a.payload.date)
      ),
    [records]
  );

  const filteredHistoryDiaries = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const list = diaries.filter((d) => {
      const p = d.payload;
      if (historyMoodFilter !== 'all' && p.mood !== historyMoodFilter) return false;
      if (q) {
        const hay = `${p.date} ${p.mood ?? ''} ${(p.emotions ?? []).join(' ')} ${p.summary ?? ''} ${p.gratitude ?? ''} ${p.wins ?? ''} ${p.learned ?? ''} ${p.narrative ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = historySortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (historySortBy === 'energy') return ((a.payload.energy ?? 0) - (b.payload.energy ?? 0)) * dir;
      if (historySortBy === 'sleep') return ((a.payload.sleepHours ?? 0) - (b.payload.sleepHours ?? 0)) * dir;
      if (historySortBy === 'stress') return ((a.payload.stress ?? 0) - (b.payload.stress ?? 0)) * dir;
      return a.payload.date.localeCompare(b.payload.date) * dir;
    });
  }, [diaries, historySearch, historyMoodFilter, historySortBy, historySortDir]);

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
    triggerBrowserDownload(md, `planaday-diary-${logicalToday}.md`, 'text/markdown');
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
          {todayDiaryRec && (
            <button
              type="button"
              className="dp-btn dp-btn-danger dp-btn-sm"
              title="Move today's diary entry to Trash"
              onClick={async () => {
                await softDeleteRecord(todayDiaryRec.id);
                pushToast(`Moved ${activeDate} diary entry to Trash`, { canUndo: true });
              }}
            >
              <Trash2 size={13} /> Trash Entry
            </button>
          )}
        </div>
      </div>

      {/* In-Tab Diary Settings Drawer */}
      <TabSettingsDrawer title="Diary Settings" subtitle="Customize journal paper surface, moods, and custom reflection prompts.">
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.83rem' }}>
          <label className="dp-row" style={{ gap: 6 }}>
            <span className="dp-muted">Paper Surface:</span>
            <select
              className="dp-select"
              style={{ width: 'auto' }}
              value={settings.paperMaterial}
              onChange={(e) => void patchSettings({ paperMaterial: e.target.value as PaperMaterial })}
            >
              <option value="plain">Plain Stationery</option>
              <option value="dot">Dot Grid</option>
              <option value="lined">Lined Journal</option>
              <option value="grid">Graph Grid</option>
              <option value="cornell">Cornell</option>
            </select>
          </label>
          <label className="dp-row" style={{ gap: 6 }}>
            <span className="dp-muted">Font Size:</span>
            <input
              type="range"
              min={13}
              max={22}
              value={settings.fontSizePx}
              onChange={(e) => void patchSettings({ fontSizePx: Number(e.target.value) })}
            />
            <span>{settings.fontSizePx}px</span>
          </label>
        </div>
        {(settings.customMoods?.length > 0 || settings.customDiaryPrompts?.length > 0) && (
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.78rem' }}>
            {(settings.customMoods ?? []).map((cm) => (
              <span key={cm} className="dp-pill">
                Mood: {cm}
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', paddingInlineStart: 4, color: 'inherit' }}
                  onClick={() => void patchSettings({ customMoods: (settings.customMoods ?? []).filter((x) => x !== cm) })}
                >
                  ×
                </button>
              </span>
            ))}
            {(settings.customDiaryPrompts ?? []).map((cp, i) => (
              <span key={i} className="dp-pill">
                Prompt: {cp.slice(0, 28)}…
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', paddingInlineStart: 4, color: 'inherit' }}
                  onClick={() => void patchSettings({ customDiaryPrompts: (settings.customDiaryPrompts ?? []).filter((_, idx) => idx !== i) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </TabSettingsDrawer>

      {/* Mood & Emotions Strip */}
      <div className="dp-card dp-stack" style={{ padding: 14 }}>
        <div className="dp-row">
          <strong>Mood:</strong>
          {allMoods.map((m) => (
            <button key={m} type="button" className={`dp-btn dp-btn-sm ${entry.mood === m ? 'dp-btn-primary' : ''}`} onClick={() => void saveDiary({ mood: m })}>
              {m}
            </button>
          ))}
          <input
            className="dp-input"
            style={{ width: 150, padding: '3px 8px', fontSize: '0.82rem' }}
            placeholder="+ Save custom mood (Enter)…"
            value={customMood}
            onChange={(e) => setCustomMood(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customMood.trim()) {
                const nm = customMood.trim();
                void saveDiary({ mood: nm });
                if (!allMoods.includes(nm)) {
                  void patchSettings({ customMoods: [...(settings.customMoods ?? []), nm] });
                }
                setCustomMood('');
                pushToast(`Saved mood "${nm}"`);
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

      {/* Rich Categorized Prompt Deck (50+ Prompts) + Custom Prompt Creator */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 10, background: 'var(--dp-surface-2)' }}>
        <div className="dp-row" style={{ gap: 5, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.82rem' }}>
            <Sparkles size={14} style={{ verticalAlign: '-2px' }} /> Reflection Prompts ({filteredPrompts.length}):
          </strong>
          {promptCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className="dp-chip"
              data-active={promptCategory === cat}
              onClick={() => {
                setPromptCategory(cat);
                setPromptIdx(0);
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '0.92rem', flex: '1 1 240px' }}>
            <span className="dp-pill" style={{ marginInlineEnd: 6 }}>{activePrompt.category}</span>
            <em>{activePrompt.text}</em>
          </span>
          <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => {
                const prefix = entry.narrative?.trim() ? `${entry.narrative.trim()}\n\n` : '';
                void saveDiary({ narrative: `${prefix}**${activePrompt.text}**\n` });
                pushToast('Inserted prompt into Narrative Journal');
              }}
            >
              + Write About This
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => setPromptIdx(Math.floor(Math.random() * filteredPrompts.length))}
              title="Pick a random prompt"
            >
              <Shuffle size={13} /> Shuffle
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setPromptIdx((n) => n + 1)}>
              Next →
            </button>
            {settings.cachedWeather && (
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const w = settings.cachedWeather!;
                  void saveDiary({ weatherNote: `${w.emoji} ${w.temp}°${w.unit} ${w.conditionLabel}` });
                  pushToast('Logged live weather into Diary');
                }}
              >
                {settings.cachedWeather.emoji} Log Weather
              </button>
            )}
          </div>
        </div>
        <div className="dp-row">
          <input
            className="dp-input"
            style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }}
            placeholder="Add your own custom reflection prompt…"
            value={customPromptInput}
            onChange={(e) => setCustomPromptInput(e.target.value)}
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              const p = customPromptInput.trim();
              if (!p) return;
              void patchSettings({ customDiaryPrompts: [...(settings.customDiaryPrompts ?? []), p] });
              setCustomPromptInput('');
              setPromptCategory('My Prompts');
              setPromptIdx((settings.customDiaryPrompts ?? []).length);
              pushToast('Added custom reflection prompt');
            }}
          >
            + Save Prompt
          </button>
        </div>
      </div>

      {!entry.blankMode ? (
        <div className="dp-grid-2">
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Summary</strong>
            <SafeTextarea
              recordKey={`diary:${activeDate}:summary`}
              externalValue={entry.summary ?? ''}
              onCommit={(val) => saveDiary({ summary: val })}
              onSaveStateChange={setDiarySaveState}
              className="dp-textarea"
            />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Gratitude</strong>
            <SafeTextarea
              recordKey={`diary:${activeDate}:gratitude`}
              externalValue={entry.gratitude ?? ''}
              onCommit={(val) => saveDiary({ gratitude: val })}
              onSaveStateChange={setDiarySaveState}
              className="dp-textarea"
            />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Wins</strong>
            <SafeTextarea
              recordKey={`diary:${activeDate}:wins`}
              externalValue={entry.wins ?? ''}
              onCommit={(val) => saveDiary({ wins: val })}
              onSaveStateChange={setDiarySaveState}
              className="dp-textarea"
            />
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <strong>Challenges &amp; Learned</strong>
            <SafeTextarea
              recordKey={`diary:${activeDate}:learned`}
              externalValue={entry.learned ?? ''}
              onCommit={(val) => saveDiary({ learned: val })}
              onSaveStateChange={setDiarySaveState}
              className="dp-textarea"
            />
          </label>
        </div>
      ) : null}

      <label className="dp-stack" style={{ gap: 6 }}>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="dp-row" style={{ gap: 6 }}>
            <strong>Narrative Journal</strong>
            <span className="dp-pill">
              {diarySaveState === 'unsaved' ? 'Unsaved changes' : diarySaveState === 'saving' ? 'Saving locally…' : 'Saved locally ✓'}
            </span>
            <span className="dp-pill">
              {settings.operatingMode !== 'docker-sync'
                ? 'Offline on device'
                : syncState.pendingCount > 0
                  ? `Waiting for sync (${syncState.pendingCount})`
                  : 'Synced ✓'}
            </span>
          </div>
          <div className="dp-row" style={{ gap: 6 }}>
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => {
                void saveDiary({});
                pushToast('Saved Diary entry locally');
              }}
            >
              <Save size={13} /> Save Diary
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => mediaInputRef.current?.click()}>
              <ImageIcon size={14} /> Add Photo/Audio
            </button>
          </div>
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
        <SafeTextarea
          recordKey={`diary:${activeDate}:narrative`}
          externalValue={entry.narrative ?? ''}
          onCommit={(val) => saveDiary({ narrative: val })}
          onSaveStateChange={setDiarySaveState}
          className="dp-textarea"
          style={{ minHeight: 180, lineHeight: 1.7 }}
          placeholder="Write freely without limits…"
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
          <div key={ex.id} className="dp-between" style={{ fontSize: '0.88rem', borderInlineStart: '2px solid var(--dp-accent)', paddingInlineStart: 10 }}>
            <span>
              <strong>{ex.time}</strong> {ex.mood ? `(${ex.mood})` : ''} — {ex.text}
            </span>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22 }}
              title="Delete timestamped entry"
              onClick={() =>
                void saveDiary({ extraEntries: (entry.extraEntries ?? []).filter((x) => x.id !== ex.id) })
              }
            >
              <Trash2 size={12} />
            </button>
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

      {/* Past Diary Entries — Easy Sort & Filter */}
      <div className="dp-stack" style={{ gap: 10 }}>
        <strong>Browse Past Diary Entries ({diaries.length})</strong>
        <SortFilterBar
          search={historySearch}
          onSearchChange={setHistorySearch}
          searchPlaceholder="Search past entries, gratitude, wins…"
          sortBy={historySortBy}
          onSortByChange={(v) => setHistorySortBy(v as typeof historySortBy)}
          sortOptions={[
            { value: 'date', label: 'Date' },
            { value: 'energy', label: 'Energy' },
            { value: 'sleep', label: 'Sleep Hours' },
            { value: 'stress', label: 'Stress' },
          ]}
          sortDir={historySortDir}
          onSortDirToggle={() => setHistorySortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          extraFilters={[
            {
              label: 'Filter by mood',
              value: historyMoodFilter,
              onChange: setHistoryMoodFilter,
              options: [
                { value: 'all', label: 'All Moods' },
                ...allMoods.map((m) => ({ value: m, label: m })),
              ],
            },
          ]}
          totalCount={diaries.length}
          shownCount={filteredHistoryDiaries.length}
          onReset={() => {
            setHistorySearch('');
            setHistoryMoodFilter('all');
          }}
        />
        {filteredHistoryDiaries.length === 0 ? (
          <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>No diary entries match your filter.</p>
        ) : (
          <div className="dp-stack" style={{ gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {filteredHistoryDiaries.slice(0, 25).map((d) => (
              <button
                key={d.id}
                type="button"
                className="dp-card dp-between"
                style={{
                  padding: '8px 12px',
                  textAlign: 'start',
                  cursor: 'pointer',
                  borderColor: d.payload.date === activeDate ? 'var(--dp-accent)' : undefined,
                }}
                onClick={() => setActiveDate(d.payload.date)}
              >
                <div>
                  <strong>{d.payload.date}</strong>{' '}
                  {d.payload.mood && <span className="dp-pill">{d.payload.mood}</span>}{' '}
                  {d.payload.weatherNote && <span className="dp-muted" style={{ fontSize: '0.78rem' }}>{d.payload.weatherNote}</span>}
                  <div className="dp-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                    {(d.payload.summary || d.payload.gratitude || d.payload.narrative || 'Opened entry').slice(0, 100)}
                  </div>
                </div>
                <span className="dp-muted" style={{ fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                  ⚡ {d.payload.energy ?? '-'} · 😴 {d.payload.sleepHours ?? '-'}h
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
