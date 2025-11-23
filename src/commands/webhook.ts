import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { WebhookManager } from "../utils/webhookManager.js";

export const data = new SlashCommandBuilder()
  .setName("webhook")
  .setDescription("Manage the bot's webhooks for automated messaging")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a new webhook in a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to create webhook in")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Custom name for the webhook")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a webhook")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name of the webhook to delete")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("test")
      .setDescription("Test a webhook by sending a message")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Test message to send")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("webhook")
          .setDescription("Name of the webhook to use")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List all of ALTERSHAPER's webhooks in this server"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Check webhook status")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name of the webhook to check")
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "**THIS COMMAND CAN ONLY BE USED IN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "create": {
        const channel = interaction.options.getChannel("channel", true);
        const webhookName = interaction.options.getString("name") ?? undefined;

        if (!(channel instanceof TextChannel)) {
          await interaction.reply({
            content: "**THOU MUST SELECT A TEXT CHANNEL!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await WebhookManager.initializeWebhook(
          interaction.guild,
          channel.id,
          webhookName,
        );

        const embed = new EmbedBuilder()
          .setTitle("🔗 WEBHOOK CREATION")
          .setDescription(result.message)
          .setColor(result.success ? "#00FF00" : "#FF0000")
          .setTimestamp();

        if (result.success && result.webhook) {
          embed.addFields({
            name: "URL",
            value: `\`${result.webhook.url}\``,
          });
        }

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "delete": {
        const webhookName = interaction.options.getString("name") ?? undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const deleted = await WebhookManager.deleteWebhook(
          interaction.guild,
          webhookName,
        );

        const embed = new EmbedBuilder()
          .setTitle("🗑️ WEBHOOK DELETION")
          .setDescription(
            deleted
              ? `**The webhook${webhookName ? ` "${webhookName}"` : ""} hath been banished from the realm!**`
              : `**No webhook${webhookName ? ` named "${webhookName}"` : ""} found to banish!**`,
          )
          .setColor(deleted ? "#00FF00" : "#FFA500")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "test": {
        const testMessage =
          interaction.options.getString("message") ??
          "**Behold! This is a test message from the Altershaper's herald!**";
        const webhookName =
          interaction.options.getString("webhook") ?? undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sent = await WebhookManager.sendMessage(
          interaction.guild,
          testMessage,
          {
            username: "Altershaper's Herald",
            webhookName: webhookName,
          },
        );

        const embed = new EmbedBuilder()
          .setTitle("🧪 WEBHOOK TEST")
          .setDescription(
            sent
              ? `**Test message sent successfully${webhookName ? ` via "${webhookName}"` : ""}!**`
              : `**Failed to send test message! Check webhook${webhookName ? ` "${webhookName}"` : ""} status.**`,
          )
          .setColor(sent ? "#00FF00" : "#FF0000")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "list": {
        const webhooks = WebhookManager.getGuildWebhooks(interaction.guild);

        const embed = new EmbedBuilder()
          .setTitle("📋 WEBHOOK LIST")
          .setColor("#00FF00")
          .setTimestamp();

        if (webhooks.length === 0) {
          embed.setDescription("**No webhooks found in this server.**");
        } else {
          const webhookList = webhooks
            .map((w) => {
              const createdDate = new Date(w.createdAt).toLocaleDateString();
              return `**${w.name}** - <#${w.channelId}> (${createdDate})`;
            })
            .join("\n");

          embed.setDescription(
            `**Found ${webhooks.length} webhook(s):**\n\n${webhookList}`,
          );
        }

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "status": {
        const webhookName = interaction.options.getString("name") ?? undefined;
        const webhook = await WebhookManager.getWebhook(
          interaction.guild,
          webhookName,
        );

        const embed = new EmbedBuilder()
          .setTitle("📊 WEBHOOK STATUS")
          .setColor(webhook ? "#00FF00" : "#FFA500")
          .setTimestamp();

        if (webhook) {
          const channel = interaction.guild.channels.cache.get(
            webhook.channelId,
          );
          const webhookEntry = WebhookManager.getGuildWebhooks(
            interaction.guild,
          ).find((w) => w.id === webhook.id);

          embed
            .setDescription(
              `**Webhook "${webhookEntry?.name || "Unknown"}" Status: ACTIVE**`,
            )
            .addFields(
              {
                name: "📍 Channel",
                value: channel ? `<#${channel.id}>` : "Unknown",
                inline: true,
              },
              {
                name: "🏷️ Name",
                value: webhookEntry?.name || "Unnamed",
                inline: true,
              },
              {
                name: "🆔 ID",
                value: webhook.id,
                inline: true,
              },
              {
                name: "📅 Created",
                value: webhookEntry
                  ? new Date(webhookEntry.createdAt).toLocaleDateString()
                  : "Unknown",
                inline: true,
              },
            );
        } else {
          const availableWebhooks = WebhookManager.getGuildWebhooks(
            interaction.guild,
          );
          let description = `**Webhook${
            webhookName ? ` "${webhookName}"` : ""
          } Status: INACTIVE**\n\n`;

          if (availableWebhooks.length > 0) {
            description += `Available webhooks: ${availableWebhooks
              .map((w) => w.name)
              .join(", ")}`;
          } else {
            description +=
              "No webhooks found. Use `/webhook create` to create one.";
          }

          embed.setDescription(description);
        }

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
    }
  } catch (error) {
    console.error("Error in webhook command:", error);
    await interaction.reply({
      content:
        "**A DISTURBANCE IN THE SACRED REALM! The webhook ritual failed.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
