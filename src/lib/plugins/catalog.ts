import type { PluginConfig, PluginKey } from "../types";
import {
  STRIPE_MCP_URL,
  STRIPE_PLUGIN_CATALOG_ENTRY,
  STRIPE_READ_TOOLS,
  STRIPE_WRITE_TOOLS,
  sanitizeStripeConfig,
  stripeToolAccess as vendorStripeToolAccess,
} from "../../../vendor/hexa-crm-plugins/plugins/stripe/src/index";

export { STRIPE_MCP_URL, STRIPE_READ_TOOLS, STRIPE_WRITE_TOOLS };

export function stripeToolAccess(toolName: string, config: PluginConfig) {
  return vendorStripeToolAccess(toolName, config as any);
}


export type PluginCatalogEntry = {
  key: PluginKey;
  name: string;
  description: string;
  category: "datos" | "pagos";
  capabilities: string[];
  defaultConfig: PluginConfig;
};

export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
  {
    key: "database_bridge",
    name: "Base de datos externa",
    description: "Conecta los datos de esta tienda con una base PostgreSQL independiente.",
    category: "datos",
    capabilities: ["Comprobar conexión", "Separación por tienda", "Lectura o lectura y escritura"],
    defaultConfig: {
      display_name: "Base de datos de la tienda",
      database_url_env: "HEXA_PLUGIN_DATABASE_SHOP_URL",
      access_mode: "read_only",
    },
  },
  STRIPE_PLUGIN_CATALOG_ENTRY,
] as const;

export function pluginDefinition(key: unknown): PluginCatalogEntry {
  const found = PLUGIN_CATALOG.find((plugin) => plugin.key === key);
  if (!found) throw new Error("Plugin no reconocido");
  return found;
}

function cleanEnvRef(value: unknown, fallback: string, prefix: string): string {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]{2,127}$/.test(normalized) || !normalized.startsWith(prefix)) {
    throw new Error(`La referencia de secreto debe usar una variable ${prefix}* válida`);
  }
  return normalized;
}

export function sanitizePluginConfig(key: PluginKey, input: unknown): PluginConfig {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (key === "database_bridge") {
    return {
      display_name: String(raw.display_name ?? "Base de datos de la tienda").trim().slice(0, 80),
      database_url_env: cleanEnvRef(
        raw.database_url_env,
        "HEXA_PLUGIN_DATABASE_SHOP_URL",
        "HEXA_PLUGIN_DATABASE_",
      ),
      access_mode: raw.access_mode === "read_write" ? "read_write" : "read_only",
    };
  }
  return sanitizeStripeConfig(input);
}
