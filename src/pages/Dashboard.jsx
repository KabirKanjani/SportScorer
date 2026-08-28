import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MatchCard from '../components/MatchCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [mine, setMine] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api('/api/me/live'), api(`/api/users/${user.id}`)])
      .then(([live, prof]) => {
        setMine(live.matches);
        setProfile(prof);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  const live = mine.filter((m) => m.status === 'live');
  const finished = mine.filter((m) => m.status === 'finished');
  const stats = profile?.stats;

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1>Hey, {user.name} 👋</h1>
          <p className="muted">Here's what your friends are up to and your recent matches.</p>
        </div>
        <Link to="/new-match" className="btn primary big">
          + Score a new match
        </Link>
      </header>

      {!user.emailVerified && (
        <div className="verify-banner">
          <span>🔎 Your email isn't verified yet — matches you score won't count as confirmed results.</span>
          <Link to={`/verify-email?email=${encodeURIComponent(user.email)}`} className="btn small">
            Verify now
          </Link>
        </div>
      )}

      <section className="panel">
        <div className="panel-title">
          <span>Account</span>
          {user.emailVerified && <span className="cred-chip ok">✓ email verified</span>}
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Friends add you to a match by your username. Yours:{' '}
          <b>{user.username ? `@${user.username}` : 'not set yet'}</b>
        </p>
      </section>

      {loading ? (
        <div className="status-row">Loading…</div>
      ) : (
        <>
          {live.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Your live matches</h2>
              </div>
              <div className="match-grid">
                {live.map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}

          {stats && (
            <section className="stats-strip">
              <div className="stat-box">
                <b>{stats.total.played}</b>
                <span>Matches</span>
              </div>
              <div className="stat-box">
                <b className="win">{stats.total.wins}</b>
                <span>Wins</span>
              </div>
              <div className="stat-box">
                <b className="loss">{stats.total.losses}</b>
                <span>Losses</span>
              </div>
              <div className="stat-box">
                <b>{stats.total.winPct}%</b>
                <span>Win rate</span>
              </div>
            </section>
          )}

          <section>
            <div className="section-head">
              <h2>History</h2>
              <Link to={`/player/${user.id}`} className="see-all">
                Full profile →
              </Link>
            </div>
            {finished.length === 0 && live.length === 0 ? (
              <p className="muted">
                No matches yet.{' '}
                <Link to="/new-match">Create your first match</Link> or check the{' '}
                <Link to="/matches">live feed</Link>.
              </p>
            ) : (
              <div className="match-grid">
                {[...live, ...finished].map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}