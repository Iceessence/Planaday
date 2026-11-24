import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Download,
  FileCode,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { triggerBrowserDownload } from '../../core/backup';
import {
  runSandboxedJs,
  type CodeTestCase,
  type CodeTestRunResult,
  type SandboxExecutionResult,
} from '../../core/sandboxRunner';
import type { LifeRecord } from '../../core/types';

interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

interface CodeProjectPayload {
  files: CodeFile[];
  activeFileId: string;
  tests: CodeTestCase[];
  lastTestSummary?: string;
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript (Sandboxed Worker ▶)', executable: true },
  { id: 'typescript', label: 'TypeScript (Stripped → Sandboxed Worker ▶)', executable: true },
  { id: 'html', label: 'HTML / CSS (Sandboxed Live Preview ▶)', executable: true },
  { id: 'python', label: 'Python (Syntax Editor — External Runtime)', executable: false },
  { id: 'csharp', label: 'C# (Syntax Editor — External Compiler)', executable: false },
  { id: 'cpp', label: 'C / C++ (Syntax Editor — External Compiler)', executable: false },
  { id: 'rust', label: 'Rust (Syntax Editor — External Compiler)', executable: false },
  { id: 'go', label: 'Go (Syntax Editor — External Compiler)', executable: false },
  { id: 'java', label: 'Java (Syntax Editor — External Compiler)', executable: false },
  { id: 'sql', label: 'SQL (Syntax Editor — External DB)', executable: false },
  { id: 'lua', label: 'Lua (Syntax Editor — External Runtime)', executable: false },
  { id: 'verse', label: 'Verse / UEFN (Syntax Editor — External)', executable: false },
];

function createStarterCodeProject(): CodeProjectPayload {
  const f1: CodeFile = {
    id: createId('cf'),
    name: 'main.js',
    language: 'javascript',
    content: `// Planaday Isolated Web Worker Sandbox (§35.8)\n// Export a solve(input) function to test against unit tests below!\nfunction solve(input) {\n  const nums = Array.isArray(input) ? input : [1, 2, 3, 4];\n  const sum = nums.reduce((acc, v) => acc + v, 0);\n  console.log('Processed', nums.length, 'items -> sum =', sum);\n  return sum;\n}\n\nconsole.log('Sandbox ready! Direct run result:', solve([10, 20, 30]));\n`,
  };
  return {
    files: [f1],
    activeFileId: f1.id,
    tests: [
      { id: createId('tc'), name: 'Sum of [1,2,3,4]', inputJson: '[1, 2, 3, 4]', expectedOutput: '10' },
      { id: createId('tc'), name: 'Sum of [10,25,15]', inputJson: '[10, 25, 15]', expectedOutput: '50' },
    ],
  };
}

