import type { PluginConfig, PluginKey } from "../types";

export type PluginCatalogEntry = {
  key: PluginKey;
  name: string;
  description: string;
  category: "datos" | "pagos";
  capabilities: string[];
  defaultConfig: PluginConfig;
};

export const STRIPE_MCP_URL = "https://mcp.stripe.com";

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
  {
    key: "stripe_mcp",
    name: "Stripe MCP",
    description: "Da al asistente herramientas oficiales de Stripe para consultar y operar la cuenta.",
    category: "pagos",
    capabilities: ["Saldo, clientes y pagos", "Facturas y enlaces de pago", "Operaciones con confirmación"],
    defaultConfig: {
      mcp_url: STRIPE_MCP_URL,
      credential_env: "HEXA_STRIPE_SHOP_TOKEN",
      environment: "sandbox",
      allow_write_tools: false,
      require_approval: true,
    },
  },
] as const;

export const STRIPE_READ_TOOLS = new Set([
  "get_stripe_account_info",
  "retrieve_balance",
  "list_coupons",
  "list_customers",
  "list_disputes",
  "list_invoices",
  "list_payment_intents",
  "list_prices",
  "list_products",
  "list_subscriptions",
  "search_stripe_resources",
  "fetch_stripe_resources",
  "search_stripe_documentation",
]);

export const STRIPE_WRITE_TOOLS = new Set([
  "create_coupon",
  "create_customer",
  "update_dispute",
  "create_invoice",
  "create_invoice_item",
  "finalize_invoice",
  "create_payment_link",
  "create_price",
  "create_product",
  "create_refund",
  "cancel_subscription",
  "update_subscription",
]);

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
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
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
  return {
    mcp_url: STRIPE_MCP_URL,
    credential_env: cleanEnvRef(raw.credential_env, "HEXA_STRIPE_SHOP_TOKEN", "HEXA_STRIPE_"),
    environment: raw.environment === "live" ? "live" : "sandbox",
    allow_write_tools: raw.allow_write_tools === true,
    // Write operations always require an explicit human confirmation.
    require_approval: true,
  };
}

export function stripeToolAccess(toolName: string, config: PluginConfig) {
  if (STRIPE_READ_TOOLS.has(toolName)) return { allowed: true, write: false, approval: false };
  if (STRIPE_WRITE_TOOLS.has(toolName)) {
    const allowed = config.allow_write_tools === true;
    return { allowed, write: true, approval: true };
  }
  return { allowed: false, write: false, approval: false };
}
