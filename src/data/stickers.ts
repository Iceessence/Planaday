export interface BuiltInSticker {
  id: string;
  name: string;
  category: StickerCategory;
  codepoints: string;
  emoji: string;
}

export type StickerCategory =
  | 'Birthdays'
  | 'Celebrations'
  | 'Family & Friends'
  | 'Work & Meetings'
  | 'Travel'
  | 'Health & Wellness'
  | 'Learning & Tech'
  | 'Money & Bills'
  | 'Home & Chores'
  | 'Food & Drinks'
  | 'Fun & Hobbies'
  | 'Nature & Pets'
  | 'Reminders'
  | 'Seasonal'
  | 'Love & Milestones'
  | 'Planning'
  | 'Laboratory & Science'
  | 'Weather & Sky'
  | 'Shapes & Badges'
  | 'Moods & Reactions';

export const STICKER_CATEGORIES: StickerCategory[] = [
  'Birthdays',
  'Celebrations',
  'Family & Friends',
  'Work & Meetings',
  'Travel',
  'Health & Wellness',
  'Learning & Tech',
  'Money & Bills',
  'Home & Chores',
  'Food & Drinks',
  'Fun & Hobbies',
  'Nature & Pets',
  'Reminders',
  'Seasonal',
  'Love & Milestones',
  'Planning',
  'Laboratory & Science',
  'Weather & Sky',
  'Shapes & Badges',
  'Moods & Reactions',
];

function cpToEmoji(codepoints: string): string {
  const parts = codepoints
    .trim()
    .split(/\s+/)
    .map((p) => Number.parseInt(p.replace(/^U\+/i, ''), 16));
  const raw = String.fromCodePoint(...parts);
  // Add emoji presentation selector for single BMP symbols when helpful
  if (parts.length === 1 && parts[0] < 0x10000 && parts[0] !== 0x200d) {
    return `${raw}\uFE0F`;
  }
  return raw;
}

type RawSpec = [StickerCategory, Array<[string, string]>];

