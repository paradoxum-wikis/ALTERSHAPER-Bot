import readline from "readline";

type CommandAction = () => Promise<void> | void;

interface ConsoleCommand {
  description: string;
  action: CommandAction;
  isAlias?: boolean;
}

export class ConsoleHandler {
  private readonly commands = new Map<string, ConsoleCommand>();
  private rl: readline.Interface | null = null;
  private readonly promptLabel: string;

  constructor(promptLabel = "altershaper> ") {
    this.promptLabel = promptLabel;
  }

  public registerCommand(
    name: string,
    description: string,
    action: CommandAction,
    isAlias: boolean = false,
  ): void {
    this.commands.set(name.toLowerCase(), { description, action, isAlias });
  }

  public listCommands(): void {
    console.log("Available console commands:");
    for (const [name, { description, isAlias }] of this.commands.entries()) {
      if (!isAlias) {
        console.log(`  • ${name} — ${description}`);
      }
    }
    console.log("");
  }

  public start(): void {
    if (this.rl) return;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on("line", async (line) => {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed) {
        this.prompt();
        return;
      }

      const command = this.commands.get(trimmed);
      if (!command) {
        console.log(
          `Unknown command "${trimmed}". Type "help" to list all options.\n`,
        );
        this.prompt();
        return;
      }

      try {
        this.rl?.pause();
        await command.action();
      } catch (error) {
        console.error("❌ Console command failed:", error);
      } finally {
        this.rl?.resume();
        this.prompt();
      }
    });

    this.rl.on("close", () => {
      console.log("Console input closed.");
    });

    console.log(' Console command handler ready. Type "help" for options.\n'); // intentional dup space
    this.prompt();
  }

  private prompt(): void {
    this.rl?.setPrompt(this.promptLabel);
    this.rl?.prompt();
  }
}
