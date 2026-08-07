import fs from "fs/promises";
import path from "path";
import type { TourneyLogFile, TourneyState } from "./types.js";

const LOG_PATH = path.join(process.cwd(), "data", "tourney_log.json");

let writing = false;

async function withLock<T>(task: () => Promise<T>): Promise<T> {
  while (writing) {
    await new Promise((r) => setTimeout(r, 50));
  }
  writing = true;
  try {
    return await task();
  } finally {
    writing = false;
  }
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
}

function emptyFile(): TourneyLogFile {
  return { version: 1, active: {}, history: [] };
}

export async function readTourneyLog(): Promise<TourneyLogFile> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(LOG_PATH, "utf-8");
    return JSON.parse(raw) as TourneyLogFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyFile();
    throw e;
  }
}

export async function writeTourneyLog(file: TourneyLogFile): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(LOG_PATH, JSON.stringify(file, null, 2));
}

export async function saveActiveTourney(state: TourneyState): Promise<void> {
  await withLock(async () => {
    const file = await readTourneyLog();
    file.active[state.guildId] = state;
    await writeTourneyLog(file);
  });
}

export async function archiveTourney(state: TourneyState): Promise<void> {
  await withLock(async () => {
    const file = await readTourneyLog();
    delete file.active[state.guildId];
    file.history.push(state);
    await writeTourneyLog(file);
  });
}

export async function removeActiveFromDisk(guildId: string): Promise<void> {
  await withLock(async () => {
    const file = await readTourneyLog();
    delete file.active[guildId];
    await writeTourneyLog(file);
  });
}

export async function loadActiveTourneys(): Promise<TourneyState[]> {
  const file = await readTourneyLog();
  return Object.values(file.active);
}

export function tourneyLogPath(): string {
  return LOG_PATH;
}
