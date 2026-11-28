import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [snapshotArg, evidenceArg, chromeArg, mode] = process.argv.slice(2);
const snapshot = path.resolve(snapshotArg);
const evidence = path.resolve(evidenceArg);
const scratch = await mkdtemp(path.join(snapshot, 'browser-'));
await mkdir(evidence, { recursive: true });
const { buildDayplanaServer } = await import(pathToFileURL(path.join(snapshot, 'dist-server/index.js')));
const dataDir = path.join(scratch, 'data');
let { app } = await buildDayplanaServer({ dataDir });
const appUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const profile = path.join(scratch, 'profile');
const chrome = spawn(chromeArg, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--remote-debugging-port=0',
  '--remote-debugging-address=127.0.0.1', '--no-proxy-server',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action, predicate = Boolean, timeout = 8_000) {
  const end = performance.now() + timeout;
  let last;
  while (performance.now() < end) {
    try {
      last = await action();
      if (predicate(last)) return last;
    } catch (error) {
      last = error.message;
    }
    await delay(70);
  }
  throw new Error(`Timed out. Last result: ${JSON.stringify(last)?.slice(0, 400)}`);
}

const report = { checks: [], viewports: [], notes: [], browserErrors: [], requests: [] };
let ws;
try {
  const active = await until(() => readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'));
  const [port] = active.split(/\r?\n/);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const callbacks = new Map();
  const requestKinds = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = callbacks.get(message.id);
      callbacks.delete(message.id);
      handler?.(message);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      report.browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === 'Network.requestWillBeSent') {
      requestKinds.set(message.params.requestId, message.params.type);
      const url = new URL(message.params.request.url);
      if (url.origin === appUrl) report.requests.push(url.pathname);
    }
    if (message.method === 'Network.loadingFailed' && requestKinds.get(message.params.requestId) === 'Script') {
      report.browserErrors.push(message.params.errorText);
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    const timeout = setTimeout(() => {
      callbacks.delete(current);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30_000);
    callbacks.set(current, message => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = expression => until(() => evaluate(expression));
  const buttons = "Array.from(document.querySelectorAll('button')).filter(b => b.getClientRects().length)";
  const buttonInventory = () => evaluate(`${buttons}.slice(0, 90).map(b => [b.innerText.trim(), b.getAttribute('aria-label'), b.title])`);
  const clickText = (value, exact = true) => wait(`(() => {
    const target = ${buttons}.find(b => [b.innerText.trim(), b.getAttribute('aria-label'), b.title]
      .some(label => label && (${exact} ? label === ${JSON.stringify(value)} : label.includes(${JSON.stringify(value)}))));
    if (!target || target.disabled) return false;
    target.click();
    return true;
  })()`);
  const goDesktop = value => wait(`(() => {
    const target = Array.from(document.querySelectorAll('.dp-sidebar button')).find(b => b.getClientRects().length
      && [b.innerText.trim().split(/\\n/)[0], b.title, b.getAttribute('aria-label')].includes(${JSON.stringify(value)}));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  const viewport = (width, height, mobile = true, deviceScaleFactor = mobile ? 2 : 1) =>
    cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile, screenWidth: width, screenHeight: height });
  const screenshot = async name => {
    const shot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(evidence, name), Buffer.from(shot.data, 'base64'));
  };
  async function check(name, action) {
    try {
      report.checks.push({ name, status: 'pass', details: await action() });
    } catch (error) {
      const details = await buttonInventory().catch(() => []);
      report.checks.push({ name, status: 'fail', error: error.message, buttons: details });
    }
    process.stdout.write(`${report.checks.at(-1).status} ${name}\n`);
  }

  await Promise.all([cdp('Runtime.enable'), cdp('Network.enable'), cdp('Page.enable')]);
  report.browser = await evaluate('navigator.userAgent');
  await viewport(1440, 900, false);
  const navigation = await cdp('Page.navigate', { url: appUrl });
  report.navigation = navigation;
  if (navigation.errorText) throw new Error(navigation.errorText);
  await wait("document.querySelector('.dp-app') !== null");
  await wait("document.querySelector('dialog[open]') !== null");
  await evaluate("document.querySelector('dialog[open] input[type=checkbox]')?.click()");
  const onboarding = await buttonInventory();
  report.onboarding = onboarding.filter(row => row[0]);
  if (mode === 'followup' || mode === 'soak' || mode === 'workflow') {
    await clickText('Close dialog');
  } else {
    await wait("(() => { const b = document.querySelector('dialog[open] button.dp-btn-primary'); if (!b) return false; b.click(); return true; })()");
  }
  await wait("document.querySelector('dialog[open]') === null");
  await screenshot('desktop-home-1440.png');
  report.desktopNav = await evaluate("Array.from(document.querySelectorAll('.dp-sidebar button')).map(b => b.innerText.trim()).filter(Boolean)");
  await check('service worker controls the built application', async () => {
    await wait('navigator.serviceWorker.controller !== null');
    return evaluate('caches.keys()');
  });
  if (mode !== 'soak' && mode !== 'workflow') await check(mode === 'followup' ? 'unvisited lazy studio opens after the server shuts down' : 'unvisited lazy studio opens after network is disabled', async () => {
    const cacheBefore = await evaluate(`(async () => (await (await caches.open((await caches.keys())[0])).keys()).map(r => new URL(r.url).pathname))()`);
    if (mode === 'followup') {
      app.server.closeAllConnections();
      await app.close();
    }
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    try {
      await goDesktop('Whiteboard Canvas');
      const outcome = await until(
        () => evaluate("({main: document.querySelector('main')?.innerText.slice(0, 180), banner: document.body.innerText.slice(0, 130)})"),
        value => /whiteboard|loading planaday/i.test(value.main ?? '') || !value.main,
      );
      await delay(600);
      const final = await evaluate("document.querySelector('main')?.innerText.slice(0, 180) ?? null");
      report.offlineStudio = { cacheBefore, outcome, final };
      assert.match(final ?? '', /whiteboard/i);
      return final;
    } finally {
      await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      if (mode === 'followup') {
        ({ app } = await buildDayplanaServer({ dataDir }));
        await app.listen({ host: '127.0.0.1', port: Number(new URL(appUrl).port) });
      }
      await cdp('Page.reload', { ignoreCache: true });
      await wait("document.querySelector('.dp-app') !== null");
    }
  });

  if (mode === 'workflow') {
    const find = selector => `document.querySelector(${JSON.stringify(selector)})`;
    async function input(selector, value) {
      await wait(`Boolean(${find(selector)})`);
      await evaluate(`(() => { const el = ${find(selector)}; el.focus(); el.select(); })()`);
      await cdp('Input.insertText', { text: value });
    }
    async function choose(selector, value) {
      await wait(`Boolean(${selector})`);
      await evaluate(`(() => { const el = ${selector}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    const mainHas = value => wait(`document.querySelector('main')?.innerText.includes(${JSON.stringify(value)})`);
    async function reload(view) {
      await cdp('Page.reload', { ignoreCache: true });
      await wait("Boolean(document.querySelector('.dp-app'))");
      await goDesktop(view);
    }
    await check('Calculator evaluates a parenthetical expression and displays the fraction', async () => {
      await goDesktop('Calculator & Graph');
      await input('input[aria-label="Mathematical expression"]', '(2+3)/2');
      await clickText('= Eval');
      await mainHas('Fraction: 5/2');
      return 'Rendered fraction 5/2 in the real Calculator view.';
    });
    await check('Calendar event created through the dialog survives reload in Agenda', async () => {
      await goDesktop('Flow Calendar');
      await clickText('New Event');
      await input('dialog[open] input[placeholder="Event title"]', 'Synthetic audit appointment');
      await clickText('Save Event');
      await wait("document.querySelector('dialog[open]') === null");
      await clickText('Agenda (', false);
      await mainHas('Synthetic audit appointment');
      await reload('Flow Calendar');
      await clickText('Agenda (', false);
      await mainHas('Synthetic audit appointment');
      return 'Reopened the same timed appointment after browser reload.';
    });
    await check('Laboratory sample creation and status survive reload', async () => {
      await goDesktop('Lab Management');
      await clickText('Samples (', false);
      await input('input[placeholder="Sample ID *"]', 'AUDIT-QC-01');
      await input('input[placeholder="Client"]', 'Synthetic client');
      await input('input[placeholder^="Required analyses"]', 'Moisture, ash');
      await clickText('Add Sample');
      await mainHas('AUDIT-QC-01');
      const status = find('select[aria-label="Testing status"]');
      await choose(status, 'review');
      await delay(300);
      await reload('Lab Management');
      await clickText('Samples (', false);
      await mainHas('AUDIT-QC-01');
      assert.equal(await evaluate(`${status}.value`), 'review');
      await mainHas('Moisture, ash');
      return 'Sample and assay list stayed visible and the status was QA Review.';
    });
    await check('Whiteboard creates a board with its starter nodes and preserves them on reload', async () => {
      await goDesktop('Whiteboard Canvas');
      await clickText('New Board');
      await mainHas('Core Concept');
      await mainHas('Next Action Step');
      await reload('Whiteboard Canvas');
      await mainHas('Core Concept');
      await mainHas('Next Action Step');
      return 'The two starter board elements remained in the same local profile.';
    });
    await check('Whiteboard SVG download contains valid SVG content and the requested filename', async () => {
      await wait(`Boolean(${find('main select')})`);
      await evaluate(`(() => {
        const original = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
          if (!this.download) return original.call(this);
          window.auditDownload = { filename: this.download, href: this.href };
        };
      })()`);
      await clickText('SVG');
      const dl = await evaluate(`(async () => {
        const item = window.auditDownload;
        return { filenameStartsWithSvg: item.filename.startsWith('<svg'),
          filenameEndsWithSvg: item.filename.endsWith('.svg'), text: await (await fetch(item.href)).text() };
      })()`);
      report.whiteboardDownload = dl;
      assert.ok(dl.filenameEndsWithSvg && dl.text.startsWith('<svg'));
      return dl;
    });
    await check('Code Studio executes its built-in arithmetic example', async () => {
      await goDesktop('Code Sandbox');
      await clickText('New Project');
      await clickText('Run in Sandbox');
      await mainHas('Direct run result: 60');
      return 'Built-in JavaScript produced the expected result. This is a functionality check.';
    });
    await check('Spreadsheet creates a workbook, evaluates a cell and retains the formula', async () => {
      await goDesktop('Spreadsheets');
      await choose("Array.from(document.querySelectorAll('main select')).find(e => e.querySelector('option[value=blank]'))", 'blank');
      await input('input[aria-label="Formula bar"]', '=2*21');
      const a1 = find('main tbody tr:first-child td:nth-child(2) input');
      const b1 = find('main tbody tr:first-child td:nth-child(3) input');
      const sheetState = () => evaluate(`({
        cell: ${a1}?.value, formula: ${find('input[aria-label="Formula bar"]')}?.value,
        active: document.activeElement?.outerHTML.slice(0, 180)
      })`);
      report.sheetStages = [];
      const verifyCell = async (stage, value) => {
        try {
          report.sheetStages.push({ stage, ...await until(sheetState, state => state.cell === value) });
        } catch (error) {
          report.sheetStages.push({ stage, ...await sheetState() });
          throw new Error(`${stage}: ${error.message}`);
        }
      };
      await verifyCell('raw formula entered', '=2*21');
      await evaluate(`${b1}.click()`);
      await verifyCell('computed display', '42');
      await reload('Spreadsheets');
      await verifyCell('raw formula after reload', '=2*21');
      assert.equal(await evaluate(`${find('input[aria-label="Formula bar"]')}.value`), '=2*21');
      await evaluate(`${b1}.click()`);
      await verifyCell('computed display after reload', '42');
      return 'A1 remained formula =2*21 with display value 42.';
    });
  } else {
  const headings = ['Quick Glance', 'Today', 'Calendar', 'Task Calendar', 'Tasks', 'Chores', 'Notes',
    'Diary', 'Calculator', 'Spreadsheets', 'Presentations', 'Projects', 'Game Dev', 'Book Studio',
    'Kanban', 'Whiteboard', 'Code Studio', 'Photo Studio', 'Files', 'Lab', 'Recipes', 'Planner'];
  async function metrics() {
    return evaluate(`(() => {
      const root = document.documentElement;
      const main = document.querySelector('main');
      const r = main.getBoundingClientRect();
      const controls = Array.from(main.querySelectorAll('button,input,select,textarea')).filter(el => el.getClientRects().length);
      const outside = controls.filter(el => {
        const box = el.getBoundingClientRect();
        if (box.right <= r.right + 2 && box.left >= r.left - 2) return false;
        for (let ancestor = el.parentElement; ancestor && ancestor !== main; ancestor = ancestor.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(ancestor).overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 2) return false;
        }
        return true;
      });
      return {
        title: main.querySelector('h1,h2,h3')?.textContent.trim() ?? '',
        width: root.clientWidth,
        height: root.clientHeight,
        documentOverflow: root.scrollWidth - root.clientWidth,
        mainOverflow: main.scrollWidth - main.clientWidth,
        unnamedButtons: controls.filter(e => e.tagName === 'BUTTON' && !e.innerText.trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title).length,
        smallButtons: controls.filter(e => e.tagName === 'BUTTON' && Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height) < 24).length,
        outside: outside.slice(0, 10).map(e => [e.tagName, e.innerText.trim().slice(0, 50) || e.title || e.placeholder || e.getAttribute('aria-label'), Math.round(e.getBoundingClientRect().right)]),
      };
    })()`);
  }
  const routes = [...new Set(report.desktopNav.filter(value => mode === 'followup'
    ? /[a-z]/.test(value)
    : headings.some(heading => value.includes(heading))))];
  for (const route of mode === 'soak' ? [] : routes) {
    await viewport(1440, 900, false);
    await goDesktop(route);
    await wait("!document.querySelector('main')?.innerText.includes('Loading Planaday studio')");
    await delay(120);
    const rows = [{ width: 1440, height: 900, ...await metrics() }];
    for (const [width, height] of [[320, 700], [360, 800], [375, 812], [390, 844], [412, 900],
      [430, 932], [480, 900], [768, 1024], [844, 390]]) {
      await viewport(width, height);
      rows.push({ width, height, ...await metrics() });
    }
    report.viewports.push({ route, rows });
    if (mode === 'followup' ? /Files|Projects|Photo|Code|Diary|Physical/i.test(route) : /Calendar|Lab|Whiteboard|Spreadsheet|Notes/i.test(route)) {
      await viewport(320, 700);
      await screenshot(`mobile-${route.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-320.png`);
    }
  }

  await viewport(1440, 900, false);
  await goDesktop(report.desktopNav.find(label => /^Notes\b/i.test(label)));
  const textarea = "document.querySelector('textarea[placeholder^=\"Write freely\"]')";
  await check('create or open a synthetic note', async () => {
    if (!(await evaluate(`Boolean(${textarea})`))) await clickText('New Note', false);
    await wait(`Boolean(${textarea})`);
    return buttonInventory();
  });
  await viewport(390, 844);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const save = () => clickText('Save immediately', false);
  const setText = async (value, start, end) => {
    await evaluate(`(() => { const t = ${textarea}; t.focus(); t.setSelectionRange(${start},${end}); })()`);
    await cdp('Input.insertText', { text: value });
  };
  const editorStats = () => evaluate(`(() => { const t = ${textarea}; return { size: t.value.length, start: t.selectionStart, end: t.selectionEnd, scroll: t.scrollTop, windowScroll: scrollY, prefix: t.value.slice(0, 35), sample: t.value.slice(99, 119) }; })()`);
  if (mode === 'followup') {
    await check('mobile menu exposes Tasks and a created task survives reload', async () => {
      await clickText('Open navigation menu');
      await wait("Boolean(document.querySelector('dialog[open]'))");
      await wait(`(() => { const b = Array.from(document.querySelectorAll('dialog[open] button')).find(el => el.innerText.trim() === 'Tasks'); if (!b) return false; b.click(); return true; })()`);
      await wait("Boolean(document.querySelector('input[placeholder^=\"New task title\"]'))");
      await evaluate("document.querySelector('input[placeholder^=\"New task title\"]').focus()");
      await cdp('Input.insertText', { text: 'Synthetic task from mobile audit' });
      await evaluate("document.querySelector('input[placeholder^=\"New task title\"]').form.requestSubmit()");
      await wait("document.querySelector('main').innerText.includes('Synthetic task from mobile audit')");
      await cdp('Page.reload', { ignoreCache: true });
      await wait("Boolean(document.querySelector('.dp-app'))");
      await viewport(1440, 900, false);
      await goDesktop('Tasks');
      await wait("document.querySelector('main').innerText.includes('Synthetic task from mobile audit')");
      return 'Task created through the mobile form and reopened on desktop layout in the same profile.';
    });
    await viewport(1440, 900, false);
    await goDesktop('Notes & Graph');
    await wait(`Boolean(${textarea})`);
  }
  for (const words of mode === 'soak' ? [1000] : [1000, 10000, 50000, 100000]) {
    await check(`note input and selected-text replacement at approximately ${words} words`, async () => {
      const initial = `# Audit note\n\n${'alpha beta gamma delta epsilon\n'.repeat(words / 5)}`;
      const before = performance.now();
      if (mode === 'followup' && words >= 50000) {
        await evaluate(`new Promise((resolve, reject) => {
          const open = indexedDB.open('dayplana-v2');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('records', 'readwrite');
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => reject(tx.error);
            const request = tx.objectStore('records').openCursor();
            request.onsuccess = () => {
              const current = request.result;
              if (!current) { reject(new Error('Fixture note missing')); return; }
              if (current.value.type !== 'note') { current.continue(); return; }
              const note = current.value;
              note.payload.content = ${JSON.stringify(initial)};
              current.update(note);
            };
          };
        })`);
        await cdp('Page.reload', { ignoreCache: true });
        await wait("Boolean(document.querySelector('.dp-app'))");
        await viewport(1440, 900, false);
        await goDesktop('Notes & Graph');
        await wait(`Boolean(${textarea})`);
        await viewport(390, 844);
      } else {
        await viewport(390, 844);
        await setText(initial, 0, Number.MAX_SAFE_INTEGER);
      }
      const pasteMs = performance.now() - before;
      assert.equal((await editorStats()).size, initial.length);
      const editTimes = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now();
        await setText(i % 2 ? 'AB' : 'CD', 100, 102);
        editTimes.push(performance.now() - start);
      }
      const immediate = await editorStats();
      await delay(850);
      const afterDebounce = await editorStats();
      await save();
      await delay(350);
      const afterManual = await editorStats();
      editTimes.sort((a, b) => a - b);
      const data = {
        words, initialLoadMethod: mode === 'followup' && words >= 50000 ? 'seed + reload' : 'Input.insertText',
        initialLoadMs: pasteMs, medianEditMs: editTimes[7], p95EditMs: editTimes[14],
        heap: await cdp('Runtime.getHeapUsage'), immediate, afterDebounce, afterManual,
      };
      report.notes.push(data);
      assert.equal(immediate.start, 102);
      assert.equal(afterDebounce.start, 102);
      assert.equal(afterDebounce.size, initial.length);
      assert.equal(immediate.sample[1] + immediate.sample[2], 'CD');
      return data;
    });
  }
  await screenshot('mobile-notes-filled-390.png').catch(() => {});
  if (mode !== 'soak') await check('100k-word saved note survives browser reload', async () => {
    const before = await editorStats();
    assert.ok(before.size > 500000);
    await cdp('Page.reload', { ignoreCache: true });
    await wait("document.querySelector('.dp-app') !== null");
    await viewport(1440, 900, false);
    await goDesktop(report.desktopNav.find(label => /^Notes\b/i.test(label)));
    await wait(`Boolean(${textarea})`);
    const after = await editorStats();
    assert.equal(after.size, before.size);
    assert.equal(after.sample, before.sample);
    return { size: after.size };
  });
  await check('note remains editable after emulated orientation change', async () => {
    await viewport(390, 844);
    await setText('orientation', 105, 116);
    await viewport(844, 390);
    await delay(100);
    assert.equal(await evaluate(`${textarea}.value.slice(105,116)`), 'orientation');
    return editorStats();
  });
  if (mode === 'soak') {
    await viewport(390, 844);
    await check('Chromium IME replacement of a selected middle word', async () => {
      await setText('begin teh end', 0, Number.MAX_SAFE_INTEGER);
      await evaluate(`(() => { const t = ${textarea}; t.focus(); t.setSelectionRange(6, 9); })()`);
      await cdp('Input.imeSetComposition', { text: 'th', selectionStart: 2, selectionEnd: 2 });
      await cdp('Input.insertText', { text: 'the' });
      await delay(850);
      assert.equal(await evaluate(`${textarea}.value`), 'begin the end');
      return editorStats();
    });
    await check('30-minute repeated Notes editing and debounce soak', async () => {
      await cdp('Performance.enable');
      const fixture = 'alpha beta gamma delta epsilon\n'.repeat(2000);
      await setText(fixture, 0, Number.MAX_SAFE_INTEGER);
      const started = performance.now();
      let edits = 0;
      const timing = [];
      const checkpoints = [];
      report.soak = { samples: checkpoints, targetSeconds: 1800 };
      while (performance.now() - started < 1800000) {
        const before = performance.now();
        await setText(edits % 2 ? 'AB' : 'CD', 100, 102);
        timing.push(performance.now() - before);
        edits++;
        if (edits === 1 || edits % 75 === 0) {
          const stats = (await cdp('Performance.getMetrics')).metrics;
          checkpoints.push({
            elapsedSeconds: (performance.now() - started) / 1000,
            edits,
            metrics: Object.fromEntries(stats.filter(x =>
              ['Nodes', 'Documents', 'JSEventListeners', 'JSHeapUsedSize', 'TaskDuration', 'LayoutCount', 'ScriptDuration'].includes(x.name),
            ).map(x => [x.name, x.value])),
            requests: report.requests.length,
          });
        }
        if (edits === 1 || edits % 75 === 0) await writeFile(path.join(evidence, "soak-progress.json"), JSON.stringify({ edits, elapsedSeconds: (performance.now() - started) / 1000, checkpoints }, null, 2));
        await delay(750);
      }
      timing.sort((a, b) => a - b);
      await save();
      await delay(850);
      const after = await editorStats();
      assert.equal(after.size, fixture.length);
      assert.equal(after.start, 102);
      return { edits, p50Ms: timing[Math.floor(timing.length / 2)], p95Ms: timing[Math.ceil(timing.length * .95) - 1], checkpoints, after };
    });
  }
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  chrome.kill();
  app.server.closeAllConnections();
  await app.close();
  await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify(report, null, 2));
}

