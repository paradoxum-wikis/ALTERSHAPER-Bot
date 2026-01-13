import {
  Guild,
  TextChannel,
  Webhook,
  EmbedBuilder,
  WebhookMessageCreateOptions,
} from "discord.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface WebhookEntry {
  id: string;
  token: string;
  channelId: string;
  guildId: string;
  name: string;
  createdAt: number;
}

interface WebhookData {
  webhooks: WebhookEntry[];
  nextHeraldNumber: number;
}

export class WebhookManager {
  private static webhookData: WebhookData | null = null;
  private static readonly WEBHOOK_DATA_FILE = join(
    process.cwd(),
    "data",
    "webhook.json",
  );

  /**
   * Load webhook data from file
   */
  private static loadWebhookData(): void {
    try {
      const data = readFileSync(this.WEBHOOK_DATA_FILE, "utf-8");
      const parsed = JSON.parse(data);
      this.webhookData =
        parsed && parsed.webhooks
          ? parsed
          : { webhooks: [], nextHeraldNumber: 1 };
      if (
        this.webhookData &&
        typeof this.webhookData.nextHeraldNumber !== "number"
      ) {
        this.webhookData.nextHeraldNumber = 1;
      }
    } catch (error) {
      console.log("[WEBHOOKMANAGER] Initializing new webhook data file");
      this.webhookData = { webhooks: [], nextHeraldNumber: 1 };
    }
  }

