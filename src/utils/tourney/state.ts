import type {
  TourneyLogEntry,
  TourneyLogKind,
  TourneyPlayer,
  TourneyState,
} from "./types.js";

const active = new Map<string, TourneyState>();

function now(): string {
  return new Date().toISOString();
}

export function createTourneyId(): string {
  return `tourney_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyTourney(guildId: string): TourneyState {
  const at = now();
  return {
    id: createTourneyId(),
    guildId,
    createdAt: at,
    updatedAt: at,
    phase: "setup_roster",
    combatants: [],
    referees: [],
    refPicks: [],
    slots: [],
    series: [],
    motScores: {},
    betPoints: {},
    refGamesOfficiated: {},
    log: [{ at, kind: "created", detail: { guildId } }],
  };
}

export function getActiveTourney(guildId: string): TourneyState | undefined {
  return active.get(guildId);
}

export function setActiveTourney(state: TourneyState): void {
  state.updatedAt = now();
  active.set(state.guildId, state);
}

export function clearActiveTourney(guildId: string): TourneyState | undefined {
  const s = active.get(guildId);
  active.delete(guildId);
  return s;
}

export function hasActiveTourney(guildId: string): boolean {
  return active.has(guildId);
}

export function touchTourney(state: TourneyState): void {
  state.updatedAt = now();
}

export function appendLog(
  state: TourneyState,
  kind: TourneyLogKind,
  detail?: unknown,
): void {
  const entry: TourneyLogEntry = { at: now(), kind };
  if (detail !== undefined) entry.detail = detail;
  state.log.push(entry);
  touchTourney(state);
}

export function setRoster(
  state: TourneyState,
  combatants: TourneyPlayer[],
  referees: TourneyPlayer[],
): void {
  if (combatants.length !== 16) throw new Error("Need 16 combatants");
  if (referees.length !== 4) throw new Error("Need 4 referees");
  const ids = new Set([
    ...combatants.map((c) => c.userId),
    ...referees.map((r) => r.userId),
  ]);
  if (ids.size !== 20) throw new Error("All 20 participants must be unique");

  state.combatants = combatants;
  state.referees = referees;
  state.phase = "setup_ref_picks";
  appendLog(state, "roster", {
    combatants: combatants.map((c) => c.userId),
    referees: referees.map((r) => r.userId),
  });
}


