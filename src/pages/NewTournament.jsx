import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { SPORTS, SPORT_IDS } from '../lib/sports.js';

export default function NewTournament() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('tennis');
  const [format, setFormat] = useState('singleElim');
  const [visibility, setVisibility] = useState('public');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    setBusy(true);
    setErr('');
    try {
      const d = await api('/api/tournaments', {
        method: 'POST',
        body: { name, sport, visibility, format },
      });
      nav(`/tournaments/${d.tournament.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="new-match">
      <h1>🏆 New tournament</h1>
      <p className="muted">
        Pick a sport, name the tournament, then add your crew. The draw, round pairings, byes, and
        brackets are generated automatically on start — every fixture is a live scored match.
      </p>

      <div className="panel">
        <div className="panel-title">Name</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Autumn Cup 2026"
          maxLength={80}
        />
      </div>

      <div className="panel">
        <div className="panel-title">Sport</div>
        <div className="sport-grid">
          {SPORT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`sport-option ${sport === id ? 'active' : ''}`}
              onClick={() => setSport(id)}
            >
              <span className="sport-icon">{SPORTS[id].icon}</span>
              <span className="sport-name">{SPORTS[id].name}</span>
            </button>
          ))}
        </div>
        <p className="sport-desc">{SPORTS[sport].description}</p>
      </div>

      <div className="panel">
        <div className="panel-title">Format</div>
        <div className="sides-grid">
          <button
            type="button"
            className={`sport-option ${format === 'singleElim' ? 'active' : ''}`}
            onClick={() => setFormat('singleElim')}
          >
            <span>🏆 Knockout</span>
            <span className="sport-desc small-block">
              Single-elimination bracket — byes handled for you.
            </span>
          </button>
          <button
            type="button"
            className={`sport-option ${format === 'groupPlayoffs' ? 'active' : ''}`}
            onClick={() => setFormat('groupPlayoffs')}
          >
            <span>🔁 Groups + playoffs</span>
            <span className="sport-desc small-block">
              Round-robin groups (2–4 teams each); top 2 advance to the knockout round.
            </span>
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Visibility</div>
        <div className="sides-grid">
          <button
            type="button"
            className={`sport-option ${visibility === 'public' ? 'active' : ''}`}
            onClick={() => setVisibility('public')}
          >
            <span>🌍 Public</span>
          </button>
          <button
            type="button"
            className={`sport-option ${visibility === 'private' ? 'active' : ''}`}
            onClick={() => setVisibility('private')}
          >
            <span>🔒 Private</span>
          </button>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}

      <button className="btn primary big" onClick={create} disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create tournament'}
      </button>
    </div>
  );
}