const RAW_CATALOG: RawSpec[] = [
  [
    'Birthdays',
    [
      ['Birthday cake', 'U+1F382'],
      ['Cupcake', 'U+1F9C1'],
      ['Present', 'U+1F381'],
      ['Balloon', 'U+1F388'],
      ['Birthday party', 'U+1F973'],
      ['Confetti', 'U+1F38A'],
      ['Pinata', 'U+1FA85'],
      ['Cake slice', 'U+1F370'],
      ['Candle', 'U+1F56F'],
      ['Celebration', 'U+1F389'],
      ['Birthday crown', 'U+1F451'],
      ['Gift bow', 'U+1F380'],
      ['Candy', 'U+1F36C'],
    ],
  ],
  [
    'Celebrations',
    [
      ['Toast', 'U+1F942'],
      ['Champagne', 'U+1F37E'],
      ['Trophy', 'U+1F3C6'],
      ['Gold medal', 'U+1F947'],
      ['Shining star', 'U+1F31F'],
      ['Special moment', 'U+2728'],
      ['Sparkles', 'U+2728'],
      ['Sparkler', 'U+1F387'],
      ['Fireworks', 'U+1F386'],
      ['Applause', 'U+1F44F'],
      ['Dancing', 'U+1F483'],
      ['Disco ball', 'U+1FAA9'],
      ['Karaoke', 'U+1F3A4'],
    ],
  ],
  [
    'Family & Friends',
    [
      ['Family day', 'U+1F46A'],
      ['Baby', 'U+1F476'],
      ['Friends', 'U+1F9D1 U+200D U+1F91D U+200D U+1F9D1'],
      ['Hug', 'U+1FAC2'],
      ['Visitor', 'U+1F6AA'],
      ['Family visit', 'U+1F3E1'],
      ['Support', 'U+1F91D'],
      ['Grandparent', 'U+1F475'],
      ['Grandfather', 'U+1F474'],
      ['Kids', 'U+1F9D2'],
      ['Baby care', 'U+1F37C'],
      ['Catch up', 'U+2615'],
      ['Game night', 'U+1F3B2'],
    ],
  ],
  [
    'Work & Meetings',
    [
      ['Work', 'U+1F4BC'],
      ['Meeting', 'U+1F5D3'],
      ['Computer work', 'U+1F4BB'],
      ['Call', 'U+1F4DE'],
      ['Email', 'U+1F4E7'],
      ['Files', 'U+1F4C1'],
      ['Presentation', 'U+1F4CA'],
      ['Growth', 'U+1F4C8'],
      ['Action items', 'U+2705'],
      ['Deadline', 'U+23F0'],
      ['Signature', 'U+270D'],
      ['Deep work', 'U+1F9E0'],
      ['Business meeting', 'U+1F91D'],
    ],
  ],
  [
    'Travel',
    [
      ['Flight', 'U+2708'],
      ['Packing', 'U+1F9F3'],
      ['Road trip', 'U+1F697'],
      ['Train', 'U+1F686'],
      ['Bike ride', 'U+1F6B2'],
      ['Bus', 'U+1F68C'],
      ['Cruise', 'U+1F6F3'],
      ['Beach', 'U+1F3D6'],
      ['Camping', 'U+1F3D5'],
      ['Map', 'U+1F5FA'],
      ['Departure', 'U+1F6EB'],
      ['Arrival', 'U+1F6EC'],
      ['Hotel', 'U+1F3E8'],
    ],
  ],
  [
    'Health & Wellness',
    [
      ['Run', 'U+1F3C3'],
      ['Workout', 'U+1F3CB'],
      ['Meditation', 'U+1F9D8'],
      ['Walk', 'U+1F6B6'],
      ['Sleep', 'U+1F634'],
      ['Hydrate', 'U+1F4A7'],
      ['Checkup', 'U+1FA7A'],
      ['Medicine', 'U+1F48A'],
      ['Healthy eating', 'U+1F957'],
      ['Dentist', 'U+1F9B7'],
      ['Cycling', 'U+1F6B4'],
      ['Swim', 'U+1F3CA'],
      ['Mental wellness', 'U+1F9E0'],
    ],
  ],
  [
    'Learning & Tech',
    [
      ['Reading', 'U+1F4D6'],
      ['Book', 'U+1F4DA'],
      ['Course', 'U+1F393'],
      ['Idea', 'U+1F4A1'],
      ['Science', 'U+1F52C'],
      ['Experiment', 'U+1F9EA'],
      ['Artificial intelligence', 'U+1F916'],
      ['Technology', 'U+1F4BB'],
      ['Coding', 'U+1F468 U+200D U+1F4BB'],
      ['Math', 'U+1F9EE'],
      ['Astronomy', 'U+1F52D'],
      ['Genetics', 'U+1F9EC'],
      ['Language practice', 'U+1F5E3'],
    ],
  ],
  [
    'Money & Bills',
    [
      ['Savings', 'U+1F437'],
      ['Payday', 'U+1F4B5'],
      ['Payment', 'U+1F4B3'],
      ['Coins', 'U+1FA99'],
      ['Bank', 'U+1F3E6'],
      ['Expenses', 'U+1F4B8'],
      ['Receipt', 'U+1F9FE'],
      ['Bills', 'U+1F4C4'],
      ['Shopping', 'U+1F6CD'],
      ['Delivery', 'U+1F4E6'],
      ['Insurance', 'U+1F6E1'],
      ['Sale', 'U+1F3F7'],
      ['Budget', 'U+1F4CA'],
    ],
  ],
  [
    'Home & Chores',
    [
      ['Home', 'U+1F3E0'],
      ['Cleaning', 'U+1F9F9'],
      ['Laundry', 'U+1F9FA'],
      ['Dishes', 'U+1F37D'],
      ['Groceries', 'U+1F6D2'],
      ['Repairs', 'U+1F527'],
      ['Keys', 'U+1F511'],
      ['House plants', 'U+1FAB4'],
      ['Mop', 'U+1F9F9'],
      ['Bedroom', 'U+1F6CF'],
      ['Tools', 'U+1F6E0'],
      ['Scrubbing', 'U+1F9FD'],
      ['Mail', 'U+1F4EC'],
    ],
  ],
  [
    'Food & Drinks',
    [
      ['Coffee', 'U+2615'],
      ['Tea', 'U+1F375'],
      ['Dinner', 'U+1F37D'],
      ['Breakfast', 'U+1F95E'],
      ['Pizza', 'U+1F355'],
      ['Burger', 'U+1F354'],
      ['Sushi', 'U+1F363'],
      ['Pastry', 'U+1F950'],
      ['Avocado', 'U+1F951'],
      ['Drink', 'U+1F964'],
      ['Berries', 'U+1FAD0'],
      ['Cookies', 'U+1F36A'],
      ['Cooking', 'U+1F373'],
    ],
  ],
  [
    'Fun & Hobbies',
    [
      ['Video games', 'U+1F3AE'],
      ['Movie night', 'U+1F3AC'],
      ['Music', 'U+1F3B5'],
      ['Art', 'U+1F3A8'],
      ['Photography', 'U+1F4F7'],
      ['Guitar', 'U+1F3B8'],
      ['Piano', 'U+1F3B9'],
      ['Soccer', 'U+26BD'],
      ['Basketball', 'U+1F3C0'],
      ['Puzzle', 'U+1F9E9'],
      ['Darts', 'U+1F3AF'],
      ['Fishing', 'U+1F3A3'],
      ['Bowling', 'U+1F3B3'],
      ['Racing', 'U+1F3CE'],
      ['Baseball', 'U+26BE'],
      ['Football', 'U+1F3C8'],
    ],
  ],
  [
    'Nature & Pets',
    [
      ['Sunflower', 'U+1F33B'],
      ['Gardening', 'U+1F331'],
      ['Trees', 'U+1F333'],
      ['Flowers', 'U+1F490'],
      ['Dog', 'U+1F436'],
      ['Cat', 'U+1F431'],
      ['Bird', 'U+1F426'],
      ['Butterfly', 'U+1F98B'],
      ['Bee', 'U+1F41D'],
      ['Rainbow', 'U+1F308'],
      ['Sunshine', 'U+2600'],
      ['Moon', 'U+1F319'],
      ['Ocean', 'U+1F30A'],
    ],
  ],
  [
    'Reminders',
    [
      ['Important', 'U+2757'],
      ['Very important', 'U+203C'],
      ['Reminder', 'U+1F514'],
      ['Alarm', 'U+23F0'],
      ['Due soon', 'U+23F3'],
      ['Pin', 'U+1F4CC'],
      ['Completed', 'U+2705'],
      ['Checklist', 'U+1F4CB'],
      ['Urgent', 'U+1F6A8'],
      ['Recurring', 'U+1F501'],
      ['Avoid', 'U+1F6AB'],
      ['Caution', 'U+26A0'],
      ['Research', 'U+1F50D'],
    ],
  ],
  [
    'Seasonal',
    [
      ['Winter', 'U+2744'],
      ['Snow day', 'U+2603'],
      ['Christmas', 'U+1F384'],
      ['Halloween', 'U+1F383'],
      ['Autumn', 'U+1F342'],
      ['Santa', 'U+1F385'],
      ['Easter', 'U+1F423'],
      ['Thanksgiving', 'U+1F983'],
      ['Spring', 'U+1F338'],
      ['Summer', 'U+2600'],
      ['Festival', 'U+1F3AA'],
      ['Harvest moon', 'U+1F315'],
      ['Breeze', 'U+1F343'],
    ],
  ],
  [
    'Love & Milestones',
    [
      ['Love', 'U+2764'],
      ['Anniversary', 'U+1F48D'],
      ['Flowers', 'U+1F339'],
      ['Love letter', 'U+1F48C'],
      ['Together', 'U+1F491'],
      ['Affection', 'U+1F970'],
      ['Valentine', 'U+1F49D'],
      ['Wedding', 'U+1F492'],
      ['Groom', 'U+1F935'],
      ['Rose', 'U+1F339'],
      ['Date night', 'U+1F56F'],
      ['Magic moment', 'U+2728'],
      ['Embrace', 'U+1FAC2'],
    ],
  ],
  [
    'Planning',
    [
      ['Plan day', 'U+1F4C5'],
      ['Calendar', 'U+1F4C6'],
      ['Journal', 'U+1F4D3'],
      ['Organize', 'U+1F5C2'],
      ['Notebook', 'U+1F4D2'],
      ['Location', 'U+1F4CD'],
      ['Project', 'U+1F4C2'],
      ['Direction', 'U+1F9ED'],
      ['Bookmark', 'U+1F516'],
      ['Archive', 'U+1F4E6'],
      ['Documents', 'U+1F4C4'],
      ['Write', 'U+270F'],
      ['Calculate', 'U+1F9EE'],
      ['Focus target', 'U+1F3AF'],
      ['Scan document', 'U+1F4F7'],
      ['PDF reading', 'U+1F4D6'],
    ],
  ],
  [
    'Laboratory & Science',
    [
      ['Test tube', 'U+1F9EA'],
      ['Alembic', 'U+2697'],
      ['Microscope', 'U+1F52C'],
      ['Petri dish', 'U+1F9EB'],
      ['DNA helix', 'U+1F9EC'],
      ['Lab coat', 'U+1F97C'],
      ['Safety goggles', 'U+1F97D'],
      ['Balance scale', 'U+2696'],
      ['Thermometer', 'U+1F321'],
      ['Atom', 'U+269B'],
      ['Biohazard', 'U+2623'],
      ['Clipboard QC', 'U+1F4CB'],
      ['Chart trend', 'U+1F4C8'],
      ['Magnet', 'U+1F9F2'],
      ['Sample vial', 'U+1F9EA'],
      ['Data review', 'U+1F4CA'],
      ['Calibration', 'U+1F4CF'],
    ],
  ],
  [
    'Weather & Sky',
    [
      ['Bright sun', 'U+2600'],
      ['Partly sunny', 'U+26C5'],
      ['Rain cloud', 'U+1F327'],
      ['Lightning', 'U+26A1'],
      ['Snowflake', 'U+2744'],
      ['Rainbow', 'U+1F308'],
      ['Crescent moon', 'U+1F319'],
      ['Shooting star', 'U+1F320'],
      ['Comet', 'U+2604'],
      ['Wind', 'U+1F32C'],
      ['Fog', 'U+1F32B'],
      ['Sunrise', 'U+1F305'],
    ],
  ],
  [
    'Shapes & Badges',
    [
      ['Gold star', 'U+2B50'],
      ['Check badge', 'U+2705'],
      ['Red circle', 'U+1F534'],
      ['Blue circle', 'U+1F535'],
      ['Green circle', 'U+1F7E2'],
      ['Yellow diamond', 'U+1F538'],
      ['Purple heart', 'U+1F49C'],
      ['Pushpin', 'U+1F4CC'],
      ['Flag goal', 'U+1F6A9'],
      ['Trophy', 'U+1F3C6'],
      ['Medal', 'U+1F3C5'],
      ['Crown', 'U+1F451'],
      ['Sparkle', 'U+2728'],
      ['Fire streak', 'U+1F525'],
    ],
  ],
  [
    'Moods & Reactions',
    [
      ['Beaming smile', 'U+1F604'],
      ['Warm calm', 'U+1F60C'],
      ['Star struck', 'U+1F929'],
      ['Thinking', 'U+1F914'],
      ['Tired', 'U+1F634'],
      ['Determined', 'U+1F4AA'],
      ['Party mind', 'U+1F92F'],
      ['Grateful hands', 'U+1F64F'],
      ['Thumbs up', 'U+1F44D'],
      ['Clapping', 'U+1F44F'],
      ['Brain focus', 'U+1F9E0'],
      ['Coffee boost', 'U+2615'],
    ],
  ],
];

export const BUILTIN_STICKERS: BuiltInSticker[] = RAW_CATALOG.flatMap(([category, entries], catIdx) =>
  entries.map(([name, codepoints], idx) => ({
    id: `stk-${catIdx + 1}-${idx + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    category,
    codepoints,
    emoji: cpToEmoji(codepoints),
  }))
);

export const STICKER_BY_ID = new Map(BUILTIN_STICKERS.map((s) => [s.id, s]));
