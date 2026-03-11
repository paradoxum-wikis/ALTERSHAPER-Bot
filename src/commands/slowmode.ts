import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { ModerationLogger } from "../utils/moderationLogger.js";

export const data = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Impose restraint upon the flow of messages")
  .addIntegerOption((option) =>
    option
      .setName("seconds")
      .setDescription("Duration of slowmode in seconds (0-21600, 0 to disable)")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(21600),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for imposing restraint")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const seconds = interaction.options.getInteger("seconds")!;
  const reason =
    interaction.options.getString("reason") || "Maintaining sacred order";

  if (interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "**RESTRAINT CAN ONLY BE IMPOSED IN GUILD CHANNELS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS HOLY COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel as TextChannel;

  try {
    await channel.setRateLimitPerUser(seconds, reason);

    await ModerationLogger.addEntry({
      type: "slowmode" as never,
      userId: "N/A",
      userTag: "N/A",
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: `${seconds === 0 ? "Disabled" : "Set"} slowmode in #${channel.name}${seconds > 0 ? ` (${seconds}s)` : ""}`,
      guildId: interaction.guild.id,
      duration: seconds > 0 ? seconds : undefined,
    });

    const embed = new EmbedBuilder()
      .setColor(seconds === 0 ? "#00FF00" : "#FFD700")
      .setTitle(seconds === 0 ? "💨 RESTRAINT LIFTED" : "⛈️ RESTRAINT IMPOSED")
      .setDescription(
        seconds === 0
          ? `**The flow of messages in ${channel} hath been restored to normal pace!**`
          : `**Restraint hath been imposed upon ${channel}! The alters are not happy.**`,
      )
      .addFields(
        {
          name: "ENFORCER OF RESTRAINT",
          value: `${executor.user.tag}`,
          inline: true,
        },
        {
          name: "CHANNEL",
          value: `${channel}`,
          inline: true,
        },
        {
          name: seconds === 0 ? "STATUS" : "RESTRAINT DURATION",
          value:
            seconds === 0
              ? "Slowmode disabled"
              : `${seconds} seconds between messages`,
          inline: true,
        },
        { name: "REASON FOR RESTRAINT", value: reason, inline: false },
        {
          name: "DIVINE WISDOM",
          value:
            seconds === 0
              ? "The faithful may once again speak freely in the sacred halls"
              : "Patience brings wisdom, and wisdom brings understanding",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error setting slowmode:", error);
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE BEEN THWARTED! The restraint could not be imposed!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
