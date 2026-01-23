import {
  Client,
  Message,
  TextChannel,
  AttachmentBuilder,
  Webhook,
} from "discord.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_PATH = path.join(process.cwd(), "data", "interserver_links.json");

interface PoolChannel {
  channelId: string;
  guildId: string;
}

interface ChatPool {
  id: string;
  name: string;
  channels: PoolChannel[];
  createdAt: string;
}

interface InterServerData {
  pools: ChatPool[];
}

export class InterServerChat {
  private static data: InterServerData = { pools: [] };
  private static client: Client;

  public static initialize(client: Client): void {
    this.client = client;
    this.loadData();
    console.log(
      `[INTERSERVERCHAT] InterServerChat loaded with ${this.data.pools.length} pools.`,
    );
  }

  private static loadData(): void {
    if (!fs.existsSync(DATA_PATH)) {
      this.data = { pools: [] };
      this.saveData();
      return;
    }

    try {
      const fileData = fs.readFileSync(DATA_PATH, "utf-8");
      const parsed = JSON.parse(fileData);

      this.data = {
        pools: parsed.pools || [],
      };
    } catch (error) {
      console.error("❌ Failed to load interserver data:", error);
      this.data = { pools: [] };
    }
  }

  private static saveData(): void {
    try {
      const dir = path.dirname(DATA_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("❌ Failed to save interserver data:", error);
    }
  }

  public static createPool(name: string): string {
    const poolId = randomUUID();
    const pool: ChatPool = {
      id: poolId,
      name: name,
      channels: [],
      createdAt: new Date().toISOString(),
    };
    this.data.pools.push(pool);
    this.saveData();
    return poolId;
  }

  public static addChannelToPool(
    poolId: string,
    channelId: string,
    guildId: string,
  ): boolean {
    const pool = this.data.pools.find((p) => p.id === poolId);
    if (!pool) return false;

    if (this.getPoolByChannel(channelId)) {
      return false;
    }

    if (pool.channels.some((c) => c.channelId === channelId)) {
      return false;
    }

    pool.channels.push({ channelId, guildId });
    this.saveData();
    return true;
  }

  public static removeChannelFromPool(
    poolId: string,
    channelId: string,
  ): boolean {
    const pool = this.data.pools.find((p) => p.id === poolId);
    if (!pool) return false;

    const initialLength = pool.channels.length;
    pool.channels = pool.channels.filter((c) => c.channelId !== channelId);

    if (pool.channels.length !== initialLength) {
      this.saveData();
      return true;
    }
    return false;
  }

  public static deletePool(poolId: string): boolean {
    const initialLength = this.data.pools.length;
    this.data.pools = this.data.pools.filter((p) => p.id !== poolId);

    if (this.data.pools.length !== initialLength) {
      this.saveData();
      return true;
    }
    return false;
  }

  public static getPool(poolId: string): ChatPool | null {
    return this.data.pools.find((p) => p.id === poolId) || null;
  }

  public static getPoolByChannel(channelId: string): ChatPool | null {
    return (
      this.data.pools.find((pool) =>
        pool.channels.some((c) => c.channelId === channelId),
      ) || null
    );
  }

  public static getPools(): ChatPool[] {
    return [...this.data.pools];
  }

  public static getPoolByName(name: string): ChatPool | null {
    return (
      this.data.pools.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      ) || null
    );
  }

  public static renamePool(poolId: string, newName: string): boolean {
    const pool = this.data.pools.find((p) => p.id === poolId);
    if (!pool) return false;

    pool.name = newName;
    this.saveData();
    return true;
  }

  private static async getWebhook(channel: TextChannel): Promise<Webhook> {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(
      (wh) =>
        wh.name === "Altershaper Relay" &&
        wh.owner?.id === this.client.user?.id,
    );

    if (!webhook) {
      webhook = await channel.createWebhook({
        name: "Altershaper Relay",
        avatar: this.client.user?.displayAvatarURL(),
      });
    }

    return webhook;
  }

