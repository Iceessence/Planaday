// Strict Null-Origin Sandboxed JavaScript Execution & Unit Test Runner (PD-005 / §35.8)
//
// SECURITY ARCHITECTURE (replaces same-origin Web Worker):
// Executes untrusted user JS/TS ONLY inside an opaque null-origin <iframe sandbox="allow-scripts">
// (explicitly OMITTING allow-same-origin, allow-forms, allow-popups, allow-top-navigation, allow-modals)
// with Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none';
//
// Under this browser-enforced boundary:
//  - window.origin === "null" (distinct from Planaday's origin)
//  - IndexedDB, localStorage, cookies, parent DOM, and Planaday records are inaccessible by browser security policy
//  - fetch / WebSocket / XHR network egress is denied by CSP connect-src 'none'
//  - Worker executes off the UI thread; timeout requests termination. Runtime isolation still requires browser verification.

export interface SandboxExecutionResult {
  ok: boolean;
  stdout: string[];
  returnValue: string;
  error?: string;
  durationMs: number;
  timedOut?: boolean;
  isolationMode?: 'null-origin-iframe' | 'unavailable';
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

export const SANDBOX_ISOLATION_POLICY = {
  sandboxAttribute: 'allow-scripts',
  csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; worker-src blob:;",
  allowsSameOrigin: false,
  allowsNetwork: false,
  allowsStorage: false,
  maxTimeoutMs: 5000,
  defaultTimeoutMs: 2000,
} as const;

/**
 * Strips light TypeScript type annotations so basic TS snippets can run cleanly in the sandbox.
 */
export function stripSimpleTypeScript(code: string): string {
  return code
    .replace(/:\s*(number|string|boolean|any|void|unknown|never|object)(\[\])?/g, '')
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, '')
    .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, '');
}

