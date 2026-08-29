// Broadcast-style scoreline, Wimbledon / US Open look: player names with the
// sets (or games) they've won, then one column per completed set/game, and a
// final "now" column for the live set/game. Also dubs the match duration.
export default function Scoreline({ display }) {
  if (!display) return null;

  const names = display.playerNames;
  const setsFamily = display.setsFamily;

  const cols = setsFamily ? (display.completedSets || []).length : (display.completedGames || []).length;
  const liveA = setsFamily ? (display.gamesInSet?.[0] ?? 0) : (display.points?.[0] ?? 0);
  const liveB = setsFamily ? (display.gamesInSet?.[1] ?? 0) : (display.points?.[1] ?? 0);
  const setScore = (s) => (s.tb ? `${s.a}-${s.b} (${s.tbPts?.[0]}-${s.tbPts?.[1]})` : `${s.a}-${s.b}`);

  const headerLabel = setsFamily ? 'sets' : 'games';
  const showCols = Math.max(cols, 1);

  return (
    <div className={`scoreline ${display.matchOver ? 'over' : ''}`}>
      <div className="scoreline-board">
        <table className="scoreline-table">
          <thead>
            <tr>
              <th className="sl-player">{headerLabel}</th>
              {Array.from({ length: cols }, (_, i) => (
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
                  <b className="sl-count">{setsFamily ? display.setCounts[side] ?? 0 : display.setCounts[side] ?? 0}</b>
                </td>
                {Array.from({ length: cols }, (_, i) => (
                  <td key={i} className={`sl-col ${setsFamily && display.completedSets[i]?.tb ? 'tb' : ''}`}>
                    {setsFamily
                      ? setScore(display.completedSets[i])
                      : `${display.completedGames[i][0]}-${display.completedGames[i][1]}`}
                  </td>
                ))}
                <td className="sl-col now">
                  {liveA}-{liveB}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sl-caption">
          {setsFamily ? (
            <>
              {names[0]} · {liveA}–{liveB} in the current set
            </>
          ) : (
            <>
              {names[0]} · {liveA}–{liveB} in the current game
            </>
          )}
        </div>
      </div>
    </div>
  );
}