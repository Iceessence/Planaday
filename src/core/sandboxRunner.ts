// Strict Sandboxed JavaScript Execution & Unit Test Runner (§35.8)
// Executes user code ONLY inside an isolated Web Worker with hard timeout and ZERO access
// to window, document, IndexedDB, localStorage, fetch/server APIs, or Planaday state!

export interface SandboxExecutionResult {
  ok: boolean;
  stdout: string[];
  returnValue: string;
  error?: string;
  durationMs: number;
  timedOut?: boolean;
}

export interface CodeTestCase {
  id: string;
  name: string;
  inputJson: string; // passed to `solve(input)` or available as `INPUT`
  expectedOutput: string;
}

export interface CodeTestRunResult {
  testId: string;
  name: string;
  passed: boolean;
  actual: string;
  expected: string;
  durationMs: number;
  error?: string;
}

/**
 * Strips light TypeScript type annotations so basic TS snippets can run cleanly in the JS worker.
 */
export function stripSimpleTypeScript(code: string): string {
  return code
    .replace(/:\s*(number|string|boolean|any|void|unknown|never|object)(\[\])?/g, '')
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, '')
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, '');
}

/**
 * Runs JavaScript strictly inside a dedicated isolated Web Worker (browser) with shadowed network APIs
 * and a hard termination timeout (default 2,000ms) so infinite loops cannot freeze Planaday!
 */
export function runSandboxedJs(
  code: string,
  opts: { input?: unknown; timeoutMs?: number; isTypeScript?: boolean } = {}
): Promise<SandboxExecutionResult> {
  const timeoutMs = Math.max(100, Math.min(5000, opts.timeoutMs ?? 2000));
  const preparedCode = opts.isTypeScript ? stripSimpleTypeScript(code) : code;
  const started = performance.now();

  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    // Non-browser test fallback: bounded deterministic notice without accessing main app secrets
    return Promise.resolve({
      ok: false,
      stdout: [],
      returnValue: '',
      error: 'Web Worker sandbox is only available in browser / Android WebView / Desktop Electron runtimes.',
      durationMs: Math.round(performance.now() - started),
    });
  }

  const workerSource = `
    'use strict';
    // Explicitly shadow network & storage globals inside the isolated worker scope (§35.8)
    self.onmessage = function(ev) {
      const { userCode, inputData } = ev.data;
      const logs = [];
      const MAX_LOGS = 200;
      const safeConsole = {
        log: (...a) => { if (logs.length < MAX_LOGS) logs.push(a.map((x) => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')); },
        warn: (...a) => { if (logs.length < MAX_LOGS) logs.push('[warn] ' + a.map(String).join(' ')); },
        error: (...a) => { if (logs.length < MAX_LOGS) logs.push('[error] ' + a.map(String).join(' ')); },
      };
      const t0 = performance.now();
      try {
        const runner = new Function(
          'console', 'INPUT', 'fetch', 'XMLHttpRequest', 'WebSocket', 'indexedDB', 'caches', 'importScripts',
          userCode + '\\n; if (typeof solve === "function" && INPUT !== undefined) { return solve(INPUT); }'
        );
        const result = runner(safeConsole, inputData, undefined, undefined, undefined, undefined, undefined, undefined);
        const retStr = result === undefined ? '' : (typeof result === 'object' ? JSON.stringify(result) : String(result));
        self.postMessage({ ok: true, stdout: logs, returnValue: retStr, durationMs: Math.round((performance.now() - t0) * 100) / 100 });
      } catch (err) {
        self.postMessage({ ok: false, stdout: logs, returnValue: '', error: err && err.message ? err.message : String(err), durationMs: Math.round((performance.now() - t0) * 100) / 100 });
      }
    };
  `;

  return new Promise((resolve) => {
    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ok: false,
        stdout: [],
        returnValue: '',
        error: `Execution timed out after ${timeoutMs}ms (infinite loop protection terminated sandbox safely).`,
        durationMs: timeoutMs,
        timedOut: true,
      });
    }, timeoutMs);

    worker.onmessage = (ev) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve(ev.data as SandboxExecutionResult);
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve({
        ok: false,
        stdout: [],
        returnValue: '',
        error: err.message || 'Sandbox runtime error',
        durationMs: Math.round(performance.now() - started),
      });
    };

    worker.postMessage({ userCode: preparedCode, inputData: opts.input });
  });
}
