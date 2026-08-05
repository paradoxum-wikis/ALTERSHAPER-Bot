import type { WikiConfig } from "./wikis.js";

type Json = Record<string, unknown>;

function mergeCookies(existing: string, response: Response): string {
  const set =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")!]
        : [];

  const map = new Map<string, string>();
  for (const pair of existing
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  for (const raw of set) {
    const part = raw.split(";")[0];
    const i = part.indexOf("=");
    if (i === -1) continue;
    map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function post(
  apiBase: string,
  params: Record<string, string>,
  cookie = "",
): Promise<{ json: Json; cookie: string }> {
  const res = await fetch(apiBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  return {
    json: (await res.json()) as Json,
    cookie: mergeCookies(cookie, res),
  };
}

async function login(apiBase: string): Promise<string> {
  const user = process.env.WIKI_BOT_USERNAME;
  const pass = process.env.WIKI_BOT_PASSWORD;
  if (!user || !pass) {
    throw new Error("WIKI_BOT_USERNAME / WIKI_BOT_PASSWORD not set");
  }

  const tokenRes = await post(apiBase, {
    action: "query",
    meta: "tokens",
    type: "login",
    format: "json",
  });
  const logintoken = (tokenRes.json.query as { tokens: { logintoken: string } })
    .tokens.logintoken;

  const loginRes = await post(
    apiBase,
    {
      action: "login",
      lgname: user,
      lgpassword: pass,
      lgtoken: logintoken,
      format: "json",
    },
    tokenRes.cookie,
  );
  const result = (loginRes.json.login as { result: string })?.result;
  if (result !== "Success") {
    throw new Error(`Wiki login failed: ${result ?? "unknown"}`);
  }
  return loginRes.cookie;
}

export interface PageInfo {
  exists: boolean;
  length: number;
}

export async function getPageInfo(
  wiki: WikiConfig,
  titles: string | string[],
): Promise<Map<string, PageInfo>> {
  const list = Array.isArray(titles) ? titles : [titles];
  const url = new URL(wiki.apiBase);
  url.search = new URLSearchParams({
    action: "query",
    prop: "info",
    titles: list.join("|"),
    format: "json",
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; missing?: boolean | string; length?: number }
      >;
    };
  };

  const out = new Map<string, PageInfo>();
  for (const title of list) out.set(title, { exists: false, length: 0 });
  for (const page of Object.values(data.query?.pages ?? {})) {
    if (!page.title) continue;
    out.set(page.title, {
      exists: page.missing === undefined,
      length: page.length ?? 0,
    });
  }
  return out;
}

export async function listSubpages(
  wiki: WikiConfig,
  titlePrefix: string,
): Promise<string[]> {
  const colon = titlePrefix.indexOf(":");
  if (colon === -1) return [];
  const nsName = titlePrefix.slice(0, colon);
  const rest = titlePrefix.slice(colon + 1);
  const ns = nsName.toLowerCase() === "user" ? 2 : 0;

  const titles: string[] = [];
  let apcontinue: string | undefined;
  do {
    const params = new URLSearchParams({
      action: "query",
      list: "allpages",
      apnamespace: String(ns),
      apprefix: rest,
      aplimit: "50",
      format: "json",
      formatversion: "2",
    });
    if (apcontinue) params.set("apcontinue", apcontinue);

    const res = await fetch(`${wiki.apiBase}?${params}`);
    if (!res.ok) throw new Error(`Wiki API ${res.status}`);
    const data = (await res.json()) as {
      continue?: { apcontinue?: string };
      query?: { allpages?: { title: string }[] };
    };
    for (const p of data.query?.allpages ?? []) titles.push(p.title);
    apcontinue = data.continue?.apcontinue;
  } while (apcontinue);

  return titles;
}

export async function getPageWikitext(
  wiki: WikiConfig,
  title: string,
): Promise<string | null> {
  const url = new URL(wiki.apiBase);
  url.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: title,
    format: "json",
    formatversion: "2",
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  const data = (await res.json()) as {
    query?: {
      pages?: {
        missing?: boolean;
        revisions?: { slots?: { main?: { content?: string } } }[];
      }[];
    };
  };
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page.revisions?.[0]?.slots?.main?.content ?? null;
}

async function session(wiki: WikiConfig) {
  const cookie = await login(wiki.apiBase);
  const tokenRes = await post(
    wiki.apiBase,
    {
      action: "query",
      meta: "tokens",
      type: "csrf",
      format: "json",
    },
    cookie,
  );
  const csrftoken = (tokenRes.json.query as { tokens: { csrftoken: string } })
    .tokens.csrftoken;
  return { cookie: tokenRes.cookie, csrftoken };
}

async function editWith(
  wiki: WikiConfig,
  auth: { cookie: string; csrftoken: string },
  title: string,
  text: string,
  summary: string,
  bot = true,
): Promise<void> {
  const params: Record<string, string> = {
    action: "edit",
    title,
    text,
    summary,
    token: auth.csrftoken,
    format: "json",
  };
  if (bot) params.bot = "1";
  const editRes = await post(wiki.apiBase, params, auth.cookie);

  const result = editRes.json.edit as { result?: string } | undefined;
  if (result?.result !== "Success") {
    const code = (editRes.json.error as { code?: string } | undefined)?.code;
    if (code === "missingtitle" || code === "emptypage") return;
    throw new Error(
      `Edit failed: ${JSON.stringify(editRes.json.error ?? editRes.json)}`,
    );
  }
}

async function editPages(
  wiki: WikiConfig,
  edits: { title: string; text: string; summary: string; bot?: boolean }[],
) {
  if (!edits.length) return;
  const auth = await session(wiki);
  for (const e of edits) {
    await editWith(wiki, auth, e.title, e.text, e.summary, e.bot !== false);
  }
}

export async function clearPages(wiki: WikiConfig, titles: string[]) {
  await editPages(
    wiki,
    titles.map((title) => ({
      title,
      text: /\.json$/i.test(title) ? "{}" : "",
      summary: "Clear job page",
    })),
  );
}

export async function publishPage(
  wiki: WikiConfig,
  title: string,
  text: string,
  summary: string,
) {
  await editPages(wiki, [{ title, text, summary }]);
}

export interface OutputDraft {
  id: string;
  jobId: string;
  target: string;
  status: "pending" | "applied" | "rejected";
  reason?: string;
}

export interface OutputIndex {
  drafts: OutputDraft[];
}

export async function getOutputIndex(
  wiki: WikiConfig,
  title: string,
): Promise<OutputIndex> {
  const raw = await getPageWikitext(wiki, title);
  if (!raw?.trim()) return { drafts: [] };
  try {
    const data = JSON.parse(raw) as OutputIndex;
    return { drafts: data.drafts ?? [] };
  } catch (err) {
    console.error("[wikiApi] invalid output JSON", title, err);
    return { drafts: [] };
  }
}

export async function setDraftStatus(
  wiki: WikiConfig,
  indexTitle: string,
  draftId: string,
  status: "applied" | "rejected",
  reason?: string,
): Promise<void> {
  const index = await getOutputIndex(wiki, indexTitle);
  const draft = index.drafts.find((d) => d.id === draftId);
  if (!draft || draft.status === status) return;
  draft.status = status;
  if (status === "rejected") draft.reason = reason ?? "";
  else delete draft.reason;
  await publishPage(
    wiki,
    indexTitle,
    JSON.stringify(index),
    `Mark ${status}: ${draftId}`,
  );
}

export async function publishAndApply(
  wiki: WikiConfig,
  opts: {
    target: string;
    body: string;
    summary: string;
    indexTitle: string;
    draftId: string;
    index: OutputIndex;
  },
): Promise<void> {
  const draft = opts.index.drafts.find((d) => d.id === opts.draftId);
  if (draft) {
    draft.status = "applied";
    delete draft.reason;
  }
  await editPages(wiki, [
    {
      title: opts.target,
      text: opts.body,
      summary: opts.summary,
      bot: false,
    },
    {
      title: opts.indexTitle,
      text: JSON.stringify(opts.index),
      summary: `Mark applied: ${opts.draftId}`,
    },
  ]);
}

export interface CompareResult {
  fromSize: number;
  toSize: number;
  diffSize: number;
  text: string;
}

export async function compareToText(
  wiki: WikiConfig,
  title: string,
  toText: string,
): Promise<CompareResult> {
  const params = new URLSearchParams({
    action: "compare",
    fromtitle: title,
    toslots: "main",
    "totext-main": toText,
    prop: "diff|diffsize|size",
    format: "json",
    formatversion: "2",
  });

  const res = await fetch(wiki.apiBase, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  const data = (await res.json()) as {
    error?: { code?: string; info?: string };
    compare?: {
      body?: string;
      fromsize?: number;
      tosize?: number;
      diffsize?: number;
    };
  };

  if (data.error?.code === "missingtitle") {
    return {
      fromSize: 0,
      toSize: Buffer.byteLength(toText, "utf8"),
      diffSize: Buffer.byteLength(toText, "utf8"),
      text: toText
        .split(/\r?\n/)
        .map((l) => `+ ${l}`)
        .join("\n"),
    };
  }
  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "compare failed");
  }

  const c = data.compare;
  if (!c) throw new Error("No compare result");

  return {
    fromSize: c.fromsize ?? 0,
    toSize: c.tosize ?? Buffer.byteLength(toText, "utf8"),
    diffSize: c.diffsize ?? 0,
    text: c.body ? htmlDiffToText(c.body) : "(no diff body)",
  };
}

function htmlDiffToText(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
        String.fromCodePoint(parseInt(h, 16)),
      )
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ");

  const strip = (s: string) => decode(s.replace(/<[^>]+>/g, "")).trim();
  const lines: string[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const cells: { className: string; inner: string }[] = [];
    const cellRe = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1]))) {
      const cm = cell[1].match(/class\s*=\s*"([^"]*)"/i);
      cells.push({ className: cm?.[1] ?? "", inner: cell[2] });
    }
    const find = (frag: string) =>
      cells.find((c) => c.className.includes(frag));
    const lineno = find("diff-lineno");
    if (lineno) {
      const m = strip(lineno.inner).match(/Line\s+(\d+)/i);
      if (m) lines.push(`@@ ${m[1]} @@`);
      continue;
    }
    const ctx = find("diff-context");
    if (ctx) {
      lines.push(`  ${strip(ctx.inner)}`);
      continue;
    }
    const del = find("diff-deletedline");
    const add = find("diff-addedline");
    if (del) lines.push(`- ${strip(del.inner)}`);
    if (add) lines.push(`+ ${strip(add.inner)}`);
  }
  return lines.join("\n");
}
