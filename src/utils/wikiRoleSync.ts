import { Guild } from "discord.js";
import { LinkLogger } from "./linkLogger.js";
import {
  FANDOM_ROLE_MAP,
  LINKED_ROLE_ID,
  TOP_CONTRIBUTORS_ROLE_ID,
  EDIT_COUNT_ROLES,
  WIKI_SYNC_ROLES,
} from "./roleConstants.js";

// Maps Discord Role ID to the corresponding Fandom Profile Tag name
const ROLE_TO_WIKI_TAG_MAP: Record<string, string> = {
  [WIKI_SYNC_ROLES.DICTATOR]: "Dictalter",
  [FANDOM_ROLE_MAP.bureaucrat]: "Altego Bureau",
  [FANDOM_ROLE_MAP.sysop]: "Alterministrator",
  [FANDOM_ROLE_MAP["content-moderator"]]: "Altertentor",
  [FANDOM_ROLE_MAP.threadmoderator]: "Egodiscussor",
  [EDIT_COUNT_ROLES.EDITS_1000]: "The Ego",
  [EDIT_COUNT_ROLES.EDITS_250]: "Triumphant Ego",
  [TOP_CONTRIBUTORS_ROLE_ID]: "Ego of the Week",
  [WIKI_SYNC_ROLES.ACTIVITY_WINNER]: "Ascended Ego",
  [WIKI_SYNC_ROLES.PARADOXUM]: "Paradoxum",
  [WIKI_SYNC_ROLES.AE_STAFF]: "AE Staff",
  [WIKI_SYNC_ROLES.INTERWIKI_STAFF]: "Interwiki Staff",
  [WIKI_SYNC_ROLES.CONTENT_CREATOR]: "Content Creator",
  [WIKI_SYNC_ROLES.FIRST_VICTIM]: "First Victim",
  [WIKI_SYNC_ROLES.SERVER_BOOSTER]: "Server Booster",
  [LINKED_ROLE_ID]: "Awakened Ego",
  [WIKI_SYNC_ROLES.BOT]: "Holy Altershaper",
};

// Defines the exact order of tags for the wiki page output
const WIKI_TAG_ORDER = [
  "Dictalter",
  "Altego Bureau",
  "Holy Altershaper",
  "Alterministrator",
  "Altertentor",
  "Egodiscussor",
  "The Ego",
  "Triumphant Ego",
  "Ego of the Week",
  "Ascended Ego",
  "Paradoxum",
  "AE Staff",
  "Interwiki Staff",
  "Content Creator",
  "First Victim",
  "Server Booster",
  "Awakened Ego",
];

const API_URL = "https://alter-ego.fandom.com/api.php";
const PAGE_TITLE = "MediaWiki:ProfileTags";

export class WikiRoleSyncManager {
  private static botUsername = process.env.WIKI_BOT_USERNAME;
  private static botPassword = process.env.WIKI_BOT_PASSWORD;
  private static editToken: string | null = null;
  private static cookie: string | null = null;

  private static async apiRequest(params: URLSearchParams) {
    const response = await fetch(API_URL, {
      method: "POST",
      body: params,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookie || "",
      },
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie;
    }
    return response.json();
  }

  private static async login(): Promise<boolean> {
    const loginTokenParams = new URLSearchParams({
      action: "query",
      meta: "tokens",
      type: "login",
      format: "json",
    });
    const tokenData: any = await this.apiRequest(loginTokenParams);
    const loginToken = tokenData.query.tokens.logintoken;

    const loginParams = new URLSearchParams({
      action: "login",
      lgname: this.botUsername!,
      lgpassword: this.botPassword!,
      lgtoken: loginToken,
      format: "json",
    });
    const loginResult: any = await this.apiRequest(loginParams);

    if (loginResult.login.result !== "Success") {
      return false;
    }

    const csrfTokenParams = new URLSearchParams({
      action: "query",
      meta: "tokens",
      format: "json",
    });
    const csrfData: any = await this.apiRequest(csrfTokenParams);
    this.editToken = csrfData.query.tokens.csrftoken;
    return true;
  }

  private static async getPageContent(): Promise<string> {
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: PAGE_TITLE,
      rvprop: "content",
      format: "json",
      rvslots: "main",
    });
    const data: any = await this.apiRequest(params);
    const page = Object.values(data.query.pages)[0] as any;
    return page.revisions[0].slots.main["*"];
  }

  private static async editPage(
    content: string,
    summary: string,
  ): Promise<void> {
    const params = new URLSearchParams({
      action: "edit",
      title: PAGE_TITLE,
      text: content,
      summary: summary,
      token: this.editToken!,
      format: "json",
    });
    const data: any = await this.apiRequest(params);
    if (data.error) {
      throw new Error(`Failed to edit wiki page: ${data.error.info}`);
    }
  }

  public static async syncRolesToWiki(
    guild: Guild,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.botUsername || !this.botPassword) {
      return {
        success: false,
        message:
          "Wiki bot credentials (WIKI_BOT_USERNAME, WIKI_BOT_PASSWORD) not configured in .env file.",
      };
    }

    const allLinks = await LinkLogger.getAllLinks();
    if (allLinks.length === 0) {
      return { success: false, message: "No linked users found to sync." };
    }

    const userTags: Record<string, string[]> = {};

    for (const link of allLinks) {
      const member = await guild.members
        .fetch(link.discordUserId)
        .catch(() => null);
      if (!member) continue;

      const memberTags: Set<string> = new Set();
      for (const roleId of member.roles.cache.keys()) {
        const tagName = ROLE_TO_WIKI_TAG_MAP[roleId];
        if (tagName) {
          memberTags.add(tagName);
        }
      }

      if (memberTags.size > 0) {
        const sortedTags = WIKI_TAG_ORDER.filter((tag) => memberTags.has(tag));
        userTags[link.fandomUsername] = sortedTags;
      }
    }

    userTags["DarkGabonnie"] = ["Holy Altershaper"];

    try {
      const currentPageContent = await this.getPageContent();
      const headerMatch = currentPageContent.match(/^((\s*\/\/.*\n)*)/);
      const header = headerMatch ? headerMatch[0] : "";

      let newContent = header;
      const sortedUsernames = Object.keys(userTags).sort((a, b) =>
        a.localeCompare(b),
      );
      for (const username of sortedUsernames) {
        const tags = userTags[username];
        if (tags.length > 0) {
          newContent += `${username}|${tags.join(", ")}\n`;
        }
      }

      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, message: "Failed to log in to the wiki." };
      }

      await this.editPage(
        newContent.trim(),
        "Automated sync from Discord roles",
      );
      return {
        success: true,
        message: `Successfully synced roles for ${Object.keys(userTags).length} users to MediaWiki:ProfileTags.`,
      };
    } catch (error) {
      console.error("Error during wiki role sync:", error);
      return {
        success: false,
        message: `An error occurred: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
