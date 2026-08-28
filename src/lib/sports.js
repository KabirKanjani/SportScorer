// Sport configurations for the scoring engine.
//
// Two "families":
//   'sets'   -> match = best-of-N sets, each set = games, games = points (tennis style)
//   'points' -> match = best-of-N games, each game = points (first to target, win by 2)
//
// serve:
//   'game'        -> server alternates each game (tennis / padel)
//   'switch2'     -> server alternates every 2 points, every 1 point during deuce
//   'lastWinner'  -> whoever won the last point serves next (squash / racquetball)
//   'sideout'     -> only the server can score; winning by non-server = side out (pickleball)

export const SPORTS = {
  tennis: {
    id: 'tennis',
    name: 'Tennis',
    icon: '🎾',
    family: 'sets',
    match: { setsToWin: 2 }, // best of 3
    set: { gamesToWin: 6, winBy: 2, tiebreakAt: 6 }, // tiebreak at 6-6
    tennis: { noAd: false },
    serve: 'game',
    description: 'Best of 3 sets · 6 games each, win by 2 · tiebreak at 6-6',
  },
  padel: {
    id: 'padel',
    name: 'Padel',
    icon: '🥎',
    family: 'sets',
    match: { setsToWin: 2 }, // best of 3
    set: { gamesToWin: 6, winBy: 2, tiebreakAt: 6 },
    tennis: { noAd: false },
    serve: 'game',
    description: 'Best of 3 sets · 6 games each, win by 2 · tiebreak at 6-6',
  },
  squash: {
    id: 'squash',
    name: 'Squash',
    icon: '🏓',
    family: 'points',
    match: { gamesToWin: 3 }, // best of 5
    game: { target: 11, winBy: 2 },
    scoring: 'rally',
    serve: 'lastWinner',
    description: 'Best of 5 games · first to 11, win by 2 (PAR scoring)',
  },
  racquetball: {
    id: 'racquetball',
    name: 'Racquetball',
    icon: '🥊',
    family: 'points',
    match: { gamesToWin: 3 }, // best of 5
    game: { target: 15, winBy: 2 },
    scoring: 'rally',
    serve: 'lastWinner',
    description: 'Best of 5 games · first to 15, win by 2',
  },
  pickleball: {
    id: 'pickleball',
    name: 'Pickleball',
    icon: '🥒',
    family: 'points',
    match: { gamesToWin: 2 }, // best of 3 games
    game: { target: 11, winBy: 2 },
    scoring: 'sideout', // only serving side scores
    serve: 'sideout',
    description: 'Best of 3 games · first to 11, win by 2 · side-out scoring',
  },
  tabletennis: {
    id: 'tabletennis',
    name: 'Table Tennis',
    icon: '🏓',
    family: 'points',
    match: { gamesToWin: 3 }, // best of 5
    game: { target: 11, winBy: 2 },
    scoring: 'rally',
    serve: 'switch2',
    description: 'Best of 5 games · first to 11, win by 2 · serve every 2 points',
  },
  badminton: {
    id: 'badminton',
    name: 'Badminton',
    icon: '🏸',
    family: 'points',
    match: { gamesToWin: 2 }, // best of 3
    game: { target: 21, winBy: 2 },
    scoring: 'rally',
    serve: 'switch2',
    description: 'Best of 3 games · first to 21, win by 2 · serve every 2 points',
  },
};

export const SPORT_IDS = Object.keys(SPORTS);

// ---- Display helpers -------------------------------------------------------

// Tennis point -> 0/15/30/40/Adv display. Returns [a, b] display strings.
export function tennisPointsDisplay(a, b) {
  const target = ['0', '15', '30', '40'];
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40']; // deuce
    if (a === b + 1) return ['AD', '40'];
    if (b === a + 1) return ['40', 'AD'];
    // lead of 2+ should never persist here (game would have ended)
    return ['40', '40'];
  }
  return [target[Math.min(a, 3)], target[Math.min(b, 3)]];
}
