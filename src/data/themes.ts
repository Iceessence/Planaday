// Theme Studio Presets & Real OKLCH WCAG AA/AAA Contrast Guard (Section 14.02)

export type PaperMaterial =
  | 'warm-cream'
  | 'kraft'
  | 'charcoal-dot'
  | 'dot-grid-5mm'
  | 'graph'
  | 'college-ruled'
  | 'wide-ruled'
  | 'blank';

export type FontPairing =
  | 'editorial-serif'
  | 'neo-grotesk'
  | 'friendly-rounded'
  | 'cozy-handwritten'
  | 'crisp-monospace';

export type DensityMode = 'airy' | 'comfortable' | 'compact';
export type ColorSchemePreference = 'light' | 'dark' | 'system';

export interface ThemeTokens {
  canvas: string;
  paper: string;
  secondarySurface: string;
  primaryInk: string;
  mutedInk: string;
  primaryAccent: string;
  secondaryAccent: string;
  highlight: string;
  border: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  defaultPaper: PaperMaterial;
  tokens: ThemeTokens;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'warm-stationery',
    name: 'Warm Stationery',
    description: 'Cream paper, burnished gold & warm walnut ink (Hobonichi inspired)',
    isDark: false,
    defaultPaper: 'dot-grid-5mm',
    tokens: {
      canvas: '#efe9dc',
      paper: '#faf6ee',
      secondarySurface: '#f2ebdc',
      primaryInk: '#2a241d',
      mutedInk: '#6b5f50',
      primaryAccent: '#a97434',
      secondaryAccent: '#4f7a65',
      highlight: '#f7e3a8',
      border: '#dcd2be',
    },
  },
  {
    id: 'sage-minimal',
    name: 'Sage Minimal',
    description: 'Calm botanical teal and slate on soft alabaster',
    isDark: false,
    defaultPaper: 'dot-grid-5mm',
    tokens: {
      canvas: '#e6ece8',
      paper: '#f7faf8',
      secondarySurface: '#ebf1ed',
      primaryInk: '#1d2b28',
      mutedInk: '#546963',
      primaryAccent: '#2f6f62',
      secondaryAccent: '#526b7a',
      highlight: '#cfe8dc',
      border: '#cedad3',
    },
  },
  {
    id: 'cozy-pastel',
    name: 'Cozy Pastel',
    description: 'Soft rose, buttercup & lavender with automatic contrast-guarded buttons',
    isDark: false,
    defaultPaper: 'warm-cream',
    tokens: {
      canvas: '#f5ece9',
      paper: '#fffaf7',
      secondarySurface: '#f8eef0',
      primaryInk: '#35272d',
      mutedInk: '#78616a',
      primaryAccent: '#d98a9c',
      secondaryAccent: '#90b494',
      highlight: '#f9e79f',
      border: '#e8d7dc',
    },
  },
  {
    id: 'botanical-forest',
    name: 'Botanical Forest',
    description: 'Deep pine desk with warm moss accents & parchment spread',
    isDark: true,
    defaultPaper: 'charcoal-dot',
    tokens: {
      canvas: '#131d18',
      paper: '#1b2821',
      secondarySurface: '#22332a',
      primaryInk: '#ebf2ec',
      mutedInk: '#a0b5a8',
      primaryAccent: '#7eb892',
      secondaryAccent: '#d4a964',
      highlight: '#395542',
      border: '#2e4437',
    },
  },
  {
    id: 'midnight-studio',
    name: 'Midnight Studio',
    description: 'Indigo twilight paper for evening reflection and deep focus',
    isDark: true,
    defaultPaper: 'charcoal-dot',
    tokens: {
      canvas: '#121520',
      paper: '#191d2b',
      secondarySurface: '#21273a',
      primaryInk: '#eef0f8',
      mutedInk: '#9ea7c2',
      primaryAccent: '#86a2f5',
      secondaryAccent: '#d9a46c',
      highlight: '#313d63',
      border: '#2d354d',
    },
  },
  {
    id: 'true-amoled',
    name: 'True AMOLED Black',
    description: 'Pure #000000 canvas for OLED battery savings and Nightstand mode',
    isDark: true,
    defaultPaper: 'blank',
    tokens: {
      canvas: '#000000',
      paper: '#080808',
      secondarySurface: '#121212',
      primaryInk: '#f4f4f4',
      mutedInk: '#a3a3a3',
      primaryAccent: '#e0a958',
      secondaryAccent: '#69b898',
      highlight: '#2d2614',
      border: '#262626',
    },
  },
  {
    id: 'crisp-minimal',
    name: 'Crisp Minimal',
    description: 'Gallery-white editorial stationery with architectural graphite ink',
    isDark: false,
    defaultPaper: 'graph',
    tokens: {
      canvas: '#f1f2f4',
      paper: '#ffffff',
      secondarySurface: '#f6f7f9',
      primaryInk: '#16181c',
      mutedInk: '#5c6370',
      primaryAccent: '#2563eb',
      secondaryAccent: '#0f766e',
      highlight: '#dbeafe',
      border: '#dfe3ea',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'WCAG AAA maximum legibility stationery theme',
    isDark: false,
    defaultPaper: 'college-ruled',
    tokens: {
      canvas: '#ffffff',
      paper: '#ffffff',
      secondarySurface: '#f2f2f2',
      primaryInk: '#000000',
      mutedInk: '#262626',
      primaryAccent: '#003ea6',
      secondaryAccent: '#005c2e',
      highlight: '#ffea00',
      border: '#1f1f1f',
    },
  },
];

