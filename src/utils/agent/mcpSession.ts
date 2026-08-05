import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mcpServerConfig } from "./wikis.js";

const require = createRequire(import.meta.url);

export class McpSession {
  #client: Client | null = null;
  #transport: StdioClientTransport | null = null;
  #configPath: string | null = null;

  async connect() {
    this.#configPath = path.join(
      tmpdir(),
      `altershaper-mw-mcp-${randomBytes(4).toString("hex")}.json`,
    );
    writeFileSync(this.#configPath, JSON.stringify(mcpServerConfig()));

    this.#transport = new StdioClientTransport({
      command: process.execPath,
      args: [require.resolve("@professional-wiki/mediawiki-mcp-server")],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (e): e is [string, string] => e[1] !== undefined,
          ),
        ),
        CONFIG: this.#configPath,
        MCP_TRANSPORT: "stdio",
        MCP_LOG_LEVEL: process.env.MCP_LOG_LEVEL ?? "warning",
      },
    });

    this.#client = new Client({ name: "altershaper-job", version: "1.0.0" });
    await this.#client.connect(this.#transport);
  }

  async listTools() {
    return (await this.#client!.listTools()).tools;
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const res = await this.#client!.callTool({ name, arguments: args });
    const text = contentText(res.content);
    return res.isError ? `Error: ${text}` : text;
  }

  async close() {
    await this.#client?.close().catch((err) =>
      console.error("[mcp] client close", err),
    );
    await this.#transport?.close().catch((err) =>
      console.error("[mcp] transport close", err),
    );
    if (this.#configPath) {
      try {
        unlinkSync(this.#configPath);
      } catch (err) {
        console.error("[mcp] config unlink", this.#configPath, err);
      }
      this.#configPath = null;
    }
    this.#client = null;
    this.#transport = null;
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((part) =>
      part && typeof part === "object" && "text" in part
        ? String((part as { text: string }).text)
        : JSON.stringify(part),
    )
    .join("\n");
}
