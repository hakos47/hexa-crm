import { describe, expect, it } from "vitest";
import {
  STRIPE_MCP_URL,
  pluginDefinition,
  sanitizePluginConfig,
  stripeToolAccess,
} from "./catalog";

describe("tenant plugin catalog", () => {
  it("keeps Stripe on the official MCP endpoint and forces approval", () => {
    const config = sanitizePluginConfig("stripe_mcp", {
      mcp_url: "https://attacker.invalid",
      credential_env: "hexa_stripe_shop_token",
      allow_write_tools: true,
      require_approval: false,
    });
    expect(config.mcp_url).toBe(STRIPE_MCP_URL);
    expect(config.credential_env).toBe("HEXA_STRIPE_SHOP_TOKEN");
    expect(config.require_approval).toBe(true);
    expect(stripeToolAccess("create_refund", config)).toEqual({
      allowed: true,
      write: true,
      approval: true,
    });
  });

  it("blocks writes unless the tenant enabled them", () => {
    const config = sanitizePluginConfig("stripe_mcp", { allow_write_tools: false });
    expect(stripeToolAccess("create_payment_link", config).allowed).toBe(false);
    expect(stripeToolAccess("retrieve_balance", config).allowed).toBe(true);
    expect(stripeToolAccess("invented_tool", config).allowed).toBe(false);
  });

  it("stores only environment references for database credentials", () => {
    const config = sanitizePluginConfig("database_bridge", {
      database_url_env: "hexa_plugin_database_shop_url",
      access_mode: "read_write",
    });
    expect(config.database_url_env).toBe("HEXA_PLUGIN_DATABASE_SHOP_URL");
    expect(config.access_mode).toBe("read_write");
    expect(config).not.toHaveProperty("password");
  });

  it("rejects unknown plugins and invalid secret references", () => {
    expect(() => pluginDefinition("unknown")).toThrow("Plugin no reconocido");
    expect(() => sanitizePluginConfig("stripe_mcp", { credential_env: "bad-secret!" })).toThrow(
      "HEXA_STRIPE_",
    );
    expect(() => sanitizePluginConfig("stripe_mcp", { credential_env: "DATABASE_URL" })).toThrow(
      "HEXA_STRIPE_",
    );
  });
});
