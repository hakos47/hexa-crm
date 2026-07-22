#!/usr/bin/env node
/**
 * hexa-crm MCP server (stdio).
 *
 * Env (preferred):
 *   HEXA_CRM_URL=http://127.0.0.1:1420
 *   HEXA_CRM_AGENT_TOKEN=...   # optional pre-auth Bearer
 * Legacy aliases: NIX_C_URL, NIX_C_AGENT_TOKEN, …
 *
 * Grok / Cursor:
 *   command = node / path/to/tools/mcp/dist/index.js
 *   or: npm run dev --prefix tools/mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerAllActions, listActionMeta } from "./actions/index.js";

async function main() {
  const cfg = loadConfig();

  const server = new McpServer({
    name: "hexa-crm-mcp",
    version: "0.1.0",
  });

  registerAllActions(server);

  // Resource: catalog of actions for agents / humans
  server.resource(
    "actions-catalog",
    "hexa-crm://actions",
    async () => ({
      contents: [
        {
          uri: "hexa-crm://actions",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              rpc: `${cfg.rpcBaseUrl}${cfg.rpcPath}`,
              agent_token_configured: Boolean(cfg.agentToken),
              actions: listActionMeta(),
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only — stdout is MCP protocol
  console.error(
    `[hexa-crm-mcp] ready · rpc=${cfg.rpcBaseUrl}${cfg.rpcPath} · actions=${listActionMeta().length} · token=${cfg.agentToken ? "env" : "login_agent"}`,
  );
}

main().catch((err) => {
  console.error("[hexa-crm-mcp] fatal", err);
  process.exit(1);
});
