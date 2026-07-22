import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "dashboard_stats",
  description:
    "KPIs de la tienda: ventas hoy/mes, tickets, caja, IVA del mes y productos con stock bajo. Requiere sesión.",
  category: "reports",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("dashboard_stats", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
