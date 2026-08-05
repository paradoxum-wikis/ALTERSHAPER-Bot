import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  SlashCommandStringOption,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { formatContextUsage, runJob } from "../utils/agent/jobLoop.js";
import {
  clearPage,
  compareToText,
  getPageInfo,
  getPageWikitext,
  listSubpages,
  publishPage,
} from "../utils/agent/wikiApi.js";
import {
  comparePagesUrl,
  outputTitle,
  pageUrl,
  resolveWiki,
  sessionTitle,
  type WikiConfig,
} from "../utils/agent/wikis.js";

export const LLM_ENABLED = process.env.LLM_ENABLED === "true";

const AGREE = "I AGREE";

type Proposal = { draftTitle: string; target: string };

const addWikiOption = (o: SlashCommandStringOption) =>
  o
    .setName("wiki")
    .setDescription("Target wiki (defaults to TDS)")
    .setRequired(false)
    .addChoices(
      { name: "Tower Defense Simulator Wiki", value: "tds" },
      { name: "ALTERPEDIA", value: "alterego" },
    );

export const data = new SlashCommandBuilder()
  .setName("job")
  .setDescription("Wiki maintenance agent")
  .addSubcommand((sc) =>
    sc
      .setName("run")
      .setDescription("Run a maintenance task")
      .addStringOption((o) =>
        o
          .setName("task")
          .setDescription("What the agent should do")
          .setRequired(true),
      )
      .addStringOption(addWikiOption)
      .addBooleanOption((o) =>
        o
          .setName("thinking")
          .setDescription("Enable thinking mode for agent (defaults to true)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("session")
      .setDescription("Show your session and output pages")
      .addStringOption(addWikiOption),
  )
  .addSubcommand((sc) =>
    sc
      .setName("clear")
      .setDescription("Clear session and drafts")
      .addStringOption(addWikiOption),
  );

function pagesOf(interaction: ChatInputCommandInteraction) {
  return pagesFor(
    interaction.user.id,
    interaction.options.getString("wiki") ?? "tds",
  );
}

function pagesFor(userId: string, wikiChoice: string) {
  const wiki = resolveWiki(wikiChoice);
  const sessionPage = sessionTitle(wiki, userId);
  const outputPage = outputTitle(wiki, userId);
  return {
    wiki,
    sessionPage,
    outputPage,
    sessionUrl: pageUrl(wiki, sessionPage),
    outputUrl: pageUrl(wiki, outputPage),
  };
}

const TARGET_RE = /<!--\s*aphonos-target:\s*(.+?)\s*-->/i;

export function parseOutputTarget(wikitext: string): {
  target: string;
  body: string;
} | null {
  const m = wikitext.match(TARGET_RE);
  if (!m) return null;
  const target = m[1].trim();
  const body = wikitext.replace(TARGET_RE, "").replace(/^\s*\n/, "");
  if (!target || !body.trim()) return null;
  return { target, body };
}

async function listProposals(
  wiki: WikiConfig,
  outputRoot: string,
): Promise<Proposal[]> {
  const subs = (await listSubpages(wiki, `${outputRoot}/`)).sort((a, b) =>
    a.localeCompare(b),
  );

  if (subs.length) {
    const info = await getPageInfo(wiki, subs);
    return subs
      .filter((t) => (info.get(t)?.length ?? 0) > 0)
      .map((draftTitle) => {
        const leaf = draftTitle.includes("/")
          ? draftTitle.slice(draftTitle.lastIndexOf("/") + 1)
          : draftTitle;
        return {
          draftTitle,
          target: leaf.replaceAll("_", " "),
        };
      });
  }

  const wt = await getPageWikitext(wiki, outputRoot);
  if (!wt?.trim()) return [];
  const p = parseOutputTarget(wt);
  if (!p) return [];
  return [{ draftTitle: outputRoot, target: p.target }];
}

async function loadProposal(
  wiki: WikiConfig,
  outputRoot: string,
  index: number,
): Promise<{ target: string; body: string; draftTitle: string } | null> {
  const list = await listProposals(wiki, outputRoot);
  const item = list[index];
  if (!item) return null;
  const wt = await getPageWikitext(wiki, item.draftTitle);
  if (!wt?.trim()) return null;
  const p = parseOutputTarget(wt);
  if (p) return { ...p, draftTitle: item.draftTitle };
  return {
    target: item.target,
    body: wt,
    draftTitle: item.draftTitle,
  };
}

function actionButtons(ownerId: string, wikiChoice: string, index: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`job:diff:${ownerId}:${wikiChoice}:${index}`)
      .setLabel("Diff")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`job:approve:${ownerId}:${wikiChoice}:${index}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Danger),
  );
}

async function runSession(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!process.env.WIKI_BOT_USERNAME) {
    await interaction.reply({
      content: "**Missing** `WIKI_BOT_USERNAME`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { wiki, sessionPage, outputPage, sessionUrl, outputUrl } =
    pagesOf(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const info = await getPageInfo(wiki, [sessionPage, outputPage]);
    const session = info.get(sessionPage) ?? { exists: false, length: 0 };
    const output = info.get(outputPage) ?? { exists: false, length: 0 };
    const size = (p: { exists: boolean; length: number }) =>
      p.exists ? `${p.length.toLocaleString()} bytes` : "does not exist yet";
    const proposals = await listProposals(wiki, outputPage);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xb9afce)
          .setTitle("Job pages")
          .addFields(
            { name: "Wiki", value: wiki.sitename },
            {
              name: "Session",
              value: `${session.exists ? `[${sessionPage}](${sessionUrl})` : `\`${sessionPage}\``} · ${size(session)}`,
            },
            {
              name: "Output",
              value: `${output.exists ? `[${outputPage}](${outputUrl})` : `\`${outputPage}\``} · ${size(output)}`,
            },
            {
              name: "Drafts",
              value:
                proposals.length > 0
                  ? proposals
                      .map(
                        (p) =>
                          `• [${p.target}](${pageUrl(wiki, p.draftTitle)})`,
                      )
                      .join("\n")
                      .slice(0, 1024)
                  : "—",
            },
          ),
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Failed to read pages:** ${message.slice(0, 1500)}`,
    });
  }
}

