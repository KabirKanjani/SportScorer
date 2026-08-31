// Bracket generation and read-side resolution for single-elimination
// tournaments. Player slots are filled from the previous round's winners at
// read time, so byes and walkovers resolve themselves without extra writes.
import { randomBytes } from 'node:crypto';
import {
  getTournamentPlayers,
  getTournamentSeeds,
  getTournamentById,
  getFixtures,
  getFixtureById,
  setTournamentPlayerSeed,
  setTournamentWinner,
  getFixtureByMatch,
  resolveFixtureWinner,
  createFixture,
  notify,
  getTournamentGroups,
  createTournamentGroup,
  setTournamentPlayerGroup,
  setFixtureGroupPoints,
  getGroupFixtures,
  getMatch,
} from './db.mjs';
import { getDisplay } from '../src/lib/engine.js';

export function nextPowerOfTwo(n) {
  let x = 1;
  while (x < n) x <<= 1;
  return x;
}

export function roundCount(roundSize) {
  return Math.log2(roundSize);
}

// Group fixtures share one round namespace (rows must keep round, position
// unique per tournament); they live above the playoff rounds.
export const GROUP_ROUND_BASE = 1000;

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
// Seeds come from getTournamentSeeds: one entry per team (doubles pairs
// collapse to their captain).
export function buildBracket(tournamentId) {
  const order = shuffle(getTournamentSeeds(tournamentId));
  order.forEach((p, i) => setTournamentPlayerSeed(tournamentId, p.userId, i + 1));
  return buildTreeFromOrder(tournamentId, order.map((p) => p.userId));
}

