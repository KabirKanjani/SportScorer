import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

const STATUS_PILL = {
  draft: 'Draft',
  live: '● Live',
  finished: 'Finished',
};

export default function Search() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('players');
  const [users, setUsers] = useState([]);
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const text = q.trim();
    if (!text) {
      setUsers([]);
      setTours([]);
      setLoading(false);
      setDone(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const [u, t] = await Promise.all([
          api(`/api/users?q=${encodeURIComponent(text)}&limit=24`),
          api(`/api/tournaments?q=${encodeURIComponent(text)}`),
        ]);
        setUsers(u.users || []);
        setTours(t.tournaments || []);
      } catch {
        setUsers([]);
        setTours([]);
      } finally {
        setLoading(false);
        setDone(true);
      }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q]);

  const active = tab === 'players' ? users : tours;
  const total = users.length + tours.length;

  return (
    <div className="search-page">
      <div className="section-head">
        <h1>🔍 Find people &amp; tournaments</h1>
      </div>

      <div className="search-box">
        <input
          className="search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players or tournaments by name…"
          autoFocus
        />
        <span className="search-count muted small">
          {q.trim() && done && <>{total} result{total === 1 ? '' : 's'}</>}
        </span>
      </div>

      <div className="filter-row">
        <div className="seg">
          <button className={`seg-btn ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>
            Players ({users.length})
          </button>
          <button className={`seg-btn ${tab === 'tournaments' ? 'active' : ''}`} onClick={() => setTab('tournaments')}>
            Tournaments ({tours.length})
          </button>
        </div>
      </div>

      {!q.trim() && (
        <div className="empty-state">
          Search matches other SportScore players by name or username, and find public tournaments
          by their name.
        </div>
      )}

      {loading && <div className="status-row">Searching…</div>}

      {q.trim() && done && !loading && active.length === 0 && (
        <div className="empty-state">No {tab} found for “{q.trim()}”.</div>
      )}

      <div className="search-results">
        {tab === 'players'
          ? active.map((u) => (
              <Link key={u.id} to={`/player/${u.id}`} className="search-row">
                <Avatar user={u} />
                <span className="search-name">{u.name}</span>
                {u.username && <span className="username-tag">@{u.username}</span>}
                <span className="muted small search-email">{u.email}</span>
                <span className="search-arrow">→</span>
              </Link>
            ))
          : active.map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="search-row">
                <span className="tourney-icon">{t.icon}</span>
                <span className="search-name">{t.name}</span>
                <span className="muted small">{t.sportName}</span>
                <span className={`status-pill s-${t.status}`}>{STATUS_PILL[t.status]}</span>
                <span className="muted small">{t.players?.length || 0} players</span>
                {t.winner && <span className="muted small">👑 {t.winner.name}</span>}
                <span className="search-arrow">→</span>
              </Link>
            ))}
      </div>
    </div>
  );
}