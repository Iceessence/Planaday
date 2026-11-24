import { createId, db, getOrInitSettings } from './db';
import { batchApplyChanges } from './repository';
import {
  convertCookingUnit,
  formatRationalFraction,
  parseQuantityText,
} from '../data/densities';
import { addDaysIso, diffDaysIso } from './temporal';
import type {
  CalendarEventPayload,
  ChorePayload,
  GroceryItemPayload,
  LifeRecord,
  MealPlanPayload,
  PantryLotPayload,
  RecipeIngredient,
  RecipePayload,
  RecipeStep,
  UndoEntry,
} from './types';

const NON_LINEAR_KEYWORDS = [
  'salt',
  'pepper',
  'yeast',
  'baking powder',
  'baking soda',
  'cinnamon',
  'cayenne',
  'chili',
  'garlic powder',
  'paprika',
  'vanilla',
  'nutmeg',
  'spice',
];

const AISLE_KEYWORDS: Array<[string, string[]]> = [
  ['Produce', ['tomato', 'onion', 'garlic', 'lemon', 'lime', 'spinach', 'avocado', 'carrot', 'apple', 'berry', 'berries', 'herb', 'rosemary', 'basil', 'cilantro', 'potato', 'lettuce']],
  ['Dairy & Eggs', ['milk', 'butter', 'cheese', 'cream', 'yogurt', 'egg', 'eggs', 'parmesan', 'mozzarella']],
  ['Meat & Seafood', ['chicken', 'beef', 'pork', 'salmon', 'shrimp', 'turkey', 'bacon', 'fish']],
  ['Baking', ['flour', 'sugar', 'cocoa', 'yeast', 'baking powder', 'baking soda', 'vanilla']],
  ['Spices', ['salt', 'pepper', 'cumin', 'paprika', 'cinnamon', 'oregano', 'thyme']],
  ['Frozen', ['frozen', 'ice cream', 'peas']],
];

export function canonicalizeIngredientName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(fresh|organic|large|small|medium|unsalted|salted|extra virgin|chopped|diced|minced|sliced|spooned|fine)\b/g, '')
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.endsWith('es') && cleaned.length > 4 && !cleaned.endsWith('oes')) return cleaned;
  return cleaned || name.toLowerCase().trim();
}

export function inferAisle(name: string): string {
  const lower = name.toLowerCase();
  for (const [aisle, words] of AISLE_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return aisle;
  }
  return 'Pantry';
}

export function extractDurationMinutesFromStep(text: string): number | undefined {
  const hr = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b/i);
  const min = text.match(/(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins)\b/i);
  const total = (hr ? Math.round(Number(hr[1]) * 60) : 0) + (min ? Math.round(Number(min[1])) : 0);
  return total > 0 ? total : undefined;
}

export function parseIngredientLine(line: string): RecipeIngredient {
  const trimmed = line.replace(/^[-*•]\s*/, '').trim();
  const m = trimmed.match(
    /^([\d\s./⅛¼⅓⅜½⅝⅔¾⅞]+)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|sticks?|cloves?|cans?|pieces?)?\s+(.+)$/i
  );
  const qty = m ? parseQuantityText(m[1]) || 1 : 1;
  const unit = m && m[2] ? m[2].toLowerCase() : 'item';
  const rest = m ? m[3].trim() : trimmed;
  const [rawName, ...prepParts] = rest.split(',');
  const name = rawName.trim();
  const canonicalName = canonicalizeIngredientName(name);
  const nonLinear = NON_LINEAR_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));

  return {
    id: createId('ing'),
    quantity: qty,
    unit,
    name,
    canonicalName,
    prepText: prepParts.join(',').trim() || undefined,
    nonLinear,
    aisle: inferAisle(name),
  };
}

/**
 * 100% offline raw-text recipe parser (Section 11.01).
 */
