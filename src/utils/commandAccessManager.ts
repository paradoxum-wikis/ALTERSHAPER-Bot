const WHITELISTED_SERVERS: string[] = [
  "1362084781134708907", // ALTER EGO Wiki
  "1040506880168034374",
];

// Commands that are allowed in whitelisted servers only
// All other commands will be globally available
const RESTRICTED_COMMANDS: string[] = [
  "ban",
  "kick",
  "timeout",
  "clear",
  "warn",
  "sins",
  "archives",
  "slowmode",
  "link",
  "checklink",
  "syncroles",
  "removelink",
  "removesin",
  "anime",
  "job",
];

export class CommandAccessManager {
  /**
   * Checks if a command can be executed in the given server.
   * @param commandName The name of the command being executed.
   * @param guildId The ID of the guild where the command is being used.
   * @returns True if the command is allowed, false otherwise.
   */
  public static canUseCommand(
    commandName: string,
    guildId: string | null,
  ): boolean {
    if (!RESTRICTED_COMMANDS.includes(commandName)) {
      return true;
    }

    return WHITELISTED_SERVERS.includes(guildId || "");
  }

  /**
   * Gets the error message for unauthorized servers.
   * @returns A string containing the error message.
   */
  public static getAccessDeniedMessage(): string {
    return "**THIS DIVINE INSTRUMENT IS NOT SANCTIONED FOR USE IN THESE LANDS!** This command's powers are reserved for the blessed ALTER EGO Wiki only.";
  }
}
