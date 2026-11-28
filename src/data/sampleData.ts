import { addDaysIso } from '../core/temporal';
import { createRecord } from '../core/repository';
import { db, getOrInitSettings, updateSettings } from '../core/db';
import type {
  AppSettings,
  CalendarEventPayload,
  ChorePayload,
  DiaryPayload,
  GoalPayload,
  HabitPayload,
  MealPlanPayload,
  ModuleId,
  NotePayload,
  PantryLotPayload,
  RecipePayload,
  TaskPayload,
  ThoughtPayload,
} from '../core/types';
import { THEME_PRESETS } from './themes';

export interface OnboardingPreset {
  id: 'tactile-paper' | 'minimalist-focus' | 'complete-life' | 'night-owl';
  name: string;
  tagline: string;
  themePresetId: string;
  dayBoundaryHour: number;
  openBookLayout: boolean;
  enabledModules: Partial<Record<ModuleId, boolean>>;
}

export const ONBOARDING_PRESETS: OnboardingPreset[] = [
  {
    id: 'tactile-paper',
    name: 'Tactile Paper',
    tagline: 'Warm cream dot-grid two-page open-book spread with stickers, diary & kitchen essentials.',
    themePresetId: 'warm-stationery',
    dayBoundaryHour: 0,
    openBookLayout: true,
    enabledModules: {
      goals: true,
      habits: true,
      people: true,
    },
  },
  {
    id: 'minimalist-focus',
    name: 'Minimalist Focus',
    tagline: 'Crisp distraction-free Today, Calendar, Tasks, Notes & Pomodoro studio.',
    themePresetId: 'sage-minimal',
    dayBoundaryHour: 0,
    openBookLayout: false,
    enabledModules: {
      goals: true,
      habits: false,
      household: false,
      health: false,
      finance: false,
      learning: false,
      media: false,
      travel: false,
      people: false,
      home_assets: false,
    },
  },
  {
    id: 'complete-life',
    name: 'Complete Life & Home',
    tagline: 'Every optional Life-OS workspace enabled: Household, Health, Finance, Travel, People & Home Vault.',
    themePresetId: 'warm-stationery',
    dayBoundaryHour: 0,
    openBookLayout: true,
    enabledModules: {
      goals: true,
      habits: true,
      household: true,
      health: true,
      finance: true,
      learning: true,
      media: true,
      travel: true,
      people: true,
      home_assets: true,
    },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    tagline: 'Midnight Studio dark paper with a 4:00 AM logical day boundary so late-night work stays on today.',
    themePresetId: 'midnight-studio',
    dayBoundaryHour: 4,
    openBookLayout: true,
    enabledModules: {
      goals: true,
      habits: true,
      learning: true,
      media: true,
    },
  },
];

export const DEFAULT_NOTEBOOKS = [
  { id: 'nb_personal', name: 'Personal', emoji: '📓', color: '#a97434' },
  { id: 'nb_family', name: 'Family', emoji: '🏡', color: '#c96f53' },
  { id: 'nb_work', name: 'Work', emoji: '💼', color: '#3b6ea5' },
  { id: 'nb_learning', name: 'Learning', emoji: '📚', color: '#6b5ca5' },
  { id: 'nb_technology', name: 'Technology', emoji: '💻', color: '#2f6f62' },
  { id: 'nb_ideas', name: 'Ideas', emoji: '💡', color: '#c79b43' },
  { id: 'nb_wellbeing', name: 'Wellbeing', emoji: '🌿', color: '#4f7a65' },
  { id: 'nb_finances', name: 'Finances', emoji: '🧾', color: '#4d7c8a' },
  { id: 'nb_other', name: 'Other', emoji: '🗂️', color: '#7a6f64' },
];

