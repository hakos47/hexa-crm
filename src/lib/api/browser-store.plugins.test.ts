import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";

beforeEach(() => {
  __resetBrowserStoreForTests();
});

describe("tenant plugin management (browser-store)", () => {
  it("loads both catalog plugins for active session with default states", async () => {
    const login = await browserApi.login("admin", "1234");
    const plugins = await browserApi.list_plugins(login.token);

    expect(plugins.length).toBe(2);

    const dbPlugin = plugins.find((p) => p.plugin_key === "database_bridge");
    const stripePlugin = plugins.find((p) => p.plugin_key === "stripe_mcp");

    expect(dbPlugin).toBeDefined();
    expect(dbPlugin?.enabled).toBe(false);
    expect(dbPlugin?.status).toBe("inactive");
    expect(dbPlugin?.config.database_url_env).toBe("HEXA_PLUGIN_DATABASE_SHOP_URL");

    expect(stripePlugin).toBeDefined();
    expect(stripePlugin?.enabled).toBe(false);
    expect(stripePlugin?.status).toBe("inactive");
    expect(stripePlugin?.config.credential_env).toBe("HEXA_STRIPE_SHOP_TOKEN");
  });

  it("persists plugin configuration per active company", async () => {
    const login = await browserApi.login("admin", "1234");
    const token = login.token;

    const updated = await browserApi.update_plugin(
      "database_bridge",
      true,
      {
        display_name: "Base Central SHOP",
        database_url_env: "HEXA_PLUGIN_DATABASE_CUSTOM_URL",
        access_mode: "read_write",
      },
      token,
    );

    expect(updated.enabled).toBe(true);
    expect(updated.status).toBe("ready");
    expect(updated.config.display_name).toBe("Base Central SHOP");
    expect(updated.config.database_url_env).toBe("HEXA_PLUGIN_DATABASE_CUSTOM_URL");
    expect(updated.config.access_mode).toBe("read_write");

    const reloaded = await browserApi.list_plugins(token);
    const dbReloaded = reloaded.find((p) => p.plugin_key === "database_bridge");
    expect(dbReloaded?.enabled).toBe(true);
    expect(dbReloaded?.config.display_name).toBe("Base Central SHOP");
  });

  it("isolates plugin state between different companies", async () => {
    const login = await browserApi.login("admin", "1234");
    const token = login.token;

    // Configure company 1 (SHOP)
    await browserApi.update_plugin(
      "stripe_mcp",
      true,
      {
        credential_env: "HEXA_STRIPE_SHOP_TOKEN",
        environment: "live",
        allow_write_tools: true,
      },
      token,
    );

    // Switch to company 2 (DEV)
    browserApi.set_active_company(2, token);

    const devPlugins = await browserApi.list_plugins(token);
    const devStripe = devPlugins.find((p) => p.plugin_key === "stripe_mcp");
    expect(devStripe?.enabled).toBe(false);
    expect(devStripe?.config.environment).toBe("sandbox");

    // Configure company 2 (DEV) differently
    await browserApi.update_plugin(
      "stripe_mcp",
      true,
      {
        credential_env: "HEXA_STRIPE_DEV_TOKEN",
        environment: "sandbox",
        allow_write_tools: false,
      },
      token,
    );

    // Switch back to company 1 (SHOP)
    browserApi.set_active_company(1, token);
    const shopPlugins = await browserApi.list_plugins(token);
    const shopStripe = shopPlugins.find((p) => p.plugin_key === "stripe_mcp");

    expect(shopStripe?.enabled).toBe(true);
    expect(shopStripe?.config.environment).toBe("live");
    expect(shopStripe?.config.allow_write_tools).toBe(true);
  });

  it("executes local plugin tests safely without network fetch calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const login = await browserApi.login("admin", "1234");
    const token = login.token;

    // Testing an unenabled plugin throws error
    await expect(browserApi.test_plugin("stripe_mcp", token)).rejects.toThrow(
      "Activa y guarda el plugin antes de probarlo",
    );

    // Enable plugin and test
    await browserApi.update_plugin("stripe_mcp", true, {}, token);
    const testResult = await browserApi.test_plugin("stripe_mcp", token);

    expect(testResult.ok).toBe(true);
    expect(testResult.message).toContain("Simulación local");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("enforces admin role policy for plugin updates and testing", async () => {
    const cajeroLogin = await browserApi.login("cajero", "0000");
    const cajeroToken = cajeroLogin.token;

    // Listing plugins works for cajero session
    const list = await browserApi.list_plugins(cajeroToken);
    expect(list.length).toBe(2);

    // Updating plugin requires admin
    await expect(
      browserApi.update_plugin("database_bridge", true, {}, cajeroToken),
    ).rejects.toThrow(/permisos de administrador/i);

    // Testing plugin requires admin
    await expect(
      browserApi.test_plugin("database_bridge", cajeroToken),
    ).rejects.toThrow(/permisos de administrador/i);
  });
});
