import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { LinkLogger } from "../utils/linkLogger.js";
import {
  FANDOM_ROLE_IDS,
  LINKED_ROLE_ID,
  STAFF_ROLE_ID,
  EDIT_COUNT_ROLE_IDS,
  TOP_CONTRIBUTORS_ROLE_ID,
} from "../utils/roleConstants.js";

export const data = new SlashCommandBuilder()
  .setName("removelink")
  .setDescription("Sever the link between a Discord soul and a Fandom alter")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The Discord soul to unlink from Fandom")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  executor: GuildMember,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "**THIS SACRED RITE CAN ONLY BE PERFORMED WITHIN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const targetMember = await interaction.guild.members
    .fetch(targetUser.id)
    .catch(() => null);

  try {
    const existingLink = await LinkLogger.getLinkByDiscordId(targetUser.id);

    if (!existingLink) {
      await interaction.reply({
        content: `**${targetUser.tag} HATH NO LINK TO SEVER! THE SOUL IS ALREADY UNBOUND FROM THE DIRAC SEA!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmationEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("⚠️ LINKING SEVERANCE")
      .setDescription(
        `**THOU ART ABOUT TO SEVER THE LINK BETWEEN DISCORD SOUL ${targetUser.tag} AND FANDOM ALTER: ${existingLink.fandomUsername}**`,
      )
      .addFields(
        {
          name: "🔒 PERMANENT ACTION",
          value:
            "**THIS SEVERANCE IS IRREVERSIBLE! THE USER MUST RE-LINK MANUALLY TO RESTORE THE LINK!**",
          inline: false,
        },
        {
          name: "📜 CONFIRMATION REQUIRED",
          value:
            "Click the button below within 60 seconds to proceed with the severance ritual.",
          inline: false,
        },
      )
      .setFooter({ text: "This confirmation expires in 60 seconds." })
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId("confirm_severance")
      .setLabel("Sever the Link")
      .setEmoji("♠️")
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel_severance")
      .setLabel("Cancel")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      cancelButton,
      confirmButton,
    );

    const response = await interaction.reply({
      embeds: [confirmationEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        componentType: ComponentType.Button,
        time: 60000,
      });

      if (confirmation.customId === "confirm_severance") {
        await confirmation.deferUpdate();
        await LinkLogger.removeLink(targetUser.id);

        if (targetMember) {
          const rolesToRemove = [
            LINKED_ROLE_ID,
            STAFF_ROLE_ID,
            TOP_CONTRIBUTORS_ROLE_ID,
            ...FANDOM_ROLE_IDS,
            ...EDIT_COUNT_ROLE_IDS,
          ].filter((roleId) => targetMember.roles.cache.has(roleId));

          if (rolesToRemove.length > 0) {
            try {
              await targetMember.roles.remove(rolesToRemove);
            } catch (roleError) {
              console.error("Failed to remove roles during unlink:", roleError);
            }
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("💔 LINKING SEVERED!")
          .setDescription(
            `**THE LINK BETWEEN ${targetUser.tag} AND FANDOM ALTER "${existingLink.fandomUsername}" HATH BEEN SEVERED!**`,
          )
          .addFields(
            {
              name: "EXECUTOR OF SEVERANCE",
              value: executor.user.tag,
              inline: true,
            },
            {
              name: "SEVERED LINK",
              value: `Discord: ${targetUser.tag}\nFandom: ${existingLink.fandomUsername}`,
              inline: true,
            },
            {
              name: "ROLES REMOVED",
              value: targetMember
                ? "All linked and Fandom-specific roles have been stripped."
                : "User not in server — roles could not be modified.",
              inline: false,
            },
          )
          .setTimestamp();

        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });

        try {
          await targetUser.send(
            `**THY LINK HATH BEEN SEVERED!**\n\nThy connection to the Fandom alter "${existingLink.fandomUsername}" has been severed by **${executor.user.tag}**.\n\nTo restore thy link, thou must use the /link command again and verify thy identity anew.`,
          );
        } catch (dmError) {
          console.log(`[REMOVELINK] Could not DM ${targetUser.tag}:`, dmError);
        }
      } else if (confirmation.customId === "cancel_severance") {
        await confirmation.update({
          content:
            "**THE SEVERANCE RITUAL HATH BEEN CANCELED. THE LINK REMAINS INTACT.**",
          embeds: [],
          components: [],
        });
      }
    } catch (error) {
      await interaction.editReply({
        content:
          "**⏰ THE SEVERANCE RITUAL HAS EXPIRED. NO CHANGES WERE MADE.**",
        embeds: [],
        components: [],
      });
    }
  } catch (error) {
    console.error("Error during account unlinking:", error);
    await interaction.reply({
      content:
        "**A DISTURBANCE IN THE SACRED HALLS! The severance ritual failed. The oracles are perplexed. Try again later, or consult the high scribes.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
