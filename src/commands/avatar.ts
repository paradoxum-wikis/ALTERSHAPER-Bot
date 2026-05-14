import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  User,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Behold the visage of a soul")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The soul whose visage thou seekest to view")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("global")
      .setDescription("Force global avatar/banner")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rawTargetUser = interaction.options.getUser("user") || interaction.user;
  const forceGlobal = interaction.options.getBoolean("global") ?? false;

  try {
    const targetUser: User = await rawTargetUser.fetch(true);
    const targetMember = forceGlobal
      ? null
      : (() => {
          const interactionMember =
            interaction.member instanceof GuildMember
              ? interaction.member
              : null;
          const optionMember = interaction.options.getMember("user");
          return optionMember instanceof GuildMember
            ? optionMember
            : interactionMember;
        })();

    const freshTargetMember = targetMember
      ? await targetMember.fetch(true)
      : null;

    const avatarHash = freshTargetMember?.avatar ?? targetUser.avatar;
    const isAnimatedAvatar = avatarHash?.startsWith("a_");
    const avatarURL =
      freshTargetMember?.displayAvatarURL({
        size: 512,
        extension: isAnimatedAvatar ? "gif" : "png",
      }) ??
      targetUser.displayAvatarURL({
        size: 512,
        extension: isAnimatedAvatar ? "gif" : "png",
      });

    const bannerHash = freshTargetMember?.banner ?? targetUser.banner;
    const isAnimatedBanner = bannerHash?.startsWith("a_");
    const bannerURL =
      freshTargetMember?.displayBannerURL({
        size: 1024,
        extension: isAnimatedBanner ? "gif" : "png",
      }) ||
      targetUser.bannerURL({
        size: 1024,
        extension: isAnimatedBanner ? "gif" : "png",
      });

    const embed = new EmbedBuilder()
      .setColor(targetUser.hexAccentColor || "#B2BEB5")
      .setTitle(`🖼️ VISAGE OF ${targetUser.tag.toUpperCase()}`)
      .setDescription(`[View Avatar](${avatarURL})`)
      .setImage(avatarURL);

    if (bannerURL) {
      embed.addFields({
        name: "Banner",
        value: `[View Banner](${bannerURL})`,
        inline: false,
      });
    } else if (targetUser.hexAccentColor) {
      embed.addFields({
        name: "Banner Color",
        value: `Hex: ${targetUser.hexAccentColor}`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error displaying avatar/banner:", error);
    await interaction.reply({
      content:
        "**Failed to retrieve user's visage! The soul may be elusive or one's divine profile hidden.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