export function parseRawRecipeText(rawText: string, sourceUrl?: string): { title: string; payload: RecipePayload } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const title = lines[0]?.replace(/^#+\s*/, '') || 'Imported Recipe';
  const servingsMatch = rawText.match(/(?:serves|servings|yield)[:\s]+(\d+)/i);
  const prepMatch = rawText.match(/prep(?:\s*time)?[:\s]+(\d+)\s*m/i);
  const cookMatch = rawText.match(/cook(?:\s*time)?[:\s]+(\d+)\s*m/i);

  let mode: 'meta' | 'ingredients' | 'steps' = 'ingredients';
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^ingredients?:?$/i.test(l)) {
      mode = 'ingredients';
      continue;
    }
    if (/^(instructions?|directions?|steps?|method):?$/i.test(l)) {
      mode = 'steps';
      continue;
    }
    if (/^(serves|servings|prep|cook|yield)\b/i.test(l)) continue;

    if (mode === 'steps' || /^\d+\.\s+/.test(l)) {
      mode = 'steps';
      stepLines.push(l.replace(/^\d+\.\s*/, ''));
    } else {
      ingredientLines.push(l);
    }
  }

  const ingredients = ingredientLines.map(parseIngredientLine);
  const steps: RecipeStep[] = stepLines.map((text, idx) => ({
    id: createId('stp'),
    order: idx + 1,
    text,
    durationMin: extractDurationMinutesFromStep(text),
  }));

  return {
    title,
    payload: {
      cuisine: 'Home Cooking',
      mealTypes: ['Dinner'],
      dietaryBadges: [],
      allergens: [],
      servings: servingsMatch ? Math.max(1, Number(servingsMatch[1])) : 4,
      prepMin: prepMatch ? Number(prepMatch[1]) : 15,
      cookMin: cookMatch ? Number(cookMatch[1]) : 25,
      restMin: 0,
      difficulty: 'medium',
      rating: 0,
      madeCount: 0,
      sourceUrl,
      equipment: [],
      ingredients,
      steps,
    },
  };
}

export interface ScaledIngredientView {
  ingredient: RecipeIngredient;
  scaledQty: number;
  displayQty: string;
  displayUnit: string;
  nonLinearNote?: string;
  conversionWarning?: string;
  densityUsedLabel?: string;
}

/**
 * Scales recipe ingredients from IMMUTABLE base quantities with rational fractions,
 * non-linear seasoning warnings, and Appendix B Mass <-> Volume density conversion (Section 11.02).
 */
export function scaleAndConvertIngredients(
  recipe: RecipePayload,
  targetServings: number,
  unitMode: 'original' | 'metric' | 'us'
): ScaledIngredientView[] {
  const baseServings = Math.max(1, recipe.servings || 1);
  const factor = Math.max(0.25, targetServings / baseServings);

  return recipe.ingredients.map((ing) => {
    const scaledQty = ing.quantity * factor;
    let finalQty = scaledQty;
    let finalUnit = ing.unit;
    let conversionWarning: string | undefined;
    let densityUsedLabel: string | undefined;

    const uLow = ing.unit.toLowerCase();
    if (unitMode === 'metric' && ['cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs'].includes(uLow)) {
      const targetUnit = ['oz', 'lb', 'lbs'].includes(uLow) ? 'g' : 'g';
      const conv = convertCookingUnit(scaledQty, ing.unit, targetUnit, ing.name);
      finalQty = conv.value;
      finalUnit = conv.unit;
      conversionWarning = conv.warning;
      if (conv.densityUsed) densityUsedLabel = `${conv.densityUsed.gramsPerCup} g/cup`;
    } else if (unitMode === 'us' && ['g', 'gram', 'grams', 'kg', 'ml', 'l'].includes(uLow)) {
      const targetUnit = ['ml', 'l'].includes(uLow) ? 'cup' : 'cup';
      const conv = convertCookingUnit(scaledQty, ing.unit, targetUnit, ing.name);
      finalQty = conv.value;
      finalUnit = conv.unit;
      conversionWarning = conv.warning;
      if (conv.densityUsed) densityUsedLabel = `${conv.densityUsed.gramsPerCup} g/cup`;
    }

    return {
      ingredient: ing,
      scaledQty: finalQty,
      displayQty:
        finalUnit === 'g' || finalUnit === 'ml'
          ? String(Math.round(finalQty))
          : formatRationalFraction(finalQty),
      displayUnit: finalUnit,
      nonLinearNote:
        ing.nonLinear && Math.abs(factor - 1) > 0.05
          ? 'Non-linear seasoning/leavening — taste & adjust rather than blindly scaling'
          : undefined,
      conversionWarning,
      densityUsedLabel,
    };
  });
}

