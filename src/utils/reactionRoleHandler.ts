import {
  Client,
  Guild,
  Message,
  MessageReaction,
  TextChannel,
  User,
} from "discord.js";
import {
  findMatchingReactionRoleRules,
  getReactionRoleRules,
} from "./reactionRoleStore.js";

/**
 * Loads rules from the JSON store at runtime (see `src/utils/reactionRoleStore.ts`),
 * so one can add or remove rules via command.
 */
export class ReactionRoleHandler {
  /**
   * Besteffort cache warmup so reaction events have message context.
   *
   * It fetches each configured message on startup.
   */
  public static async initialize(client: Client): Promise<void> {
    try {
      const rules = getReactionRoleRules();
      const byGuild = new Map<
        string,
        { channelId: string; messageId: string }[]
      >();

      for (const rule of rules) {
        const targets = byGuild.get(rule.guildId) ?? [];
        targets.push({ channelId: rule.channelId, messageId: rule.messageId });
        byGuild.set(rule.guildId, targets);
      }

      for (const [guildId, targets] of byGuild.entries()) {
        const guild = await this.getGuild(client, guildId);
        if (!guild) continue;

        // Deduplicator
        const unique = new Map<
          string,
          { channelId: string; messageId: string }
        >();
        for (const t of targets) unique.set(`${t.channelId}:${t.messageId}`, t);

        for (const { channelId, messageId } of unique.values()) {
          await this.warmMessageCache(guild, channelId, messageId);
        }
      }
    } catch (error) {
      console.error("❌ Failed to setup reaction roles:", error);
    }
  }

  public static async handleReactionAdd(
    reaction: MessageReaction,
    user: User,
  ): Promise<void> {
    await this.handleReactionChange("add", reaction, user);
  }

  public static async handleReactionRemove(
    reaction: MessageReaction,
    user: User,
  ): Promise<void> {
    await this.handleReactionChange("remove", reaction, user);
  }

  private static async handleReactionChange(
    kind: "add" | "remove",
    reaction: MessageReaction,
    user: User,
  ): Promise<void> {
    if (user.bot) return;

    // check could be redundant, ill test it later.
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const message = reaction.message as Message<boolean>;
    const guild = message.guild;
    if (!guild) return;

    const channelId = message.channelId;
    const messageId = message.id;
    const emojiNameOrId = reaction.emoji.id ?? reaction.emoji.name ?? null;

    const matched = findMatchingReactionRoleRules({
      guildId: guild.id,
      channelId,
      messageId,
      emojiNameOrId,
    });

    if (matched.length === 0) return;

    const member = await this.getMemberFromGuild(guild, user.id);
    if (!member) return;

    for (const rule of matched) {
      try {
        if (kind === "add") {
          await member.roles.add(rule.roleId);
          console.log(
            `[REACTIONROLEHANDLER] ROLE GRANTED TO ${user.tag} (${user.id}) via reaction role rule (roleId=${rule.roleId})`,
          );
        } else {
          if (rule.removeOnUnreact === false) continue;
          await member.roles.remove(rule.roleId);
          console.log(
            `[REACTIONROLEHANDLER] ROLE REMOVED FROM ${user.tag} (${user.id}) via reaction role rule (roleId=${rule.roleId})`,
          );
        }
      } catch (error) {
        console.error("❌ Failed to apply reaction role update:", {
          kind,
          userId: user.id,
          guildId: guild.id,
          channelId,
          messageId,
          emoji: emojiNameOrId,
          roleId: rule.roleId,
          error,
        });
      }
    }
  }

  private static async getGuild(
    client: Client,
    guildId: string,
  ): Promise<Guild | null> {
    const cached = client.guilds.cache.get(guildId);
    if (cached) return cached;

    try {
      return await client.guilds.fetch(guildId);
    } catch {
      return null;
    }
  }

  private static async warmMessageCache(
    guild: Guild,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    try {
      const channel = (await guild.channels.fetch(
        channelId,
      )) as TextChannel | null;

      if (!channel) return;
      if (!("messages" in channel)) return;

      await channel.messages.fetch(messageId);
    } catch (error) {
      console.error("❌ Failed to warm reaction role message cache:", {
        guildId: guild.id,
        channelId,
        messageId,
        error,
      });
    }
  }

  private static async getMemberFromGuild(guild: Guild, userId: string) {
    const cached = guild.members.cache.get(userId);
    if (cached) return cached;

    try {
      return await guild.members.fetch(userId);
    } catch {
      return null;
    }
  }
}
