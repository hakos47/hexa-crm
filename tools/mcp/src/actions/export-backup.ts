import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "export_backup",
  description:
    "Exporta copia de seguridad versionada (admin). Puede ser un payload grande; preferir en tareas de mantenimiento.",
  category: "system",
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, {}, async () => {
    try {
      const data = await callRpc("export_backup", {});
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
