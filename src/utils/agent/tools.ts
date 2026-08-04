import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { FunctionParameters } from "openai/resources/shared";
import type { WikiConfig } from "./wikis.js";
import { isWritablePage } from "./wikis.js";

const ALLOWED = new Set([
  "get-page",
  "get-pages",
  "search-page",
  "search-page-by-prefix",
  "get-category-members",
  "get-page-history",
  "get-revision",
  "compare-pages",
  "get-links-here",
  "get-recent-changes",
  "get-site-info",
  "parse-wikitext",
  "whoami",
  "get-file",
  "create-page",
  "update-page",
]);

const WRITE = new Set(["create-page", "update-page"]);

export function toTools(
  mcpTools: { name: string; description?: string; inputSchema?: unknown }[],
): ChatCompletionTool[] {
  return mcpTools
    .filter((t) => ALLOWED.has(t.name))
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: (t.inputSchema ?? {
          type: "object",
          properties: {},
        }) as FunctionParameters,
      },
    }));
}

export function prepareToolArgs(
  name: string,
  rawArgs: string,
  wiki: WikiConfig,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, error: "Invalid JSON arguments" };
  }

  args.wiki = wiki.mcpKey;

  if (WRITE.has(name)) {
    const title = String(args.title ?? "");
    if (!title || !isWritablePage(wiki, title)) {
      return {
        ok: false,
        error: `Writes limited to ${wiki.sessionPrefix}/ or ${wiki.outputPrefix}/ (got: ${title || "(empty)"})`,
      };
    }
    args.bot = true;
  }

  return { ok: true, args };
}
