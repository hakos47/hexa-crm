import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "cancel_sale",
  description:
    "Anula un ticket completed: restaura stock y registra gasto de caja por el total. No es devolución parcial.",
  category: "sales",
};

const input = {
  id: z.number().int().positive().describe("ID de la venta a anular"),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async ({ id }) => {
    try {
      const data = await callRpc("cancel_sale", { id });
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