// An opaque-origin iframe owns the worker. The parent never executes user code.
// Worker isolation and CSP must be verified in each supported browser; fail closed if unavailable.
function sandboxWorkerMain() {
  self.onmessage = async (ev: MessageEvent) => {
    const msg = ev.data;
    const logs: string[] = [];
    const stringify = (value: unknown) => {
      try { return (typeof value === 'object' && value !== null ? JSON.stringify(value) ?? '' : String(value)).slice(0, 16000); }
      catch { return '[Unserializable]'; }
    };
    const logger = (prefix: string) => (...args: unknown[]) => {
      if (logs.length < 200) logs.push((prefix + args.map(stringify).join(' ')).slice(0, 16000));
    };
    const started = performance.now();
    try {
      const fn = new Function('console', 'INPUT', msg.userCode + '\n; if (typeof solve === "function" && INPUT !== undefined) return solve(INPUT);');
      const value = await fn({ log: logger(''), warn: logger('[warn] '), error: logger('[error] ') }, msg.inputData);
      self.postMessage({ ok: true, stdout: logs, returnValue: value === undefined ? '' : stringify(value), durationMs: performance.now() - started });
    } catch (error) {
      self.postMessage({ ok: false, stdout: logs, returnValue: '', error: stringify(error instanceof Error ? error.message : error), durationMs: performance.now() - started });
    }
  };
}
function buildSandboxedIframeDoc(runId: string): string {
  const workerSource = `(${sandboxWorkerMain.toString()})();`;
  // Escape script-ending sequences in serialized source, even though it is application-owned.
  const encoded = JSON.stringify(workerSource).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_ISOLATION_POLICY.csp}"></head><body><script>
  (() => {
    const id = ${JSON.stringify(runId)};
    let started = false;
    window.addEventListener('message', ev => {
      const msg = ev.data;
      if (ev.source !== window.parent || started || !msg || msg.runId !== id || msg.cmd !== 'exec') return;
      started = true;
      let worker, url, timeout;
      const finish = result => {
        clearTimeout(timeout);
        if (worker) worker.terminate();
        if (url) URL.revokeObjectURL(url);
        window.parent.postMessage({ ...result, runId: id }, '*');
      };
      try {
        url = URL.createObjectURL(new Blob([${encoded}], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = event => finish(event.data);
        worker.onerror = () => finish({ ok: false, stdout: [], returnValue: '', error: 'Isolated worker unavailable or failed.' });
        timeout = setTimeout(() => finish({ ok: false, timedOut: true, stdout: [], returnValue: '', error: 'Execution timed out.' }), msg.timeoutMs);
        worker.postMessage({ userCode: msg.userCode, inputData: msg.inputData });
      } catch (error) { finish({ ok: false, stdout: [], returnValue: '', error: 'Isolated worker unavailable.' }); }
    });
    window.parent.postMessage({ runId: id, ready: true }, '*');
  })();</script></body></html>`;
}

/**
 * Runs JavaScript strictly inside a null-origin sandboxed iframe (`sandbox="allow-scripts"`, NO `allow-same-origin`)
 * with CSP `connect-src 'none'` and a hard termination timeout (default 2,000ms).
 */
export function runSandboxedJs(
  code: string,
  opts: { input?: unknown; timeoutMs?: number; isTypeScript?: boolean } = {}
): Promise<SandboxExecutionResult> {
  const requested = opts.timeoutMs ?? SANDBOX_ISOLATION_POLICY.defaultTimeoutMs;
  const timeoutMs = Number.isFinite(requested) ? Math.max(100, Math.min(SANDBOX_ISOLATION_POLICY.maxTimeoutMs, requested)) : SANDBOX_ISOLATION_POLICY.defaultTimeoutMs;
  const preparedCode = opts.isTypeScript ? stripSimpleTypeScript(code) : code;
  const started = performance.now();

  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  if (typeof document === 'undefined' || typeof window === 'undefined' || isJsdom) {
    return Promise.resolve({
      ok: false,
      stdout: [],
      returnValue: '',
      error: 'Null-origin sandboxed iframe execution requires a live browser / Android WebView / Electron runtime.',
      durationMs: Math.round(performance.now() - started),
      isolationMode: 'unavailable',
    });
  }

  const runId = `sbx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    // Strictly null-origin: allow-scripts ONLY (NEVER allow-same-origin!)
    iframe.setAttribute('sandbox', SANDBOX_ISOLATION_POLICY.sandboxAttribute);
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.display = 'none';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    let settled = false;
    let dispatched = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      try {
        iframe.srcdoc = '';
        iframe.remove();
      } catch {
        // ignore cleanup error
      }
    };

    const onMessage = (ev: MessageEvent) => {
      if (settled) return;
      if (ev.source !== iframe.contentWindow || ev.origin !== 'null') return;
      const data = ev.data as Record<string, unknown> | null;
      if (!data || data.runId !== runId) return;

      if (data.ready === true && !dispatched) {
        dispatched = true;
        iframe.contentWindow?.postMessage(
          { runId, cmd: 'exec', userCode: preparedCode, inputData: opts.input, timeoutMs },
          '*'
        );
        return;
      }

      if (typeof data.ok === 'boolean') {
        settled = true;
        cleanup();
        resolve({
          ok: data.ok,
          stdout: Array.isArray(data.stdout) ? data.stdout.slice(0, 200).map(v => String(v).slice(0, 16000)) : [],
          timedOut: data.timedOut === true,
          returnValue: typeof data.returnValue === 'string' ? data.returnValue : '',
          error: typeof data.error === 'string' ? data.error : undefined,
          durationMs: typeof data.durationMs === 'number' ? data.durationMs : Math.round(performance.now() - started),
          isolationMode: 'null-origin-iframe',
        });
      }
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ok: false,
        stdout: [],
        returnValue: '',
        error: `Execution timed out after ${timeoutMs}ms (sandbox timeout).`,
        durationMs: timeoutMs,
        timedOut: true,
        isolationMode: 'null-origin-iframe',
      });
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    iframe.srcdoc = buildSandboxedIframeDoc(runId);
    document.body.appendChild(iframe);
  });
}