async function runClear(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!process.env.WIKI_BOT_USERNAME || !process.env.WIKI_BOT_PASSWORD) {
    await interaction.reply({
      content: "**Missing** `WIKI_BOT_USERNAME` / `WIKI_BOT_PASSWORD`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { wiki, sessionPage, outputPage } = pagesOf(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const drafts = await listSubpages(wiki, `${outputPage}/`);
    await Promise.all(
      [sessionPage, outputPage, ...drafts].map((t) => clearPage(wiki, t)),
    );
    await interaction.editReply({
      content: `Cleared session + (${drafts.length} draft subpage(s)).`,
    });
  } catch (err) {
    console.error("[job clear]", err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Failed to clear:** ${message.slice(0, 1500)}`,
    });
  }
}

async function runTask(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const needed = [
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "WIKI_BOT_USERNAME",
    "WIKI_BOT_PASSWORD",
  ].filter((k) => !process.env[k]);
  if (needed.length) {
    await interaction.reply({
      content: `**Job agent is not configured** (missing: ${needed.join(", ")}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const task = interaction.options.getString("task", true);
  const thinking = interaction.options.getBoolean("thinking") ?? true;
  const { wiki, sessionPage, outputPage } = pagesOf(interaction);
  const jobId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  await interaction.deferReply();

  let lastEdit = 0;
  const onProgress = async (msg: string) => {
    const now = Date.now();
    if (now - lastEdit < 2000) return;
    lastEdit = now;
    await interaction.editReply({ content: msg, embeds: [] }).catch(() => {});
  };

  try {
    const result = await runJob({
      wiki,
      task,
      sessionPage,
      outputPage,
      jobId,
      thinking,
      onProgress,
    });

    const proposals = await listProposals(wiki, outputPage).catch(() => []);

    const embed = new EmbedBuilder()
      .setColor(0xb9afce)
      .setTitle("Job complete")
      .setDescription(result.summary.slice(0, 4000))
      .addFields(
        { name: "Wiki", value: wiki.sitename, inline: true },
        { name: "Steps", value: String(result.steps), inline: true },
        {
          name: "Context",
          value: formatContextUsage(
            result.peakPromptTokens,
            result.contextLimit,
          ),
          inline: true,
        },
        {
          name: "Session",
          value: `[${result.sessionPage}](${result.sessionUrl})`,
        },
        {
          name: "Output",
          value: `[${result.outputPage}](${result.outputUrl})`,
        },
      );

    if (proposals.length > 1) {
      embed.addFields({
        name: "Drafts",
        value: proposals
          .map((p) => `• ${p.target}`)
          .join("\n")
          .slice(0, 1024),
      });
    }

    const uid = interaction.user.id;
    const components: ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >[] = [];

    if (proposals.length === 1) {
      components.push(actionButtons(uid, wiki.choice, 0));
    } else if (proposals.length > 1) {
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`job:pick:${uid}:${wiki.choice}`)
            .setPlaceholder("Select a proposal")
            .addOptions(
              proposals
                .slice(0, 25)
                .map((p, i) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(p.target.slice(0, 100))
                    .setValue(String(i)),
                ),
            ),
        ),
      );
    }

    await interaction.editReply({
      content: `${interaction.user}`,
      embeds: [embed],
      components,
    });
  } catch (err) {
    console.error(`[job ${jobId}]`, err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `${interaction.user} **Job failed:** ${message.slice(0, 1800)}`,
      embeds: [],
      components: [],
    });
  }
}

