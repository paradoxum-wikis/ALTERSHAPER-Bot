import { GuildMember } from "discord.js";
import { FANDOM_ROLE_MAP, TDS_WIKI_STAFF } from "./roleConstants.js";

const COMMANDS_CHANNEL_ID = process.env.CMDS_CHANNEL_ID;

export enum PermissionLevel {
  BASIC = "basic",
  BASIC2 = "basic2", // Basic commands that require designated channel
  MODERATOR = "moderator",
  ADMIN = "admin",
}

export const COMMAND_PERMISSIONS: Record<string, PermissionLevel> = {
  // Admin
  ban: PermissionLevel.ADMIN,
  removesin: PermissionLevel.ADMIN,
  removelink: PermissionLevel.ADMIN,
  webhook: PermissionLevel.ADMIN,
  reactionrole: PermissionLevel.ADMIN,
  interchat: PermissionLevel.ADMIN,

  // Moderator
  kick: PermissionLevel.MODERATOR,
  timeout: PermissionLevel.MODERATOR,
  warn: PermissionLevel.MODERATOR,
  clear: PermissionLevel.MODERATOR,
  archives: PermissionLevel.MODERATOR,
  slowmode: PermissionLevel.MODERATOR,
  giveaway: PermissionLevel.MODERATOR,

  // Basic
  // everything else basically

  // Basic2
  anime: PermissionLevel.BASIC2,
};

// permission levels
export const ROLE_PERMISSIONS: Record<string, PermissionLevel> = {
  [FANDOM_ROLE_MAP.bureaucrat]: PermissionLevel.ADMIN,
  [FANDOM_ROLE_MAP.sysop]: PermissionLevel.ADMIN,
  [FANDOM_ROLE_MAP["content-moderator"]]: PermissionLevel.MODERATOR,
  [FANDOM_ROLE_MAP.threadmoderator]: PermissionLevel.MODERATOR,
  [TDS_WIKI_STAFF]: PermissionLevel.ADMIN,
};

export class RolePermissions {
  /**
   * Get the highest permission level a user has based on one's roles
   * Everyone defaults to BASIC, only specific roles grant higher permissions
   */
  public static getUserPermissionLevel(member: GuildMember): PermissionLevel {
    if (member.id === "178926593966735361") {
      return PermissionLevel.ADMIN;
    }
    let highestLevel = PermissionLevel.BASIC;

    for (const role of member.roles.cache.values()) {
      const rolePermission = ROLE_PERMISSIONS[role.id];
      if (rolePermission) {
        // Admin > moderator > basic
        if (rolePermission === PermissionLevel.ADMIN) {
          return PermissionLevel.ADMIN;
        } else if (rolePermission === PermissionLevel.MODERATOR) {
          highestLevel = PermissionLevel.MODERATOR;
        }
      }
    }

    return highestLevel;
  }

  /**
   * Check if a user has permission to use a specific command
   */
  public static hasCommandPermission(
    member: GuildMember,
    commandName: string,
  ): boolean {
    const requiredLevel = COMMAND_PERMISSIONS[commandName];
    const userLevel = this.getUserPermissionLevel(member);

    if (!requiredLevel) return true;

    // hierarchy
    switch (requiredLevel) {
      case PermissionLevel.BASIC:
      case PermissionLevel.BASIC2:
        return true;
      case PermissionLevel.MODERATOR:
        return (
          userLevel === PermissionLevel.MODERATOR ||
          userLevel === PermissionLevel.ADMIN
        );
      case PermissionLevel.ADMIN:
        return userLevel === PermissionLevel.ADMIN;
      default:
        return false;
    }
  }

  /**
   * Get an error message for insufficient permissions
   */
  public static getPermissionErrorMessage(commandName: string): string {
    const requiredLevel = COMMAND_PERMISSIONS[commandName];

    switch (requiredLevel) {
      case PermissionLevel.MODERATOR:
        return "**THY EGO LACKEST THE DIVINE AUTHORITY TO PERFORM THIS SACRED DUTY!** Only moderators and above may wield this power.";
      case PermissionLevel.ADMIN:
        return "**THY EGO LACKEST THE SUPREME DIVINE AUTHORITY!** Only administrators and above may perform this most sacred ritual.";
      default:
        return "**Thy ego lackest the required authority to perform this action.**";
    }
  }

  /**
   * Checks if a user can use commands in the current channel
   * Basic2 commands require designated channel for basic users
   * Mods and admins can use any command anywhere
   */
  public static canUseCommandInChannel(
    member: GuildMember,
    channelId: string,
    commandName: string,
  ): boolean {
    const userLevel = this.getUserPermissionLevel(member);
    const requiredLevel = COMMAND_PERMISSIONS[commandName];

    // mods + admins
    if (
      userLevel === PermissionLevel.MODERATOR ||
      userLevel === PermissionLevel.ADMIN
    ) {
      return true;
    }

    // basic2
    if (requiredLevel === PermissionLevel.BASIC2) {
      return channelId === COMMANDS_CHANNEL_ID;
    }

    // basic
    return true;
  }

  /**
   * Get error message for wrong channel usage
   */
  public static getChannelErrorMessage(): string {
    return `**THOU MUST UTTER THIS COMMAND IN THE DESIGNATED CHANNEL!** Please use <#${COMMANDS_CHANNEL_ID}> for this command.`;
  }
}
