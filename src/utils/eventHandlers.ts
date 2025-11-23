import {
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ChannelType,
  Interaction,
  Collection,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
  MessageFlags,
} from "discord.js";
import { Command } from "./commandLoader.js";
import { ReactionRoleHandler } from "./reactionRoleHandler.js";
import { RolePermissions } from "./rolePermissions.js";
import { CommandAccessManager } from "./commandAccessManager.js";

const WELCOME_CHANNEL_ID = "1366495690796040315";

export async function handleInteraction(
  interaction: Interaction,
  commands: Collection<string, Command>,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  if (
    !CommandAccessManager.canUseCommand(
      interaction.commandName,
      interaction.guildId,
    )
  ) {
    await interaction.reply({
      content: CommandAccessManager.getAccessDeniedMessage(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const member = interaction.member as GuildMember;
  if (!member) return;

  try {
    if (
      !RolePermissions.hasCommandPermission(member, interaction.commandName)
    ) {
      const errorMessage = RolePermissions.getPermissionErrorMessage(
        interaction.commandName,
      );
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      !RolePermissions.canUseCommandInChannel(
        member,
        interaction.channelId,
        interaction.commandName,
      )
    ) {
      await interaction.reply({
        content: RolePermissions.getChannelErrorMessage(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      interaction.commandName === "help" ||
      interaction.commandName === "info" ||
      interaction.commandName === "sins" ||
      interaction.commandName === "avatar" ||
      interaction.commandName === "archives" ||
      interaction.commandName === "link" ||
      interaction.commandName === "checklink" ||
      interaction.commandName === "syncroles"
    ) {
      await command.execute(interaction);
    } else {
      await command.execute(interaction, member);
    }
  } catch (error) {
    console.error("Error executing command:", error);

    const errorMessage =
      "**THE DIVINE POWERS HAVE ENCOUNTERED AN UNEXPECTED ERROR!**";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  const welcomeChannel = member.guild.channels.cache.get(
    WELCOME_CHANNEL_ID,
  ) as TextChannel;

  if (welcomeChannel && welcomeChannel.type === ChannelType.GuildText) {
    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🌟 A NEW SOUL ENTERS THE SACRED REALM")
      .setDescription(
        `**Welcome to the ALTER EGO Wiki Discord server, ${member.user.tag}!**\n\nThou hast entered the sacred halls of Alteruism!\nHere we honour our alter egos and embrace the righteous path!\n\nRead the sacred laws and contribute to our divine mission!\nKnow that defiance of Alteruism shall bring righteous correction!`,
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({
        text: "BOUND BY DUTY TO HONOUR OUR DIVINE ALTER EGO, WE ARE ALTER EGOISTS",
      })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed] });
  }
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("Failed to fetch reaction:", error);
      return;
    }
  }

  if (user.partial) {
    try {
      await user.fetch();
    } catch (error) {
      console.error("Failed to fetch user:", error);
      return;
    }
  }

  await ReactionRoleHandler.handleReactionAdd(
    reaction as MessageReaction,
    user as User,
  );
}

export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("Failed to fetch reaction:", error);
      return;
    }
  }

  if (user.partial) {
    try {
      await user.fetch();
    } catch (error) {
      console.error("Failed to fetch user:", error);
      return;
    }
  }

  await ReactionRoleHandler.handleReactionRemove(
    reaction as MessageReaction,
    user as User,
  );
}
