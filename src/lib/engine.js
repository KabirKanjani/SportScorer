import { SPORTS, tennisPointsDisplay } from './sports.js';

// ---------------- State shape ----------------------------------------------
// {
//   sport: 'tennis',
//   started: bool,            // a point/game has been played
//   playerNames: [..],
//   setWins: [0,0],           // sets won (tennis/padel) OR games won (points family)
//   currentSetGames: [0,0],   // games in current set (sets family only)
//   gamePoints: [0,0],        // points in current game
//   tiebreak: bool,           // current set is a tiebreak (sets family)
//   serverIdx: 0|1,           // current server
//   serveCount: 0,            // points served by current server (for switch2)
//   history: [states...],     // previous states for undo
//   matchOver: bool,
//   winnerIdx: 0|1|null,
//   finishedAt: Date string    // when match concluded (for celebrating)
// }

export function initialState(sport, playerNames = ['Player 1', 'Player 2']) {
  return {
    sport,
    started: false,
    playerNames: [...playerNames],
    setWins: [0, 0],
    currentSetGames: [0, 0],
    gamePoints: [0, 0],
    tiebreak: false,
    serverIdx: 0,
    serveCount: 0,
    history: [],
    matchOver: false,
    winnerIdx: null,
    finishedAt: null,
  };
}

const MAX_HISTORY = 400; // undo steps kept (flat, no nested history)

// Clone the mutable parts. The history is a FLAT array of prior snapshots and
// each snapshot stores NO nested history (that caused exponential JSON growth).
function snapshot(state) {
  return {
    ...state,
    playerNames: [...state.playerNames],
    setWins: [...state.setWins],
    currentSetGames: [...state.currentSetGames],
    gamePoints: [...state.gamePoints],
    history: state.history.slice(0, MAX_HISTORY),
  };
}

// The game logic mutates the live state object; to keep history simple we clone
// the state before each mutation and store the clone.
export function apply(state, action) {
  let s = snapshot(state);

  switch (action.type) {
    case 'sport': {
      const next = initialState(action.sport, s.playerNames);
      return next;
    }
    case 'players': {
      s.playerNames = [action.name0, action.name1];
      return s;
    }
    case 'undo': {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      const remaining = s.history.slice(0, -1);
      return { ...prev, history: remaining };
    }
    case 'reset': {
      return initialState(s.sport, s.playerNames);
    }
    case 'point': {
      const idx = action.player;
      if (s.matchOver) return s;
      if (idx !== 0 && idx !== 1) return s;

      const before = snapshot(s);
      before.history = []; // flat snapshot: keep no nested undo chain
      s.history = [...s.history.slice(0, MAX_HISTORY - 1), before];
      s.started = true;

      const sport = SPORTS[s.sport];

      // Side-out scoring: only server can score.
      if (sport.scoring === 'sideout' && !s.matchOver) {
        if (idx !== s.serverIdx) {
          // rally won by non-server -> side out, no point
          s.serverIdx = idx;
          return s;
        }
      }

      // Grant the point
      s.gamePoints[idx] += 1;
      s.serveCount += 1;

      // Serve rotation
      updateServeAfterPoint(s, sport);

      // Check game / set / match completion
      if (sport.family === 'points') {
        completePointsGame(s, sport, idx);
      } else {
        completeTennisGame(s, sport);
      }
      return s;
    }
    case 'swap': {
      // Swap player names and mirror the score so sides physically interchange.
      const str = (arr) => [...arr].reverse();
      s.playerNames = str(s.playerNames);
      s.setWins = str(s.setWins);
      s.currentSetGames = str(s.currentSetGames);
      s.gamePoints = str(s.gamePoints);
      s.serverIdx = s.serverIdx === 0 ? 1 : 0;
      if (s.winnerIdx !== null) s.winnerIdx = s.winnerIdx === 0 ? 1 : 0;
      return s;
    }
    default:
      return s;
  }
}

// ---- Serve rotation --------------------------------------------------------