// Create a full single-elimination tree from an ordered list of userIds; the
// first list entry is position 0 of round 1. Null slots pad up to a power of
// two and collapse to byes. Returns roundSize.
export function buildTreeFromOrder(tournamentId, order) {
  const roundSize = nextPowerOfTwo(order.length);
  const rounds = roundCount(roundSize);
  const slots = [...order];
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

// Full round-robin pairing schedule (circle method, null = bye slot).
function roundRobinSchedule(teams) {
  const arr = teams.length % 2 === 1 ? [...teams, null] : [...teams];
  const rounds = [];
  for (let r = 0; r < arr.length - 1; r += 1) {
    const round = [];
    for (let i = 0; i < arr.length / 2; i += 1) {
      const a = arr[i];
      const b = arr[arr.length - 1 - i];
      if (a != null && b != null) round.push([a, b]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

// Lock the field into groups and generate all round-robin group fixtures.
// 2 groups for up to 8 teams, otherwise 4; the top two of each group advance.
export function startGroupPlayoffs(tournamentId) {
  const seeds = getTournamentSeeds(tournamentId);
  if (seeds.length < 4) throw new Error('Need at least 4 teams for a group stage');

  const nbGroups = seeds.length <= 8 ? 2 : 4;
  const order = shuffle(seeds);
  order.forEach((p, i) => setTournamentPlayerSeed(tournamentId, p.userId, i + 1));

  const groups = [];
  for (let g = 0; g < nbGroups; g += 1) {
    groups.push(createTournamentGroup(tournamentId, String.fromCharCode(65 + g), g));
  }
  // Interleave the shuffled teams across the groups so each is evenly matched.
  order.forEach((p, i) => setTournamentPlayerGroup(tournamentId, p.userId, groups[i % nbGroups]));

  // Re-fetch so the rows carry their freshly-assigned group_id.
  const placed = getTournamentSeeds(tournamentId);
  let idx = 0;
  for (const groupId of groups) {
    const members = placed
      .filter((p) => p.groupId === groupId)
      .sort((a, b) => a.seed - b.seed)
      .map((p) => p.userId);
    for (const round of roundRobinSchedule(members)) {
      for (const [a, b] of round) {
        createFixture({
          tournamentId,
          round: GROUP_ROUND_BASE + idx,
          position: 0,
          player1Id: a,
          player2Id: b,
          phase: 'group',
          groupId,
        });
        idx += 1;
      }
    }
  }
  return { groups: nbGroups, fixtures: idx };
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

// A decided group fixture's winner, or 0 when the two players never met.
function headToHeadWinner(aId, bId, fixtures) {
  const f = fixtures.find(
    (fx) =>
      fx.status === 'done' &&
      ((fx.player1_id === aId && fx.player2_id === bId) ||
        (fx.player1_id === bId && fx.player2_id === aId))
  );
  if (!f || f.winner_id == null) return 0;
  return f.winner_id === aId ? 1 : -1;
}

function rankCompare(x, y, rows, fixtures) {
  if (x.wins !== y.wins) return y.wins - x.wins;
  if (x.diff !== y.diff) return y.diff - x.diff;
  const h2h = headToHeadWinner(x.team.userId, y.team.userId, fixtures);
  if (h2h) return -h2h;
  return (x.team.seed ?? 99) - (y.team.seed ?? 99);
}

// Standings for a group, ranked by wins → point/game diff → head-to-head →
// seed. points_a/b are the games (sets) each side won; a walkover counts 2–0.
export function computeGroupStandings(groupId, fixtures, teams) {
  if (!teams.length) return [];
  const rows = teams.map((team) => {
    const mine = fixtures.filter(
      (f) => f.group_id === groupId && (f.player1_id === team.userId || f.player2_id === team.userId)
    );
    const decided = mine.filter((f) => f.status === 'done');
    const wins = decided.filter((f) => f.winner_id === team.userId).length;
    let diff = 0;
    let pointsFor = 0;
    for (const f of decided) {
      const isA = f.player1_id === team.userId;
      const minePts = Number(isA ? f.points_a : f.points_b) || 0;
      const theirPts = Number(isA ? f.points_b : f.points_a) || 0;
      diff += minePts - theirPts;
      pointsFor += minePts;
    }
    return { team, played: decided.length, wins, losses: decided.length - wins, diff, pointsFor };
  });
  rows.sort((x, y) => rankCompare(x, y, rows, fixtures));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

// Once every group match is decided (and no playoff bracket exists yet), seed
// the knockout round from the top two of each group, crossing 1st of group i
// against 2nd of group i+1 so same-group teams can only meet in a later round.
export function maybeStartPlayoffs(tournamentId) {
  const groups = getTournamentGroups(tournamentId);
  if (groups.length === 0) return false;
  if (getFixtures(tournamentId).length > 0) return false;
  const groupFixtures = getGroupFixtures(tournamentId);
  if (groupFixtures.length === 0 || groupFixtures.some((f) => f.status !== 'done')) return false;

  const seeds = getTournamentSeeds(tournamentId);
  const standings = groups.map((g) =>
    computeGroupStandings(g.id, groupFixtures, seeds.filter((s) => s.groupId === g.id))
  );

  const order = [];
  for (let i = 0; i < standings.length; i += 2) {
    const g1 = standings[i];
    const g2 = standings[i + 1];
    if (!g2) {
      order.push(...g1.slice(0, 2).map((r) => r.team.userId));
      continue;
    }
    order.push(g1[0].team.userId, g2[1].team.userId, g1[1].team.userId, g2[0].team.userId);
  }

  buildTreeFromOrder(tournamentId, order);
  const advancers = order.map((uid) => seeds.find((s) => s.userId === uid)).filter(Boolean);
  const tname = getTournamentById(tournamentId)?.name || 'Tournament';
  for (const p of advancers) {
    notify(p.userId, {
      type: 'tournament',
      title: 'Playoffs are set',
      body: `${tname} · the knockout round is ready for you`,
      link: `/tournaments/${tournamentId}`,
    });
  }
  return true;
}

// Read-side summary of the group stage: per-group standings + fixtures.
export function groupPhaseSummary(tournamentId) {
  const groups = getTournamentGroups(tournamentId);
  if (groups.length === 0) return null;
  const fixtures = getGroupFixtures(tournamentId);
  const seeds = getTournamentSeeds(tournamentId);
  return {
    phase: fixtures.length === 0 || fixtures.some((f) => f.status !== 'done') ? 'group' : 'playoffs',
    groups: groups.map((g) => ({
      id: g.id,
      label: g.label,
      position: g.position,
      standings: computeGroupStandings(g.id, fixtures, seeds.filter((s) => s.groupId === g.id)),
      fixtures: fixtures.filter((f) => f.group_id === g.id).sort((a, b) => a.round - b.round),
    })),
  };
}

// Shared post-decision bookkeeping: crown a champion / ping the players whose
// next-round fixture just became playable (via a finished match OR a walkover).
function finishDecision(tournamentId, winnerUserId, winningFixture) {
  const tree = fixtureView(tournamentId, getFixtures(tournamentId));
  const t = getTournamentById(tournamentId);
  const name = t?.name || 'Tournament';
  if (tree.champion) {
    setTournamentWinner(tournamentId, tree.champion.id);
    const champPlayer = getTournamentPlayers(tournamentId).find(
      (p) => p.userId === tree.champion.id
    );
    const champLabel =
      champPlayer?.partnerId && champPlayer.partnerName
        ? `${champPlayer.name} & ${champPlayer.partnerName}`
        : tree.champion.name;
    for (const p of getTournamentPlayers(tournamentId)) {
      notify(p.userId, {
        type: 'tournament',
        title: 'Tournament finished',
        body: `${champLabel} is champion of ${name} 🏆`,
        link: `/tournaments/${tournamentId}`,
      });
    }
  } else if (winningFixture && winningFixture.phase === 'playoffs') {
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
// if this was the final. Group-stage fixtures record games won and roll into
// the playoff seed once the last group match is decided.
export function onFixtureMatchFinished(matchId, winnerUserId) {
  const f = getFixtureByMatch(matchId);
  if (!f) return null;
  resolveFixtureWinner(f.id, winnerUserId);
  const tournamentId = f.tournament_id;
  if (f.phase === 'group') {
    const m = getMatch(matchId);
    const counts = m ? getDisplay(m.state).setCounts : null;
    const pointsA = Number.isFinite(counts?.[0]) ? counts[0] : f.player1_id === winnerUserId ? 1 : 0;
    const pointsB = Number.isFinite(counts?.[1]) ? counts[1] : f.player2_id === winnerUserId ? 1 : 0;
    setFixtureGroupPoints(f.id, pointsA, pointsB, winnerUserId);
    maybeStartPlayoffs(tournamentId);
    return tournamentId;
  }
  finishDecision(tournamentId, winnerUserId, f);
  return tournamentId;
}

// Creator-driven forfeit / walkover: advance one of the two players without a
// live match. Same post-decision path as a finished match.
export function resolveFixtureWalkover(tournamentId, fixtureId, winnerUserId, loserUserId) {
  const f = getFixtureById(fixtureId);
  if (!f) return null;
  const tname = getTournamentById(tournamentId)?.name || 'Tournament';
  const label = f.phase === 'group' ? 'group match' : `round ${f.round}`;
  if (f.phase === 'group') {
    const pointsA = f.player1_id === winnerUserId ? 2 : 0;
    const pointsB = f.player2_id === winnerUserId ? 2 : 0;
    setFixtureGroupPoints(f.id, pointsA, pointsB, winnerUserId);
    maybeStartPlayoffs(tournamentId);
  } else {
    resolveFixtureWinner(fixtureId, winnerUserId);
    finishDecision(tournamentId, winnerUserId, f);
  }
  for (const pid of [winnerUserId, loserUserId]) {
    notify(pid, {
      type: 'tournament',
      title: pid === winnerUserId ? 'Walkover — you advance' : 'Walkover — eliminated',
      body:
        pid === winnerUserId
          ? `${tname} · walkover in ${label} — you move on`
          : `${tname} · walkover in ${label} — eliminated`,
      link: `/tournaments/${tournamentId}`,
    });
  }
  return tournamentId;
}