export async function applyOnboardingPreset(
  presetId: OnboardingPreset['id'],
  options: { loadSamples: boolean; dayBoundaryHour?: number; logicalToday: string }
): Promise<AppSettings> {
  return db.transaction('rw', [db.settings, db.records, db.outbox, db.undoStack, db.redoStack, db.revisions], async () => {
  const preset = ONBOARDING_PRESETS.find((p) => p.id === presetId) ?? ONBOARDING_PRESETS[0];
  const theme = THEME_PRESETS.find((t) => t.id === preset.themePresetId) ?? THEME_PRESETS[0];
  const current = await getOrInitSettings();

  const updated = await updateSettings({
    themePresetId: theme.id,
    customTokens: { ...theme.tokens },
    paperMaterial: theme.defaultPaper,
    colorScheme: theme.isDark ? 'dark' : 'light',
    dayBoundaryHour: options.dayBoundaryHour ?? preset.dayBoundaryHour,
    openBookLayout: preset.openBookLayout,
    enabledModules: {
      ...current.enabledModules,
      ...preset.enabledModules,
    },
    onboardingCompleted: true,
  });

  if (options.loadSamples) {
    await seedSampleData(options.logicalToday);
  }

  return updated;
  });
}

export async function seedSampleData(logicalToday: string): Promise<void> {
  return db.transaction('rw', [db.settings, db.records, db.outbox, db.undoStack, db.redoStack, db.revisions], async () => {
  const existingSamples = await db.records.filter((r) => r.isSample === true).count();
  if (existingSamples > 0) return;

  const settings = await getOrInitSettings();
  const tz = settings.defaultTimeZone;
  const yesterday = addDaysIso(logicalToday, -1);
  const tomorrow = addDaysIso(logicalToday, 1);

  // Sample Events
  await createRecord<CalendarEventPayload>(
    'event',
    'Morning Coffee & Daily Planning',
    {
      startDate: logicalToday,
      endDate: logicalToday,
      startTime: '08:30',
      endTime: '09:15',
      allDay: false,
      floating: false,
      timeZone: tz,
      style: 'soft',
      emoji: '☕',
      eventStatus: 'confirmed',
      importance: 'must_do',
      location: 'Kitchen Table',
      buffers: { prepMin: 10 },
    },
    { isSample: true, category: 'Personal', color: '#a97434', tags: ['ritual'] },
    { skipUndo: true }
  );

  await createRecord<CalendarEventPayload>(
    'event',
    'Deep Focus Studio Block',
    {
      startDate: logicalToday,
      endDate: logicalToday,
      startTime: '10:00',
      endTime: '12:00',
      allDay: false,
      floating: false,
      timeZone: tz,
      style: 'filled',
      emoji: '🧠',
      eventStatus: 'confirmed',
      importance: 'must_do',
      buffers: { decompressMin: 15 },
    },
    { isSample: true, category: 'Work', color: '#4f7a65', tags: ['deep-work'] },
    { skipUndo: true }
  );

  // Sample Tasks (including Top Three + one yesterday leftover to showcase Rollover Drawer)
  await createRecord<TaskPayload>(
    'task',
    'Finalize weekly meal prep & pantry check',
    {
      pinnedTop3Date: logicalToday,
      subtasks: [
        { id: 'st1', title: 'Check fridge freshness dates', done: true },
        { id: 'st2', title: 'Pick 3 weeknight dinners', done: false },
      ],
      boardColumn: 'in_progress',
    },
    { isSample: true, doDate: logicalToday, dueDate: tomorrow, priority: 'high', estimateMin: 25, energy: 'low', category: 'Home', tags: ['kitchen'] },
    { skipUndo: true }
  );

  await createRecord<TaskPayload>(
    'task',
    'Draft quarterly reflection in Notes',
    {
      pinnedTop3Date: logicalToday,
      subtasks: [],
      boardColumn: 'next',
    },
    { isSample: true, doDate: logicalToday, priority: 'medium', estimateMin: 40, energy: 'high', category: 'Personal', tags: ['reflection'] },
    { skipUndo: true }
  );

  await createRecord<TaskPayload>(
    'task',
    'Order replacement water pitcher filter',
    {
      subtasks: [],
      boardColumn: 'backlog',
    },
    { isSample: true, doDate: yesterday, priority: 'low', estimateMin: 10, energy: 'low', category: 'Home', tags: ['errands'] },
    { skipUndo: true }
  );

  // Sample Completion-Based Chores
  await createRecord<ChorePayload>(
    'chore',
    'Wipe kitchen counters & stovetop',
    {
      room: 'Kitchen',
      choreMode: 'after_completion',
      intervalDays: 2,
      difficulty: 1,
      checklist: [
        { id: 'c1', text: 'Clear counters', done: false },
        { id: 'c2', text: 'Wipe with warm soapy cloth', done: false },
      ],
      linkedSupplies: ['All-purpose spray', 'Microfiber cloth'],
      lastCompletedDate: addDaysIso(logicalToday, -2),
      nextDueDate: logicalToday,
      completions: [
        { id: 'cmp1', completedAt: new Date(Date.now() - 2 * 86400000).toISOString(), completedDate: addDaysIso(logicalToday, -2), minutesSpent: 10 },
      ],
    },
    { isSample: true, estimateMin: 10, energy: 'low', category: 'Kitchen', tags: ['home'] },
    { skipUndo: true }
  );

  await createRecord<ChorePayload>(
    'chore',
    'Water indoor plants',
    {
      room: 'Living Room',
      choreMode: 'after_completion',
      intervalDays: 5,
      difficulty: 1,
      checklist: [
        { id: 'c3', text: 'Check topsoil moisture', done: false },
        { id: 'c4', text: 'Mist ferns', done: false },
      ],
      linkedSupplies: ['Watering can'],
      lastCompletedDate: addDaysIso(logicalToday, -6),
      nextDueDate: yesterday,
      completions: [
        { id: 'cmp2', completedAt: new Date(Date.now() - 6 * 86400000).toISOString(), completedDate: addDaysIso(logicalToday, -6), minutesSpent: 8 },
      ],
    },
    { isSample: true, estimateMin: 8, energy: 'low', category: 'Living Room', tags: ['plants'] },
    { skipUndo: true }
  );

  // Sample Goal & Habit
  await createRecord<GoalPayload>(
    'goal',
    'Cook 20 nourishing home meals this month',
    {
      description: 'Use pantry staples first and keep weeknight dinners calm and under 35 minutes.',
      targetDate: addDaysIso(logicalToday, 21),
      area: 'Kitchen & Health',
      milestones: [
        { id: 'm1', title: 'Organize dry pantry & spice rack', done: true },
        { id: 'm2', title: 'Save 5 go-to 30-minute recipes', done: false, dueDate: addDaysIso(logicalToday, 5) },
        { id: 'm3', title: 'Complete 2 zero-waste pantry weeks', done: false, dueDate: addDaysIso(logicalToday, 18) },
      ],
    },
    { isSample: true, category: 'Health', tags: ['cooking'] },
    { skipUndo: true }
  );

  await createRecord<HabitPayload>(
    'habit',
    '20-minute outdoor walk',
    {
      scheduleType: 'daily',
      unit: 'min',
      targetQuantity: 20,
      logs: {
        [addDaysIso(logicalToday, -3)]: { value: 25 },
        [addDaysIso(logicalToday, -2)]: { value: 20 },
        [addDaysIso(logicalToday, -1)]: { value: 30 },
      },
    },
    { isSample: true, category: 'Wellbeing', tags: ['movement'] },
    { skipUndo: true }
  );

  // Sample Note & Thought & Diary
  const noteRec = await createRecord<NotePayload>(
    'note',
    'Welcome to Planaday Stationery Guide',
    {
      notebookId: 'nb_personal',
      writtenForDate: logicalToday,
      pinned: true,
      content: `# Welcome to Planaday\n\nEvery record lives in **one unified graph** stored locally in IndexedDB with zero word limits and zero \`localStorage\`.\n\n- Type \`[[\` to link notes & records together\n- Highlight any paragraph in **Thought Inbox** to file it straight into a Notebook, Task, Event, or Recipe\n- Try switching paper surfaces (5mm Dot-Grid, Kraft Paper, College Ruled) in **Settings → Theme Studio**\n\n> Tip: All sample records are tagged \`isSample: true\` and can be wiped in 1 click from Settings without touching anything you created.`,
      citations: [],
      touchedDates: [logicalToday],
    },
    { isSample: true, category: 'Personal', tags: ['guide', 'stationery'] },
    { skipUndo: true }
  );

  await createRecord<ThoughtPayload>(
    'thought',
    'Quick Sunday morning brainstorm',
    {
      content:
        'Try roasting cherry tomatoes with garlic and olive oil for an effortless weeknight pasta sauce.\n\nRemember to pick up rosemary and fresh lemon at the local market.\n\nIdea for living room: rearrange the reading lamp next to the armchair for cozy winter evenings.',
      source: 'keyboard',
    },
    { isSample: true, tags: ['ideas', 'kitchen'], links: [{ targetId: noteRec.id, targetType: 'note', relation: 'mentions' }] },
    { skipUndo: true }
  );

  await createRecord<DiaryPayload>(
    'diary',
    `Daily Reflection — ${logicalToday}`,
    {
      date: logicalToday,
      mood: 'Good',
      emotions: ['Calm', 'Focused'],
      energy: 4,
      stress: 2,
      sleepHours: 7.5,
      sleepQuality: 4,
      waterCups: 4,
      weatherNote: 'Crisp autumn morning',
      gratitude: 'Warm coffee, quiet desk, and clean paper margins.',
      tonight: 'Read two chapters before bed.',
    },
    { isSample: true, category: 'Diary', tags: ['reflection'] },
    { skipUndo: true }
  );

  // Sample Recipe, Pantry Lots & Meal Plan
  const recipe = await createRecord<RecipePayload>(
    'recipe',
    'Honey Oat Skillet Pancakes',
    {
      cuisine: 'Home Breakfast',
      mealTypes: ['Breakfast'],
      dietaryBadges: ['Vegetarian'],
      allergens: ['Gluten', 'Dairy'],
      servings: 2,
      prepMin: 10,
      cookMin: 12,
      restMin: 5,
      difficulty: 'easy',
      rating: 5,
      madeCount: 3,
      equipment: ['Cast-iron skillet', 'Mixing bowl'],
      ingredients: [
        { id: 'ing1', quantity: 1, unit: 'cup', name: 'Rolled oats', canonicalName: 'rolled oats', aisle: 'Pantry' },
        { id: 'ing2', quantity: 0.5, unit: 'cup', name: 'All-purpose flour', canonicalName: 'all-purpose flour', aisle: 'Baking' },
        { id: 'ing3', quantity: 1, unit: 'cup', name: 'Milk', canonicalName: 'milk', aisle: 'Dairy' },
        { id: 'ing4', quantity: 2, unit: 'tbsp', name: 'Honey', canonicalName: 'honey', aisle: 'Pantry' },
        { id: 'ing5', quantity: 1, unit: 'tbsp', name: 'Butter', canonicalName: 'butter', aisle: 'Dairy' },
        { id: 'ing6', quantity: 0.25, unit: 'tsp', name: 'Fine sea salt', canonicalName: 'table salt', nonLinear: true, aisle: 'Spices' },
      ],
      steps: [
        { id: 's1', order: 1, text: 'Whisk rolled oats, all-purpose flour, milk, honey, and fine sea salt in a bowl. Let rest for 5 minutes so the oats soften.', durationMin: 5 },
        { id: 's2', order: 2, text: 'Melt butter in a skillet over medium heat. Pour batter and cook 3 minutes per side until golden brown.', durationMin: 6 },
      ],
      nutrition: { calories: 420, proteinG: 13, carbsG: 68, fatG: 11 },
    },
    { isSample: true, category: 'Breakfast', tags: ['quick', 'breakfast'] },
    { skipUndo: true }
  );

  await createRecord<PantryLotPayload>(
    'pantry_lot',
    'Rolled oats',
    {
      ingredientName: 'Rolled oats',
      canonicalName: 'rolled oats',
      quantity: 4,
      unit: 'cup',
      zone: 'Dry Pantry',
      shelfBin: 'Top Jar #2',
      parLevel: 2,
      bestByDate: addDaysIso(logicalToday, 120),
    },
    { isSample: true, category: 'Dry Pantry' },
    { skipUndo: true }
  );

  await createRecord<PantryLotPayload>(
    'pantry_lot',
    'Whole Milk',
    {
      ingredientName: 'Whole Milk',
      canonicalName: 'milk',
      quantity: 3,
      unit: 'cup',
      zone: 'Fridge',
      shelfBin: 'Door Shelf',
      parLevel: 2,
      eatByDate: addDaysIso(logicalToday, 2),
    },
    { isSample: true, category: 'Fridge' },
    { skipUndo: true }
  );

  await createRecord<MealPlanPayload>(
    'meal_plan',
    'Honey Oat Skillet Pancakes',
    {
      date: logicalToday,
      slot: 'breakfast',
      entryType: 'recipe',
      recipeId: recipe.id,
      servings: 2,
    },
    { isSample: true, category: 'Meals' },
    { skipUndo: true }
  );
  });
}