// --- Lot-Based Freshness & "What Can I Make?" Matcher (Sections 11.02 & 11.04) ---

export type FreshnessStatus = 'Fresh' | 'Use Soon' | 'Expires Today' | 'Expired' | 'Unknown';

export function computeLotFreshness(lot: PantryLotPayload, todayIso: string): {
  status: FreshnessStatus;
  daysLeft: number | null;
  availableQty: number;
} {
  const availableQty = Math.max(0, (lot.quantity || 0) - (lot.reservedQty || 0));
  const expDate = lot.eatByDate || lot.bestByDate;
  if (!expDate) return { status: 'Unknown', daysLeft: null, availableQty };
  const daysLeft = diffDaysIso(todayIso, expDate);
  if (daysLeft < 0) return { status: 'Expired', daysLeft, availableQty };
  if (daysLeft === 0) return { status: 'Expires Today', daysLeft, availableQty };
  if (daysLeft <= 3) return { status: 'Use Soon', daysLeft, availableQty };
  return { status: 'Fresh', daysLeft, availableQty };
}

export interface RecipeMatchRank {
  recipe: LifeRecord<RecipePayload>;
  matchedCount: number;
  requiredCount: number;
  matchPct: number;
  usesExpiringSoonCount: number;
  missingIngredients: string[];
}

export function rankWhatCanIMake(
  recipes: Array<LifeRecord<RecipePayload>>,
  pantryLots: Array<LifeRecord<PantryLotPayload>>,
  todayIso: string
): RecipeMatchRank[] {
  // Only consider unreserved, unexpired lots
  const validLots = pantryLots
    .map((lot) => ({ lot, fresh: computeLotFreshness(lot.payload, todayIso) }))
    .filter((x) => x.fresh.status !== 'Expired' && x.fresh.availableQty > 0);

  return recipes
    .map((recipe) => {
      const required = recipe.payload.ingredients.filter((i) => !i.optional);
      let matchedCount = 0;
      let usesExpiringSoonCount = 0;
      const missingIngredients: string[] = [];

      for (const ing of required) {
        const canon = ing.canonicalName || canonicalizeIngredientName(ing.name);
        const matchingLots = validLots.filter(
          ({ lot }) =>
            lot.payload.canonicalName === canon ||
            lot.payload.ingredientName.toLowerCase().includes(canon) ||
            canon.includes(lot.payload.canonicalName)
        );
        if (matchingLots.length > 0) {
          matchedCount++;
          if (matchingLots.some((m) => m.fresh.status === 'Use Soon' || m.fresh.status === 'Expires Today')) {
            usesExpiringSoonCount++;
          }
        } else {
          missingIngredients.push(ing.name);
        }
      }

      const requiredCount = required.length;
      const matchPct = requiredCount > 0 ? Math.round((matchedCount / requiredCount) * 100) : 100;
      return { recipe, matchedCount, requiredCount, matchPct, usesExpiringSoonCount, missingIngredients };
    })
    .sort((a, b) => b.matchPct - a.matchPct || b.usesExpiringSoonCount - a.usesExpiringSoonCount);
}

