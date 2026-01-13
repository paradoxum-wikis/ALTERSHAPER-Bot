import { GuildMember } from "discord.js";
import { LinkLogger } from "./linkLogger.js";

const TOP_CONTRIBUTORS_ROLE_ID = "1380538701309808700";

interface ContributorData {
  userName: string;
  userId: string;
  avatar: string;
  profileUrl: string;
  userContactPage: string;
  isAdmin: boolean;
  isCurrent: boolean;
  contributions: string;
  latestRevision: any;
  contributionsText: string;
  index: number;
}

interface RecapData {
  timestamp: string;
  totalContributors: number;
  contributors: ContributorData[];
}

interface GitHubApiResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

export class TopContributorsManager {
  /**
   * Get the current year
   */
  private static getCurrentYear(): string {
    return new Date().getFullYear().toString();
  }

  /**
   * Find the newest recap JSON file in the current year's folder
   */
  private static async getNewestRecapFile(): Promise<string | null> {
    const currentYear = this.getCurrentYear();
    const apiUrl = `https://api.github.com/repos/Paradoxum-Wikis/AEWiki-Recap/contents/data/${currentYear}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.log(
          `[TOPCONTRIBUTORS] Failed to fetch directory contents for year ${currentYear}: ${response.status}`,
        );
        return null;
      }

      const files = (await response.json()) as unknown as GitHubApiResponse[];

      // Filter for recap files and sort by filename (which contains date)
      const recapFiles = files
        .filter(
          (file) =>
            file.type === "file" &&
            file.name.startsWith("recap-") &&
            file.name.endsWith(".json"),
        )
        .sort((a, b) => b.name.localeCompare(a.name));

      if (recapFiles.length === 0) {
        console.log(
          `[TOPCONTRIBUTORS] No recap files found for year ${currentYear}`,
        );
        return null;
      }

      // Return the newest file's name
      return recapFiles[0].name;
    } catch (error) {
      console.error(`Error fetching directory contents: ${error}`);
      return null;
    }
  }

  /**
   * Fetch the newest week's top contributors data
   */
  private static async fetchTopContributors(): Promise<ContributorData[]> {
    const currentYear = this.getCurrentYear();
    const newestFile = await this.getNewestRecapFile();

    if (!newestFile) {
      console.log(`[TOPCONTRIBUTORS] No recap files found for ${currentYear}`);
      return [];
    }

    const url = `https://raw.githubusercontent.com/Paradoxum-Wikis/AEWiki-Recap/main/data/${currentYear}/${newestFile}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(
          `[TOPCONTRIBUTORS] Failed to fetch top contributors data from ${newestFile}: ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as RecapData;
      console.log(
        `[TOPCONTRIBUTORS] Successfully loaded top contributors data from ${newestFile}`,
      );
      return data.contributors || [];
    } catch (error) {
      console.error(
        `Error fetching top contributors data from ${newestFile}: ${error}`,
      );
      return [];
    }
  }

  /**
   * Check if a Fandom username is in the top 5 contributors
   */
  public static async isTopContributor(
    fandomUsername: string,
  ): Promise<{ isTop5: boolean; rank?: number }> {
    const contributors = await this.fetchTopContributors();

    const contributor = contributors.find((c) => c.userName === fandomUsername);

    if (!contributor) {
      return { isTop5: false };
    }

    const isTop5 = contributor.index <= 5;
    return { isTop5, rank: contributor.index };
  }

  /**
   * Manage the top contributors role for a member
   */
  public static async manageTopContributorRole(
    member: GuildMember,
    fandomUsername: string,
  ): Promise<{
    roleGranted: boolean;
    roleRemoved: boolean;
    rank?: number;
    error?: string;
  }> {
    try {
      const { isTop5, rank } = await this.isTopContributor(fandomUsername);
      const hasRole = member.roles.cache.has(TOP_CONTRIBUTORS_ROLE_ID);

      if (isTop5 && !hasRole) {
        // Grant role
        try {
          await member.roles.add(TOP_CONTRIBUTORS_ROLE_ID);
          return { roleGranted: true, roleRemoved: false, rank };
        } catch (error) {
          console.error(`Failed to grant top contributor role: ${error}`);
          return {
            roleGranted: false,
            roleRemoved: false,
            rank,
            error: "Failed to grant role",
          };
        }
      } else if (!isTop5 && hasRole) {
        // Remove role
        try {
          await member.roles.remove(TOP_CONTRIBUTORS_ROLE_ID);
          return { roleGranted: false, roleRemoved: true };
        } catch (error) {
          console.error(`Failed to remove top contributor role: ${error}`);
          return {
            roleGranted: false,
            roleRemoved: false,
            error: "Failed to remove role",
          };
        }
      } else if (isTop5 && hasRole) {
        // Already has role and deserves it
        return { roleGranted: false, roleRemoved: false, rank };
      } else {
        // Not top 5 and doesn't have role
        return { roleGranted: false, roleRemoved: false };
      }
    } catch (error) {
      console.error(`Error managing top contributor role: ${error}`);
      return {
        roleGranted: false,
        roleRemoved: false,
        error: "Failed to check contributor status",
      };
    }
  }

  /**
   * Get all current top 5 contributors and sync roles for all linked users
   */
  public static async syncAllTopContributorRoles(guild: any): Promise<{
    processed: number;
    rolesGranted: number;
    rolesRemoved: number;
    errors: string[];
  }> {
    const contributors = await this.fetchTopContributors();
    const top5Contributors = contributors.filter((c) => c.index <= 5);
    const top5Usernames = top5Contributors.map((c) => c.userName);

    const allLinks = await LinkLogger.getAllLinks();
    const errors: string[] = [];
    let processed = 0;
    let rolesGranted = 0;
    let rolesRemoved = 0;

    for (const link of allLinks) {
      try {
        const member = await guild.members
          .fetch(link.discordUserId)
          .catch(() => null);
        if (!member) continue;

        const shouldHaveRole = top5Usernames.includes(link.fandomUsername);
        const hasRole = member.roles.cache.has(TOP_CONTRIBUTORS_ROLE_ID);

        if (shouldHaveRole && !hasRole) {
          await member.roles.add(TOP_CONTRIBUTORS_ROLE_ID);
          rolesGranted++;
        } else if (!shouldHaveRole && hasRole) {
          await member.roles.remove(TOP_CONTRIBUTORS_ROLE_ID);
          rolesRemoved++;
        }

        processed++;
      } catch (error) {
        errors.push(`Failed to process ${link.fandomUsername}: ${error}`);
      }
    }

    return { processed, rolesGranted, rolesRemoved, errors };
  }
}
