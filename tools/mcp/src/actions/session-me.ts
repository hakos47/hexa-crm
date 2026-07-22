import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "session_me",
  description: "Usuario de la sesión actual del agente (null si no hay token).",
  category: "auth",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("session_me", {});
      return textResult(data ?? { user: null });
    } catch (e) {
      return errorResult(e);
    }
  });
}