// --- Hands-Free Cooking Finish Flow: Deduct Lots + Log Leftovers + 1-Click Atomic Undo (11.03) ---

export async function finishCookingSession(
  recipeId: string,
  options: {
    scaleFactor: number;
    deductPantry: boolean;
    leftoverPortions: number;
    leftoverZone: 'Fridge' | 'Freezer';
    eatByDays: number;
    todayIso: string;
  }
): Promise<{ deductedLots: number; createdLeftoverId?: string }> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  let deductedLots = 0;
  let createdLeftoverId: string | undefined;

  await batchApplyChanges('Finished cooking & reconciled pantry/leftovers', async () => {
    const recipe = (await db.records.get(recipeId)) as LifeRecord<RecipePayload> | undefined;
    if (!recipe) return [];
    const changes: UndoEntry['changes'] = [];

    // Increment madeCount
    const updatedRecipe: LifeRecord<RecipePayload> = {
      ...recipe,
      updatedAt: now,
      rev: recipe.rev + 1,
      deviceId: settings.deviceId,
      payload: { ...recipe.payload, madeCount: (recipe.payload.madeCount || 0) + 1 },
    };
    changes.push({ recordId: recipe.id, before: recipe, after: updatedRecipe });

    // Deduct matching unexpired lots FIFO (soonest expiry first)
    if (options.deductPantry) {
      const lots = (await db.records.where('type').equals('pantry_lot').toArray()).filter(
        (r) => !r.deletedAt
      ) as Array<LifeRecord<PantryLotPayload>>;

      for (const ing of recipe.payload.ingredients) {
        const canon = ing.canonicalName || canonicalizeIngredientName(ing.name);
        let need = ing.quantity * options.scaleFactor;
        const candidates = lots
          .filter(
            (l) =>
              l.payload.quantity > 0 &&
              (l.payload.canonicalName === canon || l.payload.ingredientName.toLowerCase().includes(canon))
          )
          .sort((a, b) => (a.payload.eatByDate || a.payload.bestByDate || '9999').localeCompare(b.payload.eatByDate || b.payload.bestByDate || '9999'));

        for (const lot of candidates) {
          if (need <= 0) break;
          const take = Math.min(lot.payload.quantity, need);
          need -= take;
          const nextQty = Math.max(0, Number((lot.payload.quantity - take).toFixed(2)));
          const updatedLot: LifeRecord<PantryLotPayload> = {
            ...lot,
            updatedAt: now,
            rev: lot.rev + 1,
            deviceId: settings.deviceId,
            payload: { ...lot.payload, quantity: nextQty },
          };
          changes.push({ recordId: lot.id, before: lot, after: updatedLot });
          deductedLots++;
        }
      }
    }

    // Log leftovers with user-reviewed eat-by date
    if (options.leftoverPortions > 0) {
      createdLeftoverId = createId('lot');
      const eatBy = addDaysIso(options.todayIso, Math.max(1, options.eatByDays));
      const leftoverRec: LifeRecord<PantryLotPayload> = {
        id: createdLeftoverId,
        workspaceId: recipe.workspaceId,
        type: 'pantry_lot',
        title: `${recipe.title} (Leftovers)`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: options.leftoverZone,
        tags: ['leftover'],
        links: [{ targetId: recipe.id, targetType: 'recipe', relation: 'recipe' }],
        payload: {
          ingredientName: `${recipe.title} (Leftovers)`,
          canonicalName: canonicalizeIngredientName(recipe.title),
          quantity: options.leftoverPortions,
          unit: 'servings',
          zone: options.leftoverZone,
          purchaseDate: options.todayIso,
          eatByDate: eatBy,
          isLeftover: true,
          sourceRecipeId: recipe.id,
        },
        rev: 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: createdLeftoverId, before: null, after: leftoverRec });
    }

    return changes;
  });

  return { deductedLots, createdLeftoverId };
}

