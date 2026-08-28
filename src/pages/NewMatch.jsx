import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPORTS, SPORT_IDS } from '../lib/sports.js';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// A picker that searches registered users by name.
function PlayerPicker({ label, value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search(text) {
    setQ(text);
    setOpen(true);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const d = await api(`/api/users?q=${encodeURIComponent(text)}`);
      setResults(d.users);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picker">
      <span className="picker-label">{label}</span>
      <div className="picker-select">
        {value ? (
          <div className="pick-chip">
            {value.name}
            <button onClick={() => onChange(null)} aria-label="remove">✕</button>
          </div>
        ) : (
          <>
            <input
              value={q}
              onChange={(e) => search(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Search by name or username…"
            />
            {open && (
              <div className="picker-results">
                {loading && <div className="picker-empty">Searching…</div>}
                {!loading && results.length === 0 && (
                  <div className="picker-empty">No users found. They must create an account first.</div>
                )}
                {results.map((u) => (
                  <button
                    key={u.id}
                    className="picker-result"
                    onMouseDown={() => {
                      onChange(u);
                      setQ('');
                    }}
                  >
                    <span className="avatar small">{u.name[0]?.toUpperCase()}</span>
                    {u.name}
                    {u.username && <span className="username-tag">@{u.username}</span>}
                    <span className="muted small">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function NewMatch() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [sport, setSport] = useState('tennis');
  const [a1, setA1] = useState(null); // side A player 1
  const [a2, setA2] = useState(null); // side A player 2 (doubles)
  const [b1, setB1] = useState(null);
  const [b2, setB2] = useState(null);
  const [doubles, setDoubles] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const myUser = { id: user.id, name: user.name, username: user.username };

  async function create() {
    const sideA = [a1 || myUser, a2].filter(Boolean);
    const sideB = [b1, b2].filter(Boolean);
    if (sideA.length === 0 || sideB.length === 0) {
      setError('Each side needs at least one player. Pick a teammate or opponent.');
      return;
    }
    if (sideA.length > 2 || sideB.length > 2) return;
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/matches', {
        method: 'POST',
        body: {
          sport,
          sides: {
            a: sideA.map((p) => p.id),
            b: sideB.map((p) => p.id),
          },
        },
      });
      nav(`/match/${d.match.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="new-match">
      <h1>Score a new match</h1>
      <p className="muted">Players pick themselves — they need an account so their stats save.</p>

      <div className="panel">
        <div className="panel-title">Sport</div>
        <div className="sport-grid">
          {SPORT_IDS.map((id) => {
            const s = SPORTS[id];
            return (
              <button
                key={id}
                className={`sport-option ${sport === id ? 'active' : ''}`}
                onClick={() => setSport(id)}
              >
                <span className="sport-icon">{s.icon}</span>
                <span className="sport-name">{s.name}</span>
              </button>
            );
          })}
        </div>
        <div className="sport-desc">{SPORTS[sport]?.description}</div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Players
          <label className="doubles-toggle">
            <input type="checkbox" checked={doubles} onChange={(e) => setDoubles(e.target.checked)} />
            Doubles
          </label>
        </div>

        <div className="sides-grid">
          <div className="side-col">
            <div className="side-head">Side A — You ({myUser.name})</div>
            <div className="side-members">
              <div className="pick-chip self">
                <span className="avatar small">{myUser.name[0]?.toUpperCase()}</span>
                {myUser.name}
                {myUser.username && <span className="username-tag">@{myUser.username}</span>}
                <em>you</em>
              </div>
              {doubles && <PlayerPicker label="Teammate" value={a2} onChange={setA2} />}
            </div>
          </div>
          <div className="side-col">
            <div className="side-head">Side B — Opponent(s)</div>
            <div className="side-members">
              <PlayerPicker label="Player 1" value={b1} onChange={setB1} />
              {doubles && <PlayerPicker label="Player 2" value={b2} onChange={setB2} />}
            </div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        <button className="btn primary big full" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Start the match'}
        </button>
        <p className="muted small">
          After creating, everyone gets a link. Only you and the players in the match can score it.
        </p>
      </div>
    </div>
  );
}