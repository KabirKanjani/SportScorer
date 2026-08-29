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
    pointDetails: [
      { label: 'Ace', only: 'server' },
      { label: 'Double fault', only: 'receiver' },
      { label: 'Winner' },
      { label: 'Unforced error' },
      { label: 'Forced error' },
      { label: 'Drop shot' },
      { label: 'Net point' },
      { label: 'Other' },
    ],
    courtOptions: ['Hard court', 'Clay court', 'Grass court', 'Carpet court'],
    description: 'Best of 3 sets · 6 games each, win by 2 · tiebreak at 6-6',
    court: {
      kind: 'tennis',
      surface: 'Hard court',
      accent: '#4ade80',
      ball: '🎾',
      wall: false,
      arc: 'mid',
      rally: { dur: [540, 1000], bounce: [26, 42], gap: [240, 640] },
    },
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
    pointDetails: [
      { label: 'Ace', only: 'server' },
      { label: 'Double fault', only: 'receiver' },
      { label: 'Winner' },
      { label: 'Unforced error' },
      { label: 'Forced error' },
      { label: 'Bandeja' },
      { label: 'Vibora' },
      { label: 'Other' },
    ],
    courtOptions: ['Glass indoor padel', 'Outdoor padel', 'Artificial grass'],
    description: 'Best of 3 sets · 6 games each, win by 2 · tiebreak at 6-6',
    court: {
      kind: 'padel',
      surface: 'Glass padel box',
      accent: '#38bdf8',
      ball: '🎾',
      wall: false,
      arc: 'mid',
      rally: { dur: [760, 1250], bounce: [20, 36], gap: [340, 720] },
    },
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
    pointDetails: [
      { label: 'Ace', only: 'server' },
      { label: 'Unforced error' },
      { label: 'Winner' },
      { label: 'Let / stroke' },
      { label: 'Tin error' },
      { label: 'Other' },
    ],
    courtOptions: ['Glass court', 'Full-height front wall'],
    description: 'Best of 5 games · first to 11, win by 2 (PAR scoring)',
    court: {
      kind: 'box',
      surface: 'Front-wall squash',
      accent: '#fb7185',
      ball: '⚫',
      wall: true,
      arc: 'low',
      rally: { dur: [400, 820], bounce: [12, 24], gap: [150, 420] },
    },
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
    pointDetails: [
      { label: 'Ace', only: 'server' },
      { label: 'Unforced error' },
      { label: 'Winner' },
      { label: 'Skip / tin' },
      { label: 'Let' },
      { label: 'Other' },
    ],
    courtOptions: ['Standard four-wall'],
    description: 'Best of 5 games · first to 15, win by 2',
    court: {
      kind: 'box',
      surface: 'Four-wall box',
      accent: '#60a5fa',
      ball: '🔵',
      wall: true,
      arc: 'low',
      rally: { dur: [340, 700], bounce: [12, 26], gap: [140, 400] },
    },
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
    pointDetails: [
      { label: 'Serve ace', only: 'server' },
      { label: 'Unforced error' },
      { label: 'Winner' },
      { label: 'Dink error' },
      { label: 'Net / kitchen fault' },
      { label: 'Erne' },
      { label: 'Other' },
    ],
    courtOptions: ['Outdoor', 'Indoor'],
    description: 'Best of 3 games · first to 11, win by 2 · side-out scoring',
    court: {
      kind: 'pickle',
      surface: 'Painted pickle court',
      accent: '#facc15',
      ball: '🟡',
      wall: false,
      arc: 'low',
      rally: { dur: [620, 1050], bounce: [16, 28], gap: [300, 640] },
    },
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
    pointDetails: [
      { label: 'Serve ace', only: 'server' },
      { label: 'Winner' },
      { label: 'Net edge' },
      { label: 'Block' },
      { label: 'Push error' },
      { label: 'Other' },
    ],
    courtOptions: ['Competition table', 'Home table'],
    description: 'Best of 5 games · first to 11, win by 2 · serve every 2 points',
    court: {
      kind: 'table',
      surface: 'Competition table',
      accent: '#f8fafc',
      ball: '⚪',
      wall: false,
      arc: 'low',
      rally: { dur: [340, 680], bounce: [14, 26], gap: [140, 360] },
    },
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
    pointDetails: [
      { label: 'Ace serve', only: 'server' },
      { label: 'Unforced error' },
      { label: 'Winner' },
      { label: 'Netkill' },
      { label: 'Lift error' },
      { label: 'Smash' },
      { label: 'Fault' },
      { label: 'Other' },
    ],
    courtOptions: ['Competition hall', 'Club hall'],
    description: 'Best of 3 games · first to 21, win by 2 · serve every 2 points',
    court: {
      kind: 'hall',
      surface: 'Competition hall',
      accent: '#a3e635',
      ball: '🏸',
      wall: false,
      arc: 'high',
      rally: { dur: [900, 1500], bounce: [44, 62], gap: [380, 760] },
    },
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
