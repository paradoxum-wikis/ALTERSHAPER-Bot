import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { InterServerChat } from "../utils/interServerChat.js";
import crypto from "crypto";

const pendingLinks = new Map<
  string,
  { guildId: string; channelId: string; createdAt: number }
>();

setInterval(
  () => {
    const now = Date.now();
    for (const [token, data] of pendingLinks.entries()) {
      if (now - data.createdAt > 3600000) {
        // 1 hour
        pendingLinks.delete(token);
      }
    }
  },
  1000 * 60 * 60,
);

export const data = new SlashCommandBuilder()
  .setName("interchat")
  .setDescription("Manage inter-server chat connections")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Generate a connection token for this channel"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("join")
      .setDescription("Join a connection using a token")
      .addStringOption((option) =>
        option
          .setName("token")
          .setDescription("The connection token generated in the other server")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leave")
      .setDescription("Disconnect this channel from inter-server chat"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("Check connection status"),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: "This command can only be used in a server channel.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Inter-server chat only supports text channels.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "create") {
    const existingLink = InterServerChat.getLinks().find(
      (l) =>
        l.channelA === interaction.channelId ||
        l.channelB === interaction.channelId,
    );

    if (existingLink) {
      await interaction.reply({
        content:
          "❌ This channel is already linked to another channel. Use `/interchat leave` first.",
        ephemeral: true,
      });
      return;
    }

    const token = crypto.randomBytes(8).toString("hex");
    pendingLinks.set(token, {
      guildId: interaction.guildId!,
      channelId: interaction.channelId,
      createdAt: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setTitle("🔗 Connection Token Generated")
      .setDescription(
        `Use this token in another server to link the channels:\n\n\`${token}\`\n\n*This token is valid for 1 hour.*`,
      )
      .setColor("#00FF00");

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (subcommand === "join") {
    const token = interaction.options.getString("token", true);
    const pending = pendingLinks.get(token);

    if (!pending) {
      await interaction.reply({
        content: "❌ Invalid or expired token.",
        ephemeral: true,
      });
      return;
    }

    if (pending.channelId === interaction.channelId) {
      await interaction.reply({
        content: "❌ You cannot link a channel to itself.",
        ephemeral: true,
      });
      return;
    }

    const success = InterServerChat.addLink(
      pending.guildId,
      pending.channelId,
      interaction.guildId!,
      interaction.channelId,
    );

    if (success) {
      pendingLinks.delete(token);
      await interaction.reply({
        content: `✅ Successfully linked this channel with the remote channel!`,
      });
    } else {
      await interaction.reply({
        content:
          "❌ Failed to link channels. One of them might already be linked.",
        ephemeral: true,
      });
    }
  } else if (subcommand === "leave") {
    const success = InterServerChat.removeLink(interaction.channelId);

    if (success) {
      await interaction.reply({
        content: "✅ Inter-server link removed for this channel.",
      });
    } else {
      await interaction.reply({
        content: "❌ This channel is not currently linked.",
        ephemeral: true,
      });
    }
  } else if (subcommand === "status") {
    const links = InterServerChat.getLinks();
    const link = links.find(
      (l) =>
        l.channelA === interaction.channelId ||
        l.channelB === interaction.channelId,
    );

    if (link) {
      const isA = link.channelA === interaction.channelId;
      const partnerGuildId = isA ? link.guildB : link.guildA;
      const partnerChannelId = isA ? link.channelB : link.channelA;

      // Try to fetch guild name if possible (might not be in cache if bot restarted)
      const partnerGuild = interaction.client.guilds.cache.get(partnerGuildId);
      const partnerName = partnerGuild ? partnerGuild.name : partnerGuildId;

      await interaction.reply({
        content: `🤑 This channel is linked to **<#${partnerChannelId}>** in **${partnerName}**.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "ℹ️ This channel is not linked to any other server.",
        ephemeral: true,
      });
    }
  }
}
