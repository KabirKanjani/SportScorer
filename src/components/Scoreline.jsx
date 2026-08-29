// Broadcast-style full scoreline (like a Wimbledon / US Open on-screen graphic).
// Shows every finished set (or game for the points family) plus the live piece.
export default function Scoreline({ display }) {
  if (!display) return null;

  const names = display.playerNames;
  const lines = [];

  if (display.setsFamily) {
    const sets = display.completedSets || [];
    const live = (display.gamesInSet && [
      display.gamesInSet[0],
      display.gamesInSet[1],
    ]) || [0, 0];
    const scoreline = sets.length
      ? sets
          .map((s) => `${s.a}-${s.b}${s.tb ? 'ᴸᵛ' : ''}`)
          .concat([`${live[0]}-${live[1]}`])
          .join('  ·  ')
      : `${live[0]}-${live[1]}`;
    lines.push(
      { label: 'SETS', a: display.setCounts[0], b: display.setCounts[1] },
      { label: 'GAMES', a: live[0], b: live[1] },
      { label: '', line: scoreline }
    );
  } else {
    const games = display.completedGames || [];
    const pts = display.points || [0, 0];
    const scoreline = games.length
      ? games.map((g) => `${g[0]}-${g[1]}`).concat([`${pts[0]}-${pts[1]}`]).join('  ·  ')
      : `${pts[0]}-${pts[1]}`;
    lines.push(
      { label: 'GAMES', a: display.setCounts[0], b: display.setCounts[1] },
      { label: '', line: scoreline }
    );
  }

  return (
    <div className={`scoreline ${display.matchOver ? 'over' : ''}`}>
      <div className="scoreline-names">
        <span>{names[0]}</span>
        <span className="scoreline-divider-label">{display.setsFamily ? 'set by set' : 'game by game'}</span>
        <span>{names[1]}</span>
      </div>
      <div className="scoreline-cols">
        {lines.map((ln, i) =>
          ln.line != null ? (
            <div className="scoreline-line" key={i}>{ln.line}</div>
          ) : (
            <div className="scoreline-big" key={i}>
              <b>{ln.a}</b>
              <span>{ln.label}</span>
              <b>{ln.b}</b>
            </div>
          )
        )}
      </div>
    </div>
  );
}