import { useEffect, useState } from 'react';
import './App.css';
import {
  API_BASE_URL,
  createItem,
  fetchHealth,
  fetchItems,
} from './api/client';
import type { HealthResponse, Item } from './api/client';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);

  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err: unknown) {
      setHealthError(err instanceof Error ? err.message : 'Unknown connection error');
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadItems = async () => {
    setItemsLoading(true);
    try {
      const data = await fetchItems();
      setItems(data);
    } catch {
      // If backend is not currently running locally, this is non-blocking
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const data = await fetchHealth();
        if (!ignore) {
          setHealth(data);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setHealthError(err instanceof Error ? err.message : 'Unknown connection error');
        }
      }

      try {
        const itemData = await fetchItems();
        if (!ignore) {
          setItems(itemData);
        }
      } catch {
        // ignore initial item fetch error if backend not yet running
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreateLoading(true);
    try {
      await createItem({ title: newTitle.trim(), description: newDesc.trim() || undefined });
      setNewTitle('');
      setNewDesc('');
      await loadItems();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Hero Header */}
      <header className="hero-banner">
        <h1 className="hero-title">NSAIPETROSOFT</h1>
        <p className="hero-subtitle">
          Modern full-stack setup with <strong>Cloudflare Pages</strong> frontend and{' '}
          <strong>FastAPI</strong> + <strong>PostgreSQL</strong> on <strong>Railway</strong>.
        </p>

        <div className="tech-badges">
          <span className="badge badge-cf">☁️ Cloudflare Pages (React + TS)</span>
          <span className="badge badge-railway">🚆 Railway (FastAPI)</span>
          <span className="badge badge-postgres">🐘 PostgreSQL Database</span>
        </div>
      </header>

      {/* Grid: Health Check & Live Database Test */}
      <div className="grid-two">
        {/* Card 1: Backend Connection */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Backend Status</h2>
            <div className="status-indicator">
              <span
                className={`dot ${
                  health?.status === 'healthy'
                    ? 'dot-green'
                    : healthError
                      ? 'dot-red'
                      : 'dot-amber'
                }`}
              />
              <span>
                {healthLoading
                  ? 'Connecting...'
                  : health?.status === 'healthy'
                    ? 'Online'
                    : healthError
                      ? 'Offline'
                      : 'Checking'}
              </span>
            </div>
          </div>

          <p>
            Target API URL: <code>{API_BASE_URL}</code>
          </p>

          <button
            type="button"
            className="button-primary"
            onClick={checkHealth}
            disabled={healthLoading}
          >
            {healthLoading ? 'Testing connection...' : 'Test Backend Connection'}
          </button>

          {health && (
            <div className="json-box">
              <pre>{JSON.stringify(health, null, 2)}</pre>
            </div>
          )}

          {healthError && (
            <div className="json-box" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <p style={{ color: '#ef4444', fontWeight: 600 }}>Connection Error:</p>
              <p>{healthError}</p>
              <p style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                Ensure your FastAPI backend is running locally on <code>http://localhost:8000</code> or deployed on Railway.
              </p>
            </div>
          )}
        </section>

        {/* Card 2: Interactive PostgreSQL Integration */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">PostgreSQL Database Test</h2>
            <button
              type="button"
              className="button-primary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={loadItems}
              disabled={itemsLoading}
            >
              Refresh
            </button>
          </div>

          <form onSubmit={handleCreateItem} className="form-group">
            <input
              type="text"
              placeholder="Item title (e.g., Seismic Survey Data)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input-field"
              required
            />
            <input
              type="text"
              placeholder="Optional description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="input-field"
            />
            <button
              type="submit"
              className="button-primary"
              disabled={createLoading || !newTitle.trim()}
            >
              {createLoading ? 'Saving to PostgreSQL...' : '+ Add Item to Database'}
            </button>
          </form>

          <div className="items-list">
            {items.length === 0 ? (
              <p style={{ fontSize: '13px', opacity: 0.7, textAlign: 'center', padding: '16px 0' }}>
                {itemsLoading ? 'Loading records...' : 'No items found yet.'}
              </p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="item-card">
                  <h4>{item.title}</h4>
                  {item.description && <p>{item.description}</p>}
                  <span className="item-date">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Deployment Reference */}
      <section className="deployment-guide">
        <h2 className="card-title">Cloudflare Pages &amp; Railway Deployment Reference</h2>
        <div className="guide-steps">
          <div className="step-box">
            <h3>☁️ Cloudflare Pages (Frontend)</h3>
            <ul>
              <li><strong>Root Directory:</strong> <code>frontend</code></li>
              <li><strong>Build Command:</strong> <code>npm run build</code></li>
              <li><strong>Build Output:</strong> <code>dist</code></li>
              <li>
                <strong>Environment Variable:</strong><br />
                <code>VITE_API_BASE_URL = https://your-app.up.railway.app</code>
              </li>
            </ul>
          </div>

          <div className="step-box">
            <h3>🚆 Railway (Backend &amp; DB)</h3>
            <ul>
              <li><strong>PostgreSQL Plugin:</strong> Add PostgreSQL in Railway project.</li>
              <li><strong>Backend Root Directory:</strong> <code>backend</code></li>
              <li><strong>Builder:</strong> Dockerfile (auto-detected).</li>
              <li>
                <strong>Variables:</strong><br />
                Link <code>DATABASE_URL</code> from PostgreSQL plugin &amp; set <code>CORS_ORIGINS</code>.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
