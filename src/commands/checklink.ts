import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { LinkLogger } from "../utils/linkLogger.js";
import { TOP_CONTRIBUTORS_ROLE_ID } from "../utils/roleConstants.js";
import { TopContributorsManager } from "../utils/topContributors.js";
import { FandomRoleManager } from "../utils/fandomRoleManager.js";

interface FandomUserQueryUser {
  userid: number;
  name: string;
  missing?: string;
  groups?: string[];
  editcount?: number;
  registration?: string;
  gender?: string;
}

interface FandomUserQueryResponse {
  batchcomplete: string;
  query?: {
    users: FandomUserQueryUser[];
  };
}

export const data = new SlashCommandBuilder()
  .setName("checklink")
  .setDescription("Check if a user is linked to Fandom and sync roles")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The Discord soul to check")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const targetMember = await interaction.guild?.members
    .fetch(targetUser.id)
    .catch(() => null);

  if (!interaction.guild) {
    await interaction.reply({
      content:
        "**THIS SACRED RITE CAN ONLY BE PERFORMED WITHIN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!targetMember) {
    await interaction.reply({
      content: "**THE TARGET SOUL IS NOT PRESENT IN THESE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const existingLink = await LinkLogger.getLinkByDiscordId(targetUser.id);

    if (!existingLink) {
      const embed = new EmbedBuilder()
        .setColor("#808080")
        .setTitle("🔍 LINK STATUS CHECK")
        .setDescription(
          `**${targetUser.tag} is not bound to any Fandom alter!**`,
        )
        .addFields({
          name: "STATUS",
          value: "Unlinked",
          inline: true,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    console.log(
      `[CHECKLINK] Checking user: ${targetUser.tag} linked to: ${existingLink.fandomUsername}`,
    );

    const userQueryUrl = `https://alter-ego.fandom.com/api.php?action=query&format=json&list=users&ususers=${encodeURIComponent(
      existingLink.fandomUsername,
    )}&usprop=groups%7Cgender%7Cregistration%7Ceditcount`;
    const userQueryResponse = await fetch(userQueryUrl);

    if (!userQueryResponse.ok) {
      throw new Error(
        `MediaWiki API responded with status: ${userQueryResponse.status}`,
      );
    }
    const userQueryData =
      (await userQueryResponse.json()) as FandomUserQueryResponse;

    let fandomGroups: string[] = [];
    let fandomDataStatus = "Active";

    if (
      !userQueryData.query ||
      !userQueryData.query.users ||
      userQueryData.query.users.length === 0
    ) {
      fandomDataStatus = "Fandom user not found";
    } else {
      const fandomUser = userQueryData.query.users[0];
      if (fandomUser.missing !== undefined) {
        fandomDataStatus = "Fandom user not found";
      } else {
        fandomGroups = fandomUser.groups || [];
      }
    }

    console.log(
      `[CHECKLINK] Fandom groups found: ${JSON.stringify(fandomGroups)}`,
    );
    console.log(`[CHECKLINK] Fandom data status: ${fandomDataStatus}`);

    let rolesSynced = false;
    let grantedRoleNames: string[] = [];
    let failedRoleNames: string[] = [];
    let topContributorResult: any = { roleGranted: false, roleRemoved: false };

    if (fandomDataStatus === "Active") {
      console.log(
        `[CHECKLINK] Starting role sync for ${existingLink.fandomUsername}`,
      );

      const roleResult = await FandomRoleManager.manageFandomRoles(
        targetMember,
        fandomGroups,
        interaction.guild,
        existingLink.fandomUsername,
      );
      grantedRoleNames = roleResult.grantedRoleNames;
      failedRoleNames = roleResult.failedRoleNames;

      console.log(
        `[CHECKLINK] Fandom roles granted: ${JSON.stringify(grantedRoleNames)}`,
      );
      console.log(
        `[CHECKLINK] Fandom roles failed: ${JSON.stringify(failedRoleNames)}`,
      );

      topContributorResult =
        await TopContributorsManager.manageTopContributorRole(
          targetMember,
          existingLink.fandomUsername,
        );

      console.log(
        `[CHECKLINK] Top contributor result: ${JSON.stringify(topContributorResult)}`,
      );

      rolesSynced = true;
    }

    const embed = new EmbedBuilder()
      .setColor(fandomDataStatus === "Active" ? "#00FF00" : "#FFA500")
      .setTitle("🔍 LINK STATUS CHECK & SYNC")
      .setDescription(
        `**${targetUser.tag} is bound to the Fandom alter: ${existingLink.fandomUsername}**`,
      )
      .addFields(
        {
          name: "DISCORD USER",
          value: `${targetUser.tag}`,
          inline: true,
        },
        {
          name: "FANDOM ALTER",
          value: `${existingLink.fandomUsername}`,
          inline: true,
        },
        {
          name: "LINKED ON",
          value: `<t:${Math.floor(
            new Date(existingLink.linkedAt).getTime() / 1000,
          )}:F>`,
          inline: true,
        },
      );

    if (rolesSynced) {
      let allGrantedRoles = [...grantedRoleNames];
      console.log(
        `[CHECKLINK] Initial allGrantedRoles: ${JSON.stringify(
          allGrantedRoles,
        )}`,
      );

      if (topContributorResult.roleGranted || topContributorResult.rank) {
        const topRole = interaction.guild?.roles.cache.get(
          TOP_CONTRIBUTORS_ROLE_ID,
        );
        console.log(
          `[CHECKLINK] Top contributor role check - granted: ${topContributorResult.roleGranted}, rank: ${topContributorResult.rank}, found role: ${topRole?.name} (ID: ${TOP_CONTRIBUTORS_ROLE_ID})`,
        );
        if (topRole) allGrantedRoles.push(topRole.name);
      }

      console.log(
        `[CHECKLINK] Final allGrantedRoles: ${JSON.stringify(allGrantedRoles)}`,
      );

      const roleMentions = FandomRoleManager.createRoleMentions(
        allGrantedRoles,
        interaction.guild,
      );

      console.log(`[CHECKLINK] Role mentions generated: ${roleMentions}`);

      embed.addFields({ name: "ROLES SYNCHRONIZED", value: roleMentions });

      if (topContributorResult.rank) {
        embed.addFields({
          name: "TOP CONTRIBUTOR STATUS",
          value: `**🏆 Rank #${topContributorResult.rank}** in current week's top contributors!`,
        });
      } else if (topContributorResult.roleRemoved) {
        embed.addFields({
          name: "TOP CONTRIBUTOR STATUS",
          value: "No longer in top 5 contributors - role removed.",
        });
      }

      if (failedRoleNames.length > 0) {
        embed.addFields({
          name: "ROLE SYNC ISSUES",
          value: `Failed to grant: ${failedRoleNames
            .map((rName) => `\`${rName}\``)
            .join(", ")}.`,
        });
        embed.setColor("#FFA500");
      }

      if (fandomGroups.length > 0) {
        embed.addFields({
          name: "FANDOM GROUPS",
          value: fandomGroups.map((group) => `\`${group}\``).join(", "),
        });
      }
    }

    if (fandomDataStatus !== "Active") {
      embed.addFields({
        name: "⚠️ WARNING",
        value: "The linked Fandom account could not be found.",
      });
    }

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error during link check:", error);
    await interaction.reply({
      content:
        "**A DISTURBANCE IN THE SACRED HALLS! The link check ritual failed. The oracles are perplexed. Try again later, or consult the high scribes.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
