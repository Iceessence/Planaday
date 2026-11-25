import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, Image as ImageIcon, Plus, Save, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { createId, getBlobObjectUrl, storeBlob } from '../../core/db';
import { triggerBrowserDownload } from '../../core/backup';
import { addDaysIso, formatDateLocalized } from '../../core/temporal';
import { DIARY_PROMPTS, getDiaryPromptCategories } from '../../data/prompts';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { SafeTextarea, type LocalSaveState } from '../../components/Common/SafeTextEditor';
import type { CustomDiaryCategoryDef, DiaryPayload, LifeRecord, PaperMaterial } from '../../core/types';

const DEFAULT_MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'];
const EMOTION_TAGS = ['Calm', 'Grateful', 'Focused', 'Energized', 'Tired', 'Anxious', 'Inspired', 'Cozy'];
const WELLNESS_RATINGS = [
  { key: 'moodScore', label: 'Mood' },
  { key: 'energy', label: 'Energy' },
  { key: 'motivation', label: 'Motivation' },
  { key: 'stress', label: 'Stress' },
  { key: 'happiness', label: 'Happiness' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'focus', label: 'Focus' },
  { key: 'anxiety', label: 'Anxiety' },
  { key: 'physicalComfort', label: 'Physical Comfort' },
  { key: 'sleepQuality', label: 'Sleep Quality' },
  { key: 'wellness', label: 'General Wellness' },
];

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
  const [showPhotoTimeline, setShowPhotoTimeline] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoAlbum, setPhotoAlbum] = useState('Daily');
  const [photoActivity, setPhotoActivity] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [newCatName, setNewCatName] = useState('');
  const [newCatKind, setNewCatKind] = useState<CustomDiaryCategoryDef['kind']>('rating');
  const [newCatUnit, setNewCatUnit] = useState('');
  const [bathroomNote, setBathroomNote] = useState('');
  const [trendMetricA, setTrendMetricA] = useState('energy');
  const [trendMetricB, setTrendMetricB] = useState('stress');
  const [trendDays, setTrendDays] = useState(30);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const ratingScale = settings.diaryRatingScale ?? { min: 1, max: 10, step: 1 };
  const customCategories = settings.customDiaryCategories ?? [];

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

  // Load photo thumbnails from IndexedDB blobs cleanly (revoking created ObjectURLs on unmount)
  useEffect(() => {
    const hashes = new Set<string>();
    for (const p of entry.photos ?? []) hashes.add(p.blobHash);
    if (showPhotoTimeline) {
      for (const d of diaries.slice(0, 60)) {
        for (const p of d.payload.photos ?? []) hashes.add(p.blobHash);
      }
    }
    let alive = true;
    const created: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const h of hashes) {
        const u = await getBlobObjectUrl(h);
        if (u) {
          created.push(u);
          next[h] = u;
        }
      }
      if (alive) setPhotoUrls(next);
      else created.forEach((u) => URL.revokeObjectURL(u));
    })();
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [entry.photos, showPhotoTimeline, diaries]);

  // Trend series for Diary History & Trends chart (Section 13.4)
  const trendSeries = useMemo(() => {
    const startCutoff = addDaysIso(logicalToday, -(trendDays - 1));
    return [...diaries]
      .filter((d) => d.payload.date >= startCutoff)
      .sort((a, b) => a.payload.date.localeCompare(b.payload.date))
      .map((d) => {
        const getVal = (key: string): number | null => {
          const r = d.payload.ratings?.[key];
          if (typeof r === 'number') return r;
          if (key === 'energy' && typeof d.payload.energy === 'number') return d.payload.energy;
          if (key === 'stress' && typeof d.payload.stress === 'number') return d.payload.stress;
          if (key === 'sleepQuality' && typeof d.payload.sleepQuality === 'number') return d.payload.sleepQuality;
          if (key === 'sleepHours' && typeof d.payload.sleepHours === 'number') return d.payload.sleepHours;
          if (key === 'waterCups' && typeof d.payload.waterCups === 'number') return d.payload.waterCups;
          return null;
        };
        return { date: d.payload.date, a: getVal(trendMetricA), b: getVal(trendMetricB) };
      });
  }, [diaries, logicalToday, trendDays, trendMetricA, trendMetricB]);

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
          <button type="button" className="dp-btn dp-btn-sm" aria-label="Previous day" title="Previous day" onClick={() => setActiveDate(addDaysIso(activeDate, -1))}>←</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>Today</button>
          <button type="button" className="dp-btn dp-btn-sm" aria-label="Next day" title="Next day" onClick={() => setActiveDate(addDaysIso(activeDate, 1))}>→</button>
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
            <span className="dp-muted">Rating Scale:</span>
            <select
              aria-label="Diary rating scale"
              className="dp-select"
              style={{ width: 'auto' }}
              value={`${ratingScale.min}-${ratingScale.max}-${ratingScale.step}`}
              onChange={(e) => {
                const [mn, mx, st] = e.target.value.split('-').map(Number);
                void patchSettings({ diaryRatingScale: { min: mn, max: mx, step: st } });
              }}
            >
              <option value="1-10-1">1 – 10 (Default)</option>
              <option value="1-10-0.5">1 – 10 (Decimals 0.5)</option>
              <option value="0-10-1">0 – 10</option>
              <option value="1-5-1">1 – 5</option>
              <option value="1-100-1">1 – 100</option>
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
                  aria-label={`Remove custom mood ${cm}`}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', paddingInlineStart: 4, minWidth: 24, minHeight: 24, color: 'inherit' }}
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
                  aria-label="Remove custom diary prompt"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', paddingInlineStart: 4, minWidth: 24, minHeight: 24, color: 'inherit' }}
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
        {/* 1-10 (or Custom Scale) Comprehensive Daily Ratings & Measurements (Sections 13.1 & 13.2) */}
        <div className="dp-grid-3" style={{ fontSize: '0.82rem', gap: 10 }}>
          {WELLNESS_RATINGS.map((m) => {
            const cur =
              entry.ratings?.[m.key] ??
              (m.key === 'energy' ? entry.energy : m.key === 'stress' ? entry.stress : m.key === 'sleepQuality' ? entry.sleepQuality : undefined) ??
              Math.round((ratingScale.min + ratingScale.max) / 2);
            return (
              <label key={m.key} className="dp-stack" style={{ gap: 2 }}>
                <div className="dp-between">
                  <span>{m.label}</span>
                  <strong>{cur}/{ratingScale.max}</strong>
                </div>
                <input
                  type="range"
                  min={ratingScale.min}
                  max={ratingScale.max}
                  step={ratingScale.step}
                  value={cur}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const nextRatings = { ...(entry.ratings ?? {}), [m.key]: v };
                    const extra: Partial<DiaryPayload> = { ratings: nextRatings, ratingScaleMin: ratingScale.min, ratingScaleMax: ratingScale.max };
                    if (m.key === 'energy') extra.energy = v;
                    if (m.key === 'stress') extra.stress = v;
                    if (m.key === 'sleepQuality') extra.sleepQuality = v;
                    void saveDiary(extra);
                  }}
                />
              </label>
            );
          })}
          <label className="dp-between">
            <span>Sleep (hrs)</span>
            <input
              type="number"
              step={0.5}
              min={0}
              max={24}
              className="dp-input"
              style={{ width: 74, padding: '3px 6px' }}
              value={entry.sleepHours ?? ''}
              onChange={(e) => void saveDiary({ sleepHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="dp-between">
            <span>Exercise (min)</span>
            <input
              type="number"
              min={0}
              max={600}
              className="dp-input"
              style={{ width: 74, padding: '3px 6px' }}
              value={entry.exerciseMin ?? ''}
              onChange={(e) => void saveDiary({ exerciseMin: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="dp-between">
            <span>Water (cups)</span>
            <input
              type="number"
              min={0}
              max={40}
              className="dp-input"
              style={{ width: 74, padding: '3px 6px' }}
              value={entry.waterCups ?? 0}
              onChange={(e) => void saveDiary({ waterCups: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        {/* Voluntary Private Bathroom Tracking & Custom User-Defined Categories (Sections 13.1 & 13.2) */}
        <details className="dp-details">
          <summary style={{ fontSize: '0.84rem', fontWeight: 600 }}>
            Private Wellness: Optional Bathroom Log &amp; Custom Tracking Categories ({customCategories.length})
          </summary>
          <div className="dp-stack" style={{ gap: 10, marginTop: 10 }}>
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 8, background: 'var(--dp-surface-2)' }}>
              <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                <strong style={{ fontSize: '0.84rem' }}>Voluntary Private Bathroom Log</strong>
                <span className="dp-muted" style={{ fontSize: '0.75rem' }}>Stored strictly in your private device/server database</span>
              </div>
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10, fontSize: '0.83rem' }}>
                <div className="dp-row" style={{ gap: 5 }}>
                  <span>Urinations: <strong>{entry.bathroom?.urinations ?? 0}</strong></span>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      const nowT = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const b = entry.bathroom ?? { urinations: 0, bowelMovements: 0, logs: [] };
                      void saveDiary({
                        bathroom: {
                          ...b,
                          urinations: (b.urinations ?? 0) + 1,
                          logs: [...(b.logs ?? []), { id: createId('br'), time: nowT, kind: 'urination', note: bathroomNote.trim() || undefined }],
                        },
                      });
                      setBathroomNote('');
                    }}
                  >
                    +1 Log Time
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      const b = entry.bathroom ?? { urinations: 0, bowelMovements: 0, logs: [] };
                      void saveDiary({ bathroom: { ...b, urinations: Math.max(0, (b.urinations ?? 0) - 1) } });
                    }}
                  >
                    −
                  </button>
                </div>
                <div className="dp-row" style={{ gap: 5 }}>
                  <span>Bowel Movements: <strong>{entry.bathroom?.bowelMovements ?? 0}</strong></span>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      const nowT = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const b = entry.bathroom ?? { urinations: 0, bowelMovements: 0, logs: [] };
                      void saveDiary({
                        bathroom: {
                          ...b,
                          bowelMovements: (b.bowelMovements ?? 0) + 1,
                          logs: [...(b.logs ?? []), { id: createId('br'), time: nowT, kind: 'bowel', note: bathroomNote.trim() || undefined }],
                        },
                      });
                      setBathroomNote('');
                    }}
                  >
                    +1 Log Time
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      const b = entry.bathroom ?? { urinations: 0, bowelMovements: 0, logs: [] };
                      void saveDiary({ bathroom: { ...b, bowelMovements: Math.max(0, (b.bowelMovements ?? 0) - 1) } });
                    }}
                  >
                    −
                  </button>
                </div>
                <input
                  className="dp-input"
                  style={{ flex: 1, minWidth: 150 }}
                  placeholder="Optional note before logging…"
                  value={bathroomNote}
                  onChange={(e) => setBathroomNote(e.target.value)}
                />
              </div>
              {(entry.bathroom?.logs?.length ?? 0) > 0 && (
                <div className="dp-row" style={{ flexWrap: 'wrap', gap: 5, fontSize: '0.76rem' }}>
                  {(entry.bathroom?.logs ?? []).map((lg) => (
                    <span key={lg.id} className="dp-pill">
                      {lg.time} · {lg.kind === 'urination' ? 'Urine' : 'Bowel'}{lg.note ? ` (${lg.note})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Custom User-Created Tracking Categories */}
            <div className="dp-stack" style={{ gap: 8 }}>
              <strong style={{ fontSize: '0.84rem' }}>Custom Tracking Categories</strong>
              {customCategories.map((cat) => {
                const val = entry.customTrackers?.[cat.id];
                return (
                  <div key={cat.id} className="dp-between" style={{ gap: 8, fontSize: '0.83rem' }}>
                    <span>
                      <strong>{cat.name}</strong> {cat.unit ? <span className="dp-muted">({cat.unit})</span> : null}
                    </span>
                    <div className="dp-row" style={{ gap: 6 }}>
                      {cat.kind === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => void saveDiary({ customTrackers: { ...(entry.customTrackers ?? {}), [cat.id]: e.target.checked } })}
                        />
                      ) : cat.kind === 'text' ? (
                        <input
                          className="dp-input"
                          style={{ width: 180 }}
                          value={String(val ?? '')}
                          onChange={(e) => void saveDiary({ customTrackers: { ...(entry.customTrackers ?? {}), [cat.id]: e.target.value } })}
                        />
                      ) : (
                        <input
                          type="number"
                          className="dp-input"
                          style={{ width: 90 }}
                          value={typeof val === 'number' ? val : ''}
                          onChange={(e) => void saveDiary({ customTrackers: { ...(entry.customTrackers ?? {}), [cat.id]: Number(e.target.value) || 0 } })}
                        />
                      )}
                      <button
                        type="button"
                        className="dp-icon-btn"
                        aria-label={`Remove category ${cat.name}`}
                        onClick={() => void patchSettings({ customDiaryCategories: customCategories.filter((x) => x.id !== cat.id) })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <input className="dp-input" style={{ flex: 1, minWidth: 140 }} placeholder="New tracker (e.g., Caffeine, Headache, Steps)…" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
                <select className="dp-select" style={{ width: 'auto' }} value={newCatKind} onChange={(e) => setNewCatKind(e.target.value as CustomDiaryCategoryDef['kind'])}>
                  <option value="rating">Rating</option>
                  <option value="counter">Counter</option>
                  <option value="duration">Duration</option>
                  <option value="measurement">Measurement</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="text">Text Note</option>
                </select>
                <input className="dp-input" style={{ width: 90 }} placeholder="Unit (mg, mi)…" value={newCatUnit} onChange={(e) => setNewCatUnit(e.target.value)} />
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => {
                    if (!newCatName.trim()) return;
                    void patchSettings({
                      customDiaryCategories: [
                        ...customCategories,
                        { id: createId('dcat'), name: newCatName.trim(), kind: newCatKind, unit: newCatUnit.trim() || undefined },
                      ],
                    });
                    setNewCatName('');
                    setNewCatUnit('');
                    pushToast('Added custom diary tracking category!');
                  }}
                >
                  + Add Category
                </button>
              </div>
            </div>
          </div>
        </details>
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
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              const nextHashes = [...(entry.mediaBlobIds ?? [])];
              const nextPhotos = [...(entry.photos ?? [])];
              for (const f of files) {
                const stored = await storeBlob(f, f.name);
                nextHashes.push(stored.hash);
                if (f.type.startsWith('image/')) {
                  nextPhotos.push({
                    id: createId('ph'),
                    blobHash: stored.hash,
                    caption: photoCaption.trim() || f.name.replace(/\.[^.]+$/, ''),
                    timestamp: new Date().toISOString(),
                    album: photoAlbum.trim() || 'Daily',
                    linkedActivity: photoActivity.trim() || undefined,
                  });
                }
              }
              await saveDiary({ mediaBlobIds: nextHashes, photos: nextPhotos });
              setPhotoCaption('');
              setPhotoActivity('');
              pushToast(`Saved ${files.length} daily media attachment(s)!`);
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

      {/* Daily Photos Album & Chronological Photo Timeline (Section 13.3) */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <strong>
            <Camera size={15} style={{ verticalAlign: '-2px' }} /> Daily Photos ({entry.photos?.length ?? 0} on {activeDate})
          </strong>
          <div className="dp-row" style={{ gap: 6 }}>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setShowPhotoTimeline((v) => !v)}>
              {showPhotoTimeline ? 'Hide Chronological Gallery' : 'Browse All Days Photos'}
            </button>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => mediaInputRef.current?.click()}>
              <Plus size={13} /> Add Daily Photo
            </button>
          </div>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.8rem' }}>
          <input className="dp-input" style={{ flex: 1, minWidth: 140 }} placeholder="Optional photo caption…" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} />
          <input className="dp-input" style={{ width: 120 }} placeholder="Album (Daily)" value={photoAlbum} onChange={(e) => setPhotoAlbum(e.target.value)} />
          <input className="dp-input" style={{ width: 150 }} placeholder="Linked activity…" value={photoActivity} onChange={(e) => setPhotoActivity(e.target.value)} />
        </div>
        {(entry.photos?.length ?? 0) > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {(entry.photos ?? []).map((ph) => (
              <div key={ph.id} className="dp-card dp-stack" style={{ padding: 6, gap: 4 }}>
                {photoUrls[ph.blobHash] ? (
                  <img src={photoUrls[ph.blobHash]} alt={ph.caption || 'Daily photo'} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6 }} />
                ) : (
                  <div className="dp-muted" style={{ height: 110, display: 'grid', placeItems: 'center', fontSize: '0.76rem' }}>Loading…</div>
                )}
                <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{ph.caption || 'Photo'}</div>
                <div className="dp-between" style={{ fontSize: '0.7rem' }}>
                  <span className="dp-muted">{ph.album || 'Daily'}</span>
                  <button
                    type="button"
                    className="dp-btn dp-btn-ghost dp-btn-sm"
                    style={{ padding: '0 4px', minHeight: 'auto' }}
                    onClick={() => void saveDiary({ photos: (entry.photos ?? []).filter((x) => x.id !== ph.id) })}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {showPhotoTimeline && (
          <div className="dp-stack" style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 8, gap: 6 }}>
            <strong style={{ fontSize: '0.82rem' }}>Chronological Photo Browser</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {diaries
                .flatMap((d) => (d.payload.photos ?? []).map((ph) => ({ date: d.payload.date, ph })))
                .slice(0, 30)
                .map(({ date, ph }) => (
                  <button
                    key={`${date}-${ph.id}`}
                    type="button"
                    className="dp-card dp-stack"
                    style={{ padding: 5, textAlign: 'start', cursor: 'pointer', gap: 3 }}
                    onClick={() => setActiveDate(date)}
                  >
                    {photoUrls[ph.blobHash] && (
                      <img src={photoUrls[ph.blobHash]} alt={ph.caption || date} style={{ width: '100%', height: 84, objectFit: 'cover', borderRadius: 5 }} />
                    )}
                    <strong style={{ fontSize: '0.72rem' }}>{date}</strong>
                    <span className="dp-muted" style={{ fontSize: '0.7rem' }}>{ph.caption}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Diary History & Trends Comparison Chart (Section 13.4) */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <strong>📈 Diary Trends &amp; Observational Comparison</strong>
          <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap', fontSize: '0.8rem' }}>
            <select aria-label="Metric A" className="dp-select" style={{ width: 'auto' }} value={trendMetricA} onChange={(e) => setTrendMetricA(e.target.value)}>
              {WELLNESS_RATINGS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
              <option value="sleepHours">Sleep Hours</option>
              <option value="waterCups">Water Cups</option>
            </select>
            <span>vs</span>
            <select aria-label="Metric B" className="dp-select" style={{ width: 'auto' }} value={trendMetricB} onChange={(e) => setTrendMetricB(e.target.value)}>
              {WELLNESS_RATINGS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
              <option value="sleepHours">Sleep Hours</option>
              <option value="waterCups">Water Cups</option>
            </select>
            <select aria-label="Trend window" className="dp-select" style={{ width: 'auto' }} value={trendDays} onChange={(e) => setTrendDays(Number(e.target.value))}>
              <option value={14}>Last 14d</option>
              <option value={30}>Last 30d</option>
              <option value={90}>Last 90d</option>
              <option value={365}>Last 365d</option>
            </select>
          </div>
        </div>
        {trendSeries.length >= 2 ? (
          <svg viewBox="0 0 600 130" style={{ width: '100%', maxHeight: 140, background: 'var(--dp-surface-2)', borderRadius: 8 }}>
            {(() => {
              const maxVal = Math.max(ratingScale.max, ...trendSeries.flatMap((p) => [p.a ?? 0, p.b ?? 0]), 1);
              const xStep = 560 / Math.max(1, trendSeries.length - 1);
              const ptsA = trendSeries
                .map((p, i) => (p.a !== null ? `${20 + i * xStep},${115 - (p.a / maxVal) * 95}` : null))
                .filter(Boolean)
                .join(' ');
              const ptsB = trendSeries
                .map((p, i) => (p.b !== null ? `${20 + i * xStep},${115 - (p.b / maxVal) * 95}` : null))
                .filter(Boolean)
                .join(' ');
              return (
                <>
                  <polyline fill="none" stroke="#3b6ea5" strokeWidth="2.5" points={ptsA} />
                  <polyline fill="none" stroke="#c96f53" strokeWidth="2.5" strokeDasharray="5 3" points={ptsB} />
                </>
              );
            })()}
          </svg>
        ) : (
          <p className="dp-muted" style={{ margin: 0, fontSize: '0.8rem' }}>Log at least 2 days to see trend comparison lines.</p>
        )}
        <span className="dp-muted" style={{ fontSize: '0.74rem' }}>
          Blue solid = {trendMetricA} · Coral dashed = {trendMetricB}. Observational self-tracking display only — correlations are not medical conclusions.
        </span>
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
