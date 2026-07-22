import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "get_sale",
  description: "Detalle de una venta por id, con líneas.",
  category: "sales",
};

const input = {
  id: z.number().int().positive().describe("ID de la venta"),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async ({ id }) => {
    try {
      const data = await callRpc("get_sale", { id });
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
