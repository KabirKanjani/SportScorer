import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const ICONS = {
  match: '🎾',
  follow: '👤',
  tournament: '🏆',
  general: '🔔',
};

// Converts an ISO timestamp to a friendly "x ago" label.
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const d = await api('/api/notifications');
        if (alive) {
          setItems(d.items || []);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const markAll = async () => {
    try {
      await api('/api/notifications/read', { method: 'POST' });
      setItems((prev) => (prev || []).map((n) => ({ ...n, read: true })));
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) {
    return (
      <div className="page-stack">
        <div className="form-error">{error}</div>
        <button className="btn ghost" onClick={() => setError(null)}>Try again</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="panel">
        <div className="panel-title">🔔 Notifications</div>
        <div className="panel-sub">
          {items?.some((n) => !n.read) && (
            <button className="btn ghost small" onClick={markAll}>Mark all read</button>
          )}
        </div>
      </div>

      {!items && (
        <div className="waiting">
          <div className="spinner" />
          <p>Loading…</p>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {items && !error && items.length === 0 && (
        <div className="empty-state">
          <p>Nothing yet — you’ll hear about matches, follows and tournaments here.</p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="notif-list">
          {items.map((n) => {
            const inner = (
              <>
                <span className="notif-icon" aria-hidden="true">{ICONS[n.type] || ICONS.general}</span>
                <span className="notif-body">
                  <strong>{n.title}</strong>
                  <span className="notif-text">{n.body}</span>
                </span>
                <span className="notif-time">{ago(n.created_at)}</span>
              </>
            );
            return (
              <li key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
                {n.link ? (
                  <Link to={n.link} className="notif-link">{inner}</Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}