function parseJobId(customId: string): {
  kind: string;
  ownerId: string;
  wikiChoice: string;
  index: number;
} | null {
  const parts = customId.split(":");
  if (parts[0] !== "job" || parts.length < 4) return null;
  return {
    kind: parts[1],
    ownerId: parts[2],
    wikiChoice: parts[3],
    index: parts[4] !== undefined ? Number(parts[4]) : 0,
  };
}

export async function handleJobPickMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "pick") return;

  const index = Number(interaction.values[0]);
  if (!Number.isFinite(index)) return;

  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);
  const proposals = await listProposals(wiki, outputPage).catch(() => []);
  const p = proposals[index];
  if (!p) {
    await interaction.reply({
      content: "That draft is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const canApprove = interaction.user.id === id.ownerId;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`job:diff:${id.ownerId}:${id.wikiChoice}:${index}`)
      .setLabel("Diff")
      .setStyle(ButtonStyle.Secondary),
  );
  if (canApprove) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`job:approve:${id.ownerId}:${id.wikiChoice}:${index}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Danger),
    );
  }

  await interaction.reply({
    content: `**${p.target}** · [draft](${pageUrl(wiki, p.draftTitle)})`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleJobDiffButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "diff") return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);
  const proposal = await loadProposal(wiki, outputPage, id.index);
  if (!proposal) {
    await interaction.editReply({ content: "Draft not found." });
    return;
  }

  const mwDiff = comparePagesUrl(wiki, proposal.target, proposal.draftTitle);

  try {
    const cmp = await compareToText(wiki, proposal.target, proposal.body);
    const delta = cmp.toSize - cmp.fromSize;
    let body = cmp.text || "(no changes)";
    if (body.length > 3500) body = `${body.slice(0, 3500)}\n...truncated`;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xb9afce)
          .setTitle(`Diff ➡️ ${proposal.target}`)
          .setDescription(`\`\`\`diff\n${body}\n\`\`\``.slice(0, 4096))
          .addFields(
            {
              name: "Size",
              value: `${cmp.fromSize} -> ${cmp.toSize} (${delta >= 0 ? "+" : ""}${delta} bytes)`,
            },
            { name: "Wiki", value: `[Compare on wiki](${mwDiff})` },
          ),
      ],
    });
  } catch (err) {
    console.error("[job diff]", err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Diff failed:** ${message.slice(0, 1200)}\n[Compare on wiki](${mwDiff})`,
    });
  }
}

export async function handleJobApproveButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "approve") return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can approve it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`job:approve-modal:${id.ownerId}:${id.wikiChoice}:${id.index}`)
    .setTitle("Confirm publish")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`Please type: '${AGREE}'`)
        .setDescription("You accept full liability for this publish")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("liability")
            .setPlaceholder(AGREE)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(AGREE.length)
            .setMaxLength(32),
        ),
    );

  await interaction.showModal(modal);
}

export async function handleJobApproveModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "approve-modal") return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can approve it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const typed = interaction.fields.getTextInputValue("liability").trim();
  if (typed.toUpperCase() !== AGREE) {
    await interaction.reply({
      content: `You must type "${AGREE}" exactly to accept liability and publish.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);

  try {
    const proposal = await loadProposal(wiki, outputPage, id.index);
    if (!proposal) {
      await interaction.editReply({ content: "Draft not found." });
      return;
    }

    await publishPage(
      wiki,
      proposal.target,
      proposal.body,
      `Approved by ${interaction.user.tag} (${interaction.user.id}) via /job`,
    );

    if (interaction.message?.editable) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }

    const liveUrl = pageUrl(wiki, proposal.target);
    await interaction.editReply({
      content: `Published [${proposal.target}](${liveUrl}).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Publish failed:** ${message.slice(0, 1500)}`,
    });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  _member: GuildMember,
): Promise<void> {
  if (!LLM_ENABLED) {
    await interaction.reply({
      content: "**LLM jobs are disabled.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case "session":
      return runSession(interaction);
    case "clear":
      return runClear(interaction);
    default:
      return runTask(interaction);
  }
}