export const CodeStudioView: React.FC = () => {
  const { records, pushToast } = useApp();
  const projects = useMemo(
    () => records.filter((r) => r.type === 'code_project' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );
  const snippets = useMemo(
    () => records.filter((r) => r.type === 'code_snippet' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const [selectedProjId, setSelectedProjId] = useState<string | null>(null);
  const activeProj: LifeRecord | null = useMemo(
    () => projects.find((p) => p.id === selectedProjId) ?? projects[0] ?? null,
    [projects, selectedProjId]
  );
  const payload = activeProj?.payload as CodeProjectPayload | undefined;
  const files = Array.isArray(payload?.files) ? payload!.files : [];
  const activeFile = files.find((f) => f.id === payload?.activeFileId) ?? files[0] ?? null;
  const tests = Array.isArray(payload?.tests) ? payload!.tests : [];

  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState(14);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<SandboxExecutionResult | null>(null);
  const [testResults, setTestResults] = useState<CodeTestRunResult[]>([]);
  const [newTestName, setNewTestName] = useState('');
  const [newTestInput, setNewTestInput] = useState('[2, 4, 6]');
  const [newTestExpected, setNewTestExpected] = useState('12');
  const [snipTitle, setSnipTitle] = useState('');

  const langInfo = LANGUAGES.find((l) => l.id === activeFile?.language) ?? LANGUAGES[0];

  const mutateProj = async (updater: (p: CodeProjectPayload) => CodeProjectPayload) => {
    if (!activeProj) return;
    await updateRecord<CodeProjectPayload>(activeProj.id, (c) => ({ ...c, payload: updater(c.payload) }));
  };

  const updateActiveFile = async (patch: Partial<CodeFile>) => {
    if (!activeFile) return;
    await mutateProj((p) => ({
      ...p,
      files: p.files.map((f) => (f.id === activeFile.id ? { ...f, ...patch } : f)),
    }));
  };

  const handleRunCode = async () => {
    if (!activeFile) return;
    if (!langInfo.executable) {
      pushToast(`${langInfo.label} uses syntax editing only — export file to run in your local compiler/toolchain.`, { tone: 'info' });
      return;
    }
    if (activeFile.language === 'html') {
      pushToast('HTML/CSS preview updated in sandboxed iframe below', { tone: 'ok' });
      return;
    }
    setRunning(true);
    const res = await runSandboxedJs(activeFile.content, {
      timeoutMs: 2000,
      isTypeScript: activeFile.language === 'typescript',
    });
    setRunResult(res);
    setRunning(false);
  };

  const handleRunTests = async () => {
    if (!activeFile || (activeFile.language !== 'javascript' && activeFile.language !== 'typescript')) {
      pushToast('Unit test runner executes JavaScript / TypeScript files in the isolated Web Worker sandbox.', { tone: 'info' });
      return;
    }
    setRunning(true);
    const results: CodeTestRunResult[] = [];
    for (const tc of tests) {
      let parsedInput: unknown = tc.inputJson;
      try {
        parsedInput = JSON.parse(tc.inputJson);
      } catch {
        // treat as literal string
      }
      const res = await runSandboxedJs(activeFile.content, {
        input: parsedInput,
        timeoutMs: 2000,
        isTypeScript: activeFile.language === 'typescript',
      });
      const actual = res.ok ? res.returnValue : `ERROR: ${res.error}`;
      results.push({
        testId: tc.id,
        name: tc.name,
        passed: res.ok && actual.trim() === tc.expectedOutput.trim(),
        actual,
        expected: tc.expectedOutput,
        durationMs: res.durationMs,
        error: res.error,
      });
    }
    setTestResults(results);
    const passed = results.filter((r) => r.passed).length;
    await mutateProj((p) => ({ ...p, lastTestSummary: `${passed}/${results.length} passed at ${new Date().toLocaleTimeString()}` }));
    setRunning(false);
    pushToast(`Test run finished: ${passed}/${results.length} passed`, { tone: passed === results.length ? 'ok' : 'warn' });
  };

  const lineCount = (activeFile?.content ?? '').split('\n').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Code2 size={20} /> Sandboxed Code & Testing Studio
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Multi-file code projects, snippet library, unit test runner & isolated browser Web Worker sandbox (2s timeout, zero access to Planaday DB/network).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="dp-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} /> Strict Client Sandbox (§35.8)
          </span>
          <select className="dp-select" value={activeProj?.id ?? ''} onChange={(e) => setSelectedProjId(e.target.value)}>
            {projects.length === 0 && <option value="">No code projects</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={async () => {
              const rec = await createRecord<CodeProjectPayload>('code_project', `Code Project ${projects.length + 1}`, createStarterCodeProject());
              setSelectedProjId(rec.id);
              pushToast('Created new code project', { tone: 'ok' });
            }}
          >
            <Plus size={14} /> New Project
          </button>
          {activeProj && (
            <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activeProj.id); setSelectedProjId(null); }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {!activeProj || !activeFile ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Click "+ New Project" above to write, run, and unit-test code inside Planaday's isolated Web Worker sandbox.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 230px) 1fr', gap: '0.8rem' }}>
          {/* File Explorer & Snippet Library */}
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.84rem' }}>Project Files ({files.length})</strong>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <input className="dp-input" placeholder="e.g. utils.ts" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  const name = newFileName.trim() || `file${files.length + 1}.js`;
                  const ext = name.split('.').pop()?.toLowerCase();
                  const lang =
                    ext === 'ts' ? 'typescript' : ext === 'html' ? 'html' : ext === 'py' ? 'python' : ext === 'cs' ? 'csharp' : ext === 'cpp' || ext === 'c' ? 'cpp' : ext === 'rs' ? 'rust' : ext === 'go' ? 'go' : ext === 'sql' ? 'sql' : ext === 'lua' ? 'lua' : ext === 'verse' ? 'verse' : 'javascript';
                  const nf: CodeFile = { id: createId('cf'), name, language: lang, content: `// ${name}\n` };
                  void mutateProj((p) => ({ ...p, files: [...p.files, nf], activeFileId: nf.id }));
                  setNewFileName('');
                }}
              >
                +
              </button>
            </div>
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => void mutateProj((p) => ({ ...p, activeFileId: f.id }))}
                style={{
                  padding: '0.4rem 0.55rem',
                  borderRadius: 6,
                  border: f.id === activeFile.id ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FileCode size={13} /> {f.name}</span>
                {files.length > 1 && (
                  <button
                    type="button"
                    className="dp-btn"
                    style={{ padding: '1px 4px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rem = files.filter((x) => x.id !== f.id);
                      void mutateProj((p) => ({ ...p, files: rem, activeFileId: rem[0]?.id ?? '' }));
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}

            <hr style={{ border: 'none', borderTop: '1px solid var(--dp-border)' }} />
            <strong style={{ fontSize: '0.84rem' }}>Reusable Snippets ({snippets.length})</strong>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <input className="dp-input" placeholder="Save active as snippet..." value={snipTitle} onChange={(e) => setSnipTitle(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  const title = snipTitle.trim() || `${activeFile.name} snippet`;
                  await createRecord('code_snippet', title, { language: activeFile.language, content: activeFile.content });
                  setSnipTitle('');
                  pushToast(`Saved snippet "${title}"`, { tone: 'ok' });
                }}
              >
                Save
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
              {snippets.map((sn) => {
                const sp = sn.payload as { language?: string; content?: string };
                return (
                  <div key={sn.id} style={{ padding: '0.35rem 0.45rem', border: '1px solid var(--dp-border)', borderRadius: 6, fontSize: '0.76rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{ cursor: 'pointer', flex: 1 }}
                      onClick={() => void updateActiveFile({ content: `${activeFile.content}\n${sp.content ?? ''}` })}
                      title="Click to insert into active file"
                    >
                      {sn.title} ({sp.language})
                    </span>
                    <button type="button" className="dp-btn" style={{ padding: '1px 4px' }} onClick={() => void softDeleteRecord(sn.id)}><Trash2 size={10} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Code Editor, Console & Unit Tests */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div className="dp-card" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.5rem 0.7rem' }}>
              <select className="dp-select" value={activeFile.language} onChange={(e) => void updateActiveFile({ language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
              <button type="button" className="dp-btn dp-btn-primary" disabled={running} onClick={() => void handleRunCode()}>
                <Play size={13} /> {running ? 'Running...' : langInfo.executable ? 'Run in Sandbox' : 'External Toolchain'}
              </button>
              <button type="button" className="dp-btn" disabled={running} onClick={() => void handleRunTests()}>
                <Terminal size={13} /> Run {tests.length} Tests
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={() => triggerBrowserDownload(activeFile.name, activeFile.content, 'text/plain')}
              >
                <Download size={13} /> Download
              </button>
              <button type="button" className="dp-btn" onClick={() => setEditorTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
                {editorTheme === 'dark' ? '🌙 Dark' : '☀ Light'}
              </button>
              <input type="number" min={11} max={22} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="dp-input" style={{ width: 55 }} />
            </div>

            {/* Find & Replace */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Search size={14} />
              <input className="dp-input" placeholder="Find..." value={findText} onChange={(e) => setFindText(e.target.value)} style={{ width: 150 }} />
              <input className="dp-input" placeholder="Replace with..." value={replaceText} onChange={(e) => setReplaceText(e.target.value)} style={{ width: 150 }} />
              <button
                type="button"
                className="dp-btn"
                onClick={() => {
                  if (!findText) return;
                  void updateActiveFile({ content: activeFile.content.split(findText).join(replaceText) });
                  pushToast(`Replaced all occurrences of "${findText}"`, { tone: 'ok' });
                }}
              >
                Replace All
              </button>
            </div>

            {/* Editor with Line Number Gutter */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr',
                border: '1px solid var(--dp-border)',
                borderRadius: 'var(--dp-radius)',
                overflow: 'hidden',
                background: editorTheme === 'dark' ? '#161b26' : '#fbf8f1',
                color: editorTheme === 'dark' ? '#e6edf3' : '#1e1b18',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  padding: '0.65rem 0.4rem',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize,
                  lineHeight: 1.5,
                  opacity: 0.45,
                  userSelect: 'none',
                  borderRight: '1px solid rgba(128,128,128,0.2)',
                }}
              >
                {Array.from({ length: Math.max(12, lineCount) }, (_, i) => i + 1).join('\n')}
              </pre>
              <textarea
                value={activeFile.content}
                onChange={(e) => void updateActiveFile({ content: e.target.value })}
                spellCheck={false}
                rows={Math.max(14, Math.min(28, lineCount + 2))}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  resize: 'vertical',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'monospace',
                  fontSize,
                  lineHeight: 1.5,
                  padding: '0.65rem',
                }}
              />
            </div>

            {/* HTML Sandboxed Live Preview */}
            {activeFile.language === 'html' && (
              <div className="dp-card" style={{ padding: '0.5rem' }}>
                <div className="dp-muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>Sandboxed HTML/CSS Preview (`sandbox=""` — scripts & parent access disabled)</div>
                <iframe
                  title="Planaday HTML Sandbox Preview"
                  sandbox=""
                  srcDoc={activeFile.content}
                  style={{ width: '100%', height: 220, border: '1px solid var(--dp-border)', borderRadius: 6, background: '#fff' }}
                />
              </div>
            )}

            {/* Console Output */}
            {runResult && (
              <div className="dp-card" style={{ background: '#111620', color: '#e6edf3', fontFamily: 'monospace', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{runResult.ok ? '✓ Sandbox Output' : '✗ Sandbox Error'}</strong>
                  <span>{runResult.durationMs} ms{runResult.timedOut ? ' (TIMED OUT)' : ''}</span>
                </div>
                {runResult.stdout.map((line, i) => <div key={i}>{line}</div>)}
                {runResult.returnValue && <div style={{ color: '#7ee787' }}>→ Return: {runResult.returnValue}</div>}
                {runResult.error && <div style={{ color: '#ff7b72' }}>Error: {runResult.error}</div>}
              </div>
            )}

            {/* Unit Test Suite (§35.5) */}
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.86rem' }}>Unit Test Cases (`solve(input)`)</strong>
                {payload?.lastTestSummary && <span className="dp-badge">{payload.lastTestSummary}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <input className="dp-input" placeholder="Test name" value={newTestName} onChange={(e) => setNewTestName(e.target.value)} style={{ width: 150 }} />
                <input className="dp-input" placeholder="Input JSON (e.g. [2,4,6])" value={newTestInput} onChange={(e) => setNewTestInput(e.target.value)} style={{ flex: 1, fontFamily: 'monospace' }} />
                <input className="dp-input" placeholder="Expected output" value={newTestExpected} onChange={(e) => setNewTestExpected(e.target.value)} style={{ width: 130, fontFamily: 'monospace' }} />
                <button
                  type="button"
                  className="dp-btn"
                  onClick={() => {
                    const tc: CodeTestCase = {
                      id: createId('tc'),
                      name: newTestName.trim() || `Test #${tests.length + 1}`,
                      inputJson: newTestInput,
                      expectedOutput: newTestExpected,
                    };
                    void mutateProj((p) => ({ ...p, tests: [...tests, tc] }));
                    setNewTestName('');
                  }}
                >
                  <Plus size={13} /> Add Test
                </button>
              </div>
              {tests.map((tc) => {
                const res = testResults.find((r) => r.testId === tc.id);
                return (
                  <div key={tc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '0.4rem 0.55rem', border: '1px solid var(--dp-border)', borderRadius: 6, fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {res ? (res.passed ? <CheckCircle2 size={15} color="#2f855a" /> : <XCircle size={15} color="#c53030" />) : <span>•</span>}
                      <strong>{tc.name}</strong>
                      <code style={{ opacity: 0.75 }}>in: {tc.inputJson}</code>
                      <code>exp: {tc.expectedOutput}</code>
                      {res && <code>got: {res.actual} ({res.durationMs}ms)</code>}
                    </div>
                    <button type="button" className="dp-btn" onClick={() => void mutateProj((p) => ({ ...p, tests: tests.filter((x) => x.id !== tc.id) }))}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
