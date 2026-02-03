import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export const data = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Behold the knowledge of Aphonos");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  let commitInfo = "**Unable to retrieve commit data**";

  try {
    const response = await fetch(
      "https://api.github.com/repos/Paradoxum-Wikis/ALTERSHAPER-Bot/commits/main",
    );

    if (response.ok) {
      const data = (await response.json()) as GitHubCommit;
      const commitDate = new Date(data.commit.author.date);
      const commitMessage = data.commit.message.split("\n")[0];
      const commitSha = data.sha.substring(0, 7);

      commitInfo = `**[${commitSha}](${data.html_url})** - ${commitMessage}\n**Date:** ${commitDate.toLocaleDateString()} at ${commitDate.toLocaleTimeString()}`;
    }
  } catch (error) {
    console.error("Error fetching bot info:", error);
  }

  const embed = new EmbedBuilder()
    .setColor("#9932CC")
    .setTitle("ℹ️ KNOWLEDGE OF APHONOS")
    .setDescription("**Behold the divine information of thy sacred enforcer!**")
    .addFields(
      {
        name: "📚 DOCUMENTATION",
        value:
          "[Alterpedia Help Page](https://alter-ego.fandom.com/wiki/Help:ALTERSHAPER)",
        inline: false,
      },
      {
        name: "🔗 SOURCE CODE",
        value:
          "[GitHub Repository](https://github.com/Paradoxum-Wikis/ALTERSHAPER-Bot)",
        inline: false,
      },
      {
        name: "📝 LATEST UPDATE",
        value: commitInfo,
        inline: false,
      },
      {
        name: "📊 CURRENT STATUS",
        value: `**Uptime:** <t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>\n**Servers:** ${interaction.client.guilds.cache.size}\n**Users in this server:** ${interaction.guild?.memberCount}`,
        inline: false,
      },
    )
    .setFooter({
      text: "Aphonos stands eternal, guardian of Alteruism and enforcer of righteous order!",
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
