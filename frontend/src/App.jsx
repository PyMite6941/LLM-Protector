import { useState, useEffect, useRef, Component } from 'react';
import './App.css';
import demoData from './demoData.json';

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#ff4d4d' }}>
        <h2>Render error</h2>
        <pre>{this.state.error.message}</pre>
        <pre>{this.state.error.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

const API = 'http://127.0.0.1:8000';
const DEMO = import.meta.env.VITE_DEMO_MODE === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const DEMO_ATTACKS = DEMO
  ? [...demoData.attacks].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
  : [];
const DEMO_MODELS = DEMO ? demoData.models.map(m => m.model) : [];
const STATUS_LABEL = {
  vulnerable: { text: 'VULNERABLE', color: '#ff4d4d' },
  safe:       { text: 'SAFE',       color: '#4caf50' },
  uncertain:  { text: 'UNCERTAIN',  color: '#ff9800' },
  error:      { text: 'ERROR',      color: '#9e9e9e' },
};

export default function App() {
  const [ollamaOk, setOllamaOk]         = useState(DEMO ? true : null);
  const [ollamaUrl, setOllamaUrl]        = useState('');
  const [models, setModels]             = useState(DEMO ? DEMO_MODELS : []);
  const [model, setModel]               = useState(DEMO && DEMO_MODELS.length > 0 ? DEMO_MODELS[0] : '');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [attacks, setAttacks]           = useState(DEMO ? DEMO_ATTACKS : []);
  const [selected, setSelected]         = useState(DEMO ? new Set(DEMO_ATTACKS.map(a => a.id)) : new Set());
  const [loading, setLoading]           = useState(false);
  const [results, setResults]           = useState([]);
  const [logs, setLogs]                 = useState([]);
  const [error, setError]               = useState('');
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  function loadFromBackend(signal) {
    const opts = signal ? { signal } : {};

    fetch(`${API}/status`, opts)
      .then(r => r.json())
      .then(d => { setOllamaOk(d.connected); setOllamaUrl(d.url); })
      .catch(e => { if (e.name !== 'AbortError') setOllamaOk(false); });

    fetch(`${API}/models`, opts)
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list)) {
          setModels(list);
          if (list.length > 0) { setModel(list[0]); setOllamaOk(true); }
        }
      })
      .catch(() => {});

    fetch(`${API}/attacks`, opts)
      .then(r => r.json())
      .then(data => {
        const sorted = [...data].sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
        );
        setAttacks(sorted);
        setSelected(new Set(sorted.map(a => a.id)));
      })
      .catch(e => { if (e.name !== 'AbortError') setError('backend_down'); });
  }

  useEffect(() => {
    if (DEMO) return;
    const controller = new AbortController();
    loadFromBackend(controller.signal);
    return () => controller.abort();
  }, []);

  const categories = [...new Set(attacks.map(a => a.category))];

  function toggleAttack(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCategory(cat) {
    const catIds = attacks.filter(a => a.category === cat).map(a => a.id);
    const allOn = catIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      catIds.forEach(id => allOn ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function handleScanMessage(msg) {
    if (msg.type === 'result') {
      setResults(prev => [...prev, msg.data]);
    } else if (msg.type === 'log') {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, `${time}  ${msg.message}`]);
    } else if (msg.type === 'done') {
      const time = new Date().toLocaleTimeString();
      const summary = Object.entries(msg.counts ?? {})
        .map(([k, v]) => `${v} ${k}`)
        .join(', ') || 'no results';
      setLogs(prev => [...prev, `${time}  Scan finished: ${summary}`]);
    }
  }

  async function runDemoScan() {
    setError('');
    setResults([]);
    setLogs([]);
    setLoading(true);
    const md = demoData.models.find(m => m.model === model) || demoData.models[0];
    const chosen = (md?.results ?? []).filter(r => selected.has(r.id));
    const t0 = new Date().toLocaleTimeString();
    setLogs([`${t0}  Demo scan started: replaying ${chosen.length} recorded attacks against '${md?.model}'`]);
    const counts = {};
    for (const r of chosen) {
      await sleep(40);
      setResults(prev => [...prev, r]);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      const t = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, `${t}  [${r.id}] ${r.status.toUpperCase()} - ${r.reason}`]);
    }
    const t1 = new Date().toLocaleTimeString();
    const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no results';
    setLogs(prev => [...prev, `${t1}  Scan finished: ${summary} · risk ${md?.score?.risk_score} (grade ${md?.score?.grade})`]);
    setLoading(false);
  }

  async function runScan() {
    if (DEMO) return runDemoScan();
    if (!model) { setError('Select a model first.'); return; }
    if (selected.size === 0) { setError('Select at least one attack.'); return; }
    setError('');
    setResults([]);
    setLogs([]);
    setLoading(true);
    try {
      const resp = await fetch(`${API}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          attack_ids: [...selected],
          system_prompt: systemPrompt,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server error ${resp.status}: ${text}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          handleScanMessage(JSON.parse(line));
        }
      }
      if (buffer.trim()) handleScanMessage(JSON.parse(buffer));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const vulnCount    = results.filter(r => r.status === 'vulnerable').length;
  const safeCount    = results.filter(r => r.status === 'safe').length;
  const unknownCount = results.filter(r => r.status === 'uncertain').length;
  const demoModel    = DEMO ? demoData.models.find(m => m.model === model) : null;
  const demoIds      = demoModel ? new Set(demoModel.results.map(r => r.id)) : null;
  const scanTotal    = demoIds ? [...selected].filter(id => demoIds.has(id)).length : selected.size;

  return (
    <ErrorBoundary>
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <div>
            <h1>Prompt Shield</h1>
            <p className="subtitle">Local LLM Security Scanner</p>
          </div>
          <div className="ollama-status">
            <span className={`status-dot ${DEMO ? 'dot-ok' : ollamaOk === null ? 'dot-checking' : ollamaOk ? 'dot-ok' : 'dot-err'}`} />
            <span className="status-text">
              {DEMO
                ? 'Demo mode · replaying a real recorded scan'
                : <>
                    {ollamaOk === null && 'Connecting…'}
                    {ollamaOk === true  && `Ollama connected · ${ollamaUrl}`}
                    {ollamaOk === false && `Ollama unreachable · ${ollamaUrl || 'localhost:11434'}`}
                  </>}
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {DEMO && (
          <div style={{
            margin: '0 0 18px', padding: '13px 16px',
            border: '1px solid #6d4bd8', borderRadius: 10,
            background: 'linear-gradient(90deg, rgba(137,87,229,0.14), rgba(88,166,255,0.08))',
            color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.55,
          }}>
            <strong style={{ color: '#fff' }}>Live demo.</strong> These are <em>real</em> results from a recorded
            benchmark of local Ollama models, replayed instantly — nothing runs server-side, so it can't stall or
            break. Pick a model and run a scan. The full tool runs locally against your own models:{' '}
            <a href="https://github.com/PyMite6941/LLM-Protector" target="_blank" rel="noreferrer"
               style={{ color: '#8ab4ff' }}>GitHub →</a>
          </div>
        )}

        <section className="card">
          <h2>Target</h2>
          <div className="config-grid">
            <label>
              Model
              <select value={model} onChange={e => setModel(e.target.value)}>
                {models.length === 0
                  ? <option value="">No models found — run: ollama pull llama3</option>
                  : models.map(m => <option key={m} value={m}>{m}</option>)
                }
              </select>
            </label>
            <label className="full-width">
              System Prompt to Test <span className="optional">{DEMO ? '(disabled in demo)' : '(optional — leave blank to test bare model)'}</span>
              <textarea
                rows={3}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Paste the system prompt you want to protect…"
                disabled={DEMO}
              />
            </label>
          </div>
          {!DEMO && ollamaOk === false && (
            <div className="info-box">
              Ollama isn't running. Start it with: <code>ollama serve</code>
              {models.length === 0 && <>, then pull a model: <code>ollama pull llama3</code></>}
            </div>
          )}
        </section>

        <section className="card">
          <div className="attack-header">
            <h2>
              Attacks
              <span className="badge">{selected.size} / {attacks.length} selected</span>
            </h2>
            <div className="bulk-btns">
              <button className="btn-ghost" onClick={() => setSelected(new Set(attacks.map(a => a.id)))}>All</button>
              <button className="btn-ghost" onClick={() => setSelected(new Set())}>None</button>
            </div>
          </div>

          {categories.map(cat => {
            const catAttacks = attacks.filter(a => a.category === cat);
            const allOn = catAttacks.every(a => selected.has(a.id));
            return (
              <div key={cat} className="category-group">
                <div className="category-title">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => toggleCategory(cat)}
                    id={`cat-${cat}`}
                  />
                  <label htmlFor={`cat-${cat}`}>{cat}</label>
                </div>
                <div className="attack-list">
                  {catAttacks.map(a => (
                    <label key={a.id} className="attack-item">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleAttack(a.id)}
                      />
                      <span className="attack-name">{a.name}</span>
                      <span className={`severity-badge sev-${a.severity}`}>{a.severity}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {error === 'backend_down' ? (
          <div className="error-box backend-down">
            <strong>Backend not reachable</strong> — make sure it's running:
            <pre>cd backend{'\n'}.venv\Scripts\python.exe main.py</pre>
            <button className="btn-ghost" onClick={() => { setError(''); loadFromBackend(); }}>Retry</button>
          </div>
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : null}

        <button
          className="btn-primary run-btn"
          onClick={runScan}
          disabled={loading || (!DEMO && !ollamaOk)}
        >
          {loading
            ? `Scanning… (${results.length} / ${scanTotal})`
            : `Run ${scanTotal} Attack${scanTotal !== 1 ? 's' : ''}`}
        </button>

        {logs.length > 0 && (
          <section className="card">
            <h2>
              Backend Log
              {loading && <span className="badge">live</span>}
            </h2>
            {loading && scanTotal > 0 && (
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${(results.length / scanTotal) * 100}%` }}
                />
              </div>
            )}
            <div className="log-panel">
              {logs.map((line, i) => (
                <div key={i} className="log-line">{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        )}

        {results.length > 0 && (
          <section className="card">
            <h2>Results</h2>
            <div className="results-summary">
              <span className="summary-pill pill-vuln">{vulnCount} Vulnerable</span>
              <span className="summary-pill pill-safe">{safeCount} Safe</span>
              {unknownCount > 0 && (
                <span className="summary-pill pill-uncertain">{unknownCount} Uncertain</span>
              )}
              {demoModel && (
                <span className="summary-pill" style={{ background: '#6d4bd8', color: '#fff' }}>
                  Risk {demoModel.score.risk_score} · Grade {demoModel.score.grade}
                </span>
              )}
            </div>

            <div className="results-list">
              {results.map(r => {
                const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.uncertain;
                return (
                  <details key={r.id} className="result-item">
                    <summary className="result-summary">
                      <span className="result-name">{r.name}</span>
                      <span className="result-category">{r.category}</span>
                      <span className={`severity-badge sev-${r.severity}`}>{r.severity}</span>
                      <span className="result-status" style={{ color: s.color }}>{s.text}</span>
                    </summary>
                    <div className="result-body">
                      <p className="result-reason"><strong>Reason:</strong> {r.reason}</p>
                      <div className="result-cols">
                        <div>
                          <p className="col-label">Prompt sent</p>
                          <pre className="result-text">{r.prompt}</pre>
                        </div>
                        <div>
                          <p className="col-label">Model response</p>
                          <pre className="result-text">{r.response || '(no response)'}</pre>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
    </ErrorBoundary>
  );
}