  private static async relayToChannel(
    targetGuildId: string,
    targetChannelId: string,
    message: Message,
    content: string,
    files: AttachmentBuilder[],
  ): Promise<void> {
    const targetGuild = this.client.guilds.cache.get(targetGuildId);
    if (!targetGuild) return;

    const targetChannel = targetGuild.channels.cache.get(
      targetChannelId,
    ) as TextChannel;
    if (!targetChannel || !targetChannel.isTextBased()) return;

    try {
      const webhook = await this.getWebhook(targetChannel);
      const displayName =
        message.member?.displayName || message.author.username;

      await webhook.send({
        content: content || "",
        username: `${displayName} • ${message.guild!.name}`,
        avatarURL: message.author.displayAvatarURL(),
        files: files,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(
        `[INTERSERVERCHAT] Failed to relay message to ${targetGuild.name}:`,
        error,
      );
    }
  }

  public static async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild || !message.channel) return;

    const pool = this.getPoolByChannel(message.channel.id);
    if (!pool) return;

    const files: AttachmentBuilder[] = message.attachments.map(
      (attachment) =>
        new AttachmentBuilder(attachment.url, { name: attachment.name }),
    );

    let content = message.content;

    const messageSnapshots = message.messageSnapshots;
    const isForwarded = messageSnapshots && messageSnapshots.size > 0;

    if (isForwarded) {
      const snapshot = messageSnapshots.first();
      const forwardedContent = snapshot?.content || "";

      let forwardPreview = forwardedContent;
      if (!forwardPreview) {
        if (snapshot?.attachments && snapshot.attachments.size > 0)
          forwardPreview = "*[Attachment]*";
        else if (snapshot?.embeds && snapshot.embeds.length > 0)
          forwardPreview = "*[Embed]*";
        else if (snapshot?.stickers && snapshot.stickers.size > 0)
          forwardPreview = "*[Sticker]*";
        else forwardPreview = "*[Unknown]*";
      }

      if (forwardPreview.length > 360) {
        forwardPreview = forwardPreview.substring(0, 360) + "...";
      }
      forwardPreview = forwardPreview.replace(/\n/g, " ");

      content = `> 📨 **Forwarded message:** ${forwardPreview}\n${content}`;
    } else if (message.reference && message.reference.messageId) {
      try {
        const refMessage = await message.channel.messages.fetch(
          message.reference.messageId,
        );

        const refAuthor =
          refMessage.member?.displayName || refMessage.author.username;

        let refContent = refMessage.content;
        if (refContent) {
          const lines = refContent.split("\n");
          const firstLine = lines[0] ?? "";
          if (firstLine.startsWith("> ↩️ ")) {
            refContent = lines.slice(1).join("\n").trimStart();
          } else if (firstLine.startsWith("> 📨 ")) {
            refContent = lines.slice(1).join("\n").trimStart();
          }
        }

        if (!refContent) {
          if (refMessage.attachments.size > 0) refContent = "*[Attachment]*";
          else if (refMessage.embeds.length > 0) refContent = "*[Embed]*";
          else if (refMessage.stickers.size > 0) refContent = "*[Sticker]*";
          else refContent = "*[Unknown]*";
        }

        if (refContent.length > 360) {
          refContent = refContent.substring(0, 360) + "...";
        }
        refContent = refContent.replace(/\n/g, " ");

        content = `> ↩️ **${refAuthor}:** ${refContent}\n${content}`;
      } catch (error) {
        content = `> ↩️ *[Reply to unknown message]*\n${content}`;
      }
    }

    let stickerText = "";
    if (message.stickers.size > 0) {
      const stickerNames = message.stickers.map((s) => s.name).join(", ");
      stickerText = `*[Sticker: ${stickerNames}]*`;
    }

    let finalContent = content;
    if (!content && files.length === 0 && stickerText) {
      finalContent = stickerText;
    } else if (stickerText) {
      finalContent = content ? `${content}\n${stickerText}` : stickerText;
    } else if (!content && files.length === 0) {
      finalContent = "*[Empty message]*";
    }

    const targets = pool.channels.filter(
      (c) => c.channelId !== message.channel.id,
    );

    for (const target of targets) {
      await this.relayToChannel(
        target.guildId,
        target.channelId,
        message,
        finalContent,
        files,
      );
    }
  }
}