// --- Smart Aisle-Sorted Grocery List Generator & Checkout Reconciliation (Section 11.05) ---

export async function generateNetGroceryItems(options: {
  recipeIds?: string[];
  mealDateStart?: string;
  mealDateEnd?: string;
  includeParDrops?: boolean;
  includeChoreSupplies?: boolean;
  store?: string;
  todayIso: string;
}): Promise<number> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  const store = options.store || 'Local Market';

  const allRecords = (await db.records.toArray()).filter(
    (r) => !r.deletedAt && r.workspaceId === settings.activeWorkspaceId
  );
  const recipesById = new Map(
    (allRecords.filter((r) => r.type === 'recipe') as Array<LifeRecord<RecipePayload>>).map((r) => [r.id, r])
  );
  const pantryLots = allRecords.filter((r) => r.type === 'pantry_lot') as Array<LifeRecord<PantryLotPayload>>;

  // Build map of unreserved, unexpired pantry stock by canonicalName
  const stockByCanon = new Map<string, number>();
  for (const lot of pantryLots) {
    const f = computeLotFreshness(lot.payload, options.todayIso);
    if (f.status === 'Expired') continue;
    const c = lot.payload.canonicalName || canonicalizeIngredientName(lot.payload.ingredientName);
    stockByCanon.set(c, (stockByCanon.get(c) ?? 0) + f.availableQty);
  }

  // Sum needed quantities across selected recipes & meal plans
  const needed = new Map<string, { name: string; qty: number; unit: string; aisle: string; source: string }>();

  const addNeed = (rawName: string, qty: number, unit: string, aisle: string, source: string) => {
    const canon = canonicalizeIngredientName(rawName);
    const existing = needed.get(canon);
    if (existing) {
      existing.qty += qty;
    } else {
      needed.set(canon, { name: rawName, qty, unit, aisle: aisle || inferAisle(rawName), source });
    }
  };

  for (const rid of options.recipeIds ?? []) {
    const r = recipesById.get(rid);
    if (!r) continue;
    for (const ing of r.payload.ingredients) {
      addNeed(ing.name, ing.quantity, ing.unit, ing.aisle || inferAisle(ing.name), r.title);
    }
  }

  if (options.mealDateStart && options.mealDateEnd) {
    const meals = allRecords.filter((r) => r.type === 'meal_plan') as Array<LifeRecord<MealPlanPayload>>;
    for (const m of meals) {
      if (m.payload.date >= options.mealDateStart && m.payload.date <= options.mealDateEnd && m.payload.recipeId) {
        const r = recipesById.get(m.payload.recipeId);
        if (!r) continue;
        const factor = (m.payload.servings || r.payload.servings || 1) / Math.max(1, r.payload.servings || 1);
        for (const ing of r.payload.ingredients) {
          addNeed(ing.name, ing.quantity * factor, ing.unit, ing.aisle || inferAisle(ing.name), `Meal: ${r.title}`);
        }
      }
    }
  }

  if (options.includeParDrops) {
    for (const lot of pantryLots) {
      if (lot.payload.parLevel && lot.payload.quantity < lot.payload.parLevel) {
        const deficit = lot.payload.parLevel - lot.payload.quantity;
        addNeed(lot.payload.ingredientName, deficit, lot.payload.unit, inferAisle(lot.payload.ingredientName), 'Par Level Drop');
      }
    }
  }

  if (options.includeChoreSupplies) {
    const chores = allRecords.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>;
    for (const ch of chores) {
      for (const sup of ch.payload.linkedSupplies ?? []) {
        addNeed(sup, 1, 'item', 'Household', `Chore: ${ch.title}`);
      }
    }
  }

  let addedCount = 0;
  await batchApplyChanges('Generated net aisle-sorted grocery list', async () => {
    const changes: UndoEntry['changes'] = [];
    for (const [canon, item] of needed.entries()) {
      const onHand = stockByCanon.get(canon) ?? 0;
      const netQty = Number((item.qty - onHand).toFixed(2));
      if (netQty <= 0.01) continue;

      const id = createId('groc');
      const rec: LifeRecord<GroceryItemPayload> = {
        id,
        workspaceId: settings.activeWorkspaceId,
        type: 'grocery_item',
        title: item.name,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: item.aisle,
        tags: [],
        links: [],
        payload: {
          canonicalName: canon,
          quantity: netQty,
          unit: item.unit,
          aisle: item.aisle,
          store,
          checked: false,
          boughtQty: netQty,
          targetZone: item.aisle === 'Dairy & Eggs' || item.aisle === 'Produce' || item.aisle === 'Meat & Seafood' ? 'Fridge' : item.aisle === 'Frozen' ? 'Freezer' : 'Dry Pantry',
          sourceLabel: item.source,
        },
        rev: 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: id, before: null, after: rec });
      addedCount++;
    }
    return changes;
  });

  return addedCount;
}

