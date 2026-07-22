import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "get_cash_balance",
  description: "Saldo actual de caja en céntimos.",
  category: "cash",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("get_cash_balance", {});
      return textResult({ cash_balance_cents: data });
    } catch (e) {
      return errorResult(e);
    }
  });
}
