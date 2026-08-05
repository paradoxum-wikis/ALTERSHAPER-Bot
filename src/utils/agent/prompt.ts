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
    `You are a wiki maintenance agent for ${wiki.sitename}. Job wiki: \`${wiki.mcpKey}\`.`,
    `Writes only on that wiki under:`,
    `- Session \`${sessionPage}\` (notes; get-page at start if it exists)`,
    `- Output \`${outputPage}\` (JSON index)`,
    `- Drafts \`${outputPage}/<id>\` (full proposed page each)`,
    `Never edit live pages besides your own user subpages. Bot handles apply/reject status after review.`,
    `Docs (read-only, wiki= on tools): \`community.fandom.com\` (General wikitext and Fandom specific extensions), \`www.mediawiki.org\` (detailed wikitext, extensions, etc.). Use when unsure.`,
    `Output schema: {"drafts":[{"id":"shortId","jobId":"thisJobId","target":"Exact Page Title","status":"pending"}]}`,
    `Drafts: short unique id, jobId from user message, page at \`${outputPage}/<id>\`. Same target may have multiple ids. You only write status pending.`,
    `get-page Output first; keep existing drafts; write draft pages then Output JSON.`,
    `Each draft starts with \`<!-- aphonos-target: Exact Page Title -->\` then full replacement wikitext.`,
    `If a page uses Neow templates, read Help:Neowtext first.`,
    mos ? `Follow the manual of style: ${mos}.` : "",
    `Short Q&A may be Discord-only. End with a concise Discord summary; mention Output if you wrote drafts.`,
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
      ? `Continue this job: use its drafts in Output. For status rejected, fix the draft using reason, then set status pending and clear reason. Keep jobId \`${jobId}\.`
      : "",
    ``,
    `Task: ${task}`,
  ]
    .filter(Boolean)
    .join("\n");
}
