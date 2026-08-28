import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScoreboard } from '../hooks/useScoreboard.js';
import Scoreboard from '../components/Scoreboard.jsx';
import Controls from '../components/Controls.jsx';
import CourtAnimation from '../components/CourtAnimation.jsx';
import { getDisplay } from '../lib/engine.js';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function MatchPage() {
  const { id } = useParams();
  const sb = useScoreboard(id);
  const { user } = useAuth();

  const [confirmInfo, setConfirmInfo] = useState(null);
  const [scorers, setScorers] = useState([]);
  const [canConfirmApi, setCanConfirmApi] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [participants, setParticipants] = useState([]);

  // beat: which side actually won the last exchanged point (0|1|null).
  const prevStateRef = useRef(null);
  const [beat, setBeat] = useState({ winner: null, tick: 0 });

  const display = useMemo(() => (sb.state ? getDisplay(sb.state) : null), [sb.state]);
  const finished = sb.meta?.status === 'finished';

  useEffect(() => {
    if (!sb.state) return;
    const prev = prevStateRef.current;
    prevStateRef.current = sb.state;
    if (!prev) {
      setBeat((b) => ({ winner: null, tick: b.tick + 1 }));
      return;
    }
    const w = (x) => x ?? 0;
    const totals = (s) => [
      w(s.setWins[0]) * 1e6 + w(s.currentSetGames[0]) * 1e3 + w(s.gamePoints[0]),
      w(s.setWins[1]) * 1e6 + w(s.currentSetGames[1]) * 1e3 + w(s.gamePoints[1]),
    ];
    const a = totals(prev);
    const b = totals(sb.state);
    let winner = null;
    if (b[0] > a[0] && b[1] === a[1]) winner = 0;
    else if (b[1] > a[1] && b[0] === a[0]) winner = 1;
    setBeat((bd) => ({ winner, tick: bd.tick + 1 }));
  }, [sb.state]);

  useEffect(() => {
    let alive = true;
    api(`/api/matches/${id}`)
      .then((d) => {
        if (!alive) return;
        setConfirmInfo(d.confirmInfo);
        setScorers(d.scorers || []);
        setCanConfirmApi(!!d.canConfirm);
        setParticipants(d.players || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, sb.meta?.resultConfirmed]);

  async function confirm() {
    setConfirming(true);
    setConfirmMsg('');
    try {
      const d = await api(`/api/matches/${id}/confirm`, { method: 'POST' });
      setConfirmMsg(d.allConfirmed ? 'Result confirmed by everyone. 🎉' : 'Thanks! Waiting for the other players to confirm.');
      setConfirmInfo((prev) => {
        if (!prev) return prev;
        const doneIds = prev.done.map((p) => p.id).concat([user.id]);
        return {
          required: prev.required,
          done: prev.required.filter((p) => doneIds.includes(p.id)),
          allConfirmed: d.allConfirmed,
        };
      });
    } catch (err) {
      setConfirmMsg(err.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="match-page">
      <div className="match-top">
        <div>
          <Link to="/matches" className="back-link">
            ← All matches
          </Link>
          {sb.meta?.tournament && (
            <Link to={`/tournaments/${sb.meta.tournament.id}`} className="tourney-chip">
              🏆 {sb.meta.tournament.name}
              {sb.meta.tournament.round ? ` · Round ${sb.meta.tournament.round}` : ''}
            </Link>
          )}
          <h1>
            {sb.meta?.icon} {sb.meta?.sportName}
            {sb.meta?.status === 'live' && <span className="live-pill">● LIVE</span>}
            {finished && <span className="done-pill">Finished</span>}
            {finished && sb.meta?.resultConfirmed && (
              <span className="cred-chip ok">✓ Result confirmed</span>
            )}
            {finished && !sb.meta?.resultConfirmed && (
              <span className="cred-chip warn">⚠ unconfirmed</span>
            )}
            {finished && sb.meta?.suspicious && (
              <span className="cred-chip warn">⏱ finished suspiciously fast</span>
            )}
          </h1>
          <p className="muted">
            {sb.meta?.sides?.[0]} vs {sb.meta?.sides?.[1]}
          </p>
        </div>
        {sb.connected ? (
          <span className="conn-badge online">● Live sync</span>
        ) : (
          <span className="conn-badge connecting">Reconnecting…</span>
        )}
      </div>

      <div className="match-layout">
        <div className="match-main">
          {display ? (
            <>
              <CourtAnimation
                players={participants}
                sportId={sb.state.sport}
                beat={beat}
                live={!finished && !sb.state.matchOver}
                started={!!sb.state.started}
                finished={finished}
              />
              <Scoreboard display={display} />
            </>
          ) : (
            <div className="waiting">
              <div className="spinner" />
              <p>Loading match…</p>
            </div>
          )}

          {sb.canScore && display && <Controls scoreboard={sb} display={display} meta={sb.meta} />}

          {finished && canConfirmApi && !sb.meta?.resultConfirmed && (
            <div className="confirm-banner">
              <div>
                <b>Confirm this result?</b>
                <span className="muted">
                  {confirmInfo ? (
                    <span>
                      Confirmed by {confirmInfo.done.length} of {confirmInfo.required.length}:{' '}
                      {confirmInfo.required.map((p) => p.name).join(', ')}.
                      Confirmed matches count toward the stats.
                    </span>
                  ) : (
                    'This final score becomes official when the players agree on it.'
                  )}
                </span>
              </div>
              <button className="btn primary" onClick={confirm} disabled={confirming}>
                {confirming ? '…' : 'I agree — this is the result'}
              </button>
            </div>
          )}
          {confirmMsg && <div className="form-ok">{confirmMsg}</div>}

          {sb.error && <div className="form-error">{sb.error}</div>}

          <div className="note-card">
            <p>
              Share this page with friends — they'll see every point live and it saves to your
              history. Scorecard control goes to the match creator, the listed players, and any
              scorer added by the creator.
            </p>
            {scorers.length > 0 && (
              <p className="muted small">
                Scorers: <b>{scorers.map((s) => s.name).join(', ')}</b>
              </p>
            )}
            {sb.meta?.durationMinutes != null && (
              <p className="muted small">
                Match duration: {sb.meta.durationMinutes} min
                {sb.meta.suspicious ? ' (flagged — recorded very fast)' : ''}
              </p>
            )}
          </div>
        </div>

        <aside className="match-side">
          <div className="panel">
            <div className="panel-title">Point-by-point</div>
            <div className="timeline">
              {sb.events.length === 0 && <p className="muted small">No points yet.</p>}
              {[...sb.events].reverse().map((e) => (
                <div key={e.id} className="event-row">
                  <span className="event-time">{timeStr(e.createdAt)}</span>
                  <span className="event-detail">
                    {e.actor ? <span className="event-actor">{e.actor.name}</span> : null}
                    {e.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function timeStr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}