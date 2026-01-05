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

export type RussianCauseOfDeath = "shot" | "shot_self";

export interface RussianStats {
  userId: string;
  userTag: string;

  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;

  shotSelfDeaths: number;
  shotByOpponentDeaths: number;
  avgTurns: number; // rounded to 1 decimal
  avgChamber: number; // rounded to 2 decimals

  lastGameAt?: string;
  lastWinAt?: string;
  lastLossAt?: string;
}

export interface RussianRecord {
  gameId: string;
  winnerId: string;
  winnerTag: string;
  loserId: string;
  loserTag: string;
  gameDate: string;
  turns: number;
  chamber: number; // 1-6
  causeOfDeath: RussianCauseOfDeath;
  guildId: string;
}

/**
 * Stores Russian Roulette records and maintains aggregated stats.
 *
 * Files:
 * - data/russian_stats.json    (aggregates)
 * - data/russian_records.json  (per-game records)
 */
export class RussianStatsManager {
  private static readonly STATS_FILE = path.join(
    process.cwd(),
    "data",
    "russian_stats.json",
  );

  private static readonly RECORDS_FILE = path.join(
    process.cwd(),
    "data",
    "russian_records.json",
  );

  private static async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(this.STATS_FILE);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
  }

  private static async readStats(): Promise<RussianStats[]> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.STATS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as RussianStats[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      console.error("Error reading russian stats file:", error);
      return [];
    }
  }

  private static async writeStats(stats: RussianStats[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.STATS_FILE, JSON.stringify(stats, null, 2));
  }

  private static async readRecords(): Promise<RussianRecord[]> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.RECORDS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as RussianRecord[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      console.error("Error reading russian records file:", error);
      return [];
    }
  }

  private static async writeRecords(records: RussianRecord[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.RECORDS_FILE, JSON.stringify(records, null, 2));
  }

  private static calculateWinRate(wins: number, totalGames: number): number {
    return totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  }

  private static roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private static recalculateAverages(s: RussianStats): void {
    if (s.totalGames <= 0) {
      s.avgTurns = 0;
      s.avgChamber = 0;
      return;
    }

    // avgTurns and avgChamber are maintained incrementally in recordGame
    // this method exists primarily for safety and for recompute flows.
    s.avgTurns = this.roundTo(s.avgTurns, 1);
    s.avgChamber = this.roundTo(s.avgChamber, 2);
  }

  private static ensureUserStats(
    stats: RussianStats[],
    userId: string,
    userTag: string,
  ): RussianStats {
    let userStats = stats.find((s) => s.userId === userId);
    if (!userStats) {
      userStats = {
        userId,
        userTag,

        wins: 0,
        losses: 0,
        totalGames: 0,
        winRate: 0,

        shotSelfDeaths: 0,
        shotByOpponentDeaths: 0,
        avgTurns: 0,
        avgChamber: 0,

        lastGameAt: undefined,
        lastWinAt: undefined,
        lastLossAt: undefined,
      };
      stats.push(userStats);
    }
    userStats.userTag = userTag;
    return userStats;
  }

  /**
   * Record a completed Russian Roulette game and update aggregates.
   */
  public static async recordGame(
    winnerId: string,
    winnerTag: string,
    loserId: string,
    loserTag: string,
    turns: number,
    chamber: number,
    causeOfDeath: RussianCauseOfDeath,
    guildId?: string,
  ): Promise<void> {
    await withFileLock(async () => {
      const stats = await this.readStats();
      const records = await this.readRecords();

      const gameDate = new Date().toISOString();
      const gameId = `russian_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const record: RussianRecord = {
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
      records.push(record);

      // Winner aggregates
      const winner = this.ensureUserStats(stats, winnerId, winnerTag);
      winner.wins++;
      winner.totalGames++;
      winner.winRate = this.calculateWinRate(winner.wins, winner.totalGames);
      winner.lastGameAt = gameDate;
      winner.lastWinAt = gameDate;

      // Maintain averages incrementally:
      // newAvg = (oldAvg*(n-1) + x) / n
      winner.avgTurns =
        (winner.avgTurns * (winner.totalGames - 1) + turns) / winner.totalGames;
      winner.avgChamber =
        (winner.avgChamber * (winner.totalGames - 1) + chamber) /
        winner.totalGames;
      this.recalculateAverages(winner);

      // Loser aggregates
      const loser = this.ensureUserStats(stats, loserId, loserTag);
      loser.losses++;
      loser.totalGames++;
      loser.winRate = this.calculateWinRate(loser.wins, loser.totalGames);
      loser.lastGameAt = gameDate;
      loser.lastLossAt = gameDate;

      if (causeOfDeath === "shot_self") loser.shotSelfDeaths++;
      else loser.shotByOpponentDeaths++;

      loser.avgTurns =
        (loser.avgTurns * (loser.totalGames - 1) + turns) / loser.totalGames;
      loser.avgChamber =
        (loser.avgChamber * (loser.totalGames - 1) + chamber) /
        loser.totalGames;
      this.recalculateAverages(loser);

      await this.writeStats(stats);
      await this.writeRecords(records);
    });
  }

  public static async getUserStats(
    userId: string,
  ): Promise<RussianStats | null> {
    const stats = await this.readStats();
    return stats.find((s) => s.userId === userId) || null;
  }

  public static async getAllStats(): Promise<RussianStats[]> {
    return await this.readStats();
  }

  /**
   * Leaderboard sorted by winRate, then totalGames, then wins.
   * @param limit number of entries to return
   * @param minGames minimum games required to appear (defaults to 3)
   */
  public static async getLeaderboard(
    limit: number = 10,
    minGames: number = 3,
  ): Promise<RussianStats[]> {
    const stats = await this.readStats();

    return stats
      .filter((s) => s.totalGames >= minGames)
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
        return b.wins - a.wins;
      })
      .slice(0, limit);
  }

  public static async getUserGameHistory(
    userId: string,
    limit: number = 10,
  ): Promise<RussianRecord[]> {
    const records = await this.readRecords();
    return records
      .filter((r) => r.winnerId === userId || r.loserId === userId)
      .sort(
        (a, b) =>
          new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime(),
      )
      .slice(0, limit);
  }
}
