import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScoreboard } from '../hooks/useScoreboard.js';
import Scoreboard from '../components/Scoreboard.jsx';
import Scoreline from '../components/Scoreline.jsx';
import CourtAnimation from '../components/CourtAnimation.jsx';
import { getDisplay, describeDrama } from '../lib/engine.js';
import { SPORTS } from '../lib/sports.js';
import { api } from '../api.js';

// Kiosk / presenter view: a read-only, full-screen scoreboard for a TV or
// projector at the court. No controls, no nav, just live scores via WebSocket.
// Anyone with the link can open it; a finished match keeps showing the final.
export default function Kiosk() {
  const { id } = useParams();
  const sb = useScoreboard(id);

  const [participants, setParticipants] = useState([]);
  const [beat, setBeat] = useState({ winner: null, tick: 0 });
  const prevStateRef = useRef(null);

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

  // Point flash: figure out which side won the last exchanged point.
  useEffect(() => {
    if (!sb.state) return;
    const prev = prevStateRef.current;
    prevStateRef.current = sb.state;
    if (!prev) return;
    const w = (x) => x ?? 0;
    const totals = (s) => [
      w(s.setWins[0]) * 1e6 + w(s.currentSetGames[0]) * 1e3 + w(s.gamePoints[0]),
      w(s.setWins[1]) * 1e6 + w(s.currentSetGames[1]) * 1e3 + w(s.gamePoints[1]),
    ];
    const a = totals(prev);
    const b = totals(sb.state);
    if (b[0] > a[0] && b[1] === a[1]) setBeat((x) => ({ winner: 0, tick: x.tick + 1 }));
    else if (b[1] > a[1] && b[0] === a[0]) setBeat((x) => ({ winner: 1, tick: x.tick + 1 }));
  }, [sb.state]);

  useEffect(() => {
    let alive = true;
    api(`/api/matches/${id}`)
      .then((d) => {
        if (alive) setParticipants(d.players || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const sport = SPORTS[sb.state?.sport];
  const status = sb.meta?.status;
  const live = !finished && !sb.state?.matchOver && !!sb.state?.started;

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <span className="kiosk-sport">
          {sport?.icon} {sport?.name}
        </span>
        {status === 'live' && <span className="live-pill">● LIVE</span>}
        {status === 'finished' && <span className="done-pill">Final</span>}
        <span className="kiosk-vs">{sb.meta?.sides?.[0]} vs {sb.meta?.sides?.[1]}</span>
        {!sb.connected && <span className="conn-badge connecting">Reconnecting…</span>}
      </header>

      <div className="kiosk-main">
        {display ? (
          <>
            <CourtAnimation
              players={participants}
              sportId={sb.state.sport}
              beat={beat}
              context={court}
              live={live}
              started={!!sb.state.started}
              finished={finished}
            />
            <Scoreline display={display} />
            <Scoreboard display={display} />
          </>
        ) : (
          <div className="waiting">
            <div className="spinner" />
            <p>Loading scoreboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}