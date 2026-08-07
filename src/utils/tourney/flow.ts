import type { ChatInputCommandInteraction, Message } from "discord.js";
import { getActiveTourney } from "./state.js";
import { startTourney } from "./lifecycle.js";
import { runSetupFlow } from "./setupUi.js";
import { openBettingSession, seriesNeedsBetting } from "./bettingUi.js";
import { getSeriesForPlay, runPlaySession } from "./playUi.js";
import type { MessagePoster } from "./ui.js";

function makePoster(
  interaction: ChatInputCommandInteraction,
  usedReply: { v: boolean },
): MessagePoster {
  return async (payload) => {
    // d.js Interaction*Options vs MessageCreateOptions flag types clash slightly
    const p = payload as never;
    if (!usedReply.v) {
      usedReply.v = true;
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply(p);
        return interaction.fetchReply();
      }
      if (interaction.replied || interaction.deferred) {
        return (await interaction.followUp(p)) as Message;
      }
      await interaction.reply(p);
      return interaction.fetchReply();
    }
    return (await interaction.followUp(p)) as Message;
  };
}

export async function runTourneySession(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const usedReply = { v: false };
  const post = makePoster(interaction, usedReply);

  let state = getActiveTourney(guildId);
  if (!state) {
    state = await startTourney(guildId);
  }

  if (state.phase === "complete") {
    await post({ content: "This tourney is already finished." });
    return;
  }

  if (state.phase === "aborted") {
    await post({
      content: "This tourney was aborted. Run `/tourney` to start a new one.",
    });
    return;
  }

  if (
    state.phase === "setup_roster" ||
    state.phase === "setup_ref_picks" ||
    state.slots.length !== 16
  ) {
    await runSetupFlow(interaction, state, usedReply);
    state = getActiveTourney(guildId)!;
    if (
      !state ||
      state.phase === "setup_roster" ||
      state.phase === "setup_ref_picks"
    ) {
      return;
    }
  }

  while (true) {
    state = getActiveTourney(guildId)!;
    if (!state || state.phase === "complete" || state.phase === "aborted") {
      return;
    }

    const betSeries = seriesNeedsBetting(state);
    if (betSeries) {
      const locked = await openBettingSession(state, betSeries, post);
      if (!locked) return;
      continue;
    }

    const playSeries = getSeriesForPlay(state);
    if (!playSeries) {
      if (!usedReply.v) {
        await post({
          content:
            "Nothing to do right now. If a step timed out, run `/tourney` again.",
        });
      }
      return;
    }

    const result = await runPlaySession(state, playSeries, post);
    if (result === "tournament" || result === "timeout") return;
  }
}
