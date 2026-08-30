// Bracket generation and read-side resolution for single-elimination
// tournaments. Player slots are filled from the previous round's winners at
// read time, so byes and walkovers resolve themselves without extra writes.
import { randomBytes } from 'node:crypto';
import {
  getTournamentPlayers,
  getTournamentById,
  getFixtures,
  getFixtureById,
  setTournamentPlayerSeed,
  setTournamentWinner,
  getFixtureByMatch,
  resolveFixtureWinner,
  createFixture,
  notify,
} from './db.mjs';

export function nextPowerOfTwo(n) {
  let x = 1;
  while (x < n) x <<= 1;
  return x;
}

export function roundCount(roundSize) {
  return Math.log2(roundSize);
}

// Crypto-random Fisher-Yates.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Random draw + full fixture tree for a draft tournament. Returns roundSize.
export function buildBracket(tournamentId) {
  const players = getTournamentPlayers(tournamentId);
  const n = players.length;
  const roundSize = nextPowerOfTwo(n);
  const rounds = roundCount(roundSize);

  const order = shuffle(players); // seed 1 (position 0) .. seed n
  order.forEach((p, i) => setTournamentPlayerSeed(tournamentId, p.userId, i + 1));

  // Round-1 slots: real players padded with nulls (those are byes / empty).
  const slots = order.map((p) => p.userId);
  while (slots.length < roundSize) slots.push(null);

  for (let r = 1; r <= rounds; r += 1) {
    const count = roundSize / 2 ** r;
    for (let pos = 0; pos < count; pos += 1) {
      const p1 = r === 1 ? slots[2 * pos] : null;
      const p2 = r === 1 ? slots[2 * pos + 1] : null;
      createFixture({ tournamentId, round: r, position: pos, player1Id: p1, player2Id: p2 });
    }
  }
  return roundSize;
}

// Player resolution for a fixture:
//   - players: [p1, p2] of the actual user rows (may contain nulls)
//   - winner:  the resolved winner (stored for played matches, computed for byes)
//   - isBye:   true when one slot is empty (the solo player advances free)
export function fixtureView(tournamentId, fixtures) {
  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const group = new Map();
  for (const f of fixtures) group.set(`${f.round}:${f.position}`, f);

  const memo = new Map();
  const childOf = (f, i) => (f ? group.get(`${f.round - 1}:${f.position * 2 + i}`) : null);

  // round-1 slots that were padded (n < roundSize) make a subtree "empty":
  // those limbs can never produce a player, so a sibling there is a walkover.
  const emptyF = (f) => {
    if (!f) return true;
    if (f.round === 1) return !f.player1 && !f.player2;
    return emptyF(childOf(f, 0)) && emptyF(childOf(f, 1));
  };

  const resolve = (f) => {
    const key = `${f.round}:${f.position}`;
    if (memo.has(key)) return memo.get(key);
    let p1 = f.player1;
    let p2 = f.player2;
    let winner = f.winner;
    let isBye = false;

    if (f.round > 1) {
      const left = childOf(f, 0);
      const right = childOf(f, 1);
      const lw = left ? resolve(left).winner : null;
      const rw = right ? resolve(right).winner : null;
      const leftEmpty = emptyF(left);
      const rightEmpty = emptyF(right);
      p1 = lw;
      p2 = rw;
      if (lw && rw) {
        // both limbs decided -> fixture is playable; winner only after a match
      } else if ((lw && rightEmpty) || (rw && leftEmpty)) {
        isBye = true; // the other limb has nobody -> walkover
        winner = lw || rw;
      } else {
        winner = null; // a limb is still waiting on its matches
      }
    } else if ((p1 && !p2) || (!p1 && p2)) {
      isBye = true;
      winner = p1 || p2;
    }

    const view = {
      ...f,
      round: f.round,
      position: f.position,
      player1: p1,
      player2: p2,
      winner,
      isBye,
      matchId: f.match_id,
    };
    memo.set(key, view);
    return view;
  };

  const tree = rounds.map((r) => ({
    round: r,
    fixtures: fixtures
      .filter((f) => f.round === r)
      .sort((a, b) => a.position - b.position)
      .map(resolve),
  }));
  const final = tree[tree.length - 1]?.fixtures[0];
  return { rounds: tree, champion: final ? final.winner : null };
}

// Shared post-decision bookkeeping: crown a champion / ping the players whose
// next-round fixture just became playable (via a finished match OR a walkover).
function finishDecision(tournamentId, winnerUserId, winningFixture) {
  const tree = fixtureView(tournamentId, getFixtures(tournamentId));
  const t = getTournamentById(tournamentId);
  const name = t?.name || 'Tournament';
  if (tree.champion) {
    setTournamentWinner(tournamentId, tree.champion.id);
    for (const p of getTournamentPlayers(tournamentId)) {
      notify(p.userId, {
        type: 'tournament',
        title: 'Tournament finished',
        body: `${tree.champion.name} is champion of ${name} 🏆`,
        link: `/tournaments/${tournamentId}`,
      });
    }
  } else if (winningFixture) {
    // The fixture in the next round that was waiting on this winner.
    const parentNode = tree.rounds
      .find((r) => r.round === winningFixture.round + 1)
      ?.fixtures.find(
        (x) => x.player1 && x.player2 && (x.player1.id === winnerUserId || x.player2.id === winnerUserId)
      );
    if (parentNode) {
      for (const pid of [parentNode.player1.id, parentNode.player2.id]) {
        notify(pid, {
          type: 'tournament',
          title: 'Your match is up',
          body: `${name} · round ${parentNode.round} is ready`,
          link: `/tournaments/${tournamentId}`,
        });
      }
    }
  }
}

// Called after a linked match finishes: record the winner and crown a champion
// if this was the final.
export function onFixtureMatchFinished(matchId, winnerUserId) {
  const f = getFixtureByMatch(matchId);
  if (!f) return null;
  resolveFixtureWinner(f.id, winnerUserId);
  const tournamentId = f.tournament_id;
  finishDecision(tournamentId, winnerUserId, f);
  return tournamentId;
}

// Creator-driven forfeit / walkover: advance one of the two players without a
// live match. Same post-decision path as a finished match.
export function resolveFixtureWalkover(tournamentId, fixtureId, winnerUserId, loserUserId) {
  const f = getFixtureById(fixtureId);
  if (!f) return null;
  resolveFixtureWinner(fixtureId, winnerUserId);
  finishDecision(tournamentId, winnerUserId, f);
  const tname = getTournamentById(tournamentId)?.name || 'Tournament';
  for (const pid of [winnerUserId, loserUserId]) {
    notify(pid, {
      type: 'tournament',
      title: pid === winnerUserId ? 'Walkover — you advance' : 'Walkover — eliminated',
      body:
        pid === winnerUserId
          ? `${tname} · walkover in round ${f.round} — you move on`
          : `${tname} · walkover in round ${f.round} — eliminated`,
      link: `/tournaments/${tournamentId}`,
    });
  }
  return tournamentId;
}