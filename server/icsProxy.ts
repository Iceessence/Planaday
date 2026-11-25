import { safeOutboundFetch } from './outboundPolicy.js';

export async function fetchRemoteIcs(urlStr: string): Promise<string> {
  const res = await safeOutboundFetch(
    urlStr,
    {
      headers: { 'User-Agent': 'PlanadayCalendar/4.1', Accept: 'text/calendar,text/plain' },
    },
    { purpose: 'ics', maxResponseBytes: 2 * 1024 * 1024, timeoutMs: 12_000 }
  );
  if (!res.ok) throw new Error(`ICS feed fetch failed (${res.status})`);
  return res.body.toString('utf8');
}

export async function lookupBarcodeOpenFoodFacts(code: string): Promise<{
  found: boolean;
  name?: string;
  brand?: string;
  quantityText?: string;
}> {
  const clean = code.replace(/[^0-9A-Za-z-]/g, '');
  if (!clean) return { found: false };
  try {
    const res = await safeOutboundFetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json`,
      { headers: { 'User-Agent': 'PlanadayPantry/4.1' } },
      { purpose: 'barcode', maxResponseBytes: 512 * 1024, timeoutMs: 8000 }
    );
    if (!res.ok) return { found: false };
    const data = JSON.parse(res.body.toString('utf8')) as {
      status?: number;
      product?: { product_name?: string; brands?: string; quantity?: string };
    };
    if (data.status === 1 && data.product?.product_name) {
      return {
        found: true,
        name: data.product.product_name,
        brand: data.product.brands,
        quantityText: data.product.quantity,
      };
    }
  } catch {
    // Graceful offline fallback
  }
  return { found: false };
}
