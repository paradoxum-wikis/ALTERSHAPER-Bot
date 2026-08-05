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
  clearPages,
  compareToText,
  getOutputIndex,
  getPageInfo,
  getPageWikitext,
  listSubpages,
  publishPage,
  setDraftStatus,
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

type Proposal = {
  id: string;
  jobId: string;
  draftTitle: string;
  target: string;
  status: "pending" | "applied" | "rejected";
  reason?: string;
};

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
      .addStringOption((o) =>
        o
          .setName("job")
          .setDescription("Existing job id to continue (omit for a new job)")
          .setRequired(false),
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
  opts: { all?: boolean; jobId?: string } = {},
): Promise<Proposal[]> {
  const { drafts } = await getOutputIndex(wiki, outputRoot);
  return drafts
    .filter(
      (d) =>
        d.id &&
        (opts.all || d.status === "pending") &&
        (!opts.jobId || d.jobId === opts.jobId),
    )
    .map((d) => ({
      id: d.id,
      jobId: d.jobId,
      draftTitle: `${outputRoot}/${d.id}`,
      target: d.target,
      status: d.status,
      reason: d.reason,
    }));
}

async function loadProposal(
  wiki: WikiConfig,
  outputRoot: string,
  draftId: string,
): Promise<{
  id: string;
  target: string;
  body: string;
  draftTitle: string;
} | null> {
  const item = (await getOutputIndex(wiki, outputRoot)).drafts.find(
    (d) => d.id === draftId,
  );
  if (!item) return null;
  const draftTitle = `${outputRoot}/${item.id}`;
  const wt = await getPageWikitext(wiki, draftTitle);
  if (!wt?.trim()) return null;
  const p = parseOutputTarget(wt);
  if (!p) return null;
  return {
    id: item.id,
    target: item.target,
    body: p.body,
    draftTitle,
  };
}

function actionButtons(ownerId: string, wikiChoice: string, draftId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`job:diff:${ownerId}:${wikiChoice}:${draftId}`)
      .setLabel("Diff")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`job:approve:${ownerId}:${wikiChoice}:${draftId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`job:reject:${ownerId}:${wikiChoice}:${draftId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Secondary),
  );
}

function continueButton(ownerId: string, wikiChoice: string, jobId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`job:continue:${ownerId}:${wikiChoice}:${jobId}`)
      .setLabel("Continue")
      .setStyle(ButtonStyle.Primary),
  );
}

function newJobId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

type JobReply = ChatInputCommandInteraction | ModalSubmitInteraction;

async function runAgentJob(opts: {
  interaction: JobReply;
  userId: string;
  wikiChoice: string;
  task: string;
  jobId: string;
  isContinue: boolean;
  thinking: boolean;
}): Promise<void> {
  const { interaction, userId, wikiChoice, task, jobId, isContinue, thinking } =
    opts;
  const { wiki, sessionPage, outputPage } = pagesFor(userId, wikiChoice);

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
      isContinue,
      thinking,
      onProgress,
    });

    const proposals = await listProposals(wiki, outputPage, { jobId }).catch(
      () => [],
    );

    const embed = new EmbedBuilder()
      .setColor(0xb9afce)
      .setTitle(isContinue ? "Job continued" : "Job complete")
      .setDescription(result.summary.slice(0, 4000))
      .addFields(
        { name: "Wiki", value: wiki.sitename, inline: true },
        { name: "Job", value: `\`${jobId}\``, inline: true },
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
          .map((p) => `• ${p.target} (\`${p.id}\`)`)
          .join("\n")
          .slice(0, 1024),
      });
    }

    const components: ActionRowBuilder<
      ButtonBuilder | StringSelectMenuBuilder
    >[] = [];

    if (proposals.length === 1) {
      components.push(actionButtons(userId, wiki.choice, proposals[0].id));
    } else if (proposals.length > 1) {
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`job:pick:${userId}:${wiki.choice}`)
            .setPlaceholder("Select a proposal")
            .addOptions(
              proposals
                .slice(0, 25)
                .map((p) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(p.target.slice(0, 100))
                    .setDescription(p.id.slice(0, 100))
                    .setValue(p.id.slice(0, 100)),
                ),
            ),
        ),
      );
    }
    components.push(continueButton(userId, wiki.choice, jobId));

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

