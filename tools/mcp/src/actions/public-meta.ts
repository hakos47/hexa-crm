import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "public_meta",
  description: "Nombre público de la tienda (sin sesión). Útil para comprobar que el RPC responde.",
  category: "system",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("public_meta", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
