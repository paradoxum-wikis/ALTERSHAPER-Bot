import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

function cleanWikitext(text: string): string {
  text = text.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2");
  text = text.replace(/'''([^']+)'''/g, "$1");
  text = text.replace(/''([^']+)''/g, "$1");
  return text;
}

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("Get a random trivia fact from a Wiki")
  .addStringOption((option) =>
    option
      .setName("game")
      .setDescription("The game to fetch trivia for")
      .setRequired(false)
      .addChoices(
        { name: "ALTER EGO", value: "ae" },
        { name: "Tower Defense Simulator", value: "tds" },
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const game = interaction.options.getString("game") || "alterego";
  let url = "";
  let title = "";
  let footer = "";
  let color = "";

  if (game === "tds") {
    url = "https://tds.fandom.com/wiki/Template:DYKBoxContent?action=raw";
    title = "📚 Did you know that in Tower Defense Simulator:";
    footer =
      "Verily, I have drawn forth this knowledge from the annals of TDS Wiki.";
    color = "#33577A";
  } else {
    url = "https://alter-ego.fandom.com/wiki/Template:DYK?action=raw";
    title = "📚 Did you know that in ALTER EGO:";
    footer =
      "Verily, I have drawn forth this knowledge from the annals of ALTERPEDIA.";
    color = "#e61f24";
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch trivia");
    }
    const text = await response.text();
    const options = Array.from(
      text.matchAll(/<option>(.*?)<\/option>/gs),
      (m) => m[1].trim(),
    );
    if (options.length === 0) {
      throw new Error("No trivia options found");
    }
    const trivia = options[Math.floor(Math.random() * options.length)];
    const cleanedTrivia = cleanWikitext(trivia);
    const embed = new EmbedBuilder()
      .setColor(color as any)
      .setTitle(title)
      .setDescription(cleanedTrivia)
      .setFooter({
        text: footer,
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching trivia:", error);
    await interaction.reply({
      content:
        "The fetching of trivia hath failed. Prithee, attempt once more anon.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
