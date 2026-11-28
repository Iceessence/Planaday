// Centralized Outbound Integration & SSRF Egress Policy (PD-014 / §31)
// Validates protocols, blocks loopback/private/link-local/metadata IP ranges (including DNS resolution),
// validates redirects manually (max 3 hops), and enforces response byte and timeout caps.

import dns from 'node:dns/promises';
import net from 'node:net';

export interface OutboundPolicyOptions {
  allowHttp?: boolean;
  allowedHosts?: string[];
  maxRedirects?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  purpose?: string;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;

function parseEnvAllowlist(): string[] {
  const raw = process.env.PLANADAY_ALLOWED_OUTBOUND_HOSTS || '';
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '').toLowerCase();
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 RFC1918
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / Tailscale
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::' || clean === '::1') return true;
    // Detect IPv4-mapped IPv6 in hex form (e.g. ::ffff:7f00:1 or 0:0:0:0:0:ffff:7f00:1)
    const mappedHex = clean.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      return isPrivateOrReservedIp(v4);
    }
    // Detect full zero-padded IPv4-mapped or loopback forms (e.g. 0:0:0:0:0:0:0:1 or 0:0:0:0:0:ffff:127.0.0.1)
    if (/^(?:0+:){5}ffff:/i.test(clean)) {
      return isPrivateOrReservedIp(clean.replace(/^(?:0+:){5}ffff:/i, ''));
    }
    if (/^(?:0+:){7}0*1$/i.test(clean) || /^(?:0+:){7}0+$/i.test(clean)) return true;
    if (clean.startsWith('64:ff9b:') || clean.startsWith('100::')) return true; // NAT64 & RFC 6666 discard
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // Unique local fc00::/7
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
      return true; // Link-local fe80::/10
    }
    if (clean.startsWith('ff')) return true; // Multicast
    return false;
  }
  return true;
}

export async function validateOutboundUrl(urlStr: string, opts: OutboundPolicyOptions = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Invalid outbound URL.');
  }

  const allowHttp = opts.allowHttp ?? process.env.PLANADAY_ALLOW_INSECURE_HTTP === 'true';
  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Outbound protocol "${parsed.protocol}" is blocked by security policy (use https://).`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in outbound URLs are prohibited.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new Error('Outbound URL missing hostname.');

  const explicitAllowlist = new Set([...parseEnvAllowlist(), ...(opts.allowedHosts ?? []).map((h) => h.toLowerCase())]);
  if (explicitAllowlist.has(hostname) || explicitAllowlist.has(parsed.host.toLowerCase())) {
    return parsed;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Outbound host "${hostname}" is blocked by local-network SSRF policy.`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Outbound IP "${hostname}" is in a private or reserved network range.`);
    }
    return parsed;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Unable to resolve outbound host "${hostname}".`);
  }

  if (!resolved.length) {
    throw new Error(`No DNS records found for outbound host "${hostname}".`);
  }

  for (const entry of resolved) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new Error(`Outbound host "${hostname}" resolves to private/reserved IP ${entry.address} and was blocked.`);
    }
  }

  return parsed;
}

export async function safeOutboundFetch(
  urlStr: string,
  init: RequestInit = {},
  opts: OutboundPolicyOptions = {}
): Promise<{ status: number; ok: boolean; headers: Headers; body: Buffer; finalUrl: string }> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = opts.maxResponseBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = (await validateOutboundUrl(urlStr, opts)).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect response (${res.status}) missing Location header.`);
      if (hop === maxRedirects) throw new Error(`Exceeded maximum allowed redirects (${maxRedirects}).`);
      const nextUrl = new URL(loc, currentUrl).toString();
      currentUrl = (await validateOutboundUrl(nextUrl, opts)).toString();
      continue;
    }

    const declaredLen = Number(res.headers.get('content-length') || '0');
    if (declaredLen > maxBytes) {
      throw new Error(`Outbound response (${declaredLen} bytes) exceeds maximum policy cap (${maxBytes} bytes).`);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error(`Outbound response exceeded maximum policy cap (${maxBytes} bytes).`);
          }
          chunks.push(value);
        }
      }
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: Buffer.concat(chunks),
      finalUrl: currentUrl,
    };
  }

  throw new Error('Outbound request failed redirect validation.');
}