/**
 * Finished Shopping Atomic Reconciliation (Section 11.05):
 * Reconciles checked grocery items (actual bought qty, price, expiry) into Pantry Inventory lots
 * and optionally logs a single Finance expense — all atomically with 1-click Undo!
 */
export async function reconcileFinishedShopping(options: {
  todayIso: string;
  createExpense?: boolean;
  currency?: string;
}): Promise<{ lotsCreated: number; totalSpent: number }> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  let lotsCreated = 0;
  let totalSpent = 0;

  await batchApplyChanges('Finished Shopping — reconciled into Pantry Inventory', async () => {
    const groceries = (await db.records.where('type').equals('grocery_item').toArray()).filter(
      (r) => !r.deletedAt && r.status === 'active' && (r.payload as GroceryItemPayload).checked
    ) as Array<LifeRecord<GroceryItemPayload>>;

    const changes: UndoEntry['changes'] = [];

    for (const g of groceries) {
      const qty = g.payload.boughtQty ?? g.payload.quantity;
      totalSpent += Number(g.payload.price || 0);

      // Mark grocery item done
      const doneGrocery: LifeRecord<GroceryItemPayload> = {
        ...g,
        status: 'done',
        updatedAt: now,
        rev: g.rev + 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: g.id, before: g, after: doneGrocery });

      // Create new Pantry Lot
      const lotId = createId('lot');
      const lotRec: LifeRecord<PantryLotPayload> = {
        id: lotId,
        workspaceId: g.workspaceId,
        type: 'pantry_lot',
        title: g.title,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: g.payload.targetZone || 'Dry Pantry',
        tags: ['restocked'],
        links: [{ targetId: g.id, targetType: 'grocery_item', relation: 'supply' }],
        payload: {
          ingredientName: g.title,
          canonicalName: g.payload.canonicalName || canonicalizeIngredientName(g.title),
          quantity: qty,
          unit: g.payload.unit,
          zone: g.payload.targetZone || 'Dry Pantry',
          purchaseDate: options.todayIso,
          bestByDate: g.payload.expiryDate || addDaysIso(options.todayIso, 14),
        },
        rev: 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: lotId, before: null, after: lotRec });
      lotsCreated++;
    }

    if (options.createExpense && totalSpent > 0) {
      const expId = createId('exp');
      changes.push({
        recordId: expId,
        before: null,
        after: {
          id: expId,
          workspaceId: settings.activeWorkspaceId,
          type: 'expense',
          title: `Grocery Trip (${lotsCreated} items)`,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          category: 'Groceries',
          tags: ['groceries'],
          links: [],
          payload: {
            amount: Number(totalSpent.toFixed(2)),
            currency: options.currency || 'USD',
            date: options.todayIso,
            category: 'Groceries',
          },
          rev: 1,
          deviceId: settings.deviceId,
        },
      });
    }

    return changes;
  });

  return { lotsCreated, totalSpent: Number(totalSpent.toFixed(2)) };
}

