import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import { setSessionToken } from "../session.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "login_agent",
  description:
    "Inicia sesión en hexa-crm como agente/usuario y guarda el token en el proceso MCP. Usar usuario+contraseña del CRM (p.ej. admin/1234 en demo). Si HEXA_CRM_AGENT_TOKEN (o legado NIX_C_AGENT_TOKEN) ya está en el entorno, no es obligatorio.",
  category: "auth",
};

const input = {
  username: z.string().describe("Usuario CRM"),
  password: z.string().describe("Contraseña o PIN"),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async ({ username, password }) => {
    try {
      const data = await callRpc<{ token?: string; user?: unknown }>(
        "login",
        { username, password, pin: password },
        { token: null },
      );
      if (!data?.token) {
        return errorResult(new Error("Login sin token en la respuesta"));
      }
      setSessionToken(data.token);
      return textResult({
        ok: true,
        user: data.user,
        message: "Sesión de agente activa en este proceso MCP",
      });
    } catch (e) {
      return errorResult(e);
    }
  });
}
