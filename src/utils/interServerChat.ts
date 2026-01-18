import {
  Client,
  Message,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
  Webhook,
} from "discord.js";
import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "interserver_links.json");

interface ChannelLink {
  channelA: string;
  guildA: string;
  channelB: string;
  guildB: string;
}

export class InterServerChat {
  private static links: ChannelLink[] = [];
  private static client: Client;

  public static initialize(client: Client): void {
    this.client = client;
    this.loadLinks();
    console.log(
      `[INTERSERVERCHAT] InterServerChat loaded with ${this.links.length} links.`,
    );
  }

  private static loadLinks(): void {
    if (!fs.existsSync(DATA_PATH)) {
      this.links = [];
      this.saveLinks();
      return;
    }

    try {
      const data = fs.readFileSync(DATA_PATH, "utf-8");
      this.links = JSON.parse(data);
    } catch (error) {
      console.error("❌ Failed to load inter-server links:", error);
      this.links = [];
    }
  }

  private static saveLinks(): void {
    try {
      const dir = path.dirname(DATA_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DATA_PATH, JSON.stringify(this.links, null, 2));
    } catch (error) {
      console.error("❌ Failed to save inter-server links:", error);
    }
  }

  public static addLink(
    guildA: string,
    channelA: string,
    guildB: string,
    channelB: string,
  ): boolean {
    if (this.getPartnerChannel(channelA) || this.getPartnerChannel(channelB)) {
      return false;
    }

    this.links.push({ channelA, guildA, channelB, guildB });
    this.saveLinks();
    return true;
  }

  public static removeLink(channelId: string): boolean {
    const initialLength = this.links.length;
    this.links = this.links.filter(
      (link) => link.channelA !== channelId && link.channelB !== channelId,
    );

    if (this.links.length !== initialLength) {
      this.saveLinks();
      return true;
    }
    return false;
  }

  public static getLinks(): ChannelLink[] {
    return [...this.links];
  }

  private static getPartnerChannel(channelId: string): {
    channelId: string;
    guildId: string;
  } | null {
    const link = this.links.find(
      (l) => l.channelA === channelId || l.channelB === channelId,
    );

    if (!link) return null;

    if (link.channelA === channelId) {
      return { channelId: link.channelB, guildId: link.guildB };
    } else {
      return { channelId: link.channelA, guildId: link.guildA };
    }
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

  public static async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild || !message.channel) return;

    const partner = this.getPartnerChannel(message.channel.id);
    if (!partner) return;

    const targetGuild = this.client.guilds.cache.get(partner.guildId);
    if (!targetGuild) return;

    const targetChannel = targetGuild.channels.cache.get(
      partner.channelId,
    ) as TextChannel;
    if (!targetChannel || !targetChannel.isTextBased()) return;

    try {
      const webhook = await this.getWebhook(targetChannel);

      const files: AttachmentBuilder[] = message.attachments.map(
        (attachment) =>
          new AttachmentBuilder(attachment.url, { name: attachment.name }),
      );

      let content = message.content;
      if (message.reference && message.reference.messageId) {
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
            }
          }

          if (!refContent) {
            if (refMessage.attachments.size > 0) refContent = "*[Attachment]*";
            else if (refMessage.embeds.length > 0) refContent = "*[Embed]*";
            else refContent = "*[Unknown]*";
          }

          if (refContent.length > 360) {
            refContent = refContent.substring(0, 360) + "...";
          }
          refContent = refContent.replace(/\n/g, " ");

          content = `> ↩️ **${refAuthor}:** ${refContent}\n${content}`;
        } catch (error) {
          content = `> *[Forwarded message])*\n${content}`;
        }
      }

      const displayName =
        message.member?.displayName || message.author.username;

      await webhook.send({
        content: content || (files.length > 0 ? "" : "*[Sticker]*"),
        username: `${displayName} • ${message.guild.name}`,
        avatarURL: message.author.displayAvatarURL(),
        files: files,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(
        `❌ Failed to relay message from ${message.guild.name} to ${targetGuild.name}:`,
        error,
      );
    }
  }
}
