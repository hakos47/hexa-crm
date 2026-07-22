import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "list_products",
  description: "Lista productos del catálogo. active_only=true solo activos.",
  category: "catalog",
};

const input = {
  active_only: z
    .boolean()
    .optional()
    .describe("Si true, solo productos activos (default true)"),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async ({ active_only }) => {
    try {
      const data = await callRpc("list_products", {
        active_only: active_only ?? true,
      });
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
