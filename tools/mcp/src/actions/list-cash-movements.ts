import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "list_cash_movements",
  description: "Movimientos de caja (ingresos, gastos, ajustes).",
  category: "cash",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("list_cash_movements", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
