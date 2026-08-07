import { appendLog, touchTourney } from "./state.js";
import type {
  ConferenceId,
  GameResult,
  RefereeArcanaId,
  RefPick,
  RoundId,
  SeriesState,
  SubgroupId,
  TourneyState,
} from "./types.js";
import { ARCANA_LEVEL, REFEREE_ARCANAS, SUBGROUP_CONFERENCE } from "./types.js";

const R16_PAIRINGS: [number, number, SubgroupId][] = [
  [0, 1, 1],
  [2, 3, 1],
  [4, 5, 2],
  [6, 7, 2],
  [8, 9, 3],
  [10, 11, 3],
  [12, 13, 4],
  [14, 15, 4],
];

const R16_IDS = [
  "r16-1a",
  "r16-1b",
  "r16-2a",
  "r16-2b",
  "r16-3a",
  "r16-3b",
  "r16-4a",
  "r16-4b",
] as const;

function emptyWins(): Record<string, number> {
  return {};
}

function baseSeries(
  partial: Omit<SeriesState, "wins" | "games" | "bets" | "status" | "refIds"> & {
    refIds?: string[];
  },
): SeriesState {
  return {
    ...partial,
    wins: emptyWins(),
    games: [],
    bets: [],
    status: "pending",
    refIds: partial.refIds ?? [],
  };
}

export function buildSeriesTree(): SeriesState[] {
  const r16: SeriesState[] = R16_PAIRINGS.map(([slotA, slotB, subgroup], i) =>
    baseSeries({
      id: R16_IDS[i],
      round: "r16",
      subgroup,
      slotA,
      slotB,
      fighterAId: null,
      fighterBId: null,
      winsNeeded: 2,
    }),
  );

  const qf: SeriesState[] = (
    [
      ["qf-1", 1, "r16-1a", "r16-1b"],
      ["qf-2", 2, "r16-2a", "r16-2b"],
      ["qf-3", 3, "r16-3a", "r16-3b"],
      ["qf-4", 4, "r16-4a", "r16-4b"],
    ] as const
  ).map(([id, subgroup, a, b]) =>
    baseSeries({
      id,
      round: "qf",
      subgroup,
      feedsFrom: [a, b],
      fighterAId: null,
      fighterBId: null,
      winsNeeded: 2,
    }),
  );

  const semis: SeriesState[] = [
    baseSeries({
      id: "semi-exo",
      round: "semi",
      conference: "exo",
      feedsFrom: ["qf-1", "qf-2"],
      fighterAId: null,
      fighterBId: null,
      winsNeeded: 2,
    }),
    baseSeries({
      id: "semi-twox",
      round: "semi",
      conference: "two_x",
      feedsFrom: ["qf-3", "qf-4"],
      fighterAId: null,
      fighterBId: null,
      winsNeeded: 2,
    }),
  ];

  const final = baseSeries({
    id: "final",
    round: "final",
    feedsFrom: ["semi-exo", "semi-twox"],
    fighterAId: null,
    fighterBId: null,
    winsNeeded: 1,
  });

  return [...r16, ...qf, ...semis, final];
}

