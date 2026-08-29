import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScoreboard } from '../hooks/useScoreboard.js';
import Scoreboard from '../components/Scoreboard.jsx';
import Scoreline from '../components/Scoreline.jsx';
import Controls from '../components/Controls.jsx';
import CourtAnimation from '../components/CourtAnimation.jsx';
import { getDisplay, describeDrama } from '../lib/engine.js';
import { SPORTS } from '../lib/sports.js';
import { api } from '../api.js';

const DETAIL_FALLBACK = ['Winner', 'Unforced error', 'Ace', 'Other'];
const ROLE_ICONS = { Creator: '⚑', Player: '🎾', Scorer: '✍' };

export default function MatchPage() {
  const { id } = useParams();
  const sb = useScoreboard(id);

  const [scorers, setScorers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [pre, setPre] = useState(null); // { preMatch, started, canStart }
  const [starting, setStarting] = useState(false);
  const [prompt, setPrompt] = useState({ winner: null, tick: 0 });

  // beat: which side actually won the last exchanged point (0|1|null).
  const prevStateRef = useRef(null);
  const [beat, setBeat] = useState({ winner: null, tick: 0 });

  const display = useMemo(() => (sb.state ? getDisplay(sb.state) : null), [sb.state]);
  const finished = sb.meta?.status === 'finished';

  const court = useMemo(() => {
    if (!sb.state || !display) return null;
    return {
      points: display.points,
      deuce: display.deuce,
      tiebreak: display.tiebreak,
      sets: display.setCounts,
      games: display.gamesInSet,
      targetLabel: display.targetLabel,
      drama: describeDrama(sb.state),
    };
  }, [display, sb.state]);

  const chips = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (userId, name, role) => {
      if (userId == null || seen.has(userId)) return;
      seen.add(userId);
      out.push({ userId, name: name || 'Someone', role });
    };
    participants.forEach((p) => add(p.userId, p.name, 'Player'));
    scorers.forEach((s) => add(s.userId, s.name, 'Scorer'));
    const creatorId = sb.meta?.createdBy;
    const creator =
      participants.find((p) => p.userId === creatorId) ||
      scorers.find((s) => s.userId === creatorId);
    add(creatorId, creator?.name, 'Creator');
    return out;
  }, [participants, scorers, sb.meta?.createdBy]);

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

    let gameWon = null;
    let setWon = null;
    let matchWon = null;
    if (winner !== null) {
      const g = sb.state;
      const over = g.matchOver && g.winnerIdx === winner;
      const gameInc = g.currentSetGames[winner] !== prev.currentSetGames[winner];
      const setInc = g.setWins[winner] !== prev.setWins[winner];
      if (gameInc) gameWon = winner;
      else if (setInc) {
        if (over) matchWon = winner;
        else if (SPORTS[g.sport]?.family === 'sets') setWon = winner;
        else gameWon = winner;
      }
    }
    setBeat((bd) => ({ winner, tick: bd.tick + 1, gameWon, setWon, matchWon }));
    if (winner !== null) {
      setPrompt((p) => ({ winner, tick: p.tick + 1 }));
    }
  }, [sb.state]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/api/matches/${id}`)
        .then((d) => {
          if (!alive) return;
          setScorers(d.scorers || []);
          setParticipants(d.players || []);
          setPre({
            preMatch: d.preMatch || null,
            started: d.started,
            canStart: d.canStart,
            canToss: d.canScore,
          });
        })
        .catch(() => {});
    load();
    return () => {
      alive = false;
    };
  }, [id]);

  const [tossWinner, setTossWinner] = useState(null);
  const [serverFirst, setServerFirst] = useState(null);
  const [tossBusy, setTossBusy] = useState(false);

  useEffect(() => {
    if (pre?.preMatch) {
      setTossWinner(pre.preMatch.tossWinner ?? null);
      setServerFirst(pre.preMatch.serverFirst ?? null);
    }
  }, [pre?.preMatch?.tossWinner, pre?.preMatch?.serverFirst]);

  async function flipToss() {
    if (tossBusy) return;
    setTossBusy(true);
    const w = Math.random() < 0.5 ? 0 : 1;
    setTossWinner(w);
    setServerFirst(w);
    try {
      await sb.setToss({ winner: w, serverFirst: w });
    } catch {
      /* ws push will surface errors */
    } finally {
      setTossBusy(false);
    }
  }

  async function chooseServer(node) {
    if (tossBusy) return;
    setTossBusy(true);
    setServerFirst(node);
    try {
      await sb.setToss({ serverFirst: node });
    } catch {
      /* ignore */
    } finally {
      setTossBusy(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      await sb.startMatch();
      setPre((p) => ({ ...p, started: true, canStart: false }));
    } catch {
      setStarting(false);
    }
  }

  const details = SPORTS[sb.state?.sport]?.pointDetails || DETAIL_FALLBACK;
  const sideNames = display?.playerNames || ['Side A', 'Side B'];
  const detailEnabled = pre?.preMatch?.detailPrompt === true && !finished;

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

      {chips.length > 0 && (
        <div className="role-chips">
          {chips.map((c) => (
            <span key={c.userId} className={`role-chip role-${c.role.toLowerCase()}`}>
              <b>{ROLE_ICONS[c.role] || '·'}</b> {c.name} <em>{c.role}</em>
            </span>
          ))}
        </div>
      )}

      {display && <Scoreline display={display} />}

      {pre && !pre.started && (
        <div className="panel pregame">
          <div className="panel-title">Pre-match</div>
          <div className="prematch-grid">
            <div><span>Venue</span><b>{pre.preMatch?.venue || '—'}</b></div>
            <div><span>Court / surface</span><b>{pre.preMatch?.court || '—'}</b></div>
            <div><span>Conditions</span><b>{pre.preMatch?.conditions || '—'}</b></div>
            <div><span>Format</span><b>{formatLabel(sb.meta?.sport, pre.preMatch?.format)}</b></div>
            {pre.preMatch?.detailPrompt === true && (
              <div><span>Point detail</span><b>On 🎯</b></div>
            )}
          </div>

          <div className="pregame-toss">
            <div className="panel-title">Coin toss 🪙</div>
            {tossWinner === null ? (
              <div className="toss-flip">
                <button
                  className="btn primary"
                  onClick={flipToss}
                  disabled={tossBusy || pre.preMatch?.tossWinner != null || !pre.canToss}
                >
                  {tossBusy ? 'Flipping…' : 'Flip the coin'}
                </button>
                <p className="muted small">
                  {pre.canToss
                    ? 'The toss happens here — with the real player names — so the winner can pick who serves first.'
                    : 'The players or a scorer will flip the toss here before the match starts.'}
                </p>
              </div>
            ) : (
              <div className="toss-result">
                <div className="toss-winner">
                  🎉 <b>{sideNames[tossWinner]}</b> won the toss
                </div>
                <div className="toss-choose">
                  <span className="muted small">Who serves first?</span>
                  <div className="seg">
                    <button
                      className={`seg-btn ${serverFirst === 0 ? 'active' : ''}`}
                      onClick={() => chooseServer(0)}
                      disabled={tossBusy || !pre.canToss}
                    >
                      {sideNames[0]}
                    </button>
                    <button
                      className={`seg-btn ${serverFirst === 1 ? 'active' : ''}`}
                      onClick={() => chooseServer(1)}
                      disabled={tossBusy || !pre.canToss}
                    >
                      {sideNames[1]}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {pre.canStart ? (
            <button className="btn primary big" onClick={handleStart} disabled={starting}>
              {starting ? 'Starting…' : 'Start the match 🎾'}
            </button>
          ) : (
            <p className="muted small gate-note">
              🔒 Scoring is locked until the match creator presses <b>Start</b>.
            </p>
          )}
        </div>
      )}

      <div className="match-layout">
        <div className="match-main">
          {display ? (
            <>
              <CourtAnimation
                players={participants}
                sportId={sb.state.sport}
                beat={beat}
                context={court}
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

          {sb.canScore && display && (
            <Controls
              scoreboard={sb}
              display={display}
              meta={sb.meta}
              detailEnabled={detailEnabled}
              detailWinner={prompt.winner != null ? sideNames[prompt.winner] : null}
              detailPromptOn={detailEnabled && prompt.winner != null && prompt.tick > 0}
              detailOptions={details}
              onRecordDetail={(d) => {
                sb.recordDetail(d);
                setPrompt((p) => ({ ...p, winner: null }));
              }}
              onDismissDetail={() => setPrompt((p) => ({ ...p, winner: null }))}
            />
          )}

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

function formatLabel(sportId, f) {
  const cfg = SPORTS[sportId];
  if (!cfg) return '';
  if (cfg.family === 'sets') {
    const n = f || cfg.match.setsToWin;
    return n === 1 ? 'Single set' : `Best of ${n * 2 - 1} sets`;
  }
  return `First to ${f || cfg.match.gamesToWin} games`;
}