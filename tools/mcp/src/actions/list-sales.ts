import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "list_sales",
  description: "Historial de ventas/tickets (incluye anuladas). Requiere sesión.",
  category: "sales",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("list_sales", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
