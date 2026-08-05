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
    `- Session \`${sessionPage}\` for notes and or prior context (get-page at start if it exists)`,
    `- Output index \`${outputPage}\` for short link list only`,
    `- Drafts \`${outputPage}/ExactPageTitle\` for one full proposed page each`,
    `Never edit live pages besides your own user subpages.`,
    `Each draft starts with \`<!-- aphonos-target: Exact Page Title -->\` then the full replacement wikitext.`,
    `Prefer subpage drafts; multi-article jobs use one subpage per title and keep the index as links only.`,
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
): string {
  return [
    `Session: \`${sessionPage}\``,
    `Output: \`${outputPage}\` (drafts: \`${outputPage}/<PageTitle>\`)`,
    ``,
    `Task: ${task}`,
  ].join("\n");
}
