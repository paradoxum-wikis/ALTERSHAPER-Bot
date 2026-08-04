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
  for (const pair of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
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
  const logintoken = (
    tokenRes.json.query as { tokens: { logintoken: string } }
  ).tokens.logintoken;

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

export async function clearPage(
  wiki: WikiConfig,
  title: string,
): Promise<void> {
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
  const csrftoken = (
    tokenRes.json.query as { tokens: { csrftoken: string } }
  ).tokens.csrftoken;

  const editRes = await post(
    wiki.apiBase,
    {
      action: "edit",
      title,
      text: "",
      summary: "Clear job page",
      token: csrftoken,
      format: "json",
      bot: "1",
    },
    tokenRes.cookie,
  );

  const edit = editRes.json.edit as { result?: string } | undefined;
  if (edit?.result !== "Success") {
    throw new Error(
      `Clear failed: ${JSON.stringify(editRes.json.error ?? editRes.json)}`,
    );
  }
}
