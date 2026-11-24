export interface IngredientDensity {
  id: string;
  ingredient: string;
  aliases: string[];
  gramsPerCup: number;
  densityGPerMl: number;
  notes: string;
}

// Appendix B: Bundled Cooking Density Reference (for Mass <-> Volume Conversion)
export const COOKING_DENSITIES: IngredientDensity[] = [
  {
    id: 'water-milk-broth',
    ingredient: 'Water / Milk / Broth',
    aliases: ['water', 'milk', 'whole milk', 'skim milk', 'almond milk', 'oat milk', 'broth', 'stock', 'chicken broth', 'vegetable broth', 'buttermilk'],
    gramsPerCup: 240,
    densityGPerMl: 1.0,
    notes: 'Exact baseline',
  },
  {
    id: 'all-purpose-flour',
    ingredient: 'All-purpose flour (spooned)',
    aliases: ['flour', 'all-purpose flour', 'all purpose flour', 'ap flour', 'wheat flour', 'bread flour', 'pastry flour', 'cake flour'],
    gramsPerCup: 120,
    densityGPerMl: 0.51,
    notes: 'Sifted is ~110 g',
  },
  {
    id: 'granulated-sugar',
    ingredient: 'Granulated white sugar',
    aliases: ['sugar', 'white sugar', 'granulated sugar', 'caster sugar', 'brown sugar', 'cane sugar'],
    gramsPerCup: 200,
    densityGPerMl: 0.85,
    notes: 'Packed brown ~213 g',
  },
  {
    id: 'butter',
    ingredient: 'Butter (unsalted/salted)',
    aliases: ['butter', 'unsalted butter', 'salted butter', 'melted butter'],
    gramsPerCup: 227,
    densityGPerMl: 0.96,
    notes: '1 stick = 113.5 g',
  },
  {
    id: 'olive-vegetable-oil',
    ingredient: 'Olive / Vegetable oil',
    aliases: ['oil', 'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil', 'avocado oil', 'neutral oil', 'sunflower oil'],
    gramsPerCup: 216,
    densityGPerMl: 0.91,
    notes: '1 tbsp = 13.5 g',
  },
  {
    id: 'honey-maple-syrup',
    ingredient: 'Honey / Maple syrup',
    aliases: ['honey', 'maple syrup', 'syrup', 'agave', 'molasses'],
    gramsPerCup: 340,
    densityGPerMl: 1.42,
    notes: '1 tbsp = 21 g',
  },
  {
    id: 'rolled-oats',
    ingredient: 'Rolled oats',
    aliases: ['oats', 'rolled oats', 'old-fashioned oats', 'oatmeal'],
    gramsPerCup: 90,
    densityGPerMl: 0.38,
    notes: 'Steel-cut ~160 g',
  },
  {
    id: 'uncooked-white-rice',
    ingredient: 'Uncooked white rice',
    aliases: ['rice', 'white rice', 'uncooked rice', 'jasmine rice', 'basmati rice', 'long-grain rice'],
    gramsPerCup: 185,
    densityGPerMl: 0.78,
    notes: 'Long-grain',
  },
  {
    id: 'table-salt',
    ingredient: 'Table salt / Fine sea salt',
    aliases: ['salt', 'table salt', 'sea salt', 'fine sea salt', 'kosher salt'],
    gramsPerCup: 288,
    densityGPerMl: 1.22,
    notes: '1 tsp = 6 g (Kosher ~3-5 g)',
  },
  {
    id: 'cocoa-powder',
    ingredient: 'Cocoa powder (unsweetened)',
    aliases: ['cocoa', 'cocoa powder', 'unsweetened cocoa', 'dutch process cocoa'],
    gramsPerCup: 85,
    densityGPerMl: 0.36,
    notes: '1 tbsp = 5.3 g',
  },
];

export const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  'fl oz': 29.5735,
  cup: 236.588,
  cups: 236.588,
  pint: 473.176,
  quart: 946.353,
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
};

export const MASS_TO_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  stick: 113.5,
  sticks: 113.5,
};

