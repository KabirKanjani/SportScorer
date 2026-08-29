import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPORTS, SPORT_IDS } from '../lib/sports.js';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

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
                    <Avatar user={u} className="small" />
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
  const [venue, setVenue] = useState('');
  const [court, setCourt] = useState(null);
  const [conditions, setConditions] = useState('');
  const [tossWinner, setTossWinner] = useState(null); // 0|1|null until flipped
  const [serverFirst, setServerFirst] = useState(null); // 0|1|undefined (toss decides)
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const myUser = { id: user.id, name: user.name, username: user.username };

  // Per-match format (sets family -> sets to win; points family -> games to win)
  const isSetsFamily = SPORTS[sport].family === 'sets';
  const formatTargets = isSetsFamily ? [1, 2, 3] : [1, 2, 3, 5];
  const [target, setTarget] = useState(2);

  function changeSport(id) {
  const sets = SPORTS[id].family === 'sets';
  setSport(id);
  setTarget(sets ? SPORTS[id].match.setsToWin : SPORTS[id].match.gamesToWin);
}

  function flip() {
    if (flipping) return;
    setFlipping(true);
    setError('');
    setTimeout(() => {
      const w = Math.random() < 0.5 ? 0 : 1;
      setTossWinner(w);
      setServerFirst(w); // default: toss winner serves first
      setFlipping(false);
    }, 600);
  }

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
          ...(isSetsFamily ? { sets: target } : { games: target }),
          toss: {
            winner: tossWinner,
            serverFirst: serverFirst ?? undefined,
          },
          preMatch: {
            venue: venue.trim() || null,
            court: court || null,
            conditions: conditions.trim() || null,
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
                onClick={() => changeSport(id)}
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
        <div className="panel-title">Format</div>
        <div className="seg">
          {formatTargets.map((t) => (
            <button
              key={t}
              className={`seg-btn ${target === t ? 'active' : ''}`}
              onClick={() => setTarget(t)}
            >
              {t === 1 ? (isSetsFamily ? 'Single set' : '1 game') : isSetsFamily ? `Best of ${t * 2 - 1}` : `First to ${t}`}
            </button>
          ))}
        </div>
        <p className="muted small">
          {isSetsFamily
            ? 'How many sets a player must win to take the match (default: sport rule).'
            : 'How many games a player must win to take the match (default: sport rule).'}
        </p>
      </div>

      <div className="panel">
        <div className="panel-title">Coin toss 🪙</div>
        <div className="toss-row">
          {tossWinner === null ? (
            <>
              <button className="btn primary" onClick={flip} disabled={flipping}>
                {flipping ? 'Flipping…' : 'Flip the coin'}
              </button>
              <p className="muted small">A random toss decides who serves first — no disputes.</p>
            </>
          ) : (
            <div className="toss-result">
              <div className="toss-winner">
                🎉 <b>{tossWinner === 0 ? (a1 || myUser)?.name : (b1?.name || 'Side B')}</b> won the toss
              </div>
              <div className="toss-choose">
                <span className="muted small">Who serves first?</span>
                <div className="seg">
                  <button className={`seg-btn ${serverFirst === 0 ? 'active' : ''}`} onClick={() => setServerFirst(0)}>
                    {a1?.name || myUser.name}
                  </button>
                  <button className={`seg-btn ${serverFirst === 1 ? 'active' : ''}`} onClick={() => setServerFirst(1)}>
                    {b1?.name || 'Side B'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Pre-match details</div>
        <div className="field">
          <label>Venue / grounds</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Wimbledon · Centre Court"
            maxLength={80}
          />
        </div>
        <div className="field">
          <label>Court / surface</label>
          <select value={court || ''} onChange={(e) => setCourt(e.target.value || null)}>
            <option value="">Default ({SPORTS[sport].court.surface})</option>
            {(SPORTS[sport].courtOptions || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Conditions</label>
          <input
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="e.g. Sunny, 22°C, light breeze"
            maxLength={160}
          />
        </div>
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
                <Avatar user={myUser} className="small" />
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
          {busy ? 'Creating…' : 'Create the match'}
        </button>
        <p className="muted small">
          After creating, everyone gets a link. Only the listed players and invited scorers can
          score it — and only the creator can move it from the coin-toss stage to live play.
        </p>
      </div>
    </div>
  );
}