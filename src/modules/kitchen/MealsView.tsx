import { useViewFormGuard, useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import { History, Plus, Search, ShoppingCart, Trash2, Utensils } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, formatDateLocalized } from '../../core/temporal';
import {
  generateNetGroceryItems,
  moveMealPlanDate,
  scheduleMealWithPrepReminder,
} from '../../core/kitchenActions';
import { createRecord, softDeleteRecord } from '../../core/repository';
import type { FoodLogPayload, LifeRecord, MealPlanPayload, PantryLotPayload, RecipePayload } from '../../core/types';

const SLOTS: Array<MealPlanPayload['slot']> = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MealsView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, pushToast, setActiveView } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'warn' }));
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [customMealText, setCustomMealText] = useState('');
  const [addPrepReminder, setAddPrepReminder] = useState(true);
  const [subTab, setSubTab] = useState<'planner' | 'history'>('planner');

  // Food History & Logging State (Section 14)
  const [logFoodName, setLogFoodName] = useState('');
  const [logMealCat, setLogMealCat] = useState('lunch');
  const [logPortionQty, setLogPortionQty] = useState(1);
  const [logPortionUnit, setLogPortionUnit] = useState('serving');
  const [logIngredients, setLogIngredients] = useState('');
  const [logRating, setLogRating] = useState(4);
  const [logNotes, setLogNotes] = useState('');
  const [histQuery, setHistQuery] = useState('');
  const [histCatFilter, setHistCatFilter] = useState('all');
  const [histFrom, setHistFrom] = useState(() => addDaysIso(logicalToday, -30));
  const [histTo, setHistTo] = useState(logicalToday);

  const foodLogs = useMemo(
    () =>
      (records.filter((r) => r.type === 'food_log') as Array<LifeRecord<FoodLogPayload>>).sort((a, b) =>
        `${b.payload.date} ${b.payload.time || ''}`.localeCompare(`${a.payload.date} ${a.payload.time || ''}`)
      ),
    [records]
  );

  // Unified Food History combining explicit food_log entries + planned meals (zero duplicate re-entry!)
  const unifiedFoodHistory = useMemo(() => {
    const items: Array<{
      id: string;
      source: 'food_log' | 'meal_plan';
      date: string;
      time: string;
      category: string;
      name: string;
      portion?: string;
      ingredients: string[];
      rating?: number;
      notes?: string;
    }> = [];
    for (const fl of foodLogs) {
      items.push({
        id: fl.id,
        source: 'food_log',
        date: fl.payload.date,
        time: fl.payload.time || '',
        category: fl.payload.mealCategory || 'meal',
        name: fl.payload.foodName || fl.title,
        portion: fl.payload.portionQty ? `${fl.payload.portionQty} ${fl.payload.portionUnit || 'serving'}` : undefined,
        ingredients: fl.payload.ingredients ?? [],
        rating: fl.payload.rating,
        notes: fl.payload.notes,
      });
    }
    const existingKeys = new Set(items.map((i) => `${i.date}|${i.category}|${i.name.toLowerCase()}`));
    for (const mp of records.filter((r) => r.type === 'meal_plan') as Array<LifeRecord<MealPlanPayload>>) {
      const k = `${mp.payload.date}|${mp.payload.slot}|${mp.title.toLowerCase()}`;
      if (existingKeys.has(k)) continue;
      items.push({
        id: mp.id,
        source: 'meal_plan',
        date: mp.payload.date,
        time: '',
        category: mp.payload.slot,
        name: mp.title,
        portion: mp.payload.servings ? `${mp.payload.servings} serving(s)` : undefined,
        ingredients: [],
        notes: mp.payload.notes,
      });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [foodLogs, records]);

  const filteredFoodHistory = useMemo(() => {
    const q = histQuery.trim().toLowerCase();
    return unifiedFoodHistory.filter((it) => {
      if (histFrom && it.date < histFrom) return false;
      if (histTo && it.date > histTo) return false;
      if (histCatFilter !== 'all' && it.category.toLowerCase() !== histCatFilter) return false;
      if (q) {
        const hay = `${it.name} ${it.category} ${it.ingredients.join(' ')} ${it.notes ?? ''} ${it.date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedFoodHistory, histQuery, histCatFilter, histFrom, histTo]);

  const foodInsights = useMemo(() => {
    const monthCutoff = addDaysIso(logicalToday, -30);
    const freqMap = new Map<string, { name: string; count: number; lastDate: string }>();
    const bySlot = new Map<string, Map<string, number>>();
    for (const it of unifiedFoodHistory) {
      const key = it.name.trim().toLowerCase();
      if (it.date >= monthCutoff && it.date <= logicalToday) {
        const cur = freqMap.get(key) ?? { name: it.name, count: 0, lastDate: it.date };
        cur.count++;
        if (it.date > cur.lastDate) cur.lastDate = it.date;
        freqMap.set(key, cur);
      }
      const sm = bySlot.get(it.category.toLowerCase()) ?? new Map<string, number>();
      sm.set(it.name, (sm.get(it.name) ?? 0) + 1);
      bySlot.set(it.category.toLowerCase(), sm);
    }
    const topMonth = Array.from(freqMap.values()).sort((a, b) => b.count - a.count).slice(0, 6);
    const topFor = (slot: string) => {
      const m = bySlot.get(slot);
      if (!m) return '—';
      const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? `${sorted[0][0]} (${sorted[0][1]}×)` : '—';
    };
    return {
      topMonth,
      topBreakfast: topFor('breakfast'),
      topLunch: topFor('lunch'),
      topDinner: topFor('dinner'),
    };
  }, [unifiedFoodHistory, logicalToday]);

  const recipes = useMemo(
    () => records.filter((r) => r.type === 'recipe') as Array<LifeRecord<RecipePayload>>,
    [records]
  );
  const leftovers = useMemo(
    () =>
      (records.filter((r) => r.type === 'pantry_lot') as Array<LifeRecord<PantryLotPayload>>).filter(
        (l) => l.payload.isLeftover && l.payload.quantity > 0
      ),
    [records]
  );
  const meals = useMemo(
    () => records.filter((r) => r.type === 'meal_plan') as Array<LifeRecord<MealPlanPayload>>,
    [records]
  );

  const mealsByDate = useMemo(() => {
    const map = new Map<string, typeof meals>();
    for (const meal of meals) { const group = map.get(meal.payload.date); if (group) group.push(meal); else map.set(meal.payload.date, [meal]); }
    return map;
  }, [meals]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(activeDate, i)), [activeDate]);

  const weekNutrition = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    let cal = 0;
    let protein = 0;
    for (const m of meals) {
      if (m.payload.date >= weekDates[0] && m.payload.date <= weekDates[6] && m.payload.recipeId) {
        const nut = byId.get(m.payload.recipeId)?.payload.nutrition;
        if (nut) {
          cal += nut.calories ?? 0;
          protein += nut.proteinG ?? 0;
        }
      }
    }
    return { cal, protein };
  }, [meals, recipes, weekDates]);

  const handleAssignMeal = async (date: string, slot: MealPlanPayload['slot']) => {
    const rec = recipes.find((r) => r.id === selectedRecipeId);
    if (rec) {
      await scheduleMealWithPrepReminder({
        date,
        slot,
        entryType: 'recipe',
        title: rec.title,
        recipeId: rec.id,
        servings: rec.payload.servings,
        addPrepReminder,
      });
      pushToast(`Planned "${rec.title}" for ${date} ${slot}${addPrepReminder ? ' (+ prep reminder)' : ''}`, { canUndo: true });
      return;
    }
    const text = customMealText.trim() || 'Eating Out / Free Choice';
    await scheduleMealWithPrepReminder({
      date,
      slot,
      entryType: customMealText.trim() ? 'text' : 'eating_out',
      title: text,
      addPrepReminder: false,
    });
    setCustomMealText('');
    pushToast(`Planned "${text}" for ${date} ${slot}`, { canUndo: true });
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>
            <Utensils size={20} style={{ verticalAlign: '-3px' }} /> Weekly Meal Planner
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Drag meals between days (prep reminders move automatically) · Generate net aisle-sorted groceries in 1 click
          </p>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className={`dp-btn dp-btn-sm ${subTab === 'planner' ? 'dp-btn-primary' : ''}`} onClick={() => setSubTab('planner')}>
            <Utensils size={14} /> Weekly Planner
          </button>
          <button type="button" className={`dp-btn dp-btn-sm ${subTab === 'history' ? 'dp-btn-primary' : ''}`} onClick={() => setSubTab('history')}>
            <History size={14} /> Food History ({unifiedFoodHistory.length})
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -7))}>← Prev Week</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>This Week</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 7))}>Next Week →</button>
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm"
            onClick={guardAction('action-1', async () => {
              const count = await generateNetGroceryItems({
                mealDateStart: weekDates[0],
                mealDateEnd: weekDates[6],
                includeParDrops: true,
                todayIso: logicalToday,
              });
              pushToast(`Generated ${count} net grocery item(s) for ${weekDates[0]} → ${weekDates[6]}`, { canUndo: true });
              setActiveView('shopping');
            })}
          >
            <ShoppingCart size={14} /> Generate Week Groceries
          </button>
        </div>
      </div>

      {subTab === 'history' ? (
        <div className="dp-stack" style={{ gap: 14 }}>
          {/* Quick Food Log Entry */}
          <form
            className="dp-card dp-stack"
            style={{ padding: 12, gap: 8 }}
            onSubmit={guardForm('form-1', async (e) => {
              e.preventDefault();
              if (!logFoodName.trim()) return;
              await createRecord<FoodLogPayload>('food_log', logFoodName.trim(), {
                date: activeDate,
                time: new Date().toTimeString().slice(0, 5),
                mealCategory: logMealCat,
                foodName: logFoodName.trim(),
                portionQty: logPortionQty,
                portionUnit: logPortionUnit,
                ingredients: logIngredients.split(',').map((s) => s.trim()).filter(Boolean),
                rating: logRating,
                notes: logNotes.trim() || undefined,
              });
              setLogFoodName('');
              setLogIngredients('');
              setLogNotes('');
              pushToast(`Logged ${logMealCat} to Food History!`);
            })}
          >
            <strong>Log Meal or Drink for {activeDate}</strong>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Food / meal / drink…" value={logFoodName} onChange={(e) => setLogFoodName(e.target.value)} />
              <input list="dp-meal-cats" className="dp-input" style={{ width: 120 }} value={logMealCat} onChange={(e) => setLogMealCat(e.target.value)} />
              <datalist id="dp-meal-cats">
                <option value="breakfast" />
                <option value="lunch" />
                <option value="dinner" />
                <option value="snack" />
                <option value="drink" />
              </datalist>
              <input type="number" step={0.25} min={0.25} className="dp-input" style={{ width: 68 }} value={logPortionQty} onChange={(e) => setLogPortionQty(Number(e.target.value) || 1)} />
              <input className="dp-input" style={{ width: 92 }} value={logPortionUnit} onChange={(e) => setLogPortionUnit(e.target.value)} placeholder="unit (oz/cup)" />
              <select className="dp-select" style={{ width: 'auto' }} value={logRating} onChange={(e) => setLogRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{'★'.repeat(r)}</option>)}
              </select>
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Log</button>
            </div>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input className="dp-input" style={{ flex: 1 }} placeholder="Ingredients (comma separated)…" value={logIngredients} onChange={(e) => setLogIngredients(e.target.value)} />
              <input className="dp-input" style={{ flex: 1 }} placeholder="Preparation notes…" value={logNotes} onChange={(e) => setLogNotes(e.target.value)} />
            </div>
          </form>

          {/* Instant Food History Insights */}
          <div className="dp-grid-3" style={{ gap: 10 }}>
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
              <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Most Common Breakfast</span>
              <strong>{foodInsights.topBreakfast}</strong>
            </div>
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
              <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Most Common Lunch</span>
              <strong>{foodInsights.topLunch}</strong>
            </div>
            <div className="dp-card dp-stack" style={{ padding: 12, gap: 4 }}>
              <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Most Common Dinner</span>
              <strong>{foodInsights.topDinner}</strong>
            </div>
          </div>

          {foodInsights.topMonth.length > 0 && (
            <div className="dp-card dp-row" style={{ padding: 10, flexWrap: 'wrap', gap: 6, fontSize: '0.82rem' }}>
              <strong>Most Frequent (Last 30d):</strong>
              {foodInsights.topMonth.map((m) => (
                <button key={m.name} type="button" className="dp-pill highlight" style={{ cursor: 'pointer' }} onClick={() => setHistQuery(m.name)}>
                  {m.name} · {m.count}× (last {m.lastDate})
                </button>
              ))}
            </div>
          )}

          {/* Search & Date-Range Filter */}
          <div className="dp-card dp-row" style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}>
            <Search size={15} className="dp-muted" />
            <input className="dp-input" style={{ flex: 2, minWidth: 180 }} placeholder='Search foods, ingredients, or "last time I ate…"' value={histQuery} onChange={(e) => setHistQuery(e.target.value)} />
            <select className="dp-select" style={{ width: 'auto' }} value={histCatFilter} onChange={(e) => setHistCatFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
              <option value="drink">Drink</option>
            </select>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            <span>to</span>
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => { setHistFrom(addDaysIso(logicalToday, -7)); setHistTo(logicalToday); }}>
              Last 7d
            </button>
          </div>

          <div className="dp-stack" style={{ gap: 6 }}>
            {filteredFoodHistory.length === 0 ? (
              <p className="dp-muted">No matching food history records in this date range.</p>
            ) : (
              filteredFoodHistory.map((it) => (
                <div key={it.id} className="dp-card dp-between" style={{ padding: '8px 12px', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong>{it.name}</strong>{' '}
                    <span className="dp-pill">{it.category}</span>{' '}
                    {it.portion && <span className="dp-pill">{it.portion}</span>}{' '}
                    {it.rating ? <span style={{ color: 'var(--dp-accent)' }}>{'★'.repeat(it.rating)}</span> : null}
                    <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
                      {it.date}{it.time ? ` · ${it.time}` : ''}{it.ingredients.length ? ` · Ingredients: ${it.ingredients.join(', ')}` : ''}{it.notes ? ` · ${it.notes}` : ''}
                    </div>
                  </div>
                  <button type="button" className="dp-icon-btn" onClick={() => void softDeleteRecord(it.id)} title="Move to Trash">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
      <>
      {/* Picker & Template Bar */}
      <div className="dp-card dp-row" style={{ padding: 12 }}>
        <select
          aria-label="Pick recipe to assign"
          className="dp-select"
          style={{ flex: 1, minWidth: 200 }}
          value={selectedRecipeId}
          onChange={(e) => setSelectedRecipeId(e.target.value)}
        >
          <option value="">Select recipe (or type free-text meal)…</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>🍳 {r.title} ({r.payload.servings} srv)</option>
          ))}
        </select>
        <input
          className="dp-input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="Or eating out / free text…"
          value={customMealText}
          onChange={(e) => setCustomMealText(e.target.value)}
        />
        <button
          type="button"
          className="dp-btn dp-btn-sm"
          title="Save as a 1-tap favorite meal"
          onClick={() => {
            const fav = customMealText.trim();
            if (!fav) return;
            if (!(settings.customMealFavorites ?? []).includes(fav)) {
              void patchSettings({ customMealFavorites: [...(settings.customMealFavorites ?? []), fav] });
              pushToast(`Saved favorite meal "${fav}"`);
            }
          }}
        >
          ★ Save Fav
        </button>
        <label className="dp-row" style={{ fontSize: '0.84rem' }}>
          <input type="checkbox" checked={addPrepReminder} onChange={(e) => setAddPrepReminder(e.target.checked)} />
          <span>Auto defrost/prep reminder</span>
        </label>
        {weekNutrition.cal > 0 && (
          <span className="dp-pill">Week est: {weekNutrition.cal} kcal · {weekNutrition.protein}g protein</span>
        )}
      </div>

      {(settings.customMealFavorites ?? []).length > 0 && (
        <div className="dp-row" style={{ fontSize: '0.82rem', gap: 6 }}>
          <span className="dp-muted">★ Quick Favorites (tap then click + on any day):</span>
          {settings.customMealFavorites.map((fav) => (
            <span key={fav} className="dp-pill">
              <button
                type="button"
                className="dp-btn dp-btn-ghost dp-btn-sm"
                style={{ padding: 0, minHeight: 'auto' }}
                onClick={() => {
                  setSelectedRecipeId('');
                  setCustomMealText(fav);
                }}
              >
                {fav}
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-ghost dp-btn-sm"
                style={{ padding: '0 3px', minHeight: 'auto' }}
                onClick={() => void patchSettings({ customMealFavorites: settings.customMealFavorites.filter((x) => x !== fav) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {leftovers.length > 0 && (
        <div className="dp-row" style={{ fontSize: '0.82rem' }}>
          <span className="dp-muted">Available leftovers to plan:</span>
          {leftovers.map((l) => (
            <button
              key={l.id}
              type="button"
              className="dp-pill highlight"
              style={{ cursor: 'pointer' }}
              onClick={async () => {
                await scheduleMealWithPrepReminder({
                  date: activeDate,
                  slot: 'lunch',
                  entryType: 'leftover',
                  title: l.payload.ingredientName,
                  leftoverLotId: l.id,
                  addPrepReminder: false,
                });
                pushToast(`Scheduled leftover "${l.payload.ingredientName}" for lunch`);
              }}
            >
              🍱 {l.payload.ingredientName} ({l.payload.quantity})
            </button>
          ))}
        </div>
      )}

      {/* 7-Day Drag-and-Drop Meal Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10 }}>
        {weekDates.map((d) => {
          const dayMeals = mealsByDate.get(d) ?? [];
          return (
            <div
              key={d}
              className="dp-card dp-stack"
              style={{ padding: 10, gap: 8, borderColor: d === logicalToday ? 'var(--dp-accent)' : undefined }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const mealId = e.dataTransfer.getData('application/x-dayplana-meal');
                if (mealId) {
                  await moveMealPlanDate(mealId, d);
                  pushToast(`Moved meal & prep reminder to ${d}`, { canUndo: true });
                }
              }}
            >
              <strong>{formatDateLocalized(d, settings.locale, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              {SLOTS.map((slot) => {
                const slotMeals = dayMeals.filter((m) => m.payload.slot === slot);
                return (
                  <div key={slot} style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 6 }}>
                    <div className="dp-between" style={{ fontSize: '0.75rem' }}>
                      <span className="dp-muted" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{slot}</span>
                      <button
                        type="button"
                        className="dp-btn dp-btn-ghost dp-btn-sm"
                        style={{ padding: '1px 5px' }}
                        onClick={guardAction('action-2', () => handleAssignMeal(d, slot))}
                      >
                        +
                      </button>
                    </div>
                    {slotMeals.map((m) => (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('application/x-dayplana-meal', m.id)}
                        className="dp-between"
                        style={{
                          marginTop: 4,
                          padding: '4px 6px',
                          borderRadius: 6,
                          background: 'var(--dp-surface-2)',
                          fontSize: '0.82rem',
                          cursor: 'grab',
                        }}
                      >
                        <span>
                          {m.title}
                          {m.payload.deletedRecipeName && (
                            <span className="dp-pill" style={{ marginInlineStart: 4, fontSize: '0.68rem' }}>
                              Deleted Recipe
                            </span>
                          )}
                        </span>
                        <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} onClick={() => void softDeleteRecord(m.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
};
