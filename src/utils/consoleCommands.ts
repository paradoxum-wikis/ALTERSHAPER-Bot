import { ConsoleHandler } from "./consoleHandler.js";

export function registerConsoleCommands(
  handler: ConsoleHandler,
  bot: {
    logStatus: () => void;
    reloadSlashCommands: () => Promise<void>;
    restart: () => Promise<void>;
    shutdown: (exitCode?: number) => Promise<void>;
    clearCache: () => void;
    listGuilds: () => void;
    listLocks: () => void;
  },
): void {
  handler.registerCommand(
    "help",
    "List available console commands (alias: h)",
    () => handler.listCommands(),
  );
  handler.registerCommand(
    "h",
    "Alias for 'help'",
    () => handler.listCommands(),
    true,
  );

  handler.registerCommand("status", "Print current bot status (alias: s)", () =>
    bot.logStatus(),
  );
  handler.registerCommand(
    "s",
    "Alias for 'status'",
    () => bot.logStatus(),
    true,
  );

  handler.registerCommand(
    "reload",
    "Reload registered slash commands (alias: r)",
    () => bot.reloadSlashCommands(),
  );
  handler.registerCommand(
    "r",
    "Alias for 'reload'",
    () => bot.reloadSlashCommands(),
    true,
  );

  handler.registerCommand(
    "restart",
    "Restart the bot internals (alias: re)",
    () => bot.restart(),
  );
  handler.registerCommand(
    "re",
    "Alias for 'restart'",
    () => bot.restart(),
    true,
  );

  handler.registerCommand(
    "shutdown",
    "Gracefully stop the bot (aliases: exit, sd)",
    () => bot.shutdown(),
  );
  handler.registerCommand(
    "exit",
    "Alias for 'shutdown'",
    () => bot.shutdown(),
    true,
  );
  handler.registerCommand(
    "sd",
    "Alias for 'shutdown'",
    () => bot.shutdown(),
    true,
  );

  handler.registerCommand(
    "clearcache",
    "Clear Discord.js caches (alias: cc)",
    () => bot.clearCache(),
  );
  handler.registerCommand(
    "cc",
    "Alias for 'clearcache'",
    () => bot.clearCache(),
    true,
  );

  handler.registerCommand(
    "guilds",
    "List all connected servers (alias: g)",
    () => bot.listGuilds(),
  );
  handler.registerCommand(
    "g",
    "Alias for 'guilds'",
    () => bot.listGuilds(),
    true,
  );

  handler.registerCommand("locks", "View active battle locks (alias: l)", () =>
    bot.listLocks(),
  );
  handler.registerCommand(
    "l",
    "Alias for 'locks'",
    () => bot.listLocks(),
    true,
  );
}
