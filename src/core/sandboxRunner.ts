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
//  - Hard timeout terminates and detaches the iframe so infinite loops cannot freeze Planaday

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
  csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none';",
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

function buildSandboxedIframeDoc(runId: string): string {
  // Never interpolate user code directly into HTML! User code arrives strictly via postMessage after load.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_ISOLATION_POLICY.csp}">
</head>
<body>
<script>
(function() {
  'use strict';
  const EXPECTED_RUN_ID = ${JSON.stringify(runId)};
  window.addEventListener('message', function(ev) {
    const msg = ev.data;
    if (!msg || msg.runId !== EXPECTED_RUN_ID || msg.cmd !== 'exec') return;
    const logs = [];
    const MAX_LOGS = 200;
    const safeConsole = {
      log: function() {
        if (logs.length < MAX_LOGS) {
          logs.push(Array.prototype.slice.call(arguments).map(function(x) {
            try { return typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x); }
            catch (_) { return '[Unserializable]'; }
          }).join(' '));
        }
      },
      warn: function() {
        if (logs.length < MAX_LOGS) logs.push('[warn] ' + Array.prototype.slice.call(arguments).map(String).join(' '));
      },
      error: function() {
        if (logs.length < MAX_LOGS) logs.push('[error] ' + Array.prototype.slice.call(arguments).map(String).join(' '));
      }
    };
    const t0 = performance.now();
    try {
      const fn = new Function(
        'console', 'INPUT', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator', 'parent', 'top', 'opener',
        msg.userCode + '\\n; if (typeof solve === "function" && INPUT !== undefined) { return solve(INPUT); }'
      );
      const result = fn(safeConsole, msg.inputData, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
      let retStr = '';
      if (result !== undefined) {
        retStr = typeof result === 'object' && result !== null ? JSON.stringify(result) : String(result);
      }
      window.parent.postMessage({
        runId: EXPECTED_RUN_ID,
        ok: true,
        stdout: logs,
        returnValue: retStr,
        durationMs: Math.round((performance.now() - t0) * 100) / 100
      }, '*');
    } catch (err) {
      window.parent.postMessage({
        runId: EXPECTED_RUN_ID,
        ok: false,
        stdout: logs,
        returnValue: '',
        error: err && err.message ? String(err.message) : String(err),
        durationMs: Math.round((performance.now() - t0) * 100) / 100
      }, '*');
    }
  });
  window.parent.postMessage({ runId: EXPECTED_RUN_ID, ready: true }, '*');
})();
</script>
</body>
</html>`;
}

/**
 * Runs JavaScript strictly inside a null-origin sandboxed iframe (`sandbox="allow-scripts"`, NO `allow-same-origin`)
 * with CSP `connect-src 'none'` and a hard termination timeout (default 2,000ms).
 */
export function runSandboxedJs(
  code: string,
  opts: { input?: unknown; timeoutMs?: number; isTypeScript?: boolean } = {}
): Promise<SandboxExecutionResult> {
  const timeoutMs = Math.max(100, Math.min(SANDBOX_ISOLATION_POLICY.maxTimeoutMs, opts.timeoutMs ?? SANDBOX_ISOLATION_POLICY.defaultTimeoutMs));
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
      if (ev.source !== iframe.contentWindow) return;
      const data = ev.data as Record<string, unknown> | null;
      if (!data || data.runId !== runId) return;

      if (data.ready === true && !dispatched) {
        dispatched = true;
        iframe.contentWindow?.postMessage(
          { runId, cmd: 'exec', userCode: preparedCode, inputData: opts.input },
          '*'
        );
        return;
      }

      if (typeof data.ok === 'boolean') {
        settled = true;
        cleanup();
        resolve({
          ok: data.ok,
          stdout: Array.isArray(data.stdout) ? data.stdout.map(String) : [],
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
        error: `Execution timed out after ${timeoutMs}ms (null-origin sandbox frame terminated safely).`,
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
