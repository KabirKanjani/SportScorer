import { Link } from 'react-router-dom';

// Score-formatting per sport for the compact card tiles.
function ScoreText({ s }) {
  if (!s) return null;
  const { setCounts, gamesInSet, tiebreak } = s;
  const a = setCounts?.[0];
  const b = setCounts?.[1];
  if (a === null) return null;
  if (gamesInSet && gamesInSet[0] !== null) {
    // tennis-style: also show games in current set
    return (
      <span className="card-score">
        <b>
          {a}
          {b}
        </b>
        <em>
          {gamesInSet[0]}-{gamesInSet[1]}
          {tiebreak ? ' TB' : ''}
        </em>
      </span>
    );
  }
  return (
    <span className="card-score">
      <b>
        {a}
        {b}
      </b>
    </span>
  );
}

export default function MatchCard({ m }) {
  const live = m.status === 'live';
  return (
    <Link to={`/match/${m.id}`} className={`match-card ${live ? 'live' : 'finished'}`}>
      <div className="card-top">
        <span className="sport-chip small">
          {m.icon} {m.sportName}
        </span>
        {live ? <span className="live-pill">● LIVE</span> : <span className="done-pill">Done</span>}
      </div>

      <div className="card-pair">
        <div className={`card-side ${m.winner === 0 ? 'won' : ''}`}>
          <span className="side-name">{m.sides[0]}</span>
          {m.winner === 0 && <span className="trophy-mini">🏆</span>}
        </div>
        <span className="card-vs">vs</span>
        <div className={`card-side ${m.winner === 1 ? 'won' : ''}`}>
          <span className="side-name">{m.sides[1]}</span>
          {m.winner === 1 && <span className="trophy-mini">🏆</span>}
        </div>
        <ScoreText s={m.score} />
      </div>

      <div className="card-foot">
        <span>{formatWhen(m.updatedAt)}</span>
        {m.status === 'finished' && m.winnerNames && <span className="winner-name">Winner: {m.winnerNames}</span>}
      </div>
      <div className="card-flags">
        {m.status === 'finished' &&
          (m.resultConfirmed ? (
            <span className="cred-chip ok">✓ result confirmed</span>
          ) : (
            <span className="cred-chip warn">⚠ result unconfirmed</span>
          ))}
        {m.suspicious && <span className="cred-chip warn">⏱ very fast</span>}
        {m.durationMinutes != null && <span className="cred-chip neutral">{m.durationMinutes} min</span>}
      </div>
    </Link>
  );
}

export function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}