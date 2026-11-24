export async function fetchRemoteIcs(urlStr: string): Promise<string> {
  const parsed = new URL(urlStr);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS ICS URLs are supported.');
  }
  const res = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'DayplanaCalendar/2.0', Accept: 'text/calendar,text/plain' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ICS feed fetch failed (${res.status})`);
  return res.text();
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
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json`, {
      headers: { 'User-Agent': 'DayplanaPantry/2.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { found: false };
    const data = (await res.json()) as {
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
