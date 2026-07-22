import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "vat_summary",
  description:
    "Resumen de IVA (control interno) entre from y to (YYYY-MM-DD). No es libro oficial AEAT.",
  category: "reports",
};

const input = {
  from: z.string().describe("Fecha inicio YYYY-MM-DD"),
  to: z.string().describe("Fecha fin YYYY-MM-DD"),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async ({ from, to }) => {
    try {
      const data = await callRpc("vat_summary", { from, to });
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
