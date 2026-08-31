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
  const [picks, setPicks] = useState([]);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');
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

  useEffect(() => {
    const q = addBox.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const tmr = setTimeout(async () => {
      try {
        const d = await api(`/api/users?q=${encodeURIComponent(q)}`);
        const taken = new Set([
          ...(t ? t.players.map((p) => p.id) : []),
          ...picks.map((p) => p.id),
        ]);
        if (aliveRef.current) setResults(d.users.filter((u) => !taken.has(u.id)).slice(0, 8));
      } catch {
        if (aliveRef.current) setResults([]);
      }
      if (aliveRef.current) setSearching(false);
    }, 200);
    return () => clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addBox, picks]);

  const canStart = t?.canStart;
  const canCopyAdd = t?.status === 'draft' && user && t.myRole === 'creator';
  const canJoin = t?.canJoin;

  function pik(u) {
    setPicks((p) => (p.some((x) => x.id === u.id) ? p : [...p, u]));
    setAddBox('');
    setResults([]);
  }

  async function addPlayers() {
    const entries =
      picks.length > 0
        ? picks.map((p) => p.username)
        : [addBox.replace(/^@/, '')].filter(Boolean);
    if (entries.length === 0) return;
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/participants`, {
        method: 'POST',
        body: { usernames: entries },
      });
      setT(d.tournament);
      setPicks([]);
      setAddBox('');
      if (d.invalid.length)
        setMsg(`Couldn't add: ${d.invalid.join(' · ')}`);
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

  async function pair() {
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/partners`, {
        method: 'POST',
        body: { playerId: Number(pairA), partnerId: Number(pairB) },
      });
      setT(d.tournament);
      setPairA('');
      setPairB('');
      setMsg('Pairing set — they play as a team ✓');
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function breakPair(p) {
    setMsg('');
    try {
      const d = await api(`/api/tournaments/${id}/partners/${p.id}`, { method: 'DELETE' });
      setT(d.tournament);
      setMsg('Pairing broken ✓');
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

  async function walkover(fx, winnerId) {
    setMsg('');
    try {
      const d = await api(`/api/fixtures/${fx.id}/walkover`, {
        method: 'POST',
        body: { winner: winnerId },
      });
      setT(d.tournament);
      setMsg('Walkover awarded — the player advances ✓');
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
  const teams = useMemo(
    () => (t ? t.players.filter((p) => !p.partner || p.id < p.partner.id) : []),
    [t]
  );
  const isDoubles = teams.length !== (t ? t.players.length : 0);
  const pairOptions = useMemo(
    () => (t && canCopyAdd ? t.players.filter((p) => !p.partner) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );
  const teamLabel = (uid) => (t ? t.players.find((p) => p.id === uid)?.name ?? '—' : '—');
  const minTeams = t?.format === 'groupPlayoffs' ? 4 : 2;

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
            {t.sportName} · {t.format === 'groupPlayoffs' ? 'Groups + playoffs' : 'Knockout bracket'} · hosted by{' '}
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
          <div className="panel-title">
            {isDoubles
              ? `Field · ${teams.length} team${teams.length === 1 ? '' : 's'} (doubles)`
              : `Field · ${t.players.length} player${t.players.length === 1 ? '' : 's'}`}
          </div>
          <div className="player-chips">
            {teams.map((p) => (
              <Link
                key={p.id}
                to={`/player/${p.id}`}
                className={`player-chip ${p.id === myId || p.partner?.id === myId ? 'me' : ''} ${p.partner ? 'doubles' : ''}`}
              >
                {(p.id === myId || p.partner?.id === myId) && <b>★ </b>}
                {p.seed ? <span className="chip-seed">{p.seed}</span> : null}
                {p.name}
                {p.partner ? <span className="partner-tag">DOUBLES</span> : null}
                {p.username && <span className="username-tag">@{p.username}</span>}
              </Link>
            ))}
          </div>

          {canCopyAdd && pairOptions.length >= 2 && (
            <div className="pair-box">
              <div className="pair-title">Doubles pairings</div>
              <div className="pair-row">
                <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
                  <option value="">— player 1 —</option>
                  {pairOptions.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === Number(pairB)}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
                  <option value="">— player 2 —</option>
                  {pairOptions.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === Number(pairA)}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn small"
                  onClick={pair}
                  disabled={!pairA || !pairB || pairA === pairB}
                >
                  Pair as team
                </button>
              </div>
              {teams.filter((p) => p.partner).length > 0 && (
                <div className="pair-list">
                  {teams
                    .filter((p) => p.partner)
                    .map((p) => (
                      <span key={p.id} className="pair-chip">
                        {p.name}
                        <button type="button" onClick={() => breakPair(p)}>
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {canCopyAdd && (
            <div className="add-players">
              <div className="ti">
                <input
                  type="text"
                  value={addBox}
                  onChange={(e) => setAddBox(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (results[0]) pik(results[0]);
                      else addPlayers();
                    }
                  }}
                  placeholder="Search players by name or @username…"
                />
                <span className="ti-spin">{searching ? '…' : ''}</span>
                {results.length > 0 && (
                  <div className="ti-results">
                    {results.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="ti-result"
                        onClick={() => pik(u)}
                      >
                        <span className="ti-name">{u.name}</span>
                        {u.username && <span className="username-tag">@{u.username}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {picks.length > 0 && (
                <div className="sel-chips">
                  {picks.map((u) => (
                    <span key={u.id} className="sel-chip">
                      {u.name}
                      {u.username && <span className="username-tag">@{u.username}</span>}
                      <button type="button" onClick={() => setPicks((p) => p.filter((x) => x.id !== u.id))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                className="btn primary"
                onClick={addPlayers}
                disabled={addBox.trim() === '' && picks.length === 0}
              >
                Add{picks.length ? ` ${picks.length}` : ''}
              </button>
            </div>
          )}

          {t.status === 'draft' && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {isDoubles
                ? 'Pairings are locked into the draw: each team is one bracket entry and bracket matches are scored as doubles.'
                : 'The draw is automatic: when you start, everyone is randomly seeded into a knockout bracket — byes handled for you. Use the pairings box above to play doubles.'}
            </p>
          )}
        </div>

        {canStart && (
          <div className="panel draw-box">
            <div className="panel-title">Ready to draw?</div>
            <button
              className="btn primary big"
              onClick={start}
              disabled={teams.length < minTeams}
            >
              {t.format === 'groupPlayoffs' ? '🎲 Draw groups &amp; start' : '🎲 Make the bracket'}
            </button>
            <p className="muted small">
              Needs at least {minTeams} {isDoubles ? 'teams' : 'players'}
              {t.format === 'groupPlayoffs' ? ' (groups of 3–4, top 2 advance).' : '.'}
            </p>
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

      {t.format === 'groupPlayoffs' && t.groups && (
        <div className="panel group-panel">
          <div className="panel-title">Group stage · {t.groups.length} groups</div>
          {t.groups.map((g) => (
            <div className="group-block" key={g.id}>
              <div className="group-hd">Group {g.label}</div>
              <table className="standings">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>L</th>
                    <th>+/−</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {g.standings.map((s) => (
                    <tr key={s.team.userId} className={s.rank <= 2 ? 'advance' : ''}>
                      <td>{s.rank}</td>
                      <td>
                        <Link to={`/player/${s.team.userId}`} className="stand-name">
                          {teamLabel(s.team.userId)}
                        </Link>
                        {s.rank <= 2 && g.standings.length > 2 && <span className="adv-tag">adv</span>}
                      </td>
                      <td>{s.played}</td>
                      <td>{s.wins}</td>
                      <td>{s.losses}</td>
                      <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                      <td>{s.pointsFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="group-fixtures">
                {g.fixtures.map((f) => (
                  <GroupFixtureRow
                    key={f.id}
                    f={f}
                    teamLabel={teamLabel}
                    myRole={t.myRole}
                    live={t.status === 'live'}
                    onStart={startFixture}
                    onOpen={openFixture}
                    onWalkover={walkover}
                  />
                ))}
              </div>
            </div>
          ))}
          {t.phase === 'group' && (
            <p className="muted small">
              Playoffs start automatically once every group match is decided.
            </p>
          )}
        </div>
      )}

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
            onWalkover={t.myRole === 'creator' && t.status === 'live' ? walkover : null}
          />
          {t.status === 'finished' && t.champion && (
            <div className="winner-banner">👑 {t.champion.name} is the champion!</div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupFixtureRow({ f, teamLabel, myRole, live, onStart, onOpen, onWalkover }) {
  const playable = f.status === 'scheduled' && f.player1 && f.player2;
  const inMatch = f.status === 'live' && f.matchId;
  const ended = f.status === 'done' && f.winner;
  const canAct = myRole === 'creator' || myRole === 'player';
  const winOf = (p) => ended && p && f.winner.id === p.id;
  return (
    <div className={`gfixture ${f.status}`}>
      <span className="gf-match">
        <b className={winOf(f.player1) ? 'gf-win' : ''}>{f.player1 ? teamLabel(f.player1.id) : '—'}</b>
        <span className="gf-vs">vs</span>
        <b className={winOf(f.player2) ? 'gf-win' : ''}>{f.player2 ? teamLabel(f.player2.id) : '—'}</b>
      </span>
      {ended && (
        <span className="gf-score">
          {f.points_a}–{f.points_b} · {teamLabel(f.winner.id)} won
        </span>
      )}
      {inMatch && (
        <button className="btn small" onClick={() => onOpen(f.matchId)}>
          Open match →
        </button>
      )}
      {playable && canAct && (
        <button className="btn small" onClick={() => onStart(f)}>
          Start ▶
        </button>
      )}
      {playable && myRole === 'creator' && live && (
        <span className="gwo">
          {[f.player1, f.player2].filter(Boolean).map((p) => (
            <button
              key={p.id}
              type="button"
              className="fx-wo-btn"
              title="Award a walkover — the other team forfeits"
              onClick={() => onWalkover(f, p.id)}
            >
              WO {String(p.name).split(' ')[0]} →
            </button>
          ))}
        </span>
      )}
    </div>
  );
}