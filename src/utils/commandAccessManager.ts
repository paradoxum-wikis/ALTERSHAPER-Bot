const AEW = "1362084781134708907";
const TDSW = "735394249863987241";
const TEST = "1040506880168034374";

const RESTRICTED_SERVERS = [AEW, TEST];
const WIKI_SERVERS = [AEW, TDSW, TEST];

const RESTRICTED_COMMANDS = new Set([
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
]);

const WIKI_COMMANDS = new Set(["job"]);

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
    const id = guildId || "";
    if (WIKI_COMMANDS.has(commandName)) {
      return WIKI_SERVERS.includes(id);
    }
    if (RESTRICTED_COMMANDS.has(commandName)) {
      return RESTRICTED_SERVERS.includes(id);
    }
    return true;
  }

  /**
   * Gets the error message for unauthorized servers.
   * @returns A string containing the error message.
   */
  public static getAccessDeniedMessage(): string {
    return "**THIS DIVINE INSTRUMENT IS NOT SANCTIONED FOR USE IN THESE LANDS!** This command's powers are reserved for the blessed ALTER EGO Wiki only.";
  }
}
