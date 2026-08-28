import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { SPORTS } from '../lib/sports.js';

const COLW = 240;
const CARD_W = 200;
const CH = 74;
const GUT = COLW - CARD_W; // connector gutter between columns

function slotHeight(roundSize) {
  if (roundSize <= 4) return 118;
  if (roundSize <= 8) return 92;
  if (roundSize <= 16) return 80;
  return 70;
}

function roundLabel(round, last, prevLast) {
  if (round === last) return 'Final';
  if (last >= 3 && round === prevLast) return 'Semi';
  return `Round ${round}`;
}

// Classic converging bracket. Column r holds roundSize/2^(r+1) fixtures; each
// column doubles its vertical slot, so children always funnel into their parent.
function computeLayout(rounds) {
  const roundSize = rounds[0]?.fixtures.length * 2 || 2;
  const VS = slotHeight(roundSize);
  const H = roundSize * VS;
  const spots = new Map();

  rounds.forEach((rd, idx) => {
    const slot = VS * 2 ** idx;
    rd.fixtures.forEach((f) => {
      spots.set(`${rd.round}:${f.position}`, {
        x: idx * COLW + (GUT / 2),
        y: f.position * slot + slot / 2 - CH / 2,
        cx: idx * COLW + COLW / 2,
        cy: f.position * slot + slot / 2,
      });
    });
  });

  const lines = [];
  for (let idx = 0; idx < rounds.length - 1; idx += 1) {
    const parentRound = rounds[idx + 1];
    parentRound.fixtures.forEach((pf) => {
      const a = spots.get(`${rounds[idx].round}:${pf.position * 2}`);
      const b = spots.get(`${rounds[idx].round}:${pf.position * 2 + 1}`);
      if (!a || !b) return;
      const endLeft = (idx + 1) * COLW + GUT / 2;
      const mx = (a.cx + b.cx) / 2;
      const cyP = (a.cy + b.cy) / 2;
      lines.push(
        `M${a.cx} ${a.cy} H${mx}`,
        `M${b.cx} ${b.cy} H${mx}`,
        `M${mx} ${a.cy} V${b.cy}`,
        `M${mx} ${cyP} H${endLeft}`
      );
    });
  }
  return { roundSize, H, spots, lines, width: rounds.length * COLW + GUT };
}

export default function Bracket({ rounds, champion, sport, canStart, onStartMatch, onOpenMatch }) {
  const layout = useMemo(() => computeLayout(rounds), [rounds]);
  const last = rounds.length;
  const crownGap = 26;

  if (rounds.length === 0) return null;

  return (
    <div className="bracket-scroll">
      <div className="bracket-head" style={{ width: layout.width + (champion ? crownGap + COLW * 0.55 : 0) }}>
        {rounds.map((rd) => (
          <div className="brag-col-hd" key={rd.round} style={{ width: COLW }}>
            {roundLabel(rd.round, last, last - 1)}
          </div>
        ))}
        {champion && <div className="brag-col-hd crown-hd" style={{ width: crownGap + COLW * 0.55 }}>🏆</div>}
      </div>

      <div
        className="bracket-canvas"
        style={{ width: layout.width + (champion ? crownGap + COLW * 0.55 : 0), height: layout.H }}
      >
        <svg width={layout.width} height={layout.H} className="bracket-lines">
          {layout.lines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>

        {rounds.flatMap((rd) =>
          rd.fixtures.map((f) => {
            const spot = layout.spots.get(`${rd.round}:${f.position}`);
            if (!spot) return null;
            return (
              <FixtureCard
                key={`${rd.round}-${f.position}`}
                f={f}
                sport={sport}
                x={spot.x}
                y={spot.y}
                isFinal={rd.round === last}
                canStart={canStart}
                onStartMatch={onStartMatch}
                onOpenMatch={onOpenMatch}
              />
            );
          })
        )}

        {champion && (
          <Link
            to={`/player/${champion.id}`}
            className="court-champ"
            style={{
              left: layout.width + crownGap,
              top: layout.H / 2 - 34,
              width: COLW * 0.55,
            }}
          >
            <span className="champ-crown">👑</span>
            <span className="champ-name">{champion.name}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function FixtureCard({ f, sport, x, y, isFinal, canStart, onStartMatch, onOpenMatch }) {
  const rows = [
    { p: f.player1, isLoser: f.winner && f.player1 && f.winner.id !== f.player1.id },
    { p: f.player2, isLoser: f.winner && f.player2 && f.winner.id !== f.player2.id },
  ];
  const clickable = !!f.matchId;
  const playable = !f.matchId && f.player1 && f.player2 && f.status === 'scheduled';

  const inner = (
    <>
      {clickable && <span className="fx-live">{f.status === 'live' ? '● LIVE' : '✓'}</span>}
      {rows.map(({ p, isLoser }, i) => (
        <div
          key={i}
          className={`fx-row ${f.winner && p && f.winner.id === p.id ? 'win' : ''} ${isLoser ? 'loss' : ''}`}
        >
          <span className={`fx-ball ${f.winner && p && f.winner.id === p.id ? 'dot-win' : ''}`}>
            {SPORTS[sport]?.icon || '🎾'}
          </span>
          <span className="fx-name">{p ? p.name : '—'}</span>
          {f.isBye && i === 0 && <span className="fx-bye">BYE</span>}
        </div>
      ))}
      {!playable && !clickable && !f.isBye && (
        <div className="fx-foot">
          <span className="fx-wait">{f.winner ? 'Winner' : 'TBD'}</span>
        </div>
      )}
      {isFinal && f.winner && <div className="fx-final-tag">👑 Champion</div>}
    </>
  );

  return (
    <div
      className={`fx-card ${clickable ? 'clickable' : ''} ${playable ? 'playable' : ''}`}
      style={{ left: x, top: y, width: CARD_W }}
      onClick={() => {
        if (clickable && onOpenMatch) onOpenMatch(f.matchId);
        else if (playable && onStartMatch) onStartMatch(f);
      }}
      title={
        playable
          ? 'Start the linked live match'
          : clickable
            ? 'Open the live match'
            : f.isBye
              ? 'Walkover — this player advances free'
              : 'Waiting for results'
      }
    >
      {inner}
      {playable && canStart && (
        <span className="fx-start" onClick={(e) => {
          e.stopPropagation();
          if (onStartMatch) onStartMatch(f);
        }}>
          Start ▶
        </span>
      )}
    </div>
  );
}