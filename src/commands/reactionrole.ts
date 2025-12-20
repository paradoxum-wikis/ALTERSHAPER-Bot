import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import {
  addReactionRoleRule,
  getReactionRoleRules,
  normalizeEmojiInput,
  removeReactionRoleRule,
  type ReactionRoleRule,
} from "../utils/reactionRoleStore.js";

function isSnowflake(s: string): boolean {
  return /^\d{15,25}$/.test(s);
}

function makeEmbed(params: {
  title: string;
  description: string;
  color: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(params.title)
    .setDescription(params.description)
    .setColor(params.color as any)
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName("reactionrole")
  .setDescription("Manage reaction roles")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Add a reaction role rule")
      .addStringOption((o) =>
        o
          .setName("message_id")
          .setDescription("The message ID to watch reactions on")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription(
            'Emoji to watch (unicode like "🖋️" or custom emoji mention like "<:name:id>")',
          )
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("role_id")
          .setDescription("Role ID to add/remove")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("channel_id")
          .setDescription(
            "Channel ID containing the message (defaults to current channel)",
          )
          .setRequired(false),
      )
      .addBooleanOption((o) =>
        o
          .setName("remove_on_unreact")
          .setDescription("If true, unreact removes the role (default: true)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("remove")
      .setDescription("Remove a reaction role rule")
      .addStringOption((o) =>
        o
          .setName("message_id")
          .setDescription("The message ID")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription("The emoji (same format you used when adding)")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("channel_id")
          .setDescription(
            "Channel ID containing the message (defaults to current channel)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("list")
      .setDescription("List reaction role rules for this server"),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;

  if (!guildId) {
    const embed = makeEmbed({
      title: "⚠️ REACTION ROLE",
      description: "This command can only be used in a server.",
      color: "#FFA500",
    });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "list") {
    const rules = getReactionRoleRules({ guildId });

    if (rules.length === 0) {
      const embed = makeEmbed({
        title: "📋 REACTION ROLE LIST",
        description: "No reaction role rules are configured for this server.",
        color: "#FFA500",
      });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = rules.map((r, i) => {
      const removeOnUnreact = r.removeOnUnreact ?? true;
      return [
        `**${i + 1}.**`,
        `channel=\`${r.channelId}\``,
        `message=\`${r.messageId}\``,
        `emoji=\`${r.emoji}\``,
        `role=\`${r.roleId}\``,
        `removeOnUnreact=\`${removeOnUnreact}\``,
      ].join(" ");
    });

    const embed = makeEmbed({
      title: "📋 REACTION ROLE LIST",
      description: lines.join("\n"),
      color: "#00FF00",
    });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "add") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messageId = interaction.options.getString("message_id", true).trim();
    const rawEmoji = interaction.options.getString("emoji", true);
    const emoji = normalizeEmojiInput(rawEmoji);

    const roleId = interaction.options.getString("role_id", true).trim();
    const channelId =
      interaction.options.getString("channel_id", false)?.trim() ??
      interaction.channelId;

    const removeOnUnreact =
      interaction.options.getBoolean("remove_on_unreact", false) ?? true;

    if (!isSnowflake(messageId)) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE ADD",
        description:
          "Invalid `message_id` (expected a numeric Discord snowflake).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }
    if (!isSnowflake(roleId)) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE ADD",
        description:
          "Invalid `role_id` (expected a numeric Discord snowflake).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }
    if (!isSnowflake(channelId)) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE ADD",
        description:
          "Invalid `channel_id` (expected a numeric Discord snowflake).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }
    if (!emoji || emoji.trim().length === 0) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE ADD",
        description: "Invalid `emoji` (must not be empty).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Besteffort that validates the message exists and is accessible.
    try {
      const channel = await interaction.guild?.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) {
        const embed = makeEmbed({
          title: "❌ REACTION ROLE ADD",
          description:
            "That channel either doesn't exist, isn't accessible, or doesn't support messages.",
          color: "#FF0000",
        });

        await interaction.editReply({
          embeds: [embed],
        });
        return;
      }
      await channel.messages.fetch(messageId);
    } catch {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE ADD",
        description:
          "I couldn't fetch that message. Check the message ID + channel ID, and ensure I have View Channel + Read Message History.",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const newRule: ReactionRoleRule = {
      guildId,
      channelId,
      messageId,
      emoji,
      roleId,
      removeOnUnreact,
    };

    const added = addReactionRoleRule(newRule);
    if (!added) {
      const embed = makeEmbed({
        title: "⚠️ REACTION ROLE ADD",
        description:
          "A rule already exists for that guild/channel/message/emoji combo.",
        color: "#FFA500",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const embed = makeEmbed({
      title: "✅ REACTION ROLE ADD",
      description: [
        "**Saved reaction role rule.**",
        "",
        `guild=\`${guildId}\``,
        `channel=\`${channelId}\``,
        `message=\`${messageId}\``,
        `emoji=\`${emoji}\``,
        `role=\`${roleId}\``,
        `removeOnUnreact=\`${removeOnUnreact}\``,
      ].join("\n"),
      color: "#00FF00",
    });

    await interaction.editReply({
      embeds: [embed],
    });
    return;
  }

  if (sub === "remove") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messageId = interaction.options.getString("message_id", true).trim();
    const rawEmoji = interaction.options.getString("emoji", true);
    const emoji = normalizeEmojiInput(rawEmoji);
    const channelId =
      interaction.options.getString("channel_id", false)?.trim() ??
      interaction.channelId;

    if (!isSnowflake(messageId)) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE REMOVE",
        description:
          "Invalid `message_id` (expected a numeric Discord snowflake).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }
    if (!isSnowflake(channelId)) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE REMOVE",
        description:
          "Invalid `channel_id` (expected a numeric Discord snowflake).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }
    if (!emoji || emoji.trim().length === 0) {
      const embed = makeEmbed({
        title: "❌ REACTION ROLE REMOVE",
        description: "Invalid `emoji` (must not be empty).",
        color: "#FF0000",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const removed = removeReactionRoleRule({
      guildId,
      channelId,
      messageId,
      emoji,
    });

    if (!removed) {
      const embed = makeEmbed({
        title: "⚠️ REACTION ROLE REMOVE",
        description: "No matching rule found to remove.",
        color: "#FFA500",
      });

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const embed = makeEmbed({
      title: "✅ REACTION ROLE REMOVE",
      description: [
        "**Removed reaction role rule.**",
        "",
        `guild=\`${guildId}\``,
        `channel=\`${channelId}\``,
        `message=\`${messageId}\``,
        `emoji=\`${emoji}\``,
      ].join("\n"),
      color: "#00FF00",
    });

    await interaction.editReply({
      embeds: [embed],
    });
    return;
  }

  const embed = makeEmbed({
    title: "❌ REACTION ROLE",
    description: "Unknown subcommand.",
    color: "#FF0000",
  });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
