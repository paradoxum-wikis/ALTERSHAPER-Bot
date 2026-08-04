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
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { formatContextUsage, runJob } from "../utils/agent/jobLoop.js";
import {
  clearPage,
  getPageInfo,
  getPageWikitext,
  publishPage,
} from "../utils/agent/wikiApi.js";
import {
  outputTitle,
  pageUrl,
  resolveWiki,
  sessionTitle,
  type WikiConfig,
} from "../utils/agent/wikis.js";

export const LLM_ENABLED = process.env.LLM_ENABLED === "true";

const AGREE = "I AGREE";

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
      .addStringOption(addWikiOption),
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
      .setDescription("Clear your session page")
      .addStringOption(addWikiOption),
  );

function pagesOf(interaction: ChatInputCommandInteraction): {
  wiki: WikiConfig;
  sessionPage: string;
  outputPage: string;
  sessionUrl: string;
  outputUrl: string;
} {
  const wiki = resolveWiki(interaction.options.getString("wiki"));
  const uid = interaction.user.id;
  const sessionPage = sessionTitle(wiki, uid);
  const outputPage = outputTitle(wiki, uid);
  return {
    wiki,
    sessionPage,
    outputPage,
    sessionUrl: pageUrl(wiki, sessionPage),
    outputUrl: pageUrl(wiki, outputPage),
  };
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

  const { wiki, sessionPage, sessionUrl } = pagesOf(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const before = (await getPageInfo(wiki, sessionPage)).get(sessionPage) ?? {
      exists: false,
      length: 0,
    };
    if (!before.exists || before.length === 0) {
      await interaction.editReply({
        content: `Session is already empty: \`${sessionPage}\``,
      });
      return;
    }

    await clearPage(wiki, sessionPage);
    await interaction.editReply({
      content: `Cleared [${sessionPage}](${sessionUrl}) (${before.length.toLocaleString()} bytes -> empty).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Failed to clear session:** ${message.slice(0, 1500)}`,
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
      onProgress,
    });

    const outputText = await getPageWikitext(wiki, outputPage).catch(
      () => null,
    );
    const canApprove =
      Boolean(outputText?.trim()) && Boolean(parseOutputTarget(outputText!));

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

    const row = canApprove
      ? new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`job:approve:${interaction.user.id}:${wiki.choice}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Danger),
        )
      : undefined;

    await interaction.editReply({
      content: "",
      embeds: [embed],
      components: row ? [row] : [],
    });
  } catch (err) {
    console.error(`[job ${jobId}]`, err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `**Job failed:** ${message.slice(0, 1800)}`,
      embeds: [],
      components: [],
    });
  }
}

export async function handleJobApproveButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split(":");
  // job:approve:userId:wikiChoice
  if (parts.length !== 4 || parts[0] !== "job" || parts[1] !== "approve") {
    return;
  }
  const [, , ownerId, wikiChoice] = parts;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can approve it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`job:approve-modal:${ownerId}:${wikiChoice}`)
    .setTitle("Confirm publish")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`Please type: ${AGREE}`)
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
  const parts = interaction.customId.split(":");
  // job:approve-modal:userId:wikiChoice
  if (
    parts.length !== 4 ||
    parts[0] !== "job" ||
    parts[1] !== "approve-modal"
  ) {
    return;
  }
  const [, , ownerId, wikiChoice] = parts;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the user who ran this job can approve it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const typed = interaction.fields.getTextInputValue("liability").trim();
  if (typed.toUpperCase() !== AGREE) {
    await interaction.reply({
      content: `You must type **${AGREE}** exactly to accept liability and publish.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { wiki, outputPage } = pagesFor(ownerId, wikiChoice);

  try {
    const wikitext = await getPageWikitext(wiki, outputPage);
    if (!wikitext?.trim()) {
      await interaction.editReply({
        content: "Output page is empty, there is nothing to publish.",
      });
      return;
    }

    const parsed = parseOutputTarget(wikitext);
    if (!parsed) {
      await interaction.editReply({
        content:
          "Output needs `<!-- aphonos-target: PageTitle -->` in the wikitext source, plus the page body.",
      });
      return;
    }

    await publishPage(
      wiki,
      parsed.target,
      parsed.body,
      `Approved by ${interaction.user.tag} (${interaction.user.id}) via /job`,
    );

    if (interaction.message?.editable) {
      await interaction.message
        .edit({
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("job:approve:done")
                .setLabel("Published")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            ),
          ],
        })
        .catch(() => {});
    }

    const liveUrl = pageUrl(wiki, parsed.target);
    await interaction.editReply({
      content: `Published [${parsed.target}](${liveUrl}).`,
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
