import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import {
  closeBetting,
  getNextPlayableSeries,
  openBetting,
  roundLabel,
  setBet,
} from "./bracket.js";
import { saveActiveTourney } from "./log.js";
import { isTourneyOwner } from "./lifecycle.js";
import type { SeriesState, TourneyState } from "./types.js";
import { seriesEmbedColor, timeoutEmbed, type MessagePoster } from "./ui.js";

const COLLECT_MS = 60 * 60 * 1000;

function displayName(state: TourneyState, userId: string): string {
  const p =
    state.combatants.find((c) => c.userId === userId) ||
    state.referees.find((r) => r.userId === userId);
  return p?.displayName ?? userId;
}

function seriesTitle(series: SeriesState): string {
  const bits = [roundLabel(series.round)];
  if (series.conference) {
    bits.push(series.conference === "exo" ? "Exo" : "Two X");
  }
  if (series.subgroup) bits.push(`Subgroup ${series.subgroup}`);
  return bits.join(" - ");
}

function tally(series: SeriesState): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const bet of series.bets) {
    if (bet.pickId === series.fighterAId) a++;
    else if (bet.pickId === series.fighterBId) b++;
  }
  return { a, b };
}

export function bettingEmbed(
  state: TourneyState,
  series: SeriesState,
  closed = false,
): EmbedBuilder {
  const a = series.fighterAId!;
  const b = series.fighterBId!;
  const t = tally(series);
  const na = displayName(state, a);
  const nb = displayName(state, b);

  const lines = [
    `**${na}** vs **${nb}**`,
    `**${na}** ${t.a} - **${nb}** ${t.b}`,
    closed ? "Locked." : "Vote series winner.",
  ];

  return new EmbedBuilder()
    .setColor(seriesEmbedColor(series))
    .setTitle(`Pick'em - ${seriesTitle(series)}`)
    .setDescription(lines.join("\n"));
}

function bettingRows(
  state: TourneyState,
  series: SeriesState,
): ActionRowBuilder<ButtonBuilder>[] {
  const a = series.fighterAId!;
  const b = series.fighterBId!;
  const label = (id: string) => {
    const n = displayName(state, id);
    return n.length > 70 ? n.slice(0, 67) + "..." : n;
  };

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:bet:${series.id}:A`)
        .setLabel(label(a))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tourney:bet:${series.id}:B`)
        .setLabel(label(b))
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:betclose:${series.id}`)
        .setLabel("Lock bets")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function seriesNeedsBetting(
  state: TourneyState,
): SeriesState | undefined {
  if (state.phase === "betting" && state.currentSeriesId) {
    const s = state.series.find((x) => x.id === state.currentSeriesId);
    if (s?.status === "betting") return s;
  }
  const next = getNextPlayableSeries(state);
  if (!next) return undefined;
  if (next.status === "in_progress" || next.status === "complete") {
    return undefined;
  }
  if (next.status === "ready" && next.betsClosedAt) return undefined;
  return next;
}

export async function openBettingSession(
  state: TourneyState,
  series: SeriesState,
  post: MessagePoster,
): Promise<boolean> {
  if (series.status !== "betting") {
    openBetting(state, series.id);
    await saveActiveTourney(state);
  }

  const message = await post({
    embeds: [bettingEmbed(state, series)],
    components: bettingRows(state, series),
  });

  return collectBets(message, state, series.id);
}

async function collectBets(
  message: Message,
  state: TourneyState,
  seriesId: string,
): Promise<boolean> {
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECT_MS,
  });

  let locked = false;

  collector.on("collect", async (i: ButtonInteraction) => {
    const live = state.series.find((s) => s.id === seriesId);
    if (!live || live.status !== "betting") {
      collector.stop("done");
      return;
    }

    try {
      if (i.customId === `tourney:betclose:${seriesId}`) {
        if (!isTourneyOwner(i.user.id)) {
          await i.reply({
            content: "Only the owner can lock bets.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        closeBetting(state, seriesId);
        await saveActiveTourney(state);
        locked = true;
        await i.update({
          embeds: [bettingEmbed(state, live, true)],
          components: [],
        });
        collector.stop("closed");
        return;
      }

      const prefix = `tourney:bet:${seriesId}:`;
      if (!i.customId.startsWith(prefix)) return;

      const side = i.customId.slice(prefix.length);
      const pickId = side === "A" ? live.fighterAId! : live.fighterBId!;
      setBet(state, seriesId, i.user.id, pickId);
      await saveActiveTourney(state);

      await i.update({
        embeds: [bettingEmbed(state, live)],
        components: bettingRows(state, live),
      });
    } catch (e) {
      if (i.replied || i.deferred) return;
      await i.reply({
        content: e instanceof Error ? e.message : "Bet failed.",
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  await new Promise<void>((resolve) => {
    collector.on("end", async (_c, reason) => {
      if (reason !== "closed" && reason !== "done") {
        const live = state.series.find((s) => s.id === seriesId);
        if (live?.status === "betting") {
          await message.edit({
            embeds: [
              timeoutEmbed(
                "Bets are still open. Run `/tourney` again to continue, then **Lock bets**.",
              ),
            ],
            components: [],
          });
        }
      }
      resolve();
    });
  });

  return locked;
}

export function betLeaderboardLine(state: TourneyState, limit = 5): string {
  const entries = Object.entries(state.betPoints).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "No points yet.";
  return entries
    .slice(0, limit)
    .map(([id, pts], i) => `${i + 1}. <@${id}> ${pts}`)
    .join("\n");
}
