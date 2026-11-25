export interface ParsedRecipeDraft {
  title: string;
  sourceUrl: string;
  cuisine?: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  restMin: number;
  ingredients: string[];
  steps: string[];
  imageUrl?: string;
  nutrition?: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number };
}

function parseIsoDurationMinutes(iso?: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) {
    const num = Number.parseInt(iso, 10);
    return Number.isFinite(num) ? num : 0;
  }
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  return days * 1440 + hours * 60 + mins;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function findRecipeNode(json: unknown): Record<string, unknown> | null {
  if (!json) return null;
  if (Array.isArray(json)) {
    for (const item of json) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const t = obj['@type'];
    if (
      t === 'Recipe' ||
      (Array.isArray(t) && t.includes('Recipe')) ||
      (typeof t === 'string' && t.endsWith('/Recipe'))
    ) {
      return obj;
    }
    if (Array.isArray(obj['@graph'])) {
      const found = findRecipeNode(obj['@graph']);
      if (found) return found;
    }
  }
  return null;
}

function extractInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n+/)
      .map((s) => decodeHtmlEntities(s))
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const clean = decodeHtmlEntities(item);
        if (clean) out.push(clean);
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if (Array.isArray(o.itemListElement)) {
          out.push(...extractInstructions(o.itemListElement));
        } else if (typeof o.text === 'string') {
          const clean = decodeHtmlEntities(o.text);
          if (clean) out.push(clean);
        }
      }
    }
    return out;
  }
  return [];
}

function parseServings(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  if (Array.isArray(raw) && raw.length > 0) return parseServings(raw[0]);
  if (typeof raw === 'string') {
    const m = raw.match(/(\d+)/);
    if (m) return Math.max(1, Number(m[1]));
  }
  return 4;
}

export function extractRecipeFromHtml(html: string, sourceUrl: string): ParsedRecipeDraft {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const node = findRecipeNode(parsed);
      if (node) {
        const ingredients = Array.isArray(node.recipeIngredient)
          ? node.recipeIngredient.map((s) => decodeHtmlEntities(String(s))).filter(Boolean)
          : [];
        const steps = extractInstructions(node.recipeInstructions);
        const imageRaw = node.image;
        const imageUrl =
          typeof imageRaw === 'string'
            ? imageRaw
            : Array.isArray(imageRaw)
              ? typeof imageRaw[0] === 'string'
                ? imageRaw[0]
                : (imageRaw[0] as Record<string, unknown>)?.url as string | undefined
              : (imageRaw as Record<string, unknown>)?.url as string | undefined;

        const nut = node.nutrition as Record<string, unknown> | undefined;
        const numOf = (v: unknown) => {
          const m2 = String(v ?? '').match(/(\d+(?:\.\d+)?)/);
          return m2 ? Number(m2[1]) : undefined;
        };

        return {
          title: decodeHtmlEntities(String(node.name || 'Imported Recipe')),
          sourceUrl,
          cuisine: Array.isArray(node.recipeCuisine)
            ? String(node.recipeCuisine[0] ?? '')
            : typeof node.recipeCuisine === 'string'
              ? node.recipeCuisine
              : undefined,
          servings: parseServings(node.recipeYield),
          prepMin: parseIsoDurationMinutes(node.prepTime as string | undefined),
          cookMin: parseIsoDurationMinutes(node.cookTime as string | undefined),
          restMin: 0,
          ingredients,
          steps,
          imageUrl,
          nutrition: nut
            ? {
                calories: numOf(nut.calories),
                proteinG: numOf(nut.proteinContent),
                carbsG: numOf(nut.carbohydrateContent),
                fatG: numOf(nut.fatContent),
              }
            : undefined,
        };
      }
    } catch {
      // continue scanning other ld+json blocks
    }
  }

  // Fallback title & list extraction
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : 'Clipped Recipe';
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const items: string[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = liRegex.exec(html)) !== null && items.length < 40) {
    const t = decodeHtmlEntities(lm[1]);
    if (t.length > 3 && t.length < 240) items.push(t);
  }

  return {
    title,
    sourceUrl,
    servings: 4,
    prepMin: 15,
    cookMin: 25,
    restMin: 0,
    ingredients: items.slice(0, 12),
    steps: items.slice(12, 20),
  };
}

import { safeOutboundFetch } from './outboundPolicy.js';

export async function fetchAndParseRecipeUrl(urlStr: string): Promise<ParsedRecipeDraft> {
  const res = await safeOutboundFetch(
    urlStr,
    {
      headers: {
        'User-Agent': 'PlanadayRecipeClipper/4.1 (+self-hosted)',
        Accept: 'text/html,application/xhtml+xml',
      },
    },
    { purpose: 'recipe', maxResponseBytes: 2 * 1024 * 1024, timeoutMs: 12_000 }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch recipe page (${res.status})`);
  }

  const html = res.body.toString('utf8');
  return extractRecipeFromHtml(html, res.finalUrl);
}
