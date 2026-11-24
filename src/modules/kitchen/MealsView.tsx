import React, { useMemo, useState } from 'react';
import { ShoppingCart, Trash2, Utensils } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, formatDateLocalized } from '../../core/temporal';
import {
  generateNetGroceryItems,
  moveMealPlanDate,
  scheduleMealWithPrepReminder,
} from '../../core/kitchenActions';
import { softDeleteRecord } from '../../core/repository';
import type { LifeRecord, MealPlanPayload, PantryLotPayload, RecipePayload } from '../../core/types';

const SLOTS: Array<MealPlanPayload['slot']> = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MealsView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, pushToast, setActiveView } = useApp();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [customMealText, setCustomMealText] = useState('');
  const [addPrepReminder, setAddPrepReminder] = useState(true);

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
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -7))}>← Prev Week</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>This Week</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 7))}>Next Week →</button>
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm"
            onClick={async () => {
              const count = await generateNetGroceryItems({
                mealDateStart: weekDates[0],
                mealDateEnd: weekDates[6],
                includeParDrops: true,
                todayIso: logicalToday,
              });
              pushToast(`Generated ${count} net grocery item(s) for ${weekDates[0]} → ${weekDates[6]}`, { canUndo: true });
              setActiveView('shopping');
            }}
          >
            <ShoppingCart size={14} /> Generate Week Groceries
          </button>
        </div>
      </div>

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
          const dayMeals = meals.filter((m) => m.payload.date === d);
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
                        onClick={() => void handleAssignMeal(d, slot)}
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
    </div>
  );
};
