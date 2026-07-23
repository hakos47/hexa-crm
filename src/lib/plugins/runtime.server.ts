import postgres from "postgres";
import type { PluginConfig, PluginTestResult, PluginToolResult } from "../types";
import { STRIPE_MCP_URL } from "./catalog";

function secretFromEnv(ref: unknown): string {
  const name = String(ref ?? "");
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  if (!value) throw new Error(`Falta configurar el secreto ${name} en el servidor`);
  return value;
}

export function pluginSecretConfigured(config: PluginConfig, kind: "database" | "stripe"): boolean {
  const ref = kind === "database" ? config.database_url_env : config.credential_env;
  return !!(ref && typeof process !== "undefined" && process.env[String(ref)]);
}

export async function testDatabasePlugin(config: PluginConfig): Promise<PluginTestResult> {
  const connection = postgres(secretFromEnv(config.database_url_env), {
    max: 1,
    connect_timeout: 6,
    idle_timeout: 1,
  });
  try {
    const rows = await connection`SELECT current_database() AS database, current_setting('server_version') AS version`;
    return {
      ok: true,
      message: `Conectado a ${rows[0]?.database ?? "PostgreSQL"}`,
      details: { database: rows[0]?.database, version: rows[0]?.version },
    };
  } finally {
    await connection.end({ timeout: 2 }).catch(() => undefined);
  }
}

function parseMcpBody(raw: string): unknown {
  const lines = raw.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const json = lines.length ? lines.at(-1)!.slice(5).trim() : raw.trim();
  return json ? JSON.parse(json) : {};
}

async function stripeMcpRequest(
  token: string,
  payload: unknown,
  sessionId?: string | null,
): Promise<{ result: any; sessionId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const response = await fetch(STRIPE_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Stripe MCP respondió HTTP ${response.status}`);
  const parsed = body.trim() ? parseMcpBody(body) as any : {};
  if (parsed?.error) throw new Error(parsed.error.message || "Stripe MCP rechazó la petición");
  return { result: parsed?.result ?? parsed, sessionId: response.headers.get("mcp-session-id") ?? sessionId ?? null };
}

async function stripeMcp(config: PluginConfig, method: string, params?: unknown): Promise<any> {
  const token = secretFromEnv(config.credential_env);
  const initialized = await stripeMcpRequest(token, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "hexa-crm", version: "0.2.0" },
    },
  });
  await stripeMcpRequest(
    token,
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    initialized.sessionId,
  );
  const response = await stripeMcpRequest(
    token,
    { jsonrpc: "2.0", id: crypto.randomUUID(), method, params },
    initialized.sessionId,
  );
  return response.result;
}

export async function listStripeTools(config: PluginConfig): Promise<any[]> {
  const result = await stripeMcp(config, "tools/list", {});
  return Array.isArray(result?.tools) ? result.tools : [];
}

export async function testStripePlugin(config: PluginConfig): Promise<PluginTestResult> {
  const tools = await listStripeTools(config);
  return { ok: true, message: `Stripe MCP conectado: ${tools.length} herramientas disponibles`, details: { tools: tools.length } };
}

export async function callStripeTool(
  config: PluginConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<PluginToolResult> {
  const result = await stripeMcp(config, "tools/call", { name, arguments: args });
  return { ok: true, plugin_key: "stripe_mcp", tool_name: name, result };
}