export function shuffleCombatants(userIds: string[]): string[] {
  if (userIds.length !== 16) throw new Error("Need 16 combatants to seed");
  const a = [...userIds];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seriesById(state: TourneyState, id: string): SeriesState {
  const s = state.series.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown series ${id}`);
  return s;
}

export function resolveRefIds(
  state: TourneyState,
  series: SeriesState,
): string[] {
  const bySub = new Map<SubgroupId, string>();
  for (const p of state.refPicks) bySub.set(p.subgroup, p.userId);

  if (series.round === "r16" || series.round === "qf") {
    const id = bySub.get(series.subgroup!);
    return id ? [id] : [];
  }
  if (series.round === "semi") {
    const subs: SubgroupId[] =
      series.conference === "exo" ? [1, 2] : [3, 4];
    return subs.map((sg) => bySub.get(sg)).filter(Boolean) as string[];
  }
  return state.refPicks.map((p) => p.userId);
}

function refreshSeriesRefs(state: TourneyState): void {
  for (const s of state.series) {
    s.refIds = resolveRefIds(state, s);
  }
}

function fillFightersFromSlots(state: TourneyState): void {
  for (const s of state.series) {
    if (s.round !== "r16") continue;
    s.fighterAId = state.slots[s.slotA!];
    s.fighterBId = state.slots[s.slotB!];
    s.status = "ready";
  }
}

export function seedTourney(
  state: TourneyState,
  order?: string[],
): void {
  if (state.combatants.length !== 16) throw new Error("Need 16 combatants");
  if (state.refPicks.length !== 4) throw new Error("Need 4 ref picks");

  const ids = order ?? shuffleCombatants(state.combatants.map((c) => c.userId));
  if (ids.length !== 16) throw new Error("Seed order must be 16 ids");

  state.slots = ids;
  state.series = buildSeriesTree();
  fillFightersFromSlots(state);
  refreshSeriesRefs(state);
  state.phase = "ready";
  appendLog(state, "seeded", { slots: state.slots });
}

export function setRefPick(state: TourneyState, pick: RefPick): void {
  if (pick.refIndex < 0 || pick.refIndex >= state.referees.length) {
    throw new Error("Invalid referee");
  }
  if (state.referees[pick.refIndex].userId !== pick.userId) {
    throw new Error("Referee mismatch");
  }

  state.refPicks = state.refPicks.filter((p) => p.refIndex !== pick.refIndex);

  if (state.refPicks.some((p) => p.subgroup === pick.subgroup)) {
    throw new Error(`Subgroup ${pick.subgroup} already taken`);
  }
  if (state.refPicks.some((p) => p.arcana === pick.arcana)) {
    throw new Error(`Arcana ${pick.arcana} already taken`);
  }

  state.refPicks.push(pick);
  appendLog(state, "ref_pick", pick);

  if (state.refPicks.length === 4 && state.slots.length === 16) {
    refreshSeriesRefs(state);
  }
}

export function arcanaLevelForRound(round: RoundId): 0 | 1 | 2 | 3 {
  return ARCANA_LEVEL[round];
}

export function subgroupOfSlot(slotIndex: number): SubgroupId {
  if (slotIndex < 4) return 1;
  if (slotIndex < 8) return 2;
  if (slotIndex < 12) return 3;
  return 4;
}

export function conferenceOfSlot(slotIndex: number): ConferenceId {
  return SUBGROUP_CONFERENCE[subgroupOfSlot(slotIndex)];
}

export function activeRefereeArcanas(
  state: TourneyState,
  series: SeriesState,
): { userId: string; arcana: RefereeArcanaId; level: 0 | 1 | 2 | 3 }[] {
  const level = arcanaLevelForRound(series.round);

  let picks = state.refPicks;
  if (series.round === "r16" || series.round === "qf") {
    picks = state.refPicks.filter((p) => p.subgroup === series.subgroup);
  } else if (series.round === "semi") {
    const subs: SubgroupId[] =
      series.conference === "exo" ? [1, 2] : [3, 4];
    picks = state.refPicks.filter((p) => subs.includes(p.subgroup));
  }

  return picks.map((p) => ({
    userId: p.userId,
    arcana: p.arcana,
    level,
  }));
}

export function allRefereeArcanasAtLevel(
  level: 0 | 1 | 2 | 3,
): { arcana: RefereeArcanaId; level: 0 | 1 | 2 | 3 }[] {
  return REFEREE_ARCANAS.map((arcana) => ({ arcana, level }));
}

export function getSeries(state: TourneyState, seriesId: string): SeriesState {
  return seriesById(state, seriesId);
}

export function getNextPlayableSeries(
  state: TourneyState,
): SeriesState | undefined {
  const order: RoundId[] = ["r16", "qf", "semi", "final"];
  for (const round of order) {
    const found = state.series.find(
      (s) =>
        s.round === round &&
        s.status !== "complete" &&
        s.fighterAId &&
        s.fighterBId,
    );
    if (found) return found;
  }
  return undefined;
}

function ensureSelfBets(s: SeriesState): void {
  for (const id of [s.fighterAId, s.fighterBId]) {
    if (!id) continue;
    const existing = s.bets.find((b) => b.userId === id);
    if (existing) existing.pickId = id;
    else s.bets.push({ userId: id, pickId: id });
  }
}

export function openBetting(state: TourneyState, seriesId: string): void {
  const s = seriesById(state, seriesId);
  if (!s.fighterAId || !s.fighterBId) throw new Error("Fighters not set");
  if (s.status === "complete" || s.status === "in_progress") {
    throw new Error("Series already started or finished");
  }
  if (s.status === "betting") {
    ensureSelfBets(s);
    state.currentSeriesId = seriesId;
    state.phase = "betting";
    return;
  }
  s.status = "betting";
  ensureSelfBets(s);
  state.currentSeriesId = seriesId;
  state.phase = "betting";
  appendLog(state, "bets_opened", { seriesId });
}

export function setBet(
  state: TourneyState,
  seriesId: string,
  userId: string,
  pickId: string,
): void {
  const s = seriesById(state, seriesId);
  if (s.status !== "betting") throw new Error("Betting closed");
  const locked =
    userId === s.fighterAId || userId === s.fighterBId ? userId : pickId;
  if (locked !== s.fighterAId && locked !== s.fighterBId) {
    throw new Error("Invalid pick");
  }
  const existing = s.bets.find((b) => b.userId === userId);
  if (existing) existing.pickId = locked;
  else s.bets.push({ userId, pickId: locked });
  touchTourney(state);
}

export function closeBetting(state: TourneyState, seriesId: string): void {
  const s = seriesById(state, seriesId);
  if (s.status !== "betting") throw new Error("Not in betting");
  s.status = "ready";
  s.betsClosedAt = new Date().toISOString();
  state.phase = "playing";
  appendLog(state, "bets_closed", {
    seriesId,
    bets: s.bets,
  });
}

function advanceWinnerIntoChildren(
  state: TourneyState,
  completed: SeriesState,
): void {
  for (const s of state.series) {
    if (!s.feedsFrom) continue;
    const [a, b] = s.feedsFrom;
    if (a === completed.id) s.fighterAId = completed.winnerId!;
    if (b === completed.id) s.fighterBId = completed.winnerId!;
    if (s.fighterAId && s.fighterBId && s.status === "pending") {
      s.status = "ready";
    }
  }
}

function scoreBets(state: TourneyState, series: SeriesState): void {
  const w = series.winnerId!;
  for (const bet of series.bets) {
    if (bet.pickId === w) {
      state.betPoints[bet.userId] = (state.betPoints[bet.userId] ?? 0) + 1;
    }
  }
}

export function recordGame(
  state: TourneyState,
  seriesId: string,
  result: Omit<GameResult, "gameIndex" | "playedAt"> & {
    playedAt?: string;
  },
): SeriesState {
  const s = seriesById(state, seriesId);
  if (!s.fighterAId || !s.fighterBId) throw new Error("Fighters not set");
  if (s.status === "complete") throw new Error("Series complete");
  if (s.status === "betting") throw new Error("Lock bets first");

  s.status = "in_progress";
  state.phase = "playing";
  state.currentSeriesId = seriesId;

  const game: GameResult = {
    gameIndex: s.games.length,
    winnerId: result.winnerId,
    loserId: result.loserId,
    turns: result.turns,
    scores: result.scores,
    playedAt: result.playedAt ?? new Date().toISOString(),
  };
  s.games.push(game);
  s.wins[result.winnerId] = (s.wins[result.winnerId] ?? 0) + 1;

  for (const [uid, sc] of Object.entries(result.scores)) {
    state.motScores[uid] =
      (state.motScores[uid] ?? 0) + sc.damageDealt + sc.hpRemaining;
  }

  for (const refId of s.refIds) {
    state.refGamesOfficiated[refId] =
      (state.refGamesOfficiated[refId] ?? 0) + 1;
  }

  appendLog(state, "game", { seriesId, game });

  if ((s.wins[result.winnerId] ?? 0) >= s.winsNeeded) {
    s.winnerId = result.winnerId;
    s.status = "complete";
    scoreBets(state, s);
    advanceWinnerIntoChildren(state, s);
    appendLog(state, "series", {
      seriesId,
      winnerId: s.winnerId,
      wins: s.wins,
    });

    if (seriesId === "final") {
      state.phase = "complete";
      state.currentSeriesId = undefined;
    }
  }

  touchTourney(state);
  return s;
}

export function getExoChampion(state: TourneyState): string | undefined {
  return seriesById(state, "semi-exo").winnerId;
}

export function getTwoXChampion(state: TourneyState): string | undefined {
  return seriesById(state, "semi-twox").winnerId;
}

export function getTournamentChampion(state: TourneyState): string | undefined {
  return seriesById(state, "final").winnerId;
}

export function deepestRoundReached(
  state: TourneyState,
  userId: string,
): number {
  const rank: Record<RoundId, number> = {
    r16: 1,
    qf: 2,
    semi: 3,
    final: 4,
  };
  let best = 0;
  for (const s of state.series) {
    if (s.fighterAId !== userId && s.fighterBId !== userId) continue;
    const r = rank[s.round];
    if (s.winnerId === userId) best = Math.max(best, r);
    else if (s.status === "complete") best = Math.max(best, r - 0.5);
    else best = Math.max(best, r - 0.5);
  }
  if (getTournamentChampion(state) === userId) return 5;
  return best;
}

export function roundLabel(round: RoundId): string {
  switch (round) {
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarterfinals";
    case "semi":
      return "Semifinals";
    case "final":
      return "Championship";
  }
}