function missingAgentEnv(): string[] {
  return [
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "WIKI_BOT_USERNAME",
    "WIKI_BOT_PASSWORD",
  ].filter((k) => !process.env[k]);
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
    const proposals = await listProposals(wiki, outputPage, { all: true });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xb9afce)
          .setTitle("Job pages")
          .addFields(
            { name: "Wiki", value: wiki.sitename },
            {
              name: "Session",
              value: `${session.exists ? `[${sessionPage}](${sessionUrl})` : `\`${sessionPage}\``} - ${size(session)}`,
            },
            {
              name: "Output",
              value: `${output.exists ? `[${outputPage}](${outputUrl})` : `\`${outputPage}\``} - ${size(output)}`,
            },
            {
              name: "Drafts",
              value:
                proposals.length > 0
                  ? proposals
                      .map((p) => {
                        const reason =
                          p.status === "rejected" && p.reason
                            ? ` — ${p.reason}`
                            : "";
                        return `• [${p.target}](${pageUrl(wiki, p.draftTitle)}) \`${p.id}\` - job \`${p.jobId}\` - ${p.status}${reason}`;
                      })
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
    await clearPages(wiki, [sessionPage, outputPage, ...drafts]);
    await interaction.editReply({
      content: `Cleared session + output + (${drafts.length} draft subpage(s)).`,
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
  const needed = missingAgentEnv();
  if (needed.length) {
    await interaction.reply({
      content: `**Job agent is not configured** (missing: ${needed.join(", ")}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const task = interaction.options.getString("task", true);
  const thinking = interaction.options.getBoolean("thinking") ?? true;
  const existing = interaction.options.getString("job")?.trim();
  const jobId = existing || newJobId();

  await interaction.deferReply();
  await runAgentJob({
    interaction,
    userId: interaction.user.id,
    wikiChoice: interaction.options.getString("wiki") ?? "tds",
    task,
    jobId,
    isContinue: !!existing,
    thinking,
  });
}

export async function handleJobContinueButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "continue" || !id.draftId) return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can continue it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `job:continue-modal:${id.ownerId}:${id.wikiChoice}:${id.draftId}`,
    )
    .setTitle("Continue job")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Follow-up task")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("task")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2000),
        ),
    );

  await interaction.showModal(modal);
}

export async function handleJobContinueModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "continue-modal" || !id.draftId) return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can continue it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const needed = missingAgentEnv();
  if (needed.length) {
    await interaction.reply({
      content: `**Job agent is not configured** (missing: ${needed.join(", ")}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const task = interaction.fields.getTextInputValue("task").trim();
  if (!task) {
    await interaction.reply({
      content: "Task cannot be empty.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  await runAgentJob({
    interaction,
    userId: id.ownerId,
    wikiChoice: id.wikiChoice,
    task,
    jobId: id.draftId,
    isContinue: true,
    thinking: true,
  });
}

function parseJobId(customId: string): {
  kind: string;
  ownerId: string;
  wikiChoice: string;
  draftId: string;
} | null {
  const parts = customId.split(":");
  if (parts[0] !== "job" || parts.length < 4) return null;
  return {
    kind: parts[1],
    ownerId: parts[2],
    wikiChoice: parts[3],
    draftId: parts.slice(4).join(":"),
  };
}

export async function handleJobPickMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "pick") return;

  const draftId = interaction.values[0];
  if (!draftId) return;

  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);
  const p = (await listProposals(wiki, outputPage).catch(() => [])).find(
    (x) => x.id === draftId,
  );
  if (!p) {
    await interaction.reply({
      content: "That draft is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const row =
    interaction.user.id === id.ownerId
      ? actionButtons(id.ownerId, id.wikiChoice, p.id)
      : new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`job:diff:${id.ownerId}:${id.wikiChoice}:${p.id}`)
            .setLabel("Diff")
            .setStyle(ButtonStyle.Secondary),
        );

  await interaction.reply({
    content: `**${p.target}** - [draft](${pageUrl(wiki, p.draftTitle)})`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleJobDiffButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "diff" || !id.draftId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);
  const proposal = await loadProposal(wiki, outputPage, id.draftId);
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
  if (!id || id.kind !== "approve" || !id.draftId) return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can approve it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `job:approve-modal:${id.ownerId}:${id.wikiChoice}:${id.draftId}`,
    )
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
  if (!id || id.kind !== "approve-modal" || !id.draftId) return;

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
    const proposal = await loadProposal(wiki, outputPage, id.draftId);
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
    await setDraftStatus(wiki, outputPage, proposal.id, "applied");

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

export async function handleJobRejectButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "reject" || !id.draftId) return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can reject it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `job:reject-modal:${id.ownerId}:${id.wikiChoice}:${id.draftId}`,
    )
    .setTitle("Reject draft")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Reason")
        .setDescription("Used when you continue this job")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1000),
        ),
    );

  await interaction.showModal(modal);
}

export async function handleJobRejectModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const id = parseJobId(interaction.customId);
  if (!id || id.kind !== "reject-modal" || !id.draftId) return;

  if (interaction.user.id !== id.ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can reject it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (!reason) {
    await interaction.reply({
      content: "Reason cannot be empty.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { wiki, outputPage } = pagesFor(id.ownerId, id.wikiChoice);

  try {
    const proposal = await loadProposal(wiki, outputPage, id.draftId);
    if (!proposal) {
      await interaction.editReply({ content: "Draft not found." });
      return;
    }

    await setDraftStatus(wiki, outputPage, proposal.id, "rejected", reason);

    if (interaction.message?.editable) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }

    await interaction.editReply({
      content: `Rejected **${proposal.target}** (\`${proposal.id}\`): ${reason.slice(0, 500)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Reject failed:** ${message.slice(0, 1500)}`,
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
