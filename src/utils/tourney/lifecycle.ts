import { LockManager } from "../lockManager.js";
import { archiveTourney, loadActiveTourneys, saveActiveTourney } from "./log.js";
import {
  appendLog,
  clearActiveTourney,
  createEmptyTourney,
  getActiveTourney,
  hasActiveTourney,
  setActiveTourney,
} from "./state.js";
import { TOURNEY_OWNER_ID, type TourneyState } from "./types.js";

const playBusy = new Set<string>();

export function isTourneyOwner(userId: string): boolean {
  return userId === TOURNEY_OWNER_ID;
}

export function tryBeginPlay(guildId: string): boolean {
  if (playBusy.has(guildId)) return false;
  playBusy.add(guildId);
  return true;
}

export function endPlay(guildId: string): void {
  playBusy.delete(guildId);
}

export async function hydrateActiveTourneys(): Promise<number> {
  let n = 0;
  for (const s of await loadActiveTourneys()) {
    if (s.phase === "complete" || s.phase === "aborted") continue;
    setActiveTourney(s);
    if (!LockManager.isLocked(s.guildId, "tourney")) {
      LockManager.acquireLock(s.guildId, "tourney", []);
    }
    n++;
  }
  return n;
}

export async function startTourney(guildId: string): Promise<TourneyState> {
  if (hasActiveTourney(guildId) || LockManager.isLocked(guildId, "tourney")) {
    throw new Error("A tourney is already active in this server.");
  }
  if (LockManager.isLocked(guildId, "battle")) {
    throw new Error("A battle is in progress. Wait for it to finish.");
  }
  if (!LockManager.acquireLock(guildId, "tourney", [])) {
    throw new Error("Could not lock the arena for the tourney.");
  }

  const state = createEmptyTourney(guildId);
  setActiveTourney(state);
  await saveActiveTourney(state);
  return state;
}

export async function abortTourney(
  guildId: string,
): Promise<TourneyState | undefined> {
  const state = getActiveTourney(guildId);
  if (!state) {
    LockManager.releaseLock(guildId, "tourney");
    return undefined;
  }
  state.phase = "aborted";
  appendLog(state, "aborted");
  clearActiveTourney(guildId);
  LockManager.releaseLock(guildId, "tourney");
  await archiveTourney(state);
  return state;
}

export async function finishTourney(state: TourneyState): Promise<void> {
  state.phase = "complete";
  appendLog(state, "complete", { awards: state.awards });
  clearActiveTourney(state.guildId);
  LockManager.releaseLock(state.guildId, "tourney");
  await archiveTourney(state);
}
