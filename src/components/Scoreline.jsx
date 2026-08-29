// Broadcast-style scoreline, Wimbledon / US Open look. One column per
// completed set/game, with the score SPLIT across the two player rows so the
// column reads "6 | 4" = 6-4 (never duplicated per player). The final "now"
// column shows each player's live games, and the caption carries the live game
// points so the scoreline and the Scoreboard always stay in sync.
export default function Scoreline({ display }) {
  if (!display) return null;

  const names = display.playerNames;
  const setsFamily = display.setsFamily;
  const cols = setsFamily ? display.completedSets : display.completedGames;
  const live = setsFamily ? display.gamesInSet : display.points;
  const setNumber = (setsFamily ? (cols?.length || 0) : (cols?.length || 0)) + 1;

  const caption = setsFamily
    ? (() => {
        const game = display.tiebreak
          ? `tiebreak ${display.points[0]}-${display.points[1]}`
          : display.deuce
            ? 'game deuce'
            : `game ${display.points[0]}-${display.points[1]}`;
        return `${names[0]} · set ${setNumber} ${live[0]}-${live[1]} · ${game}`;
      })()
    : `${names[0]} · game ${live[0]}-${live[1]} · ${display.targetLabel || ''}`;

  return (
    <div className={`scoreline ${display.matchOver ? 'over' : ''}`}>
      <div className="scoreline-board">
        <table className="scoreline-table">
          <thead>
            <tr>
              <th className="sl-player">{setsFamily ? 'sets' : 'games'}</th>
              {(cols || []).map((_, i) => (
                <th key={i} className="sl-col">
                  {setsFamily ? `S${i + 1}` : `G${i + 1}`}
                </th>
              ))}
              <th className="sl-col now">now</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1].map((side) => (
              <tr key={side} className={display.winnerIdx === side ? 'winning' : undefined}>
                <td className="sl-player">
                  <span className="sl-name">{names[side]}</span>
                  <b className="sl-count">{display.setCounts[side] ?? 0}</b>
                </td>
                {(cols || []).map((s, i) => (
                  <td key={i} className={`sl-col ${s.tb ? 'tb' : ''}`}>
                    {setsFamily
                      ? tbCell(s, side)
                      : s[side]}
                  </td>
                ))}
                <td className="sl-col now">{live[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sl-caption">{caption}</div>
      </div>
    </div>
  );
}

// A set column holds one score split across the rows: row 0 shows player A's
// games (e.g. 7 with superscript 8 for a 7-6(8-6) breaker), row 1 player B's (6).
function tbCell(set, side) {
  const games = side === 0 ? set.a : set.b;
  const tbPts = set.tb && set.tbPts ? (side === 0 ? set.tbPts[0] : set.tbPts[1]) : null;
  return tbPts != null ? (
    <>
      {games}
      <sup>{tbPts}</sup>
    </>
  ) : (
    games
  );
}