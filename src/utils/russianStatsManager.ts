import fs from "fs/promises";
import path from "path";

let isWriting = false;

async function withFileLock<T>(task: () => Promise<T>): Promise<T> {
  while (isWriting) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  try {
    isWriting = true;
    return await task();
  } finally {
    isWriting = false;
  }
}

export interface RussianRecord {
  gameId: string;
  winnerId: string;
  winnerTag: string;
  loserId: string;
  loserTag: string;
  gameDate: string;
  turns: number;
  chamber: number;
  causeOfDeath: "shot" | "shot_self";
  guildId: string;
}

export class RussianStatsManager {
  private static readonly RECORDS_FILE = path.join(
    process.cwd(),
    "data",
    "russian_records.json",
  );

  private static async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(this.RECORDS_FILE);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
  }

  private static async readRecords(): Promise<RussianRecord[]> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.RECORDS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      console.error("Error reading russian records file:", error);
      return [];
    }
  }

  private static async writeRecords(records: RussianRecord[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.RECORDS_FILE, JSON.stringify(records, null, 2));
  }

  public static async recordGame(
    winnerId: string,
    winnerTag: string,
    loserId: string,
    loserTag: string,
    turns: number,
    chamber: number,
    causeOfDeath: "shot" | "shot_self",
    guildId?: string,
  ): Promise<void> {
    await withFileLock(async () => {
      const records = await this.readRecords();
      const gameDate = new Date().toISOString();
      const gameId = `russian_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const gameRecord: RussianRecord = {
        gameId,
        winnerId,
        winnerTag,
        loserId,
        loserTag,
        gameDate,
        turns,
        chamber,
        causeOfDeath,
        guildId: guildId || "unknown",
      };
      records.push(gameRecord);

      await this.writeRecords(records);
    });
  }
}
