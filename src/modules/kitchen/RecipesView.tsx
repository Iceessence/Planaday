import React, { useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  Download,
  Flame,
  Globe,
  Play,
  Plus,
  Printer,
  ShoppingCart,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import {
  finishCookingSession,
  generateNetGroceryItems,
  parseIngredientLine,
  parseRawRecipeText,
  rankWhatCanIMake,
  scaleAndConvertIngredients,
} from '../../core/kitchenActions';
import { COOKING_DENSITIES } from '../../data/densities';
import { triggerBrowserDownload } from '../../core/backup';
import { createId, getBlobObjectUrl, storeBlob } from '../../core/db';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type { LifeRecord, PantryLotPayload, RecipePayload } from '../../core/types';

export const RecipesView: React.FC = () => {
  const { settings, records, logicalToday, pushToast, startCountdownTimer, setActiveView } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showWhatCanIMake, setShowWhatCanIMake] = useState(false);
  const [clipperOpen, setClipperOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState('');
  const [clipText, setClipText] = useState('');
  const [clippingBusy, setClippingBusy] = useState(false);

  // Scaler & Density Converter state
  const [targetServings, setTargetServings] = useState<number>(2);
  const [unitMode, setUnitMode] = useState<'original' | 'metric' | 'us'>('original');
  const [densityDrawerOpen, setDensityDrawerOpen] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  // Hands-Free Cooking Mode snapshot state (Section 11.03)
  const [cookingSession, setCookingSession] = useState<{
    recipeId: string;
    title: string;
    snapshot: RecipePayload;
    scaleFactor: number;
    stepIdx: number;
    checkedIngIds: Set<string>;
    finishOpen: boolean;
  } | null>(null);
  const [deductPantry, setDeductPantry] = useState(true);
  const [leftoverPortions, setLeftoverPortions] = useState(2);
  const [leftoverZone, setLeftoverZone] = useState<'Fridge' | 'Freezer'>('Fridge');
  const [eatByDays, setEatByDays] = useState(4);

  const recipes = useMemo(
    () => records.filter((r) => r.type === 'recipe') as Array<LifeRecord<RecipePayload>>,
    [records]
  );
  const pantryLots = useMemo(
    () => records.filter((r) => r.type === 'pantry_lot') as Array<LifeRecord<PantryLotPayload>>,
    [records]
  );

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.payload.cuisine || '').toLowerCase().includes(q) ||
        r.payload.ingredients.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [recipes, search]);

  const activeRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedId) ?? filteredRecipes[0] ?? null,
    [recipes, selectedId, filteredRecipes]
  );

  useEffect(() => {
    if (activeRecipe) setTargetServings(activeRecipe.payload.servings || 2);
  }, [activeRecipe?.id, activeRecipe]);

  useEffect(() => {
    let alive = true;
    const h = activeRecipe?.payload.heroBlobId;
    if (!h) {
      setHeroUrl(null);
      return;
    }
    void getBlobObjectUrl(h).then((u) => {
      if (alive) setHeroUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [activeRecipe?.payload.heroBlobId]);

  // Wake Lock & Spacebar step advance during Hands-Free Cooking Mode
  useEffect(() => {
    if (!cookingSession) return;
    let wakeLock: { release?: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => { /* optional */ });

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !cookingSession.finishOpen) {
        e.preventDefault();
        setCookingSession((prev) =>
          prev ? { ...prev, stepIdx: Math.min(prev.snapshot.steps.length - 1, prev.stepIdx + 1) } : null
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      void wakeLock?.release?.();
    };
  }, [cookingSession]);

  const scaledIngredients = useMemo(
    () => (activeRecipe ? scaleAndConvertIngredients(activeRecipe.payload, targetServings, unitMode) : []),
    [activeRecipe, targetServings, unitMode]
  );

  const rankedMatches = useMemo(
    () => rankWhatCanIMake(recipes, pantryLots, logicalToday),
    [recipes, pantryLots, logicalToday]
  );

  const handleClipUrl = async () => {
    if (!clipUrl.trim()) return;
    setClippingBusy(true);
    try {
      const base = settings.syncServerUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/proxy/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clipUrl.trim() }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        draft?: {
          title: string;
          sourceUrl: string;
          cuisine?: string;
          servings: number;
          prepMin: number;
          cookMin: number;
          ingredients: string[];
          steps: string[];
          nutrition?: RecipePayload['nutrition'];
        };
      };
      if (!json.ok || !json.draft) {
        throw new Error(json.error || 'Could not parse recipe URL');
      }
      const d = json.draft;
      const created = await createRecord<RecipePayload>('recipe', d.title, {
        cuisine: d.cuisine || 'Imported',
        mealTypes: ['Dinner'],
        dietaryBadges: [],
        allergens: [],
        servings: d.servings || 4,
        prepMin: d.prepMin || 15,
        cookMin: d.cookMin || 25,
        restMin: 0,
        difficulty: 'medium',
        rating: 0,
        madeCount: 0,
        sourceUrl: d.sourceUrl,
        equipment: [],
        ingredients: d.ingredients.map(parseIngredientLine),
        steps: d.steps.map((text, idx) => ({ id: createId('stp'), order: idx + 1, text })),
        nutrition: d.nutrition,
      });
      setSelectedId(created.id);
      setClipperOpen(false);
      setClipUrl('');
      pushToast(`Imported "${created.title}" via Docker Recipe Proxy`, { canUndo: true });
    } catch (err) {
      pushToast(
        `${err instanceof Error ? err.message : 'URL import failed'} — paste raw text below for 100% offline import.`,
        { tone: 'warn' }
      );
    } finally {
      setClippingBusy(false);
    }
  };

  const handleClipRawText = async () => {
    if (!clipText.trim()) return;
    const parsed = parseRawRecipeText(clipText, clipUrl.trim() || undefined);
    const created = await createRecord<RecipePayload>('recipe', parsed.title, parsed.payload);
    setSelectedId(created.id);
    setClipperOpen(false);
    setClipText('');
    setClipUrl('');
    pushToast(`Imported "${created.title}" offline`, { canUndo: true });
  };

  const exportMarkdown = (r: LifeRecord<RecipePayload>) => {
    const md = [
      `# ${r.title}`,
      `Servings: ${r.payload.servings} | Prep: ${r.payload.prepMin}m | Cook: ${r.payload.cookMin}m`,
      `\n## Ingredients`,
      ...r.payload.ingredients.map((i) => `- ${i.quantity} ${i.unit} ${i.name}${i.prepText ? `, ${i.prepText}` : ''}`),
      `\n## Steps`,
      ...r.payload.steps.map((s) => `${s.order}. ${s.text}`),
    ].join('\n');
    triggerBrowserDownload(md, `${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, 'text/markdown');
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <ChefHat size={20} style={{ verticalAlign: '-3px' }} /> Recipe Library & Smart Clipper
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Serving Scaler · Appendix B Density Converter · "What Can I Make?" · Hands-Free Cooking Mode
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => setClipperOpen(true)}>
            <Plus size={14} /> Import / New Recipe
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${showWhatCanIMake ? 'dp-btn-primary' : ''}`}
            onClick={() => setShowWhatCanIMake((v) => !v)}
          >
            <Sparkles size={14} /> What Can I Make?
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setDensityDrawerOpen(true)}>
            Density Table (Appendix B)
          </button>
        </div>
      </div>

      {showWhatCanIMake ? (
        <div className="dp-stack">
          <h3>"What Can I Make?" — Matched Against Unexpired Pantry Lots</h3>
          <div className="dp-grid-2">
            {rankedMatches.map((m) => (
              <div key={m.recipe.id} className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
                <div className="dp-between">
                  <strong>{m.recipe.title}</strong>
                  <span className="dp-pill highlight">{m.matchPct}% ready ({m.matchedCount}/{m.requiredCount})</span>
                </div>
                {m.usesExpiringSoonCount > 0 && (
                  <span style={{ fontSize: '0.82rem', color: 'var(--dp-ok)', fontWeight: 600 }}>
                    Uses {m.usesExpiringSoonCount} soon-to-expire pantry item(s)!
                  </span>
                )}
                {m.missingIngredients.length > 0 && (
                  <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
                    Missing: {m.missingIngredients.join(', ')}
                  </span>
                )}
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      setSelectedId(m.recipe.id);
                      setShowWhatCanIMake(false);
                    }}
                  >
                    Open Recipe
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', gap: 16 }}>
          {/* Recipe List */}
          <div className="dp-stack" style={{ gap: 8 }}>
            <input className="dp-input" placeholder="Search recipes or ingredients…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {filteredRecipes.map((r) => (
              <button
                key={r.id}
                type="button"
                className="dp-card"
                style={{
                  textAlign: 'start',
                  padding: 10,
                  cursor: 'pointer',
                  borderColor: r.id === activeRecipe?.id ? 'var(--dp-accent)' : undefined,
                  borderWidth: r.id === activeRecipe?.id ? 2 : 1,
                }}
                onClick={() => setSelectedId(r.id)}
              >
                <strong>{r.title}</strong>
                <div className="dp-muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                  {r.payload.prepMin + r.payload.cookMin}m · Serves {r.payload.servings} · Made {r.payload.madeCount}×
                </div>
              </button>
            ))}
          </div>

          {/* Recipe Card Detail */}
          {activeRecipe ? (
            <div className="dp-card dp-stack" style={{ padding: 18 }}>
              <div className="dp-between">
                <div>
                  <h2 style={{ fontSize: '1.45rem' }}>{activeRecipe.title}</h2>
                  <div className="dp-row" style={{ marginTop: 6 }}>
                    <span className="dp-pill">Prep {activeRecipe.payload.prepMin}m</span>
                    <span className="dp-pill">Cook {activeRecipe.payload.cookMin}m</span>
                    <span className="dp-pill">Difficulty: {activeRecipe.payload.difficulty}</span>
                    <span className="dp-pill">Made {activeRecipe.payload.madeCount}×</span>
                    {activeRecipe.payload.dietaryBadges.map((b) => (
                      <span key={b} className="dp-pill highlight">{b}</span>
                    ))}
                  </div>
                </div>
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary"
                    onClick={() =>
                      setCookingSession({
                        recipeId: activeRecipe.id,
                        title: activeRecipe.title,
                        snapshot: structuredClone(activeRecipe.payload),
                        scaleFactor: targetServings / Math.max(1, activeRecipe.payload.servings || 1),
                        stepIdx: 0,
                        checkedIngIds: new Set(),
                        finishOpen: false,
                      })
                    }
                  >
                    <Flame size={15} /> Start Cooking Mode
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={async () => {
                      const added = await generateNetGroceryItems({
                        recipeIds: [activeRecipe.id],
                        todayIso: logicalToday,
                      });
                      pushToast(`Added ${added} net missing item(s) to Grocery List`, { canUndo: true });
                      setActiveView('shopping');
                    }}
                  >
                    <ShoppingCart size={14} /> + Net Groceries
                  </button>
                  <button type="button" className="dp-icon-btn" title="Print recipe card" onClick={() => window.print()}>
                    <Printer size={15} />
                  </button>
                  <button type="button" className="dp-icon-btn" title="Export Markdown" onClick={() => exportMarkdown(activeRecipe)}>
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Move recipe to Trash (historical Meal Plans stay intact)"
                    onClick={async () => {
                      await softDeleteRecord(activeRecipe.id);
                      setSelectedId(null);
                      pushToast('Recipe moved to Trash (past Meal Plan entries kept with badge).', { canUndo: true });
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {heroUrl ? (
                <img src={heroUrl} alt={activeRecipe.title} style={{ maxHeight: 220, objectFit: 'cover', borderRadius: 10 }} />
              ) : (
                <label className="dp-btn dp-btn-sm" style={{ alignSelf: 'flex-start' }}>
                  + Add Hero Photo (stored in Blob store)
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const stored = await storeBlob(f, f.name);
                      await updateRecord<RecipePayload>(activeRecipe.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, heroBlobId: stored.hash },
                      }));
                      pushToast('Saved hero photo');
                    }}
                  />
                </label>
              )}

              {/* Serving Scaler & Density Unit Converter */}
              <div className="dp-card dp-between" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
                <div className="dp-row">
                  <strong>Servings:</strong>
                  {[0.5, 1, 2, 3].map((mult) => {
                    const s = Math.max(1, Math.round(activeRecipe.payload.servings * mult * 10) / 10);
                    return (
                      <button
                        key={mult}
                        type="button"
                        className={`dp-btn dp-btn-sm ${targetServings === s ? 'dp-btn-primary' : ''}`}
                        onClick={() => setTargetServings(s)}
                      >
                        {mult}× ({s})
                      </button>
                    );
                  })}
                  <input
                    aria-label="Custom servings"
                    type="number"
                    min={0.5}
                    step={0.5}
                    className="dp-input"
                    style={{ width: 68, padding: '3px 6px' }}
                    value={targetServings}
                    onChange={(e) => setTargetServings(Math.max(0.5, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="dp-row">
                  {(['original', 'metric', 'us'] as const).map((um) => (
                    <button
                      key={um}
                      type="button"
                      className={`dp-btn dp-btn-sm ${unitMode === um ? 'dp-btn-primary' : ''}`}
                      onClick={() => setUnitMode(um)}
                    >
                      {um === 'original' ? 'Original' : um === 'metric' ? 'Metric (g/ml)' : 'US Cups'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ingredients List */}
              <div className="dp-stack" style={{ gap: 6 }}>
                <div className="dp-section-title">Ingredients</div>
                {scaledIngredients.map((si) => (
                  <div key={si.ingredient.id} style={{ padding: '4px 0', borderBottom: '1px dotted var(--dp-border)' }}>
                    <div className="dp-between">
                      <span>
                        <strong>
                          {si.displayQty} {si.displayUnit}
                        </strong>{' '}
                        {si.ingredient.name}
                        {si.ingredient.prepText ? <span className="dp-muted">, {si.ingredient.prepText}</span> : null}
                      </span>
                      {si.densityUsedLabel && <span className="dp-pill">{si.densityUsedLabel}</span>}
                    </div>
                    {si.nonLinearNote && <div style={{ fontSize: '0.76rem', color: 'var(--dp-warn)' }}>⚠ {si.nonLinearNote}</div>}
                    {si.conversionWarning && <div style={{ fontSize: '0.76rem', color: 'var(--dp-warn)' }}>⚠ {si.conversionWarning}</div>}
                  </div>
                ))}
              </div>

              {/* Numbered Steps with inline tappable Timer Chips */}
              <div className="dp-stack" style={{ gap: 10 }}>
                <div className="dp-section-title">Method</div>
                {activeRecipe.payload.steps.map((st) => (
                  <div key={st.id} className="dp-row" style={{ alignItems: 'flex-start' }}>
                    <span className="dp-pill highlight">{st.order}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0 }}>{st.text}</p>
                      {st.durationMin && (
                        <button
                          type="button"
                          className="dp-btn dp-btn-sm"
                          style={{ marginTop: 6 }}
                          onClick={() => void startCountdownTimer(`${activeRecipe.title} — Step ${st.order}`, st.durationMin! * 60, 'cooking', activeRecipe.id)}
                        >
                          <Timer size={13} /> Start {st.durationMin}m Timer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="dp-empty">
              <strong>No recipes yet</strong>
              <button type="button" className="dp-btn dp-btn-primary" onClick={() => setClipperOpen(true)}>
                Import your first recipe
              </button>
            </div>
          )}
        </div>
      )}

      {/* Smart Recipe Clipper Modal (URL via Docker proxy + 100% Offline Raw Text) */}
      <ModalDialog open={clipperOpen} onClose={() => setClipperOpen(false)} title="Smart Recipe Clipper (URL or Offline Text)" wide>
        <div className="dp-stack">
          <div className="dp-card dp-stack" style={{ padding: 12 }}>
            <strong><Globe size={14} /> Import from URL (via Docker CORS-Free Proxy)</strong>
            <div className="dp-row">
              <input className="dp-input" style={{ flex: 1 }} placeholder="https://example.com/recipe..." value={clipUrl} onChange={(e) => setClipUrl(e.target.value)} />
              <button type="button" className="dp-btn dp-btn-primary" disabled={clippingBusy} onClick={() => void handleClipUrl()}>
                {clippingBusy ? 'Fetching…' : 'Clip URL'}
              </button>
            </div>
          </div>

          <div className="dp-card dp-stack" style={{ padding: 12 }}>
            <strong>Paste Raw Recipe Text (Works 100% Offline)</strong>
            <textarea
              className="dp-textarea"
              style={{ minHeight: 170 }}
              placeholder={`Garlic Herb Pasta\nServes: 4\nPrep: 10m\nCook: 15m\n\nIngredients:\n2 cups all-purpose flour\n2 tbsp olive oil\n1 tsp table salt\n\nSteps:\n1. Boil pasta for 10 minutes until al dente.\n2. Toss with olive oil and herbs for 3 minutes.`}
              value={clipText}
              onChange={(e) => setClipText(e.target.value)}
            />
            <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="dp-btn dp-btn-primary" onClick={() => void handleClipRawText()}>
                Parse & Save Recipe Offline
              </button>
            </div>
          </div>
        </div>
      </ModalDialog>

      {/* Bundled Appendix B Cooking Density Reference Modal */}
      <ModalDialog open={densityDrawerOpen} onClose={() => setDensityDrawerOpen(false)} title="Bundled Cooking Density Reference (Appendix B)" wide>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--dp-border)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Ingredient</th>
              <th style={{ padding: 8 }}>Grams / US Cup</th>
              <th style={{ padding: 8 }}>Density</th>
              <th style={{ padding: 8 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {COOKING_DENSITIES.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--dp-border)' }}>
                <td style={{ padding: 8 }}><strong>{d.ingredient}</strong></td>
                <td style={{ padding: 8 }}>{d.gramsPerCup} g / cup</td>
                <td style={{ padding: 8 }}>{d.densityGPerMl.toFixed(2)} g/ml</td>
                <td style={{ padding: 8 }} className="dp-muted">{d.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ModalDialog>

      {/* Hands-Free Cooking Mode Fullscreen Overlay (Section 11.03) */}
      {cookingSession && (
        <div className="dp-fullscreen-overlay dp-cooking-mode" role="dialog" aria-label="Hands-Free Cooking Mode">
          <div className="dp-between" style={{ maxWidth: 960, width: '100%', margin: '0 auto 18px' }}>
            <div>
              <h2>🍳 {cookingSession.title}</h2>
              <span className="dp-muted" style={{ fontSize: '0.9rem' }}>
                Screen Wake Lock active · Press Spacebar to advance step · Snapshot isolated from edits
              </span>
            </div>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={() => setCookingSession((p) => (p ? { ...p, finishOpen: true } : null))}
              >
                Finish & Reconcile Pantry
              </button>
              <button type="button" className="dp-btn" onClick={() => setCookingSession(null)}>
                Exit
              </button>
            </div>
          </div>

          <div className="dp-grid-2" style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}>
            {/* Mise-en-place Ingredient Check-Off */}
            <div className="dp-card dp-stack">
              <h3>Mise-en-Place</h3>
              {scaleAndConvertIngredients(
                cookingSession.snapshot,
                cookingSession.snapshot.servings * cookingSession.scaleFactor,
                unitMode
              ).map((si) => {
                const checked = cookingSession.checkedIngIds.has(si.ingredient.id);
                return (
                  <label key={si.ingredient.id} className="dp-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: 20, height: 20 }}
                      checked={checked}
                      onChange={() =>
                        setCookingSession((prev) => {
                          if (!prev) return null;
                          const next = new Set(prev.checkedIngIds);
                          if (next.has(si.ingredient.id)) next.delete(si.ingredient.id);
                          else next.add(si.ingredient.id);
                          return { ...prev, checkedIngIds: next };
                        })
                      }
                    />
                    <span style={{ textDecoration: checked ? 'line-through' : undefined, opacity: checked ? 0.55 : 1 }}>
                      <strong>{si.displayQty} {si.displayUnit}</strong> {si.ingredient.name}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Active Step Focus */}
            <div className="dp-card dp-stack" style={{ justifyContent: 'space-between' }}>
              <div className="dp-stack">
                <div className="dp-between">
                  <span className="dp-pill highlight">
                    Step {cookingSession.stepIdx + 1} of {Math.max(1, cookingSession.snapshot.steps.length)}
                  </span>
                </div>
                <p style={{ fontSize: '1.45rem', margin: '8px 0' }}>
                  {cookingSession.snapshot.steps[cookingSession.stepIdx]?.text || 'Enjoy your meal!'}
                </p>
                {cookingSession.snapshot.steps[cookingSession.stepIdx]?.durationMin && (
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      const st = cookingSession.snapshot.steps[cookingSession.stepIdx];
                      void startCountdownTimer(`${cookingSession.title} Step ${st.order}`, st.durationMin! * 60, 'cooking', cookingSession.recipeId);
                    }}
                  >
                    <Play size={16} /> Launch {cookingSession.snapshot.steps[cookingSession.stepIdx].durationMin}m Step Timer
                  </button>
                )}
              </div>

              <div className="dp-between">
                <button
                  type="button"
                  className="dp-btn"
                  disabled={cookingSession.stepIdx <= 0}
                  onClick={() => setCookingSession((p) => (p ? { ...p, stepIdx: p.stepIdx - 1 } : null))}
                >
                  ← Previous Step
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={() => {
                    if (cookingSession.stepIdx < cookingSession.snapshot.steps.length - 1) {
                      setCookingSession((p) => (p ? { ...p, stepIdx: p.stepIdx + 1 } : null));
                    } else {
                      setCookingSession((p) => (p ? { ...p, finishOpen: true } : null));
                    }
                  }}
                >
                  {cookingSession.stepIdx < cookingSession.snapshot.steps.length - 1 ? 'Next Step →' : 'Finish Cooking ✓'}
                </button>
              </div>
            </div>
          </div>

          <ModalDialog
            open={cookingSession.finishOpen}
            onClose={() => setCookingSession((p) => (p ? { ...p, finishOpen: false } : null))}
            title="Finish Flow — Deduct Pantry & Log Leftovers"
          >
            <div className="dp-stack" style={{ fontSize: '0.95rem' }}>
              <label className="dp-row">
                <input type="checkbox" checked={deductPantry} onChange={(e) => setDeductPantry(e.target.checked)} />
                <span>Deduct scaled ingredients from oldest unexpired Pantry Lots (FIFO)</span>
              </label>
              <div className="dp-grid-3">
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Leftover Portions</span>
                  <input type="number" min={0} max={24} className="dp-input" value={leftoverPortions} onChange={(e) => setLeftoverPortions(Number(e.target.value) || 0)} />
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Storage Zone</span>
                  <select className="dp-select" value={leftoverZone} onChange={(e) => setLeftoverZone(e.target.value as 'Fridge' | 'Freezer')}>
                    <option value="Fridge">Fridge</option>
                    <option value="Freezer">Freezer</option>
                  </select>
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Eat-By Guidance (days)</span>
                  <input type="number" min={1} max={180} className="dp-input" value={eatByDays} onChange={(e) => setEatByDays(Number(e.target.value) || 3)} />
                </label>
              </div>
              <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={async () => {
                    const res = await finishCookingSession(cookingSession.recipeId, {
                      scaleFactor: cookingSession.scaleFactor,
                      deductPantry,
                      leftoverPortions,
                      leftoverZone,
                      eatByDays,
                      todayIso: logicalToday,
                    });
                    setCookingSession(null);
                    pushToast(
                      `Cooked! Deducted ${res.deductedLots} pantry lot(s)${res.createdLeftoverId ? ` & logged ${leftoverPortions} leftover portions.` : '.'}`,
                      { canUndo: true }
                    );
                  }}
                >
                  Confirm Finish (1-Click Undoable)
                </button>
              </div>
            </div>
          </ModalDialog>
        </div>
      )}
    </div>
  );
};