export function findIngredientDensity(name: string): IngredientDensity | undefined {
  const norm = name.toLowerCase().trim();
  if (!norm) return undefined;
  return COOKING_DENSITIES.find(
    (d) =>
      d.ingredient.toLowerCase().includes(norm) ||
      d.aliases.some((alias) => norm === alias || norm.includes(alias))
  );
}

export interface ConversionResult {
  value: number;
  unit: string;
  densityUsed?: IngredientDensity;
  warning?: string;
}

export function convertCookingUnit(
  amount: number,
  fromUnit: string,
  toUnit: string,
  ingredientName: string
): ConversionResult {
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();
  if (f === t) return { value: amount, unit: toUnit };

  const fromVol = VOLUME_TO_ML[f];
  const toVol = VOLUME_TO_ML[t];
  const fromMass = MASS_TO_G[f];
  const toMass = MASS_TO_G[t];

  if (fromVol && toVol) {
    return { value: (amount * fromVol) / toVol, unit: toUnit };
  }
  if (fromMass && toMass) {
    return { value: (amount * fromMass) / toMass, unit: toUnit };
  }

  const density = findIngredientDensity(ingredientName);
  if (!density) {
    return {
      value: amount,
      unit: fromUnit,
      warning: `Unknown density for "${ingredientName || 'ingredient'}": cannot convert ${fromUnit} to ${toUnit} accurately.`,
    };
  }

  // Exact cup <-> gram calibration when using cups
  if (fromVol && toMass) {
    const grams =
      f === 'cup' || f === 'cups'
        ? amount * density.gramsPerCup
        : amount * fromVol * density.densityGPerMl;
    return { value: grams / toMass, unit: toUnit, densityUsed: density };
  }

  if (fromMass && toVol) {
    const grams = amount * fromMass;
    if (t === 'cup' || t === 'cups') {
      return { value: grams / density.gramsPerCup, unit: toUnit, densityUsed: density };
    }
    const ml = grams / density.densityGPerMl;
    return { value: ml / toVol, unit: toUnit, densityUsed: density };
  }

  return {
    value: amount,
    unit: fromUnit,
    warning: `Unsupported unit conversion from "${fromUnit}" to "${toUnit}".`,
  };
}

export function formatRationalFraction(val: number): string {
  if (!Number.isFinite(val)) return '';
  if (val === 0) return '0';
  const whole = Math.floor(val + 1e-6);
  const rem = val - whole;
  const fractions: Array<[number, string]> = [
    [0, ''],
    [1 / 8, '⅛'],
    [1 / 4, '¼'],
    [1 / 3, '⅓'],
    [3 / 8, '⅜'],
    [1 / 2, '½'],
    [5 / 8, '⅝'],
    [2 / 3, '⅔'],
    [3 / 4, '¾'],
    [7 / 8, '⅞'],
    [1, '1'],
  ];
  let best = fractions[0];
  let bestDiff = Math.abs(rem - best[0]);
  for (const f of fractions) {
    const d = Math.abs(rem - f[0]);
    if (d < bestDiff) {
      bestDiff = d;
      best = f;
    }
  }
  if (bestDiff > 0.045) {
    return Number(val.toFixed(2)).toString();
  }
  if (best[0] === 1) return String(whole + 1);
  if (whole === 0) return best[1] || '0';
  return best[1] ? `${whole} ${best[1]}` : String(whole);
}

export function parseQuantityText(raw: string): number {
  const cleaned = raw
    .trim()
    .replace('⅛', ' 1/8')
    .replace('¼', ' 1/4')
    .replace('⅓', ' 1/3')
    .replace('⅜', ' 3/8')
    .replace('½', ' 1/2')
    .replace('⅝', ' 5/8')
    .replace('⅔', ' 2/3')
    .replace('¾', ' 3/4')
    .replace('⅞', ' 7/8')
    .trim();
  if (!cleaned) return 0;
  const parts = cleaned.split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/').map(Number);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        total += num / den;
      }
    } else {
      const n = Number(p);
      if (Number.isFinite(n)) total += n;
    }
  }
  return total;
}
