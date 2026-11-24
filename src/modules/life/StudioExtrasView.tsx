import React, { useMemo, useState } from 'react';
import { BarChart3, Bot, Download, Layers, LayoutDashboard, Play, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import {
  evaluateAutomations,
  type AutomationAction,
  type AutomationRulePayload,
  type AutomationTrigger,
} from '../../core/automations';
import { addDaysIso } from '../../core/temporal';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { THEME_PRESETS } from '../../data/themes';
import type { DiaryPayload, LifeRecord } from '../../core/types';

const BUILTIN_CONTEXT_MODES = [
  { id: 'work', name: 'Work Focus', theme: 'crisp-minimal', lowEnergy: false, desc: 'Clean graph grid + Work modules prioritized' },
  { id: 'weekend', name: 'Weekend Cozy', theme: 'warm-stationery', lowEnergy: false, desc: 'Warm dot-grid cream + Kitchen & Hobbies' },
  { id: 'home-cozy', name: 'Home / Cozy', theme: 'cozy-pastel', lowEnergy: false, desc: 'Soft pastel stationery + Home & Pantry' },
  { id: 'zen-focus', name: 'Zen Focus', theme: 'sage-minimal', lowEnergy: false, desc: 'Botanical minimal + Deep Focus blocks' },
  { id: 'low-energy', name: 'Low Energy', theme: 'warm-stationery', lowEnergy: true, desc: 'Hides clutter to show only Must-Do + Top 3 + 10m timer' },
  { id: 'travel', name: 'Travel Mode', theme: 'botanical-forest', lowEnergy: false, desc: 'Forest palette + Travel & Packing enabled' },
  { id: 'study', name: 'Study Mode', theme: 'midnight-studio', lowEnergy: false, desc: 'Indigo dark paper + Spaced Review & Pomodoro' },
];

export const StudioExtrasView: React.FC<{ mode: 'spaces' | 'rituals' | 'insights' | 'automations' }> = ({ mode }) => {
  const { settings, patchSettings, records, logicalToday, pushToast, setActiveView } = useApp();

  // Custom Spaces state
  const [spaceTitle, setSpaceTitle] = useState('');
  const [spaceScope, setSpaceScope] = useState<'Day' | 'Week' | 'Month' | 'Year' | 'Ongoing' | 'All Views'>('Ongoing');

  // Insights range
  const [insightDays, setInsightDays] = useState<28 | 56 | 84>(28);

  // Automation builder state
  const [ruleTitle, setRuleTitle] = useState('Refill alert when medication runs low');
  const [ruleTrigger, setRuleTrigger] = useState<AutomationTrigger>('med_low_stock');
  const [ruleThreshold, setRuleThreshold] = useState(7);
  const [ruleAction, setRuleAction] = useState<AutomationAction>('create_refill_task');
  const [dryRunOutput, setDryRunOutput] = useState<string>('');

  // Optional Local / BYOK AI helper state (Section 13.08 — off by default, never silently rewrites text!)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProposal, setAiProposal] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // Ritual step tracker
  const [ritualTab, setRitualTab] = useState<'morning' | 'evening' | 'weekly'>('morning');
  const [ritualChecked, setRitualChecked] = useState<Record<string, boolean>>({});

  const spaces = useMemo(() => records.filter((r) => r.type === 'custom_space'), [records]);
  const rules = useMemo(
    () => records.filter((r) => r.type === 'automation_rule') as Array<LifeRecord<AutomationRulePayload>>,
    [records]
  );

  // Honest Insights queried directly from real IndexedDB records (zero modulo duplication; missing != zero!)
  const insightWindow = useMemo(() => {
    const diaries = new Map(
      (records.filter((r) => r.type === 'diary') as Array<LifeRecord<DiaryPayload>>).map((d) => [d.payload.date, d.payload])
    );
    const doneTasksByDate = new Map<string, number>();
    for (const t of records.filter((r) => r.type === 'task' && r.status === 'done')) {
      const d = String((t.payload as { completedAt?: string }).completedAt ?? t.updatedAt).slice(0, 10);
      doneTasksByDate.set(d, (doneTasksByDate.get(d) ?? 0) + 1);
    }
    return Array.from({ length: insightDays }, (_, i) => {
      const date = addDaysIso(logicalToday, -(insightDays - 1 - i));
      const diary = diaries.get(date);
      const tasksDone = doneTasksByDate.get(date);
      return {
        date,
        hasRecord: Boolean(diary || tasksDone !== undefined),
        mood: diary?.mood ?? null,
        energy: diary?.energy ?? null,
        tasksDone: tasksDone ?? 0,
      };
    });
  }, [records, insightDays, logicalToday]);

  if (mode === 'spaces') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>
          <Layers size={20} style={{ verticalAlign: '-3px' }} /> Unlimited Custom Spaces
        </h2>
        <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Create dedicated personal spaces scoped to Day, Week, Month, Year, Ongoing, or All Views with notes & checklists.
        </p>

        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!spaceTitle.trim()) return;
            await createRecord('custom_space', spaceTitle.trim(), { scope: spaceScope, notes: '', checklist: [] });
            setSpaceTitle('');
            pushToast('Created Custom Space');
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Space name (e.g., Q4 Garden Plan)" value={spaceTitle} onChange={(e) => setSpaceTitle(e.target.value)} />
          <select aria-label="Scope" className="dp-select" style={{ width: 'auto' }} value={spaceScope} onChange={(e) => setSpaceScope(e.target.value as typeof spaceScope)}>
            {(['Day', 'Week', 'Month', 'Year', 'Ongoing', 'All Views'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Create Space</button>
        </form>

        <div className="dp-grid-2">
          {spaces.map((sp) => {
            const p = sp.payload as { scope: string; notes: string };
            return (
              <div key={sp.id} className="dp-card dp-stack" style={{ padding: 14 }}>
                <div className="dp-between">
                  <strong>{sp.title}</strong>
                  <div className="dp-row" style={{ gap: 6 }}>
                    <span className="dp-pill">{p.scope}</span>
                    <button
                      type="button"
                      className="dp-icon-btn"
                      title="Delete custom space"
                      onClick={async () => {
                        await softDeleteRecord(sp.id);
                        pushToast(`Moved "${sp.title}" to Trash`, { canUndo: true });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <textarea
                  className="dp-textarea"
                  placeholder="Space notes, lists, and tracker blocks…"
                  value={p.notes ?? ''}
                  onChange={(e) => void updateRecord(sp.id, (c) => ({ ...c, payload: { ...c.payload, notes: e.target.value } }), { skipUndo: true })}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'rituals') {
    const RITUAL_STEPS = {
      morning: [
        'Review yesterday leftovers in Rollover Migration Drawer',
        'Scan today’s Calendar events & meal plan',
        'Check due chores & pantry alerts',
        'Star your Top Three Priorities for today',
      ],
      evening: [
        'Check off finished tasks & log actual times',
        'Record 1-tap Mood, Energy & Gratitude in Diary strip',
        'Preview tomorrow’s schedule & verify wake-up alarm',
      ],
      weekly: [
        'Triage Thought Inbox passages into Notebooks & Tasks',
        'Plan 5 calm dinners & generate net Grocery List',
        'Check 4-week Chore Health & Upcoming Birthdays',
      ],
    };

    const moveWidget = (idx: number, dir: -1 | 1) => {
      const next = [...settings.homeWidgets];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return;
      [next[idx], next[target]] = [next[target], next[idx]];
      void patchSettings({ homeWidgets: next });
    };

    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>
          <LayoutDashboard size={20} style={{ verticalAlign: '-3px' }} /> Planning Rituals, Context Modes & Layout Builder
        </h2>

        {/* 1-Tap Context Modes (Section 14.05) */}
        <div className="dp-card dp-stack">
          <h4>1-Tap Context Modes (Swap Theme, Modules & Calm Layout Simultaneously)</h4>
          <div className="dp-grid-3">
            {BUILTIN_CONTEXT_MODES.map((cm) => (
              <button
                key={cm.id}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  padding: 12,
                  cursor: 'pointer',
                  borderColor: settings.activeContextModeId === cm.id ? 'var(--dp-accent)' : undefined,
                  borderWidth: settings.activeContextModeId === cm.id ? 2 : 1,
                }}
                onClick={async () => {
                  const preset = THEME_PRESETS.find((t) => t.id === cm.theme) ?? THEME_PRESETS[0];
                  await patchSettings({
                    activeContextModeId: cm.id,
                    themePresetId: preset.id,
                    customTokens: { ...preset.tokens },
                    paperMaterial: preset.defaultPaper,
                    colorScheme: preset.isDark ? 'dark' : 'light',
                    lowEnergyMode: cm.lowEnergy,
                  });
                  pushToast(`Switched to "${cm.name}" Context Mode`);
                }}
              >
                <strong>{cm.name}</strong>
                <div className="dp-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>{cm.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Guided 2-3 Minute Planning Rituals (Section 14.06) */}
        <div className="dp-card dp-stack">
          <div className="dp-between">
            <h4><Sparkles size={15} /> Guided Planning Rituals</h4>
            <div className="dp-row">
              {(['morning', 'evening', 'weekly'] as const).map((rt) => (
                <button key={rt} type="button" className={`dp-btn dp-btn-sm ${ritualTab === rt ? 'dp-btn-primary' : ''}`} onClick={() => setRitualTab(rt)}>
                  {rt === 'morning' ? 'Morning Kickoff' : rt === 'evening' ? 'Evening Shutdown' : 'Weekly Reset'}
                </button>
              ))}
            </div>
          </div>
          {RITUAL_STEPS[ritualTab].map((step, i) => {
            const key = `${ritualTab}-${i}`;
            return (
              <label key={key} className="dp-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(ritualChecked[key])} onChange={(e) => setRitualChecked((p) => ({ ...p, [key]: e.target.checked }))} />
                <span style={{ textDecoration: ritualChecked[key] ? 'line-through' : undefined }}>{step}</span>
              </label>
            );
          })}
          <div>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => setActiveView('today')}>
              Open Today Spread →
            </button>
          </div>
        </div>

        {/* Home & Today Layout Builder */}
        <div className="dp-card dp-stack">
          <h4>Layout Builder — Reorder Home Dashboard Widgets</h4>
          <div className="dp-stack" style={{ gap: 6 }}>
            {settings.homeWidgets.map((w, idx) => (
              <div key={w} className="dp-between" style={{ padding: '6px 10px', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <strong style={{ textTransform: 'capitalize' }}>{w.replace('_', ' ')}</strong>
                <div className="dp-row">
                  <button type="button" className="dp-btn dp-btn-sm" disabled={idx === 0} onClick={() => moveWidget(idx, -1)}>↑</button>
                  <button type="button" className="dp-btn dp-btn-sm" disabled={idx === settings.homeWidgets.length - 1} onClick={() => moveWidget(idx, 1)}>↓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'insights') {
    const loggedDays = insightWindow.filter((d) => d.hasRecord).length;
    const totalDone = insightWindow.reduce((s, d) => s + d.tasksDone, 0);
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <div className="dp-between">
          <div>
            <h2>
              <BarChart3 size={20} style={{ verticalAlign: '-3px' }} /> Honest Review Analytics & Heatmaps
            </h2>
            <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Queried directly from real IndexedDB records · Missing days clearly distinct from zero
            </p>
          </div>
          <div className="dp-row">
            {([28, 56, 84] as const).map((d) => (
              <button key={d} type="button" className={`dp-btn dp-btn-sm ${insightDays === d ? 'dp-btn-primary' : ''}`} onClick={() => setInsightDays(d)}>
                {d} Days
              </button>
            ))}
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => {
                const csv = recordsToCsv(
                  ['Date', 'Logged', 'Mood', 'Energy', 'TasksCompleted'],
                  insightWindow.map((r) => [r.date, r.hasRecord, r.mood ?? 'missing', r.energy ?? 'missing', r.tasksDone])
                );
                triggerBrowserDownload(csv, `planaday-insights-${insightDays}d.csv`, 'text/csv');
                pushToast('Exported Insights CSV');
              }}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        <div className="dp-kpi-grid">
          <div className="dp-kpi-card">
            <span className="dp-kpi-value">{loggedDays}/{insightDays}</span>
            <span className="dp-kpi-label">Days With Real Activity</span>
          </div>
          <div className="dp-kpi-card">
            <span className="dp-kpi-value">{totalDone}</span>
            <span className="dp-kpi-label">Tasks Completed ({insightDays}d)</span>
          </div>
          <div className="dp-kpi-card">
            <span className="dp-kpi-value">{records.length}</span>
            <span className="dp-kpi-label">Total Unified Graph Records</span>
          </div>
        </div>

        <div className="dp-card dp-stack">
          <div className="dp-between">
            <strong>{insightDays}-Day Activity & Reflection Heatmap</strong>
            <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Dashed hollow = missing day · Solid = recorded</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(22px, 1fr))', gap: 5 }}>
            {insightWindow.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.hasRecord ? `${d.tasksDone} tasks, mood: ${d.mood || 'none'}` : 'Missing (no data)'}`}
                style={{
                  height: 22,
                  borderRadius: 4,
                  border: d.hasRecord ? '1px solid var(--dp-accent-2)' : '1px dashed var(--dp-border)',
                  background: !d.hasRecord
                    ? 'transparent'
                    : d.tasksDone >= 3
                      ? '#2f6f62'
                      : d.tasksDone >= 1
                        ? '#76a882'
                        : 'color-mix(in oklch, var(--dp-accent) 28%, var(--dp-paper))',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Local Automations & Optional Local / BYOK AI Assistant (Sections 15.07 & 13.08)
  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <h2>
        <Zap size={20} style={{ verticalAlign: '-3px' }} /> Local Automation Engine & Optional Local/BYOK AI
      </h2>

      <div className="dp-card dp-stack">
        <h4>No-Code When → If → Then Rules (Dry-Run, Loop Guard & Idempotency)</h4>
        <form
          className="dp-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ruleTitle.trim()) return;
            await createRecord<AutomationRulePayload>('automation_rule', ruleTitle.trim(), {
              enabled: true,
              trigger: ruleTrigger,
              conditionThreshold: ruleThreshold,
              action: ruleAction,
              fireCount: 0,
            });
            pushToast('Saved local automation rule');
          }}
        >
          <div className="dp-row">
            <input className="dp-input" style={{ flex: 2 }} value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} placeholder="Rule name…" />
            <select aria-label="When trigger" className="dp-select" style={{ width: 'auto' }} value={ruleTrigger} onChange={(e) => setRuleTrigger(e.target.value as AutomationTrigger)}>
              <option value="alarm_dismissed">When: Alarm dismissed</option>
              <option value="pantry_staple_zero">When: Pantry staple hits ≤</option>
              <option value="focus_timer_ended">When: Focus timer ends</option>
              <option value="med_low_stock">When: Med drops ≤</option>
            </select>
            <label className="dp-row" style={{ gap: 4 }}>
              <input type="number" className="dp-input" style={{ width: 68 }} value={ruleThreshold} onChange={(e) => setRuleThreshold(Number(e.target.value) || 0)} title="Threshold" />
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>units</span>
            </label>
            <select aria-label="Then action" className="dp-select" style={{ width: 'auto' }} value={ruleAction} onChange={(e) => setRuleAction(e.target.value as AutomationAction)}>
              <option value="open_morning_kickoff">Then: Open Morning Kickoff</option>
              <option value="add_to_grocery_list">Then: Add to Grocery List</option>
              <option value="create_refill_task">Then: Create Refill Task</option>
              <option value="prompt_break_timer">Then: Log Minutes & Prompt Break</option>
            </select>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save Rule</button>
          </div>
        </form>

        {rules.map((r) => (
          <div key={r.id} className="dp-between" style={{ padding: 10, background: 'var(--dp-surface-2)', borderRadius: 8 }}>
            <div>
              <strong>{r.title}</strong>
              <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                When <code>{r.payload.trigger}</code> (≤ {r.payload.conditionThreshold ?? 0}) → <code>{r.payload.action}</code> · Fired {r.payload.fireCount ?? 0}×
              </div>
            </div>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={async () => {
                  const res = await evaluateAutomations(r.payload.trigger, {
                    subjectName: 'Sample Item',
                    numericValue: r.payload.conditionThreshold ?? 0,
                    todayIso: logicalToday,
                    dryRun: true,
                  });
                  setDryRunOutput(res.map((x) => `${x.ruleTitle}: ${x.effectSummary} (dry-run)`).join(' | ') || 'No rules matched');
                }}
              >
                <Play size={12} /> Dry-Run Test
              </button>
              <input
                type="checkbox"
                checked={r.payload.enabled}
                onChange={(e) => void updateRecord<AutomationRulePayload>(r.id, (c) => ({ ...c, payload: { ...c.payload, enabled: e.target.checked } }))}
              />
              <button
                type="button"
                className="dp-icon-btn"
                title="Delete automation rule"
                onClick={async () => {
                  await softDeleteRecord(r.id);
                  pushToast(`Moved rule "${r.title}" to Trash`, { canUndo: true });
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {dryRunOutput && <div className="dp-pill highlight">Dry-Run Result: {dryRunOutput}</div>}
      </div>

      {/* Optional Local / BYOK AI Assistant (Section 13.08 — Off by default, user-confirmed only) */}
      <div className="dp-card dp-stack">
        <div className="dp-between">
          <h4><Bot size={16} /> Optional Local / BYOK AI Assistant (Off by Default)</h4>
          <label className="dp-row">
            <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => void patchSettings({ aiEnabled: e.target.checked })} />
            <span>Enable Local/BYOK AI Helpers</span>
          </label>
        </div>
        {settings.aiEnabled && (
          <div className="dp-stack">
            <div className="dp-row">
              <input className="dp-input" style={{ flex: 2 }} value={settings.aiEndpoint} onChange={(e) => void patchSettings({ aiEndpoint: e.target.value })} placeholder="Ollama endpoint e.g. http://localhost:11434" />
              <input className="dp-input" style={{ flex: 1 }} value={settings.aiModel} onChange={(e) => void patchSettings({ aiModel: e.target.value })} placeholder="Model name (e.g. llama3.2)" />
            </div>
            <textarea className="dp-textarea" placeholder="Paste rough thoughts or messy recipe text for a user-confirmed cleanup suggestion…" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              disabled={aiBusy}
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                if (!aiPrompt.trim()) return;
                setAiBusy(true);
                try {
                  const res = await fetch(`${settings.aiEndpoint.replace(/\/+$/, '')}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: settings.aiModel, prompt: `Summarize cleanly into actionable planner bullet points:\n\n${aiPrompt}`, stream: false }),
                  });
                  const json = (await res.json()) as { response?: string };
                  setAiProposal(json.response || 'No response returned by local model.');
                } catch {
                  setAiProposal('Could not reach configured Ollama endpoint — Planaday stays 100% functional offline without AI.');
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              {aiBusy ? 'Generating proposal…' : 'Propose Suggestion (Never Auto-Overwrites)'}
            </button>
            {aiProposal && (
              <div className="dp-card" style={{ background: 'var(--dp-surface-2)' }}>
                <strong>AI Proposal (Review Before Saving):</strong>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{aiProposal}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