/**
 * Schedules a Meal Plan entry AND auto-schedules a prep/defrost reminder event on Calendar
 * that moves automatically when the meal moves (Section 11.05).
 */
export async function scheduleMealWithPrepReminder(options: {
  date: string;
  slot: MealPlanPayload['slot'];
  entryType: MealPlanPayload['entryType'];
  title: string;
  recipeId?: string | null;
  leftoverLotId?: string | null;
  servings?: number;
  addPrepReminder?: boolean;
}): Promise<LifeRecord<MealPlanPayload>> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();
  const mealId = createId('meal');
  let prepEventId: string | null = null;

  await batchApplyChanges(`Planned ${options.slot}: ${options.title}`, async () => {
    const changes: UndoEntry['changes'] = [];
    if (options.addPrepReminder) {
      prepEventId = createId('ev');
      const prepDate = addDaysIso(options.date, -1);
      const prepEv: LifeRecord<CalendarEventPayload> = {
        id: prepEventId,
        workspaceId: settings.activeWorkspaceId,
        type: 'event',
        title: `Defrost / Prep: ${options.title}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: 'Kitchen',
        color: '#c96f53',
        tags: ['meal-prep'],
        links: [{ targetId: mealId, targetType: 'meal_plan', relation: 'scheduled_from' }],
        payload: {
          startDate: prepDate,
          endDate: prepDate,
          startTime: '19:00',
          endTime: '19:20',
          allDay: false,
          floating: false,
          timeZone: settings.defaultTimeZone,
          style: 'soft',
          emoji: '🍳',
          eventStatus: 'confirmed',
        },
        rev: 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: prepEventId, before: null, after: prepEv });
    }

    const mealRec: LifeRecord<MealPlanPayload> = {
      id: mealId,
      workspaceId: settings.activeWorkspaceId,
      type: 'meal_plan',
      title: options.title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      category: 'Meals',
      tags: [],
      links: options.recipeId ? [{ targetId: options.recipeId, targetType: 'recipe', relation: 'recipe' }] : [],
      payload: {
        date: options.date,
        slot: options.slot,
        entryType: options.entryType,
        recipeId: options.recipeId ?? null,
        leftoverLotId: options.leftoverLotId ?? null,
        servings: options.servings ?? 2,
        prepReminderEventId: prepEventId,
      },
      rev: 1,
      deviceId: settings.deviceId,
    };
    changes.push({ recordId: mealId, before: null, after: mealRec });
    return changes;
  });

  return (await db.records.get(mealId)) as LifeRecord<MealPlanPayload>;
}

export async function moveMealPlanDate(mealId: string, newDate: string): Promise<void> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  await batchApplyChanges(`Moved meal to ${newDate}`, async () => {
    const meal = (await db.records.get(mealId)) as LifeRecord<MealPlanPayload> | undefined;
    if (!meal) return [];
    const changes: UndoEntry['changes'] = [];

    const nextMeal: LifeRecord<MealPlanPayload> = {
      ...meal,
      updatedAt: now,
      rev: meal.rev + 1,
      deviceId: settings.deviceId,
      payload: { ...meal.payload, date: newDate },
    };
    changes.push({ recordId: meal.id, before: meal, after: nextMeal });

    if (meal.payload.prepReminderEventId) {
      const prep = (await db.records.get(meal.payload.prepReminderEventId)) as LifeRecord<CalendarEventPayload> | undefined;
      if (prep && !prep.deletedAt) {
        const newPrepDate = addDaysIso(newDate, -1);
        changes.push({
          recordId: prep.id,
          before: prep,
          after: {
            ...prep,
            updatedAt: now,
            rev: prep.rev + 1,
            deviceId: settings.deviceId,
            payload: { ...prep.payload, startDate: newPrepDate, endDate: newPrepDate },
          },
        });
      }
    }
    return changes;
  });
}
