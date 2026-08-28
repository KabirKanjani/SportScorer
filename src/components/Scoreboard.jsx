import { SPORTS } from '../lib/sports.js';

function ServingDot({ active }) {
  return <span className={`server-dot ${active ? 'active' : ''}`}>●</span>;
}

export default function Scoreboard({ display, compact = false }) {
  const {
    sport,
    playerNames,
    serverIdx,
    matchOver,
    winnerIdx,
    setCounts,
    gamesInSet,
    points,
    deuce,
    tiebreak,
    targetLabel,
    started,
  } = display;

  const sportMeta = SPORTS[sport.id];
  const setsFamily = sport.family === 'sets';
  const winnerName = matchOver && winnerIdx !== null ? playerNames[winnerIdx] : null;

  return (
    <section className={`scoreboard ${compact ? 'compact' : ''}`}>
      <div className="scoreboard-head">
        <span className="sport-chip">
          {sportMeta.icon} {sportMeta.name}
        </span>
        <span className="score-meta">{targetLabel}</span>
        {deuce && !matchOver && <span className="deuce-chip">Deuce</span>}
        {tiebreak && <span className="deuce-chip">Tiebreak</span>}
        {matchOver && <span className="winner-chip">Match complete</span>}
      </div>

      <div className="players-grid">
        {/* Player 1 */}
        <div className={`player-card ${serverIdx === 0 ? 'serving' : ''} ${winnerIdx === 0 ? 'winner' : ''}`}>
          <div className="player-row">
            <ServingDot active={serverIdx === 0} />
            <span className="player-name">{playerNames[0]}</span>
            {matchOver && winnerIdx === 0 && <span className="trophy">🏆</span>}
          </div>

          <div className="score-rows">
            {setsFamily && (
              <div className="score-line">
                <span className="score-label">GAMES IN SET</span>
                <span className="score-value">
                  {gamesInSet[0]}
                  {tiebreak ? <span className="tb-mark"> TB</span> : ''}
                </span>
              </div>
            )}
            <div className="score-line big">
              <span className="score-label">POINTS</span>
              <span className={`score-value ${tiebreak ? 'tiebreak' : ''}`}>
                {points[0]}
              </span>
            </div>
            {setsFamily && (
              <div className="score-line">
                <span className="score-label">SETS WON</span>
                <span className="score-value small">{setCounts[0]}</span>
              </div>
            )}
            {!setsFamily && (
              <div className="score-line">
                <span className="score-label">
                  GAMES WON ({sport.match?.gamesToWin === 3 ? 'best of 5' : 'best of 3'})
                </span>
                <span className="score-value small">{setCounts[0]}</span>
              </div>
            )}
          </div>
        </div>

        {/* Player 2 */}
        <div className={`player-card ${serverIdx === 1 ? 'serving' : ''} ${winnerIdx === 1 ? 'winner' : ''}`}>
          <div className="player-row">
            <ServingDot active={serverIdx === 1} />
            <span className="player-name">{playerNames[1]}</span>
            {matchOver && winnerIdx === 1 && <span className="trophy">🏆</span>}
          </div>

          <div className="score-rows">
            {setsFamily && (
              <div className="score-line">
                <span className="score-label">GAMES (set)</span>
                <span className="score-value">{gamesInSet[1]}</span>
              </div>
            )}
            <div className="score-line big">
              <span className="score-label">POINTS</span>
              <span className={`score-value ${tiebreak ? 'tiebreak' : ''}`}>
                {points[1]}
              </span>
            </div>
            {setsFamily && (
              <div className="score-line">
                <span className="score-label">SETS WON</span>
                <span className="score-value small">{setCounts[1]}</span>
              </div>
            )}
            {!setsFamily && (
              <div className="score-line">
                <span className="score-label">GAMES WON</span>
                <span className="score-value small">{setCounts[1]}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {!started && !matchOver && (
        <div className="not-started">Ready to play — tap a player to score the first point</div>
      )}
      {winnerName && (
        <div className="winner-banner">
          🎉 {winnerName} wins the {sportMeta.name} match!
        </div>
      )}
    </section>
  );
}
