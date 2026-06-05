import { useState, useEffect } from 'react';
import './App.css';

const API = 'http://localhost:8000';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_LABEL = {
  vulnerable: { text: 'VULNERABLE', color: '#ff4d4d' },
  safe:       { text: 'SAFE',       color: '#4caf50' },
  uncertain:  { text: 'UNCERTAIN',  color: '#ff9800' },
  error:      { text: 'ERROR',      color: '#9e9e9e' },
};

export default function App() {
  const [ollamaOk, setOllamaOk]         = useState(null); // null=checking, true, false
  const [ollamaUrl, setOllamaUrl]        = useState('');
  const [models, setModels]             = useState([]);
  const [model, setModel]               = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [attacks, setAttacks]           = useState([]);
  const [selected, setSelected]         = useState(new Set());
  const [loading, setLoading]           = useState(false);
  const [results, setResults]           = useState([]);
  const [error, setError]               = useState('');

  function loadFromBackend(signal) {
    setError('');
    const opts = signal ? { signal } : {};

    fetch(`${API}/status`, opts)
      .then(r => r.json())
      .then(d => { setOllamaOk(d.connected); setOllamaUrl(d.url); })
      .catch(e => { if (e.name !== 'AbortError') setOllamaOk(false); });

    fetch(`${API}/models`, opts)
      .then(r => r.json())
      .then(list => { setModels(list); if (list.length > 0) setModel(list[0]); })
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

  async function runScan() {
    if (!model) { setError('Select a model first.'); return; }
    if (selected.size === 0) { setError('Select at least one attack.'); return; }
    setError('');
    setResults([]);
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
      setResults(await resp.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const vulnCount    = results.filter(r => r.status === 'vulnerable').length;
  const safeCount    = results.filter(r => r.status === 'safe').length;
  const unknownCount = results.filter(r => r.status === 'uncertain').length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <div>
            <h1>Prompt Shield</h1>
            <p className="subtitle">Local LLM Security Scanner</p>
          </div>
          <div className="ollama-status">
            <span className={`status-dot ${ollamaOk === null ? 'dot-checking' : ollamaOk ? 'dot-ok' : 'dot-err'}`} />
            <span className="status-text">
              {ollamaOk === null && 'Connecting…'}
              {ollamaOk === true  && `Ollama connected · ${ollamaUrl}`}
              {ollamaOk === false && `Ollama unreachable · ${ollamaUrl || 'localhost:11434'}`}
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* ── MODEL + SYSTEM PROMPT ── */}
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
              System Prompt to Test <span className="optional">(optional — leave blank to test bare model)</span>
              <textarea
                rows={3}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Paste the system prompt you want to protect…"
              />
            </label>
          </div>
          {ollamaOk === false && (
            <div className="info-box">
              Ollama isn't running. Start it with: <code>ollama serve</code>
              {models.length === 0 && <>, then pull a model: <code>ollama pull llama3</code></>}
            </div>
          )}
        </section>

        {/* ── ATTACK SELECTION ── */}
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
            <button className="btn-ghost" onClick={loadFromBackend}>Retry</button>
          </div>
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : null}

        <button
          className="btn-primary run-btn"
          onClick={runScan}
          disabled={loading || !ollamaOk}
        >
          {loading
            ? `Scanning… (${results.length} / ${selected.size})`
            : `Run ${selected.size} Attack${selected.size !== 1 ? 's' : ''}`}
        </button>

        {/* ── RESULTS ── */}
        {results.length > 0 && (
          <section className="card">
            <h2>Results</h2>
            <div className="results-summary">
              <span className="summary-pill pill-vuln">{vulnCount} Vulnerable</span>
              <span className="summary-pill pill-safe">{safeCount} Safe</span>
              {unknownCount > 0 && (
                <span className="summary-pill pill-uncertain">{unknownCount} Uncertain</span>
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
  );
}