  /**
   * Save webhook data to file
   */
  private static saveWebhookData(): void {
    if (this.webhookData) {
      const dataDir = join(process.cwd(), "data");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        this.WEBHOOK_DATA_FILE,
        JSON.stringify(this.webhookData, null, 2),
      );
    }
  }

  /**
   * Get the webhook avatar from webhook.png file
   */
  private static getWebhookAvatar(): string | undefined {
    const backgroundFile = "webhook.png";
    const possiblePaths = [
      join(process.cwd(), "src", backgroundFile),
      join(process.cwd(), "dist", backgroundFile),
      join(process.cwd(), "altershaper-bot", "dist", backgroundFile),
    ];

    for (const filePath of possiblePaths) {
      try {
        const imageBuffer = readFileSync(filePath);
        const base64Image = imageBuffer.toString("base64");
        return `data:image/png;base64,${base64Image}`;
      } catch (error) {
        continue;
      }
    }

    console.warn(
      "webhook.png not found in any of the expected locations:",
      possiblePaths,
    );
    return undefined;
  }

  /**
   * Create a new webhook in the specified channel
   */
  public static async createWebhook(
    channel: TextChannel,
    name: string = "Altershaper's Herald",
    customName?: string,
  ): Promise<Webhook | null> {
    try {
      if (
        !channel
          .permissionsFor(channel.guild.members.me!)
          ?.has("ManageWebhooks")
      ) {
        throw new Error(
          "Bot lacks permission to manage webhooks in this channel",
        );
      }

      if (!this.webhookData) {
        this.loadWebhookData();
      }

      if (!this.webhookData) {
        throw new Error("Failed to initialize webhook data");
      }

      const finalName =
        customName || `herald_${this.webhookData.nextHeraldNumber}`;

      const existingWebhook = this.webhookData.webhooks.find(
        (w) => w.guildId === channel.guild.id && w.name === finalName,
      );

      if (existingWebhook) {
        throw new Error(
          `Webhook with name "${finalName}" already exists in this guild`,
        );
      }

      const webhookAvatar = this.getWebhookAvatar();

      const webhook = await channel.createWebhook({
        name: name,
        avatar: webhookAvatar,
        reason: "Automated webhook creation for bot messaging",
      });

      const webhookEntry: WebhookEntry = {
        id: webhook.id,
        token: webhook.token!,
        channelId: channel.id,
        guildId: channel.guild.id,
        name: finalName,
        createdAt: Date.now(),
      };

      this.webhookData.webhooks.push(webhookEntry);

      if (!customName) {
        this.webhookData.nextHeraldNumber++;
      }

      this.saveWebhookData();

      return webhook;
    } catch (error) {
      console.error("Error creating webhook:", error);
      return null;
    }
  }

  /**
   * Get a specific webhook by name
   */
  public static async getWebhook(
    guild: Guild,
    webhookName?: string,
  ): Promise<Webhook | null> {
    if (!this.webhookData) {
      this.loadWebhookData();
    }

    if (!this.webhookData) {
      console.error("Failed to load webhook data");
      return null;
    }

    const guildWebhooks = this.webhookData.webhooks.filter(
      (w) => w.guildId === guild.id,
    );

    if (guildWebhooks.length === 0) {
      return null;
    }

    const targetWebhook = webhookName
      ? guildWebhooks.find((w) => w.name === webhookName)
      : guildWebhooks[0];

    if (!targetWebhook) {
      return null;
    }

    try {
      const webhook = await guild.client.fetchWebhook(
        targetWebhook.id,
        targetWebhook.token,
      );
      return webhook;
    } catch (error) {
      console.error("Error fetching webhook:", error);
      return null;
    }
  }

  /**
   * Get all webhooks for a guild
   */
  public static getGuildWebhooks(guild: Guild): WebhookEntry[] {
    if (!this.webhookData) {
      this.loadWebhookData();
    }

    if (!this.webhookData) {
      console.error("Failed to load webhook data");
      return [];
    }

    return this.webhookData.webhooks.filter((w) => w.guildId === guild.id);
  }

  /**
   * Delete a specific webhook
   */
  public static async deleteWebhook(
    guild: Guild,
    webhookName?: string,
  ): Promise<boolean> {
    if (!this.webhookData) {
      this.loadWebhookData();
    }

    if (!this.webhookData) {
      console.error("Failed to load webhook data");
      return false;
    }

    const webhookIndex = this.webhookData.webhooks.findIndex(
      (w) =>
        w.guildId === guild.id && (webhookName ? w.name === webhookName : true),
    );

    if (webhookIndex === -1) {
      return false;
    }

    const webhookEntry = this.webhookData.webhooks[webhookIndex];

    try {
      const webhook = await guild.client.fetchWebhook(
        webhookEntry.id,
        webhookEntry.token,
      );
      await webhook.delete("Cleaning up webhook");

      this.webhookData.webhooks.splice(webhookIndex, 1);
      this.saveWebhookData();
      return true;
    } catch (error) {
      console.error("Error deleting webhook:", error);
      // Remove from data even if Discord API call failed
      this.webhookData.webhooks.splice(webhookIndex, 1);
      this.saveWebhookData();
      return true;
    }
  }

  /**
   * Send a message via webhook
   */
  public static async sendMessage(
    guild: Guild,
    content: string,
    options?: {
      embeds?: EmbedBuilder[];
      username?: string;
      avatarURL?: string;
      webhookName?: string;
    },
  ): Promise<boolean> {
    const webhook = await this.getWebhook(guild, options?.webhookName);
    if (!webhook) {
      console.error("No webhook available for sending message");
      return false;
    }

    try {
      const messageOptions: WebhookMessageCreateOptions = {
        content: content,
        embeds: options?.embeds?.map((embed) => embed.toJSON()),
        username: options?.username,
        avatarURL: options?.avatarURL,
      };

      await webhook.send(messageOptions);
      return true;
    } catch (error) {
      console.error("Error sending webhook message:", error);
      return false;
    }
  }

  /**
   * Send an embed via webhook
   */
  public static async sendEmbed(
    guild: Guild,
    embed: EmbedBuilder,
    options?: {
      username?: string;
      avatarURL?: string;
      webhookName?: string;
    },
  ): Promise<boolean> {
    return this.sendMessage(guild, "", {
      embeds: [embed],
      ...options,
    });
  }

  /**
   * Initialize webhook for a guild (create if doesn't exist)
   */
  public static async initializeWebhook(
    guild: Guild,
    channelId?: string,
    webhookName?: string,
  ): Promise<{
    success: boolean;
    message: string;
    webhook?: import("discord.js").Webhook;
  }> {
    try {
      let webhook = await this.getWebhook(guild, webhookName);

      if (webhook) {
        return {
          success: true,
          message: `Webhook "${webhookName || "default"}" already exists and is functional`,
          webhook,
        };
      }

      let targetChannel: TextChannel | null = null;

      if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel instanceof TextChannel) {
          targetChannel = channel;
        }
      }

      if (!targetChannel) {
        const generalChannel = guild.channels.cache.find(
          (channel) =>
            channel instanceof TextChannel &&
            (channel.name.includes("general") ||
              channel.name.includes("main") ||
              channel.name.includes("chat")),
        ) as TextChannel;

        if (generalChannel) {
          targetChannel = generalChannel;
        } else {
          targetChannel = guild.channels.cache.find(
            (channel) =>
              channel instanceof TextChannel &&
              channel.permissionsFor(guild.members.me!)?.has("SendMessages"),
          ) as TextChannel;
        }
      }

      if (!targetChannel) {
        return {
          success: false,
          message: "No suitable text channel found to create webhook",
        };
      }

      const displayName =
        webhookName || `herald_${this.webhookData?.nextHeraldNumber || 1}`;
      webhook = await this.createWebhook(
        targetChannel,
        "Altershaper's Herald",
        webhookName, // Pass the original webhookName since it could be undefined
      );

      if (webhook) {
        return {
          success: true,
          message: `Webhook "${displayName}" created successfully in #${targetChannel.name}`,
          webhook,
        };
      } else {
        return { success: false, message: "Failed to create webhook" };
      }
    } catch (error) {
      console.error("Error initializing webhook:", error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
