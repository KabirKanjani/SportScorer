import { useEffect, useMemo, useRef, useState } from 'react';
import { SPORTS } from '../lib/sports.js';

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e'];

function avatarColor(id, idx) {
  const n = typeof id === 'number' && Number.isFinite(id) ? id : idx;
  return PALETTE[Math.abs(n) % PALETTE.length];
}

const rand = (min, max) => Math.random() * (max - min) + min;

// Little “live court” above the scoreboard: two profile-avatars face off and a
// ball rallies back and forth until a point lands. The point winner comes from
// the real score (`beat.winner`), so the animation always ends with the correct
// player taking the point — never the loser. Rally choreography is randomized
// (who you hit to, speed, bounce height).
export default function CourtAnimation({ players = [], sportId, beat, live, started, finished }) {
  const trackRef = useRef(null);
  const ballRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const xRef = useRef(rand() < 0.5 ? -46 : 46);
  const genRef = useRef(1);
  const [flash, setFlash] = useState({ winner: null, active: false });
  const [rally, setRally] = useState(0);
  const [hold, setHold] = useState(false);

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

  // Keep the court on screen briefly after the final point so the winning beat
  // can play out, then hide it.
  useEffect(() => {
    if (finished && typeof beat?.winner === 'number') {
      setHold(true);
      const t = setTimeout(() => setHold(false), 950);
      return () => clearTimeout(t);
    }
  }, [beat?.tick, finished]);

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

    const crossShot = (target) => {
      if (cancelled || gen !== genRef.current) return;
      const from = xRef.current;
      let to = target === 0 ? -46 : 46;
      if (to === from) to = -to; // never hit the same player twice in a row
      const bounce = rand(22, 40);
      const dur = rand(480, 950);
      const xk = [
        { transform: `translateX(${from}%)` },
        { transform: 'translateX(0%)', offset: 0.5 },
        { transform: `translateX(${to}%)` },
      ];
      const yk = [
        { transform: 'translateY(0px)' },
        { transform: `translateY(${-bounce}px)`, offset: 0.55 },
        { transform: 'translateY(0px)' },
      ];
      const xa = track.animate(xk, { duration: dur, easing: 'ease-in-out' });
      const ya = ball.animate(yk, { duration: dur, easing: 'ease-in-out' });
      jobs.add(xa);
      jobs.add(ya);
      xRef.current = to;
      bump(to === -46 ? 0 : 1);
      xa.addEventListener('finish', () => {
        if (cancelled || gen !== genRef.current) return;
        const t = setTimeout(() => crossShot(Math.random() < 0.5 ? 0 : 1), rand(200, 620));
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
  }, [started, live, rally]);

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
    genRef.current += 1; // stop any in-flight rally
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

  return (
    <div className="court" aria-hidden="true">
      <div className="court-net" />
      <div
        className={`court-player side-0 ${flash.active && flash.winner === 0 ? 'win' : ''}`}
        ref={leftRef}
        style={{ '--c': avatarColor(tokens[0].id, 0) }}
      >
        <span className="court-avatar">{tokens[0].name[0]?.toUpperCase() || '?'}</span>
        <span className="court-name">{tokens[0].name.split(' ')[0]}</span>
      </div>
      <div
        className={`court-player side-1 ${flash.active && flash.winner === 1 ? 'win' : ''}`}
        ref={rightRef}
        style={{ '--c': avatarColor(tokens[1].id, 1) }}
      >
        <span className="court-avatar">{tokens[1].name[0]?.toUpperCase() || '?'}</span>
        <span className="court-name">{tokens[1].name.split(' ')[0]}</span>
      </div>
      <div className="court-ball-track" ref={trackRef}>
        <div className="court-ball" ref={ballRef}>
          {flash.active && flash.winner !== null
            ? `${sportIcon}💥`
            : sportIcon}
        </div>
      </div>
    </div>
  );
}