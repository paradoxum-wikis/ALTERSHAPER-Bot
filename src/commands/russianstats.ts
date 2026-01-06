import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { RussianStatsManager } from "../utils/russianStatsManager.js";
import type {
  RussianStats,
  RussianRecord,
} from "../utils/russianStatsManager.js";

function formatRelativeTimestamp(iso?: string): string {
  if (!iso) return "Never";
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Never";
  return `<t:${ts}:R>`;
}

function formatShortDate(iso: string): string {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Unknown date";
  return `<t:${ts}:d>`;
}

function clampLimit(value: number, max: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(max, value));
}

function renderUserStatsEmbed(
  targetUserTag: string,
  targetAvatarUrl: string,
  stats: RussianStats,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor("#000000")
    .setTitle("🔫 RUSSIAN ROULETTE RECORD")
    .setDescription(`Statistics for **${targetUserTag}**`)
    .setThumbnail(targetAvatarUrl)
    .setTimestamp();

  embed.addFields(
    { name: "📊 **OVERVIEW**", value: "\u200B", inline: false },
    { name: "🏆 Wins", value: stats.wins.toString(), inline: true },
    { name: "💀 Losses", value: stats.losses.toString(), inline: true },
    { name: "📈 Win Rate", value: `${stats.winRate}%`, inline: true },
    {
      name: "🎯 Total Games",
      value: stats.totalGames.toString(),
      inline: true,
    },
    {
      name: "🗓️ Last Game",
      value: formatRelativeTimestamp(stats.lastGameAt),
      inline: true,
    },
    {
      name: "⚖️ Ratio",
      value: `${stats.wins}W-${stats.losses}L`,
      inline: true,
    },
  );

  embed.addFields(
    { name: "🧨 **FATE METRICS**", value: "\u200B", inline: false },
    {
      name: "🩸 Suicide",
      value: stats.shotSelfDeaths.toString(),
      inline: true,
    },
    {
      name: "🎯 Shot by Opponent",
      value: stats.shotByOpponentDeaths.toString(),
      inline: true,
    },
    {
      name: "⏱️ Average Turns",
      value: stats.avgTurns.toString(),
      inline: true,
    },
    {
      name: "🔢 Average Chamber",
      value: stats.avgChamber.toString(),
      inline: true,
    },
    {
      name: "🏆 Last Win",
      value: formatRelativeTimestamp(stats.lastWinAt),
      inline: true,
    },
    {
      name: "💀 Last Loss",
      value: formatRelativeTimestamp(stats.lastLossAt),
      inline: true,
    },
  );

  return embed;
}

function renderLeaderboardEmbed(
  entries: RussianStats[],
  minGames: number,
): EmbedBuilder {
  let leaderboardText = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const medal =
      i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;

    leaderboardText += `${medal} **${entry.userTag}** - ${entry.winRate}% WR (${entry.wins}W-${entry.losses}L, ${entry.totalGames} games)\n`;
  }

  return new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🏆 RUSSIAN ROULETTE LEADERBOARD")
    .setDescription(
      `**Top Players by Win Rate**\n` +
        `*Minimum ${minGames} games required*\n\n` +
        leaderboardText,
    )
    .setTimestamp();
}

function renderHistoryEmbed(
  targetUserTag: string,
  targetAvatarUrl: string,
  history: RussianRecord[],
  targetUserId: string,
): EmbedBuilder {
  let historyText = "";
  for (const game of history) {
    const isWinner = game.winnerId === targetUserId;
    const opponent = isWinner ? game.loserTag : game.winnerTag;

    const result = isWinner ? "🔥 **WON**" : "💀 **LOST**";
    const date = formatShortDate(game.gameDate);

    const cause = !isWinner
      ? game.causeOfDeath === "shot_self"
        ? " (self-inflicted)"
        : " (shot)"
      : "";

    historyText += `${result} vs **${opponent}** (Chamber ${game.chamber}/6, ${game.turns} turns)${cause} - ${date}\n`;
  }

  return new EmbedBuilder()
    .setColor("#800000")
    .setTitle("📜 RUSSIAN ROULETTE CHRONICLES")
    .setDescription(`Recent games for **${targetUserTag}**\n\n${historyText}`)
    .setThumbnail(targetAvatarUrl)
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName("russianstats")
  .setDescription("View Russian Roulette statistics and leaderboards")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("user")
      .setDescription("View a user's Russian Roulette statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose statistics to view (defaults to yourself)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leaderboard")
      .setDescription("View the top Russian Roulette leaderboard")
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many users to show (defaults to 10, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View recent Russian Roulette game history for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose history to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many games to show (defaults to 10, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "user": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;

        const stats = await RussianStatsManager.getUserStats(targetUser.id);

        if (!stats) {
          await interaction.reply({
            content: `**${targetUser.tag} has not participated in any Russian Roulette games yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = renderUserStatsEmbed(
          targetUser.tag,
          targetUser.displayAvatarURL(),
          stats,
        );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      case "leaderboard": {
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );
        const minGames = 3;

        const leaderboard = await RussianStatsManager.getLeaderboard(
          limit,
          minGames,
        );

        if (leaderboard.length === 0) {
          await interaction.reply({
            content: `**No users have played enough Russian Roulette yet! (Minimum ${minGames} games required)**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = renderLeaderboardEmbed(leaderboard, minGames);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case "history": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );

        const history = await RussianStatsManager.getUserGameHistory(
          targetUser.id,
          limit,
        );

        if (history.length === 0) {
          await interaction.reply({
            content: `**${targetUser.tag} has no Russian Roulette history!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = renderHistoryEmbed(
          targetUser.tag,
          targetUser.displayAvatarURL(),
          history,
          targetUser.id,
        );

        await interaction.reply({ embeds: [embed] });
        return;
      }
    }
  } catch (error) {
    console.error("Error fetching Russian Roulette statistics:", error);
    await interaction.reply({
      content: "**FAILED TO RETRIEVE RUSSIAN ROULETTE RECORDS!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
