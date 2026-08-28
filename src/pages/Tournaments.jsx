import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_PILL = {
  draft: 'Draft',
  live: '● Live',
  finished: 'Finished',
};

export default function Tournaments() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api('/api/tournaments')
      .then((d) => alive && setList(d.tournaments || []))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="feed-page">
      <div className="match-top">
        <div>
          <h1>🏆 Tournaments</h1>
          <p className="muted">Knockout brackets with live matches and automatic draws.</p>
        </div>
        <Link to="/tournaments/new" className="btn primary">
          + New tournament
        </Link>
      </div>

      {err && <div className="form-error">{err}</div>}

      {!list && (
        <div className="waiting">
          <div className="spinner" />
        </div>
      )}

      {list && list.length === 0 && (
        <div className="note-card">
          <p>No tournaments yet — make one and invite friends by username. 🏸</p>
        </div>
      )}

      <div className="tourney-grid">
        {list?.map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className="tourney-card">
            <div className="tourney-head">
              <span className="tourney-icon">{t.icon}</span>
              <div>
                <div className="tourney-name">{t.name}</div>
                <div className="muted small">{t.sportName}</div>
              </div>
            </div>
            <div className="tourney-meta">
              <span className={`status-pill s-${t.status}`}>{STATUS_PILL[t.status]}</span>
              <span className="muted small">{t.players.length} players</span>
            </div>
            {t.winner && (
              <div className="muted small">👑 {t.winner.name}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}