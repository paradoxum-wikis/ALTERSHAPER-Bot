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
import { MessageLogger } from "../utils/messageLogger.js";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Purge up to 100 messages from the sacred halls")
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of messages to purge (1-100)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user whose messages you want to purge")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  const amount = interaction.options.getInteger("amount")!;
  const user = interaction.options.getUser("user");

  if (interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply({
      content:
        "**DIVINE PURIFICATION CAN ONLY BE PERFORMED IN GUILD CHANNELS!**",
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
    let messagesToDelete;
    let messagesArray;

    if (user) {
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });
      messagesToDelete = fetchedMessages
        .filter((m) => m.author.id === user.id)
        .first(amount);
      messagesArray = messagesToDelete;
    } else {
      messagesToDelete = await channel.messages.fetch({ limit: amount });
      messagesArray = Array.from(messagesToDelete.values());
    }

    if (messagesArray.length === 0) {
      const content = user
        ? "No messages found to delete for the specified user."
        : "No messages found to delete.";
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    const tempActionId = `C${Date.now()}`;

    if (messagesArray.length > 0) {
      await MessageLogger.logPurgedMessages(
        messagesArray,
        executor.user.tag,
        tempActionId,
      );
    }

    const deleted = await channel.bulkDelete(messagesToDelete, true);

    await ModerationLogger.addEntry({
      type: "clear",
      userId: user ? user.id : "N/A",
      userTag: user ? user.tag : "N/A",
      moderatorId: executor.id,
      moderatorTag: executor.user.tag,
      reason: user
        ? `Purged ${deleted.size} messages from ${user.tag} in #${channel.name}`
        : `Purged ${deleted.size} messages in #${channel.name}`,
      guildId: interaction.guild.id,
      messageCount: deleted.size,
    });

    const embed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("🧹 SACRED PURIFICATION COMPLETE")
      .setDescription(
        `**${deleted.size} messages have been cleansed from the sacred halls!**`,
      )
      .addFields(
        {
          name: "PURIFIER OF TRUTH",
          value: `${executor.user.tag}`,
          inline: true,
        },
        { name: "ACTION ID", value: `${tempActionId}`, inline: true },
        {
          name: "MESSAGES ARCHIVED",
          value: `${messagesArray.length} messages saved to the seraphic archives`,
          inline: true,
        },
        {
          name: "HOLY DECREE",
          value: "The halls of Alteruism must remain pure",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error during purge operation:", error);
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE BEEN THWARTED! The purification failed!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
