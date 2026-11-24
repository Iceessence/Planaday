import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db';
import { createRecord, performUndo, updateRecord } from '../src/core/repository';
import {
  finishCookingSession,
  generateNetGroceryItems,
  moveMealPlanDate,
  parseRawRecipeText,
  rankWhatCanIMake,
  reconcileFinishedShopping,
  scaleAndConvertIngredients,
  scheduleMealWithPrepReminder,
} from '../src/core/kitchenActions';
import { extractRecipeFromHtml } from '../server/recipeProxy';
import type { CalendarEventPayload, GroceryItemPayload, PantryLotPayload, RecipePayload } from '../src/core/types';

describe('Phase 3 — Kitchen OS Full Kitchen Week Verification Gate', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.undoStack.clear();
    await db.redoStack.clear();
    await db.settings.clear();
  });

  it('parses recipes both via Docker JSON-LD proxy and 100% offline raw text, scales with Appendix B densities & warns on unknown density', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Rustic Honey Bread',
      recipeYield: '4 servings',
      prepTime: 'PT15M',
      cookTime: 'PT35M',
      recipeIngredient: ['2 cups all-purpose flour', '2 tbsp honey', '1 tsp table salt'],
      recipeInstructions: [{ text: 'Mix and rest for 10 minutes.' }, { text: 'Bake for 35 minutes.' }],
    })}</script></head></html>`;

    const proxied = extractRecipeFromHtml(html, 'https://recipes.example/bread');
    expect(proxied.title).toBe('Rustic Honey Bread');
    expect(proxied.prepMin).toBe(15);
    expect(proxied.cookMin).toBe(35);
    expect(proxied.ingredients).toHaveLength(3);

    const offline = parseRawRecipeText(
      `Lemon Oat Loaf\nServes: 2\nIngredients:\n1 cup all-purpose flour\n1 cup rolled oats\n1 tsp table salt\n1 cup dragonfruit dust\nSteps:\n1. Bake for 25 minutes.`
    );
    expect(offline.title).toBe('Lemon Oat Loaf');
    expect(offline.payload.steps[0].durationMin).toBe(25);

    // Scale 2x (2 -> 4 servings) and convert to Metric using Appendix B density table!
    const scaledMetric = scaleAndConvertIngredients(offline.payload, 4, 'metric');
    const flour = scaledMetric.find((x) => x.ingredient.name.includes('flour'))!;
    expect(flour.displayUnit).toBe('g');
    expect(flour.displayQty).toBe('240'); // 2 cups * 120 g/cup exact Appendix B!

    const oats = scaledMetric.find((x) => x.ingredient.name.includes('oats'))!;
    expect(oats.displayQty).toBe('180'); // 2 cups * 90 g/cup exact Appendix B!

    const salt = scaledMetric.find((x) => x.ingredient.name.includes('salt'))!;
    expect(salt.nonLinearNote).toBeDefined();

    const mystery = scaledMetric.find((x) => x.ingredient.name.includes('dragonfruit'))!;
    expect(mystery.conversionWarning).toContain('Unknown density');
  });

  it('executes the complete Kitchen Week flow: import -> plan meal (+moving prep reminder) -> net grocery -> checkout to pantry -> cook -> deduct lots & log leftovers -> atomic undo', async () => {
    const today = '2026-11-23';

    // 1. Existing pantry already has 1 cup rolled oats (expiring soon!)
    const oatsLot = await createRecord<PantryLotPayload>('pantry_lot', 'Rolled Oats', {
      ingredientName: 'Rolled Oats',
      canonicalName: 'rolled oats',
      quantity: 2,
      unit: 'cup',
      zone: 'Dry Pantry',
      eatByDate: '2026-11-25',
    });

    // 2. Import recipe offline
    const parsed = parseRawRecipeText(
      `Warm Maple Oatmeal\nServes: 2\nIngredients:\n1 cup rolled oats\n2 cups milk\n2 tbsp maple syrup\nSteps:\n1. Simmer oats and milk for 8 minutes.`
    );
    const recipe = await createRecord<RecipePayload>('recipe', parsed.title, parsed.payload);

    // Check "What Can I Make?" highlights soon-to-expire oats match
    const ranked = rankWhatCanIMake([recipe], [oatsLot], today);
    expect(ranked[0].usesExpiringSoonCount).toBe(1);
    expect(ranked[0].missingIngredients).toContain('milk');

    // 3. Plan meal for Nov 25 with auto prep reminder (Nov 24), then move meal to Nov 26 -> reminder moves to Nov 25!
    const meal = await scheduleMealWithPrepReminder({
      date: '2026-11-25',
      slot: 'breakfast',
      entryType: 'recipe',
      title: recipe.title,
      recipeId: recipe.id,
      servings: 2,
      addPrepReminder: true,
    });
    expect(meal.payload.prepReminderEventId).toBeTruthy();
    await moveMealPlanDate(meal.id, '2026-11-26');
    const movedPrep = (await db.records.get(meal.payload.prepReminderEventId!)) as unknown as { payload: CalendarEventPayload };
    expect(movedPrep.payload.startDate).toBe('2026-11-25');

    // 4. Generate net aisle-sorted grocery list for week (oats already in pantry -> subtracted cleanly!)
    const addedGroceries = await generateNetGroceryItems({
      mealDateStart: '2026-11-23',
      mealDateEnd: '2026-11-29',
      todayIso: today,
    });
    expect(addedGroceries).toBe(2); // milk + maple syrup (rolled oats covered by pantry!)

    const groceries = (await db.records.where('type').equals('grocery_item').toArray()) as Array<
      (typeof recipe) & { payload: GroceryItemPayload }
    >;
    expect(groceries.some((g) => g.payload.canonicalName === 'rolled oats')).toBe(false);

    // 5. Check off groceries with prices and reconcile Finished Shopping -> Pantry Lots + Finance expense
    for (const g of groceries) {
      await updateRecord<GroceryItemPayload>(g.id, (c) => ({
        ...c,
        payload: { ...c.payload, checked: true, price: 4.5 },
      }));
    }
    const checkout = await reconcileFinishedShopping({ todayIso: today, createExpense: true });
    expect(checkout.lotsCreated).toBe(2);
    expect(checkout.totalSpent).toBe(9);
    const expenses = await db.records.where('type').equals('expense').toArray();
    expect(expenses).toHaveLength(1);

    // 6. Cook recipe -> deducts pantry lots + logs leftovers + increments madeCount
    const cooked = await finishCookingSession(recipe.id, {
      scaleFactor: 1,
      deductPantry: true,
      leftoverPortions: 2,
      leftoverZone: 'Fridge',
      eatByDays: 4,
      todayIso: today,
    });
    expect(cooked.deductedLots).toBeGreaterThanOrEqual(3);
    expect(cooked.createdLeftoverId).toBeTruthy();

    const oatsAfterCook = (await db.records.get(oatsLot.id)) as unknown as { payload: PantryLotPayload };
    expect(oatsAfterCook.payload.quantity).toBe(1); // 2 - 1 = 1 cup remaining!
    const leftover = (await db.records.get(cooked.createdLeftoverId!)) as unknown as { payload: PantryLotPayload };
    expect(leftover.payload.isLeftover).toBe(true);
    expect(leftover.payload.eatByDate).toBe('2026-11-27');

    // 7. 1-click atomic Undo reverses lot deductions, madeCount, and leftover creation!
    await performUndo();
    const oatsAfterUndo = (await db.records.get(oatsLot.id)) as unknown as { payload: PantryLotPayload };
    expect(oatsAfterUndo.payload.quantity).toBe(2);
  });
});