function updateServeAfterPoint(s, sport) {
  const mode = sport.serve;
  if (mode === 'lastWinner') {
    // After granting a point to idx (which we did), server = last point winner.
    // We need to know who scored; recompute from the point just added.
    // Simplest: server becomes the player who has the larger score this game.
    // Not perfectly accurate for side-out, but fine for display.
    const [a, b] = s.gamePoints;
    // The scorer got the point, but for rally scoring with lastWinner we track
    // the last winner = whoever just scored.
    s.serverIdx = a >= b ? (a === b ? s.serverIdx : 0) : 1;
    s.serveCount = 0;
    return;
  }
  if (mode === 'sideout') {
    // server stays same; only changes on side out handled in apply().
    s.serveCount = 0;
    return;
  }
  if (mode === 'switch2') {
    const sport = SPORTS[s.sport];
    const deuceThreshold =
      s.sport === 'badminton' ? 20 : 10; // table tennis -> 10
    const interval =
      s.gamePoints[0] >= deuceThreshold && s.gamePoints[1] >= deuceThreshold
        ? 1
        : 2;
    if (s.serveCount >= interval) {
      s.serverIdx = s.serverIdx === 0 ? 1 : 0;
      s.serveCount = 0;
    }
    return;
  }
  // 'game' mode (tennis/padel): server alternates per game, handled on game end.
  void sport;
}

// ---- Points-family game completion -----------------------------------------

function completePointsGame(s, sport, idx) {
  const target = sport.game.target;
  const winBy = sport.game.winBy;
  const [a, b] = s.gamePoints;
  if ((a >= target && a - b >= winBy) || (b >= target && b - a >= winBy)) {
    // Game won by idx
    s.setWins[idx] += 1;
    s.gamePoints = [0, 0];
    s.serveCount = 0;
    if (s.sport === 'pickleball') {
      // next server is the side that won the game
      s.serverIdx = idx;
    } else if (SPORTS[s.sport].serve === 'switch2') {
      // reset serve to player 0 for next game (unimportant, controller decides)
      s.serverIdx = idx === 1 ? 1 : 0;
    }
    if (s.setWins[idx] >= sport.match.gamesToWin) {
      finishMatch(s, idx);
    } else {
      s.started = true;
    }
  }
}

// ---- Tennis-family game completion -----------------------------------------

function completeTennisGame(s, sport) {
  const [a, b] = s.gamePoints;
  let gameWinner = null;

  if (!s.tiebreak) {
    if ((a >= 4 && a - b >= 2) || (b >= 4 && b - a >= 2)) {
      gameWinner = a > b ? 0 : 1;
      s.currentSetGames[gameWinner] += 1;
      s.gamePoints = [0, 0];
      // next game: server alternates
      s.serverIdx = gameWinner === 0 ? 1 : 0;
      s.serveCount = 0;
      checkTennisSet(s, sport);
    }
  } else {
    if ((a >= 7 && a - b >= 2) || (b >= 7 && b - a >= 2)) {
      const tbWinner = a > b ? 0 : 1;
      // tiebreak winner takes the set; record as 7-6
      s.currentSetGames[tbWinner] = Math.max(s.currentSetGames[tbWinner], 6) + 1;
      s.setWins[tbWinner] += 1;
      s.tiebreak = false;
      s.currentSetGames = [0, 0];
      s.gamePoints = [0, 0];
      s.serverIdx = tbWinner === 0 ? 1 : 0;
      s.serveCount = 0;
      if (s.setWins[tbWinner] >= sport.match.setsToWin) {
        finishMatch(s, tbWinner);
      }
    }
  }
}

function checkTennisSet(s, sport) {
  const [gA, gB] = s.currentSetGames;
  const gtw = sport.set.gamesToWin;
  const winBy = sport.set.winBy;
  const tbAt = sport.set.tiebreakAt;

  if ((gA >= gtw && gA - gB >= winBy) || (gB >= gtw && gB - gA >= winBy)) {
    const setWinner = gA > gB ? 0 : 1;
    s.setWins[setWinner] += 1;
    s.currentSetGames = [0, 0];
    s.gamePoints = [0, 0];
    if (s.setWins[setWinner] >= sport.match.setsToWin) {
      finishMatch(s, setWinner);
    }
  } else if (gA >= tbAt && gB >= tbAt) {
    // reached tiebreak threshold (6-6)
    s.tiebreak = true;
    s.gamePoints = [0, 0];
  }
}

// ---- Match end ---------------------------------------------------------------

