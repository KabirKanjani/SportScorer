import { useEffect, useRef, useState } from 'react';
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

// Real-place picker: Google Places autocomplete + "nearby courts" geolocation,
// served through the server-side proxy. Falls back to free text with no key.
function VenueField({ text, onText, place, onPlace, sportName }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef();

  useEffect(() => {
    let alive = true;
    api('/api/places/config')
      .then((d) => alive && setConfigured(!!d.configured))
      .catch(() => alive && setConfigured(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (configured !== true || !text.trim() || place) {
      setResults([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      api(`/api/places/search?q=${encodeURIComponent(text.trim())}`)
        .then((d) => setResults(d.results || []))
        .catch((e) => setErr(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [text, configured, place]);

  async function pick(p) {
    setOpen(false);
    setNearby([]);
    let chosen = p;
    if (!Number.isFinite(p.lat) && p.placeId) {
      try {
        const d = await api(`/api/places/place?placeId=${encodeURIComponent(p.placeId)}`);
        if (d.place) chosen = d.place;
      } catch { /* keep the lightweight prediction */ }
    }
    onPlace(chosen);
    onText(chosen.name);
  }

  async function findNearby() {
    if (!navigator.geolocation) {
      setErr('This browser has no location support — type a venue instead.');
      return;
    }
    setLocating(true);
    setErr('');
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const d = await api(
        `/api/places/courts?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&q=${encodeURIComponent(`${sportName} court`)}`
      );
      setNearby(d.results || []);
      setOpen(true);
      if (!d.results?.length) setErr(d.error || `No ${sportName} courts found nearby — try typing one.`);
    } catch (e) {
      setErr(
        e?.code === 1
          ? 'Location permission denied — type a venue instead.'
          : 'Could not get your location — type a venue instead.'
      );
    } finally {
      setLocating(false);
    }
  }

  const suggestions = place ? [] : open && configured ? [...results, ...nearby] : [];

  return (
    <div className="venue-field">
      <div className="venue-row">
        <input
          value={text}
          onChange={(e) => {
            if (place) onPlace(null);
            onText(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={place ? place.name : 'e.g. Wimbledon · Centre Court'}
          maxLength={80}
        />
        {place ? (
          <button type="button" className="pick-clear" onClick={() => { onPlace(null); onText(''); }} aria-label="remove place">
            ✕
          </button>
        ) : configured ? (
          <button type="button" className="btn ghost" onClick={findNearby} disabled={locating}>
            📍 {locating ? 'Finding…' : 'Near me'}
          </button>
        ) : null}
      </div>
      {configured === true && !place && (
        <p className="muted small venue-hint">Search real {sportName} courts &amp; venues.</p>
      )}
      {suggestions.length > 0 || loading ? (
        <div className="picker-results place-results">
          {loading && <div className="picker-empty">Searching…</div>}
          {!loading &&
            suggestions.map((s) => (
              <button
                key={s.placeId || `${s.name}-${s.address}`}
                className="picker-result"
                onMouseDown={() => pick(s)}
              >
                <span className="place-name">📍 {s.name}</span>
                {s.address && <span className="place-addr">{s.address}</span>}
              </button>
            ))}
        </div>
      ) : null}
      {err && <p className="muted small venue-hint err">{err}</p>}
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
  const [place, setPlace] = useState(null);
  const [court, setCourt] = useState(null);
  const [conditions, setConditions] = useState('');
  const [pointDetail, setPointDetail] = useState(false);
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
          preMatch: {
            venue: place?.name || venue.trim() || null,
            court: court || null,
            conditions: conditions.trim() || null,
            detailPrompt: pointDetail,
            ...(place
              ? {
                  place: {
                    placeId: place.placeId || null,
                    name: place.name,
                    address: place.address || null,
                    lat: Number.isFinite(place.lat) ? place.lat : null,
                    lng: Number.isFinite(place.lng) ? place.lng : null,
                  },
                }
              : {}),
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
        <div className="panel-title">Pre-match details</div>
        <div className="field">
          <label>Venue / place</label>
          <VenueField
            text={venue}
            onText={setVenue}
            place={place}
            onPlace={setPlace}
            sportName={SPORTS[sport].name}
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
        <label className="detail-toggle">
          <input
            type="checkbox"
            checked={pointDetail}
            onChange={(e) => setPointDetail(e.target.checked)}
          />
          <span>
            <b>Point-by-point detail</b>
            <em>After every point, ask how it was won (ace, winner, double fault…).</em>
          </span>
        </label>
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
          After creating, everyone gets a link. You'll flip the toss and set the format on the
          match page, then only you (the creator) can move it to live play. Only the listed
          players and invited scorers can score it.
        </p>
      </div>
    </div>
  );
}