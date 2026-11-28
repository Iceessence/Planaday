/**
 * Authenticated Server Bridge to Optional Self-Hosted NVIDIA GPU Microservice (v4.2.0 §6).
 *
 * - Never required: cleanly returns `{ ok: true, available: false, fallback: 'local' }` when
 *   PLANADAY_GPU_URL is unset or the GPU container is offline/restarting.
 * - Authenticated via internal Bearer token so only Planaday server can submit GPU jobs.
 * - Never used for routine UI, typing, or SQLite queries — ONLY heavy OCR, image enhancement,
 *   embeddings, and explicit hardware benchmarks.
 */

export interface GpuBridgeOptions {
  gpuUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GpuServiceBridge {
  private gpuUrl: string;
  private internalToken: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: GpuBridgeOptions = {}) {
    this.gpuUrl = (opts.gpuUrl ?? process.env.PLANADAY_GPU_URL ?? '').trim().replace(/\/+$/, '');
    this.internalToken = (opts.internalToken ?? process.env.PLANADAY_GPU_INTERNAL_TOKEN ?? '').trim();
    this.timeoutMs = opts.timeoutMs ?? 45_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  public isConfigured(): boolean {
    return this.gpuUrl.length > 0;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.internalToken) {
      h.Authorization = `Bearer ${this.internalToken}`;
    }
    return h;
  }

  private async requestJson(
    endpoint: string,
    init: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    if (!this.isConfigured()) {
      return {
        ok: true,
        status: 200,
        data: {
          ok: true,
          available: false,
          fallback: 'local',
          reason: 'Self-hosted GPU microservice is not configured (set PLANADAY_GPU_URL or deploy docker-compose.gpu.yml).',
        },
      };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const res = await Promise.race([
        this.fetchImpl(`${this.gpuUrl}${endpoint}`, {
          ...init,
          headers: this.headers((init.headers as Record<string, string>) ?? {}),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`GPU worker timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data: json };
    } catch (err) {
      if (timer) clearTimeout(timer);
      return {
        ok: true,
        status: 200,
        data: {
          ok: true,
          available: false,
          fallback: 'local',
          reason:
            err instanceof Error
              ? `GPU worker unreachable (${err.message}) — automatic on-device fallback active.`
              : 'GPU worker unreachable — automatic on-device fallback active.',
        },
      };
    }
  }

  public async getStatus(): Promise<Record<string, unknown>> {
    const res = await this.requestJson('/status', { method: 'GET' });
    return res.data;
  }

  public async listJobs(): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      return { ok: true, available: false, jobs: [] };
    }
    const res = await this.requestJson('/jobs', { method: 'GET' });
    return res.data;
  }

  public async cancelJob(jobId: string): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      return { ok: false, available: false, error: 'GPU service not configured' };
    }
    const safeId = encodeURIComponent(jobId);
    const res = await this.requestJson(`/jobs/${safeId}/cancel`, { method: 'POST' });
    return res.data;
  }

  public async runOcr(payload: {
    imageBase64: string;
    mimeType?: string;
    language?: string;
    model?: string;
    priority?: string;
  }): Promise<Record<string, unknown>> {
    const res = await this.requestJson('/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  public async runEnhance(payload: {
    imageBase64: string;
    mimeType?: string;
    shadowReduction?: boolean;
    contrastBoost?: number;
    priority?: string;
  }): Promise<Record<string, unknown>> {
    const res = await this.requestJson('/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  public async runEmbed(payload: { texts: string[]; priority?: string }): Promise<Record<string, unknown>> {
    const res = await this.requestJson('/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  public async runBenchmark(): Promise<Record<string, unknown>> {
    const res = await this.requestJson('/benchmark', { method: 'POST' });
    return res.data;
  }
}