// --- OKLCH & WCAG 2.1 Relative Luminance Contrast Guard ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface OKLCH {
  L: number;
  C: number;
  H: number;
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { r: 128, g: 128, b: 128 };
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel(v: number): number {
  const clamped = Math.max(0, Math.min(1, v));
  const s = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

export function rgbToOklch(rgb: RGB): OKLCH {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bk * bk);
  let H = (Math.atan2(bk, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToRgb({ L, C, H }: OKLCH): RGB {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const bk = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bk;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bk;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bk;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: linearToSrgbChannel(r),
    g: linearToSrgbChannel(g),
    b: linearToSrgbChannel(b),
  };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Targets WCAG AA (>= 4.5) or AAA (>= 7.0); returns the best black/white ratio when the target is mathematically impossible
 * by inspecting OKLCH lightness and choosing/adjusting ink lightness if the desired ink fails contrast.
 */
export function guardReadableInk(
  bgHex: string,
  preferredInkHex?: string,
  minRatio = 4.5
): { color: string; ratio: number; adjusted: boolean } {
  if (preferredInkHex) {
    const existing = contrastRatio(bgHex, preferredInkHex);
    if (existing >= minRatio) {
      return { color: preferredInkHex, ratio: existing, adjusted: false };
    }
  }

  const darkInk = '#161411';
  const lightInk = '#faf8f4';

  const darkRatio = contrastRatio(bgHex, darkInk);
  const lightRatio = contrastRatio(bgHex, lightInk);

  // If user preferred a tinted ink, shift its OKLCH L toward dark or light until WCAG target is met
  if (preferredInkHex) {
    const base = rgbToOklch(hexToRgb(preferredInkHex));
    const goDarker = darkRatio >= lightRatio;
    for (let step = 1; step <= 20; step++) {
      const candidateL = goDarker
        ? Math.max(0.08, base.L - step * 0.045)
        : Math.min(0.98, base.L + step * 0.045);
      const candidateHex = rgbToHex(oklchToRgb({ L: candidateL, C: Math.min(base.C, 0.06), H: base.H }));
      const r = contrastRatio(bgHex, candidateHex);
      if (r >= minRatio) {
        return { color: candidateHex, ratio: r, adjusted: true };
      }
    }
  }

  const themed = darkRatio >= lightRatio ? { color: darkInk, ratio: darkRatio } : { color: lightInk, ratio: lightRatio };
  if (themed.ratio >= minRatio) return { ...themed, adjusted: true };
  const black = contrastRatio(bgHex, '#000000');
  const white = contrastRatio(bgHex, '#ffffff');
  return { color: black >= white ? '#000000' : '#ffffff', ratio: Math.max(black, white), adjusted: true };
}

export interface ComputedThemeVars {
  tokens: ThemeTokens;
  onPrimaryAccent: string;
  onSecondaryAccent: string;
  onHighlight: string;
  guardedPrimaryInk: string;
  guardedMutedInk: string;
  paperContrast: number;
  accentContrast: number;
  isDark: boolean;
}

export function computeGuardedTheme(tokens: ThemeTokens, minRatio = 4.5): ComputedThemeVars {
  const paperInk = guardReadableInk(tokens.paper, tokens.primaryInk, minRatio);
  const mutedInk = guardReadableInk(tokens.paper, tokens.mutedInk, Math.min(minRatio, 4.5));
  const accentInk = guardReadableInk(tokens.primaryAccent, undefined, minRatio);
  const secAccentInk = guardReadableInk(tokens.secondaryAccent, undefined, minRatio);
  const highlightInk = guardReadableInk(tokens.highlight, tokens.primaryInk, minRatio);
  const isDark = relativeLuminance(tokens.paper) < 0.25;

  return {
    tokens,
    onPrimaryAccent: accentInk.color,
    onSecondaryAccent: secAccentInk.color,
    onHighlight: highlightInk.color,
    guardedPrimaryInk: paperInk.color,
    guardedMutedInk: mutedInk.color,
    paperContrast: paperInk.ratio,
    accentContrast: accentInk.ratio,
    isDark,
  };
}

export function serializeThemePack(name: string, tokens: ThemeTokens, paper: PaperMaterial): string {
  return JSON.stringify(
    {
      format: 'dayplana-theme-v2',
      extension: '.dmtheme',
      name,
      paper,
      tokens,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function parseThemePack(jsonText: string): { name: string; tokens: ThemeTokens; paper?: PaperMaterial } {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || !parsed.tokens) {
    throw new Error('Invalid .dmtheme file: missing tokens object');
  }
  const required: Array<keyof ThemeTokens> = [
    'canvas',
    'paper',
    'secondarySurface',
    'primaryInk',
    'mutedInk',
    'primaryAccent',
    'secondaryAccent',
    'highlight',
    'border',
  ];
  for (const k of required) {
    if (typeof parsed.tokens[k] !== 'string') {
      throw new Error(`Invalid .dmtheme file: missing color token "${k}"`);
    }
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : 'Imported Theme',
    tokens: parsed.tokens as ThemeTokens,
    paper: parsed.paper,
  };
}
