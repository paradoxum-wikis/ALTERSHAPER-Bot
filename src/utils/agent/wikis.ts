export type WikiChoice = "tds" | "alterego";

export interface WikiConfig {
  choice: WikiChoice;
  mcpKey: string;
  sitename: string;
  publicBase: string;
  apiBase: string;
  sessionPrefix: string;
  outputPrefix: string;
}

/**
 * Bot passwords log in as Account@Name
 * but user pages don't have that suffix.
 */
export function wikiAccountName(): string {
  const raw = process.env.WIKI_BOT_USERNAME;
  if (!raw) throw new Error("WIKI_BOT_USERNAME is not set");
  const at = raw.indexOf("@");
  return at === -1 ? raw : raw.slice(0, at);
}

const WIKIS = {
  tds: {
    mcpKey: "tds.fandom.com",
    sitename: "Tower Defense Simulator Wiki",
    publicBase: "https://tds.fandom.com/wiki/",
    apiBase: "https://tds.fandom.com/api.php",
    server: "https://tds.fandom.com",
  },
  alterego: {
    mcpKey: "alter-ego.fandom.com",
    sitename: "ALTER EGO Wiki",
    publicBase: "https://alterego.wiki/wiki/",
    apiBase: "https://alter-ego.fandom.com/api.php",
    server: "https://alter-ego.fandom.com",
  },
} as const satisfies Record<
  WikiChoice,
  Omit<WikiConfig, "choice" | "sessionPrefix" | "outputPrefix"> & {
    server: string;
  }
>;

export function mcpServerConfig() {
  const wikis: Record<string, object> = {};
  for (const w of Object.values(WIKIS)) {
    wikis[w.mcpKey] = {
      sitename: w.sitename,
      server: w.server,
      articlepath: "/wiki",
      scriptpath: "/",
      username: "${WIKI_BOT_USERNAME}",
      password: "${WIKI_BOT_PASSWORD}",
      private: false,
      attributeEdits: false,
    };
  }
  return {
    allowWikiManagement: false,
    defaultWiki: WIKIS.tds.mcpKey,
    wikis,
  };
}

export function resolveWiki(choice: string | null | undefined): WikiConfig {
  const key: WikiChoice = choice === "alterego" ? "alterego" : "tds";
  const account = wikiAccountName();
  return {
    choice: key,
    ...WIKIS[key],
    sessionPrefix: process.env.JOB_SESSION_PREFIX ?? `User:${account}/Sessions`,
    outputPrefix: process.env.JOB_OUTPUT_PREFIX ?? `User:${account}/Output`,
  };
}

export const sessionTitle = (wiki: WikiConfig, userId: string) =>
  `${wiki.sessionPrefix}/${userId}`;

export const outputTitle = (wiki: WikiConfig, userId: string) =>
  `${wiki.outputPrefix}/${userId}`;

export const pageUrl = (wiki: WikiConfig, title: string) =>
  wiki.publicBase + title.replaceAll(" ", "_");

export function comparePagesUrl(
  wiki: WikiConfig,
  page1: string,
  page2: string,
): string {
  const q = new URLSearchParams({ page1, page2 });
  return `${wiki.publicBase}Special:ComparePages?${q}`;
}

export function isWritablePage(wiki: WikiConfig, title: string): boolean {
  const t = title.replaceAll("_", " ");
  for (const prefix of [wiki.sessionPrefix, wiki.outputPrefix]) {
    const p = prefix.replaceAll("_", " ");
    if (t === p || t.startsWith(`${p}/`)) return true;
  }
  return false;
}
