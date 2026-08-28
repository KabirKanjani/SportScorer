import { useEffect, useMemo, useRef, useState } from 'react';
import { SPORTS } from '../lib/sports.js';
import { avatarHref } from './Avatar.jsx';

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e'];

function avatarColor(id, idx) {
  const n = typeof id === 'number' && Number.isFinite(id) ? id : idx;
  return PALETTE[Math.abs(n) % PALETTE.length];
}

const rand = (min, max) => Math.random() * (max - min) + min;

// Live court above the scoreboard.
//
// What makes it about the *game* (not just a pretty rally):
//  - the on-court HUD always shows the REAL running score, flipping on each point
//  - the serving player is flagged (custom per-sport rotation comes from the engine)
//  - a commentary line describes real pressure (match point, set point, deuce, adv)
//  - rally speed reacts to drama: slower + a pulse on match point
//  - GAME / SET calls land when those really happen; a confetti celebration fires
//    only on the actual match-winning point.
export default function CourtAnimation({
  players = [],
  sportId,
  beat,
  context = null,
  live,
  started,
  finished,
}) {
  const trackRef = useRef(null);
  const ballRef = useRef(null);
  const wallRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const xRef = useRef(rand() < 0.5 ? -46 : 46);
  const genRef = useRef(1);
  const [flash, setFlash] = useState({ winner: null, active: false });
  const [rally, setRally] = useState(0);
  const [hold, setHold] = useState(false);
  const [toast, setToast] = useState(null);
  const [confetti, setConfetti] = useState([]);

  const tokens = useMemo(() => {
    const sides = [null, null];
    for (const p of players) {
      if (p.side === 0 || p.side === 1) sides[p.side] = sides[p.side] ?? p;
    }
    return [
      sides[0] ?? { id: 0, name: 'Player 1', side: 0 },
      sides[1] ?? { id: 1, name: 'Player 2', side: 1 },
    ];
  }, [players]);

  const sportIcon = (SPORTS[sportId]?.icon || '🎾').replace(/[^\p{Extended_Pictographic}]/gu, '');
  const ball = court.ball || sportIcon;
  const court = useMemo(() => SPORTS[sportId]?.court || {}, [sportId]);
  const drama = context?.drama || { serverIdx: 0, deuce: false, gamePoint: null, setPoint: null, matchPoint: null };
  const slow = drama.matchPoint != null ? 1.4 : drama.setPoint != null ? 1.18 : 1;

  // Keep the court on screen briefly after the final point for the celebration.
  useEffect(() => {
    if (finished && typeof beat?.winner === 'number') {
      setHold(true);
      const t = setTimeout(() => setHold(false), beat?.matchWon != null ? 2600 : 1200);
      return () => clearTimeout(t);
    }
  }, [beat?.tick, finished]);

  // GAME / SET call when those milestones really land.
  useEffect(() => {
    const w = beat?.gameWon;
    if (w === 0 || w === 1) {
      setToast({ kind: 'game', side: w, text: `Game ${tokens[w].name.split(' ')[0]}` });
      const t = setTimeout(() => setToast(null), 1400);
      return () => clearTimeout(t);
    }
    if (beat?.setWon === 0 || beat?.setWon === 1) {
      const s = beat.setWon;
      setToast({ kind: 'set', side: s, text: `Set ${tokens[s].name.split(' ')[0]}` });
      const t = setTimeout(() => setToast(null), 1800);
      return () => clearTimeout(t);
    }
    setToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.tick]);

  // Confetti on the actual match-winning point only.
  useEffect(() => {
    if (beat?.matchWon !== 0 && beat?.matchWon !== 1) return;
    const pieces = Array.from({ length: 42 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      dur: 1.1 + Math.random() * 0.9,
      color: PALETTE[i % PALETTE.length],
      size: 6 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 90,
    }));
    setConfetti(pieces);
    const t = setTimeout(() => setConfetti([]), 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.tick]);

  // Rally loop: shots bounce across the court until the next score lands.
  useEffect(() => {
    const track = trackRef.current;
    const ball = ballRef.current;
    if (!track || !ball || !started || !live) return undefined;
    let cancelled = false;
    const gen = genRef.current;
    const jobs = new Set();

    const bump = (side) => {
      const el = side === 0 ? leftRef.current : rightRef.current;
      if (!el) return;
      el.classList.add('lunge');
      const t = setTimeout(() => el.classList.remove('lunge'), 160);
      jobs.add(t);
    };

    const r = court.rally || { dur: [480, 950], bounce: [22, 40], gap: [200, 620] };
    const wall = !!court.wall;

    const crossShot = (target) => {
      if (cancelled || gen !== genRef.current) return;
      const from = xRef.current;
      let to = target === 0 ? -46 : 46;
      if (to === from) to = -to;
      const bounce = rand(r.bounce[0], r.bounce[1]);
      const dur = rand(r.dur[0], r.dur[1]) * slow;
      const xk = [
        { transform: `translateX(${from}%)` },
        { transform: 'translateX(0%)', offset: 0.5 },
        { transform: `translateX(${to}%)` },
      ];
      const yk = wall
        ? [
            { transform: 'translateY(0px)' },
            { transform: `translateY(${-bounce * 0.4}px) scale(1.35)`, offset: 0.48 },
            { transform: `translateY(${-bounce}px)`, offset: 0.68 },
            { transform: 'translateY(2px)', offset: 0.94 },
            { transform: 'translateY(0px)' },
          ]
        : court.arc === 'high'
          ? [
              { transform: 'translateY(0px)' },
              { transform: `translateY(${-bounce}px)`, offset: 0.62 },
              { transform: 'translateY(3px)', offset: 0.94 },
              { transform: 'translateY(0px)' },
            ]
          : [
              { transform: 'translateY(0px)' },
              { transform: `translateY(${-bounce}px)`, offset: 0.5 },
              { transform: 'translateY(0px)' },
            ];
      const xa = track.animate(xk, { duration: dur, easing: 'ease-in-out' });
      const ya = ball.animate(yk, { duration: dur, easing: 'ease-in-out' });
      jobs.add(xa);
      jobs.add(ya);
      xRef.current = to;
      bump(to === -46 ? 0 : 1);
      if (wall && wallRef.current) {
        const t = setTimeout(() => {
          if (wallRef.current) {
            wallRef.current.classList.add('hit');
            const t2 = setTimeout(() => wallRef.current?.classList.remove('hit'), 140);
            jobs.add(t2);
          }
        }, dur * 0.46);
        jobs.add(t);
      }
      xa.addEventListener('finish', () => {
        if (cancelled || gen !== genRef.current) return;
        const t = setTimeout(() => crossShot(Math.random() < 0.5 ? 0 : 1), rand(r.gap[0], r.gap[1]));
        jobs.add(t);
      });
    };

    crossShot(Math.random() < 0.5 ? 0 : 1);
    return () => {
      cancelled = true;
      genRef.current += 1;
      for (const j of jobs) {
        if (j && typeof j.cancel === 'function') j.cancel();
        else clearTimeout(j);
      }
    };
  }, [started, live, rally, slow, court]);

  // Point landing: fly the ball to the real winner, pop them, then restart.
  useEffect(() => {
    if (!started) return;
    const track = trackRef.current;
    const ball = ballRef.current;
    const winner = beat?.winner;
    if (typeof winner !== 'number') {
      setFlash({ winner: null, active: false });
      setRally((r) => r + 1);
      return;
    }
    if (!track || !ball) return;
    let cancelled = false;
    genRef.current += 1;
    const from = xRef.current;
    const to = winner === 0 ? -60 : 60;
    const xk = [
      { transform: `translateX(${from}%)` },
      { transform: `translateX(${to * 0.55}%)`, offset: 0.55 },
      { transform: `translateX(${to}%)`, offset: 0.9 },
      { transform: `translateX(${to}%) translateY(6px)` },
    ];
    const yk = [
      { transform: 'translateY(-6px)' },
      { transform: `translateY(${-34}px)`, offset: 0.55 },
      { transform: 'translateY(4px)' },
    ];
    const xa = track.animate(xk, { duration: 640, easing: 'ease-in' });
    const ya = ball.animate(yk, { duration: 640, easing: 'ease-in-out' });
    setFlash({ winner, active: true });
    const t = setTimeout(() => {
      if (cancelled) return;
      setFlash({ winner: null, active: false });
      xRef.current = to;
      if (live) setRally((r) => r + 1);
    }, 800);
    return () => {
      cancelled = true;
      xa.cancel();
      ya.cancel();
      clearTimeout(t);
    };
  }, [beat?.tick, live, started]);

  if ((finished && !hold) || !started) return null;

  // ---- HUD: real running score -----------------------------------------------
  const points = context?.points || ['0', '0'];
  const deuce = context?.deuce;
  const scoreTxt = deuce
    ? 'DEUCE'
    : points.some((p) => p === 'AD')
      ? points.join('·')
      : points.join('–');

  // ---- Commentary line ---------------------------------------------------------
  let caption = '';
  if (finished && beat?.matchWon != null) {
    caption = `🏆 ${tokens[beat.matchWon].name.split(' ')[0]} wins the match!`;
  } else if (deuce) {
    caption = `Deuce · ${tokens[drama.serverIdx]?.name.split(' ')[0]} serves`;
  } else if (drama.matchPoint != null) {
    caption = `⚡ Match point ${tokens[drama.matchPoint].name.split(' ')[0]}`;
  } else if (drama.setPoint != null) {
    caption = `Set point ${tokens[drama.setPoint].name.split(' ')[0]}`;
  } else if (drama.gamePoint != null) {
    const gp = drama.gamePoint;
    caption =
      points[gp] === 'AD'
        ? `Advantage ${tokens[gp].name.split(' ')[0]}`
        : `Game point ${tokens[gp].name.split(' ')[0]}`;
  } else if (context?.tiebreak) {
    caption = `Tiebreak · ${tokens[drama.serverIdx]?.name.split(' ')[0]} serves`;
  } else {
    caption = `${tokens[drama.serverIdx]?.name.split(' ')[0]} is serving`;
  }

  const hot = drama.matchPoint != null || (drama.setPoint != null && !finished);
  const setLine = context
    ? `Sets ${context?.sets?.[0] ?? 0}–${context?.sets?.[1] ?? 0}`
    : '';

  return (
    <div
      className={`court ${hot ? 'hot' : ''}${court.kind ? ` court-${court.kind}` : ''}`}
      aria-hidden="true"
    >
      {court.wall ? (
        <div className="court-wall" ref={wallRef} style={{ '--wall-c': court.accent }} />
      ) : (
        <div className="court-net" />
      )}
      {court.surface && <div className="court-surface">{court.surface}</div>}

      <div
        className={`court-player side-0 ${flash.active && flash.winner === 0 ? 'win' : ''} ${
          drama.serverIdx === 0 ? 'serving' : ''
        }`}
        ref={leftRef}
        style={{ '--c': avatarColor(tokens[0].id, 0) }}
      >
        {tokens[0].avatar ? (
          <img className="court-avatar photo" src={avatarHref(tokens[0].avatar)} alt="" />
        ) : (
          <span className="court-avatar">{tokens[0].name[0]?.toUpperCase() || '?'}</span>
        )}
        <span className="court-name">{tokens[0].name.split(' ')[0]}</span>
        <span className="court-momentum">
          {Array.from({ length: context?.sets?.[0] ?? 0 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </div>

      <div
        className={`court-player side-1 ${flash.active && flash.winner === 1 ? 'win' : ''} ${
          drama.serverIdx === 1 ? 'serving' : ''
        }`}
        ref={rightRef}
        style={{ '--c': avatarColor(tokens[1].id, 1) }}
      >
        {tokens[1].avatar ? (
          <img className="court-avatar photo" src={avatarHref(tokens[1].avatar)} alt="" />
        ) : (
          <span className="court-avatar">{tokens[1].name[0]?.toUpperCase() || '?'}</span>
        )}
        <span className="court-name">{tokens[1].name.split(' ')[0]}</span>
        <span className="court-momentum">
          {Array.from({ length: context?.sets?.[1] ?? 0 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </div>

      <div className="court-hud" key={scoreTxt + ':' + context?.sets?.join('-')}>
        <span className="court-score">{scoreTxt}</span>
        {setLine && <span className="court-setline">{setLine}</span>}
      </div>
      <div className="court-caption">{caption}</div>

      {toast && (
        <div className={`court-toast ${toast.kind} side-${toast.side}`}>
          {toast.text}
          <span className="court-toast-sub">{toast.kind === 'set' ? setLine : 'one more point…'}</span>
        </div>
      )}

      <div className="court-ball-track" ref={trackRef}>
        <div className={`court-ball ${court.kind || ''}`} ref={ballRef}>
          {flash.active && flash.winner !== null ? `${ball}💥` : ball}
        </div>
      </div>

      {confetti.length > 0 && (
        <div className="court-confetti">
          {confetti.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size * 0.4,
                background: i % 3 === 0 && court.accent ? court.accent : p.color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
                '--drift': `${p.drift}px`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}