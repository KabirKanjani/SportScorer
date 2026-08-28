import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Bracket from '../components/Bracket.jsx';

const STATUS_PILL = {
  draft: 'Draft',
  live: '● Live',
  finished: 'Finished',
};

export default function Tournament() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [addBox, setAddBox] = useState('');
  const aliveRef = useRef(true);

  const load = async (silent = false) => {
    try {
      const d = await api(`/api/tournaments/${id}`);
      if (aliveRef.current) {
        setT(d.tournament);
        if (!silent) setErr('');
      }
    } catch (e) {
      if (!silent && aliveRef.current) setErr(e.message);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    load(true);
    const tmr = setInterval(() => load(true), 4000);
    return () => {
      aliveRef.current = false;
      clearInterval(tmr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canStart = t?.canStart;
  const canCopyAdd = t?.status === 'draft' && user && t.myRole === 'creator';
  const canJoin = t?.canJoin;

  async function addPlayers() {
    const usernames = addBox
      .split(',')
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean);
    if (usernames.length === 0) return;
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/participants`, {
        method: 'POST',
        body: { usernames },
      });
      setT(d.tournament);
      setAddBox('');
      if (d.invalid.length) setMsg(`Couldn't find: ${d.invalid.join(', ')}`);
      else setMsg(`Added ${d.added.length} player${d.added.length === 1 ? '' : 's'} ✓`);
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function start() {
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/start`, { method: 'POST' });
      setT(d.tournament);
      setMsg('Draw made — bracket is live 🎲');
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function join() {
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/join`, { method: 'POST' });
      setT(d.tournament);
      setMsg('You joined ✓');
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function startFixture(fx) {
    try {
      const d = await api(`/api/fixtures/${fx.id}/start-match`, { method: 'POST' });
      nav(`/match/${d.matchId}`);
    } catch (e) {
      setMsg(e.message);
    }
  }

  const openFixture = (matchId) => nav(`/match/${matchId}`);

  const myId = user?.id;
  const mine = useMemo(
    () => (t ? t.players.find((p) => p.id === myId) : null),
    [t, myId]
  );

  if (!t) {
    return (
      <div className="waiting">
        <div className="spinner" />
        <p>Loading tournament…</p>
      </div>
    );
  }

  return (
    <div className="tourney-page">
      <div className="match-top">
        <div>
          <Link to="/tournaments" className="back-link">
            ← All tournaments
          </Link>
          <h1>
            {t.icon} {t.name}
            <span className={`status-pill s-${t.status}`}>{STATUS_PILL[t.status]}</span>
            {t.visibility === 'private' && <span className="credit-muted">🔒 private</span>}
          </h1>
          <p className="muted">
            {t.sportName} · hosted by{' '}
            <Link to={`/player/${t.creator.id}`} className="event-actor">
              {t.creator.name}
            </Link>
            {t.winner && (
              <span className="cred-chip ok">
                👑 Winner: {t.winner.name}
              </span>
            )}
          </p>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}
      {msg && <div className="form-ok">{msg}</div>}

      <div className="tourney-field">
        <div className="panel tourney-players">
          <div className="panel-title">Field · {t.players.length} player{t.players.length === 1 ? '' : 's'}</div>
          <div className="player-chips">
            {t.players.map((p) => (
              <Link
                key={p.id}
                to={`/player/${p.id}`}
                className={`player-chip ${p.id === myId ? 'me' : ''}`}
              >
                {p.id === myId && <b>★ </b>}
                {p.seed ? <span className="chip-seed">{p.seed}</span> : null}
                {p.name}
                {p.username && <span className="username-tag">@{p.username}</span>}
              </Link>
            ))}
          </div>

          {canCopyAdd && (
            <div className="copy-add">
              <input
                type="text"
                value={addBox}
                onChange={(e) => setAddBox(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayers()}
                placeholder="Add players by username, comma-separated (e.g. @alex, @priya)"
              />
              <button className="btn primary" onClick={addPlayers}>
                Add
              </button>
            </div>
          )}

          {t.status === 'draft' && (
            <p className="muted small" style={{ marginTop: 10 }}>
              The draw is automatic: when you start, everyone is randomly seeded into a knockout
              bracket — byes handled for you.
            </p>
          )}
        </div>

        {canStart && (
          <div className="panel draw-box">
            <div className="panel-title">Ready to draw?</div>
            <button className="btn primary big" onClick={start} disabled={t.players.length < 2}>
              🎲 Make the bracket
            </button>
            <p className="muted small">Needs at least 2 players.</p>
          </div>
        )}
        {canJoin && (
          <div className="panel draw-box">
            <div className="panel-title">Join this tournament</div>
            <button className="btn primary big" onClick={join}>
              Enter as {user?.name.split(' ')[0]}
            </button>
          </div>
        )}
      </div>

      {t.status !== 'draft' && t.rounds.length > 0 && (
        <div className="panel bracket-panel">
          <div className="panel-title">Fixtures &amp; results</div>
          <Bracket
            rounds={t.rounds}
            champion={t.champion}
            sport={t.sport}
            canStart={t.myRole === 'creator' || t.myRole === 'player'}
            onStartMatch={startFixture}
            onOpenMatch={openFixture}
          />
          {t.status === 'finished' && t.champion && (
            <div className="winner-banner">👑 {t.champion.name} is the champion!</div>
          )}
        </div>
      )}
    </div>
  );
}