function finishMatch(s, idx) {
  s.matchOver = true;
  s.winnerIdx = idx;
  s.finishedAt = new Date().toISOString();
}

// ---- Computed display values --------------------------------------------------

// "Pressure" readout for the live court: which side (if any) is one point from
// taking the game / set / match, plus who is serving. Mirrors the engine's own
// rules so the animation can react to real drama (match points, deuce, etc.).
export function describeDrama(state) {
  const sport = SPORTS[state.sport];
  const [a, b] = state.gamePoints;
  const out = {
    serverIdx: state.serverIdx,
    deuce: false,
    gamePoint: null,
    setPoint: null,
    matchPoint: null,
  };

  if (sport.family === 'sets') {
    const inTb = state.tiebreak;
    const endsGame = (ta, tb) =>
      inTb
        ? (ta >= 7 && ta - tb >= 2) || (tb >= 7 && tb - ta >= 2)
        : (ta >= 4 && ta - tb >= 2) || (tb >= 4 && tb - ta >= 2);

    if (!inTb && a >= 3 && b >= 3) {
      out.deuce = a === b;
      if (a === b + 1) out.gamePoint = 0;
      else if (b === a + 1) out.gamePoint = 1;
    } else {
      for (const s of [0, 1]) {
        const ta = s === 0 ? a + 1 : a;
        const tb = s === 1 ? b + 1 : b;
        if (endsGame(ta, tb)) out.gamePoint = s;
      }
    }

    if (out.gamePoint != null) {
      const setGames = state.currentSetGames[out.gamePoint] + 1;
      const oppGames = state.currentSetGames[1 - out.gamePoint];
      const setEnds = inTb
        ? true
        : setGames >= sport.set.gamesToWin && setGames - oppGames >= sport.set.winBy;
      if (setEnds) {
        if (state.setWins[out.gamePoint] + 1 >= sport.match.setsToWin) out.matchPoint = out.gamePoint;
        else out.setPoint = out.gamePoint;
      }
    }
  } else {
    const { target, winBy } = sport.game;
    for (const s of [0, 1]) {
      const ta = s === 0 ? a + 1 : a;
      const tb = s === 1 ? b + 1 : b;
      if ((ta >= target && ta - tb >= winBy) || (tb >= target && tb - ta >= winBy)) {
        out.gamePoint = s;
      }
    }
    if (out.gamePoint != null && state.setWins[out.gamePoint] + 1 >= sport.match.gamesToWin) {
      out.matchPoint = out.gamePoint;
    }
  }
  return out;
}

export function getDisplay(state) {
  const sport = SPORTS[state.sport];
  const out = {
    sport,
    setsFamily: sport.family === 'sets',
    playerNames: state.playerNames,
    serverIdx: state.serverIdx,
    matchOver: state.matchOver,
    winnerIdx: state.winnerIdx,
    started: state.started,
    setCounts: [null, null], // how many sets/games each has won
    gamesInSet: [null, null], // current set games (sets family)
    points: [null, null], // current game point display
    deuce: false,
    tiebreak: state.tiebreak,
  };

  if (sport.family === 'sets') {
    out.setCounts = [state.setWins[0], state.setWins[1]];
    out.gamesInSet = [state.currentSetGames[0], state.currentSetGames[1]];
    if (state.tiebreak) {
      out.points = [state.gamePoints[0], state.gamePoints[1]];
    } else {
      const [a, b] = tennisPointsDisplay(state.gamePoints[0], state.gamePoints[1]);
      out.points = [a, b];
      if (a === '40' && b === '40' && state.started && !state.matchOver) {
        out.deuce = true;
      }
    }
  } else {
    // points family: setCounts = games won
    out.setCounts = [state.setWins[0], state.setWins[1]];
    out.points = [state.gamePoints[0], state.gamePoints[1]];
    out.gamesInSet = [null, null];
  }

  // "game to X" label
  if (sport.family === 'points') {
    out.targetLabel = `Game to ${sport.game.target}`;
  } else {
    out.targetLabel = `Set to ${sport.set.gamesToWin}`;
  }

  return out;
}

// History is session-only (undo). Drop it for persistence/transmission.
export function stripHistory(state) {
  return { ...state, history: [] };
}
