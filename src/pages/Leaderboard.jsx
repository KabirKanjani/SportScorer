import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SPORTS } from '../lib/sports.js';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { SportIcon, SPORT_COLORS } from '../components/SportIcon.jsx';

const TABS = [
  { key: null, label: 'All sports', color: '#2563eb' },
  ...Object.entries(SPORTS).map(([k, s]) => ({ key: k, label: s.name, color: SPORT_COLORS[k] })),
];

function streakText(streak) {
  if (!streak) return '—';
  return streak > 0 ? `🔥 ${streak} in a row` : `❄️ ${Math.abs(streak)} in a row`;
}

export default function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const sport = params.get('sport') || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = sport && sport !== 'all' ? `?sport=${encodeURIComponent(sport)}` : '';
      const d = await api(`/api/leaderboard${q}`);
      setRows(d.players || []);
    } catch (e) {
      setError(e.message || 'Could not load the leaderboard');
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    load();
  }, [load]);

  const active = TABS.find((t) => (t.key || '') === sport) || TABS[0];
  const showStreak = sport && sport !== 'all';

  return (
    <div className="page-stack">
      <div className="panel">
        <div className="panel-title">🏆 Leaderboard</div>
        <p className="muted small">
          Global standings from finished matches. A doubles win counts for both partners.
        </p>
      </div>

      <div className="seg sport-tabs">
        {TABS.map((t) => (
          <button
            key={t.key || 'all'}
            className={`seg-btn ${active.key === t.key ? 'active' : ''}`}
            onClick={() => setParams(t.key ? { sport: t.key } : {})}
            style={t.key ? { '--tab-c': t.color } : undefined}
          >
            {t.key ? <SportIcon id={t.key} size={15} /> : <span className="tab-all">🎽</span>} {t.label}
          </button>
        ))}
      </div>
      {loading && (
        <div className="waiting">
          <div className="spinner" />
          <p>Loading standings…</p>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="empty-state">
          <p>No finished {showStreak ? `${active.label.toLowerCase()} ` : ''}matches yet.</p>
          <p className="muted small">Play a match and finish it to get on the board.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-card">
          <table className="board-table">
            <thead>
              <tr>
                <th className="rank-col">#</th>
                <th>Player</th>
                <th>Played</th>
                <th>W–L</th>
                <th>Win%</th>
                {showStreak && <th>Streak</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user.id}>
                  <td className="rank-col rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
                  <td>
                    <Link to={`/player/${r.user.id}`} className="table-user">
                      <Avatar user={r.user} />
                      <span className="table-name">
                        {r.user.name}
                        {r.user.username && <em>@{r.user.username}</em>}
                      </span>
                    </Link>
                  </td>
                  <td>{r.played}</td>
                  <td className={r.wins === r.played && r.played > 0 ? 'win-text' : ''}>{r.wins}–{r.losses}</td>
                  <td>{r.winPct}%</td>
                  {showStreak && <td>{streakText(r.streak)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}