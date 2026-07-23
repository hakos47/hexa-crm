import { describe, expect, it, vi } from "vitest";
import {
  STRIPE_MCP_URL,
  pluginDefinition,
  sanitizePluginConfig,
  stripeToolAccess,
} from "./catalog";
import {
  sanitizeStripeConfig as vendorSanitizeStripeConfig,
  stripeToolAccess as vendorStripeToolAccess,
} from "../../../vendor/hexa-crm-plugins/plugins/stripe/src/index";

describe("tenant plugin catalog", () => {
  it("delegates stripe_mcp config sanitization and tool access to vendor package without network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const rawInput = {
      mcp_url: "https://attacker.invalid",
      credential_env: "hexa_stripe_shop_token",
      allow_write_tools: false,
    };

    const hostConfig = sanitizePluginConfig("stripe_mcp", rawInput);
    const vendorConfig = vendorSanitizeStripeConfig(rawInput);

    expect(hostConfig).toEqual(vendorConfig);
    expect(hostConfig.mcp_url).toBe(STRIPE_MCP_URL);

    // Verify write tool is blocked when allow_write_tools is false
    const writeAccessHost = stripeToolAccess("create_payment_link", hostConfig);
    const writeAccessVendor = vendorStripeToolAccess("create_payment_link", vendorConfig);

    expect(writeAccessHost).toEqual(writeAccessVendor);
    expect(writeAccessHost.allowed).toBe(false);
    expect(writeAccessHost.write).toBe(true);

    // Verify read tool is allowed
    const readAccessHost = stripeToolAccess("retrieve_balance", hostConfig);
    const readAccessVendor = vendorStripeToolAccess("retrieve_balance", vendorConfig);

    expect(readAccessHost).toEqual(readAccessVendor);
    expect(readAccessHost.allowed).toBe(true);
    expect(readAccessHost.write).toBe(false);

    // Verify no network calls were made during sanitization and access check
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

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
