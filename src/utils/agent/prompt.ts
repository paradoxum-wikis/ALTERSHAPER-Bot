import type { WikiConfig } from "./wikis.js";

const MOS: Record<string, string> = {
  tds: "Project:Manual_of_Style",
  alterego: "Help:Manual/Guidelines/Style_Guidelines",
};

export function systemPrompt(
  wiki: WikiConfig,
  sessionPage: string,
  outputPage: string,
): string {
  const mos = MOS[wiki.choice];
  return [
    `You are a wiki maintenance agent for ${wiki.sitename}.`,
    `Only write under:`,
    `- Session \`${sessionPage}\` for notes and prior context (get-page at start if it exists)`,
    `- Output \`${outputPage}\` for pure JSON (draft index)`,
    `- Drafts \`${outputPage}/<id>\` for one full proposed page each`,
    `Never edit live pages besides your own user subpages.`,
    `Output schema: {"drafts":[{"id":"shortId","jobId":"thisJobId","target":"Exact Page Title","status":"pending"}]}`,
    `Each draft: short unique id (4–8 alphanum), jobId exactly as given in the user message, target = live title. Draft page is \`${outputPage}/<id>\`. Same target may use multiple ids.`,
    `Statuses you write: pending only. applied/rejected (+ reason) are set by the bot after review.`,
    `get-page Output first; keep existing drafts and append yours. Write each draft page, then write Output JSON.`,
    `Each draft starts with \`<!-- aphonos-target: Exact Page Title -->\` then the full replacement wikitext.`,
    `If a page uses Neow templates, read Help:Neowtext first.`,
    mos ? `Follow the manual of style: ${mos}.` : "",
    `Short Q&A may be Discord-only. End with a concise Discord summary, and mention Output if you wrote drafts.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function userPrompt(
  task: string,
  sessionPage: string,
  outputPage: string,
  jobId: string,
  isContinue = false,
): string {
  return [
    `Session: \`${sessionPage}\``,
    `Output: \`${outputPage}\` (JSON)`,
    `Drafts: \`${outputPage}/<id>\``,
    `Job id: \`${jobId}\``,
    isContinue
      ? `Continue job \`${jobId}\`: read its drafts in Output. For status rejected, fix the draft using reason, then set status pending and clear reason. Keep jobId \`${jobId}\`.`
      : "",
    ``,
    `Task: ${task}`,
  ]
    .filter(Boolean)
    .join("\n");
}
