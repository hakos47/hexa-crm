import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "ollama_health",
  description: "Comprueba si Ollama responde y lista modelos instalados.",
  category: "ai",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("ollama_health", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
