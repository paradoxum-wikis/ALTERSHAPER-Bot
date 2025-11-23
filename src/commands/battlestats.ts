import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BattleStatsManager } from "../utils/battleStatsManager.js";

export const data = new SlashCommandBuilder()
  .setName("battlestats")
  .setDescription("View deathbattle statistics and leaderboards")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("user")
      .setDescription("View a user's battle statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The warrior whose stats to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal, ranked, or all stats (defaults to normal)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
            { name: "All", value: "all" },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leaderboard")
      .setDescription("View the top warriors leaderboard")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal or ranked leaderboard (defaults to normal)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View recent battle history for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The warrior whose history to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal, ranked, or all battles (defaults to all)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
            { name: "All", value: "all" },
          )
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
        const mode = interaction.options.getString("mode") || "normal";
        const stats = await BattleStatsManager.getUserStats(targetUser.id);

        if (!stats) {
          await interaction.reply({
            content: `**${targetUser.tag} has not participated in any deathbattles yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor("#4B0082")
          .setTitle("⚔️ WARRIOR BATTLE RECORD")
          .setDescription(`Battle statistics for **${targetUser.tag}**`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        if (mode === "normal" || mode === "all") {
          embed.addFields(
            { name: "📊 **NORMAL BATTLES**", value: "\u200B", inline: false },
            { name: "🏆 Wins", value: stats.wins.toString(), inline: true },
            { name: "💀 Losses", value: stats.losses.toString(), inline: true },
            { name: "📊 Win Rate", value: `${stats.winRate}%`, inline: true },
            {
              name: "⭐ Weighted Score",
              value: `${stats.weightedScore}`,
              inline: true,
            },
            {
              name: "⚔️ Total Battles",
              value: stats.totalBattles.toString(),
              inline: true,
            },
            {
              name: "📅 Last Battle",
              value: stats.lastCasualBattleAt
                ? `<t:${Math.floor(new Date(stats.lastCasualBattleAt).getTime() / 1000)}:R>`
                : "Never",
              inline: true,
            },
            {
              name: "🎯 Battle Ratio",
              value: `${stats.wins}W-${stats.losses}L`,
              inline: true,
            },
          );
        }

        if (mode === "ranked" || mode === "all") {
          embed.addFields(
            { name: "🏆 **RANKED BATTLES**", value: "\u200B", inline: false },
            {
              name: "🏆 Ranked Wins",
              value: stats.rankedWins.toString(),
              inline: true,
            },
            {
              name: "💀 Ranked Losses",
              value: stats.rankedLosses.toString(),
              inline: true,
            },
            {
              name: "📊 Ranked Win Rate",
              value: `${stats.rankedWinRate}%`,
              inline: true,
            },
            {
              name: "⭐ Ranked Weighted Score",
              value: `${stats.rankedWeightedScore}`,
              inline: true,
            },
            {
              name: "⚔️ Total Ranked",
              value: stats.rankedTotalBattles.toString(),
              inline: true,
            },
            {
              name: "📅 Last Ranked",
              value: stats.lastRankedBattleAt
                ? `<t:${Math.floor(new Date(stats.lastRankedBattleAt).getTime() / 1000)}:R>`
                : "Never",
              inline: true,
            },
            {
              name: "🎯 Ranked Ratio",
              value: `${stats.rankedWins}W-${stats.rankedLosses}L`,
              inline: true,
            },
          );
        }

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "leaderboard": {
        const mode = interaction.options.getString("mode") || "normal";
        const isRanked = mode === "ranked";
        const leaderboard = await BattleStatsManager.getLeaderboard(
          10,
          isRanked,
        );

        if (leaderboard.length === 0) {
          await interaction.reply({
            content: `**No warriors have participated in enough ${isRanked ? "ranked " : ""}battles yet! (Minimum ${isRanked ? "5" : "3"} battles required)**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        let leaderboardText = "";
        for (let i = 0; i < leaderboard.length; i++) {
          const warrior = leaderboard[i];
          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          const wins = isRanked ? warrior.rankedWins : warrior.wins;
          const losses = isRanked ? warrior.rankedLosses : warrior.losses;
          const weightedScore = isRanked
            ? warrior.rankedWeightedScore
            : warrior.weightedScore;
          const winRate = isRanked ? warrior.rankedWinRate : warrior.winRate;

          leaderboardText += `${medal} **${warrior.userTag}** - ${weightedScore.toFixed(2)} WS (${wins}W-${losses}L, ${winRate}% WR)\n`;
        }

        const embed = new EmbedBuilder()
          .setColor(isRanked ? "#FF6B35" : "#FFD700")
          .setTitle(`🏆 ${isRanked ? "RANKED " : ""}HALL OF CHAMPIONS`)
          .setDescription(
            `**Top Warriors by ${isRanked ? "Ranked " : ""}Weighted Score**\n` +
              `*Minimum ${isRanked ? "5" : "3"} battles required*\n` +
              `*WS = Weighted Score, WR = Win Rate*\n\n` +
              leaderboardText,
          )
          .setFooter({
            text: `Fight your way to the top${isRanked ? " in ranked battles" : ""}!`,
          })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "history": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const mode = interaction.options.getString("mode") || "all";

        let rankedFilter: boolean | undefined;
        if (mode === "normal") rankedFilter = false;
        else if (mode === "ranked") rankedFilter = true;
        else rankedFilter = undefined; // all

        const history = await BattleStatsManager.getUserBattleHistory(
          targetUser.id,
          10,
          rankedFilter,
        );

        if (history.length === 0) {
          await interaction.reply({
            content: `**${targetUser.tag} has no ${mode === "all" ? "" : mode + " "}battle history!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        let historyText = "";
        for (const battle of history) {
          const isWinner = battle.winnerId === targetUser.id;
          const opponent = isWinner ? battle.loserTag : battle.winnerTag;
          const result = isWinner ? "🔥 **WON**" : "💀 **LOST**";
          const date = `<t:${Math.floor(new Date(battle.battleDate).getTime() / 1000)}:d>`;
          const battleType = battle.isRanked ? "🏆" : "⚔️";

          historyText += `${result} vs **${opponent}** ${battleType} (${battle.turns} turns) - ${date}\n`;
        }

        const embed = new EmbedBuilder()
          .setColor("#800080")
          .setTitle(`📜 ${mode.toUpperCase()} BATTLE CHRONICLES`)
          .setDescription(
            `Recent ${mode === "all" ? "" : mode + " "}battle history for **${targetUser.tag}**\n\n` +
              `${mode === "all" ? "🏆 = Ranked | ⚔️ = Normal\n\n" : ""}` +
              historyText,
          )
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  } catch (error) {
    console.error("Error fetching battle stats:", error);
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE FAILED TO RETRIEVE THE BATTLE RECORDS!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
