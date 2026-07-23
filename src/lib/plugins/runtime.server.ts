import postgres from "postgres";
import type { PluginConfig, PluginTestResult, PluginToolResult } from "../types";
import {
  pluginSecretConfigured as stripePluginSecretConfigured,
  listStripeTools as vendorListStripeTools,
  testStripePlugin as vendorTestStripePlugin,
  callStripeTool as vendorCallStripeTool,
} from "../../../vendor/hexa-crm-plugins/plugins/stripe/src/index";

function secretFromEnv(ref: unknown): string {
  const name = String(ref ?? "");
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  if (!value) throw new Error(`Falta configurar el secreto ${name} en el servidor`);
  return value;
}

export function pluginSecretConfigured(config: PluginConfig, kind: "database" | "stripe"): boolean {
  if (kind === "stripe") {
    return stripePluginSecretConfigured(config as any);
  }
  const ref = config.database_url_env;
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

export async function listStripeTools(config: PluginConfig): Promise<any[]> {
  return vendorListStripeTools(config as any);
}

export async function testStripePlugin(config: PluginConfig): Promise<PluginTestResult> {
  return vendorTestStripePlugin(config as any);
}

export async function callStripeTool(
  config: PluginConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<PluginToolResult> {
  return vendorCallStripeTool(config as any, name, args) as Promise<PluginToolResult>;
}
