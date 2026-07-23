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
    expect(stripePlugin?.secret_configured).toBe(false);
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

  it("saves, replaces, and removes stripe credentials safely in local store without leaking plaintext", async () => {
    const login = await browserApi.login("admin", "1234");
    const token = login.token;

    // 1. Save secret
    const saved = await browserApi.update_plugin(
      "stripe_mcp",
      true,
      { environment: "live" },
      token,
      "save",
      "rk_test_51N123456789",
    );
    expect(saved.secret_configured).toBe(true);
    expect(saved.status).toBe("ready");

    // 2. Replace secret
    const replaced = await browserApi.update_plugin(
      "stripe_mcp",
      true,
      { environment: "live" },
      token,
      "replace",
      "rk_test_99999999999",
    );
    expect(replaced.secret_configured).toBe(true);

    // 3. Remove secret
    const removed = await browserApi.update_plugin(
      "stripe_mcp",
      true,
      { environment: "live" },
      token,
      "remove",
    );
    expect(removed.secret_configured).toBe(false);
    expect(removed.status).toBe("needs_secret");
  });

  it("isolates plugin state between different companies", async () => {
    const login = await browserApi.login("admin", "1234");
    const token = login.token;

    // Configure company 1 (SHOP)
    await browserApi.update_plugin(
      "stripe_mcp",
      true,
      {
        environment: "live",
        allow_write_tools: true,
      },
      token,
      "save",
      "rk_live_shop_token",
    );

    // Switch to company 2 (DEV)
    browserApi.set_active_company(2, token);

    const devPlugins = await browserApi.list_plugins(token);
    const devStripe = devPlugins.find((p) => p.plugin_key === "stripe_mcp");
    expect(devStripe?.enabled).toBe(false);
    expect(devStripe?.secret_configured).toBe(false);

    // Switch back to company 1 (SHOP)
    browserApi.set_active_company(1, token);
    const shopPlugins = await browserApi.list_plugins(token);
    const shopStripe = shopPlugins.find((p) => p.plugin_key === "stripe_mcp");

    expect(shopStripe?.enabled).toBe(true);
    expect(shopStripe?.secret_configured).toBe(true);
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

    // Enable plugin and save secret
    await browserApi.update_plugin("stripe_mcp", true, {}, token, "save", "rk_test_123");
    const testResult = await browserApi.test_plugin("stripe_mcp", token);

    expect(testResult.ok).toBe(true);
    expect(testResult.message).toContain("Simulación local");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("enforces admin role policy for plugin updates, testing, and reading audit logs", async () => {
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

    // Reading plugin audit logs requires admin
    await expect(
      browserApi.list_plugin_logs("database_bridge", 20, cajeroToken),
    ).rejects.toThrow(/permisos de administrador/i);
  });

  it("records audit log entries for config update, test connection, tool block and execution", async () => {
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    // 1. Update plugin
    await browserApi.update_plugin(
      "stripe_mcp",
      true,
      {
        environment: "sandbox",
        allow_write_tools: false,
      },
      token,
      "save",
      "rk_test_123",
    );

    // 2. Test connection
    await browserApi.test_plugin("stripe_mcp", token);

    // 3. Attempt a blocked write tool call (allow_write_tools is false)
    await expect(
      browserApi.call_plugin_tool("stripe_mcp", "create_payment_link", {}, true, token),
    ).rejects.toThrow(/no permitida/i);

    // Fetch audit logs
    const logs = await browserApi.list_plugin_logs("stripe_mcp", 20, token);
    expect(logs.length).toBeGreaterThanOrEqual(3);

    const configLog = logs.find((l) => l.action === "enabled_or_updated" || l.action === "secret_saved");
    expect(configLog).toBeDefined();
    expect(configLog?.result).toBe("ok");
    expect(configLog?.actor_name).toBe("Administrador");

    const testLog = logs.find((l) => l.action === "connection_test_ok");
    expect(testLog).toBeDefined();
    expect(testLog?.result).toBe("ok");

    const blockedLog = logs.find((l) => l.action === "tool_blocked_permission");
    expect(blockedLog).toBeDefined();
    expect(blockedLog?.result).toBe("blocked");
    expect(blockedLog?.tool_name).toBe("create_payment_link");
  });

  it("isolates audit log history strictly between different companies", async () => {
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    // Actions in Company 1
    browserApi.set_active_company(1, token);
    await browserApi.update_plugin("database_bridge", true, { display_name: "Tienda 1" }, token);
    await browserApi.test_plugin("database_bridge", token);

    const logsCompany1 = await browserApi.list_plugin_logs("database_bridge", 20, token);
    expect(logsCompany1.length).toBe(2);

    // Switch to Company 2
    browserApi.set_active_company(2, token);
    const logsCompany2 = await browserApi.list_plugin_logs("database_bridge", 20, token);
    expect(logsCompany2.length).toBe(0);

    // Action in Company 2
    await browserApi.update_plugin("database_bridge", true, { display_name: "Tienda 2" }, token);
    const logsCompany2After = await browserApi.list_plugin_logs("database_bridge", 20, token);
    expect(logsCompany2After.length).toBe(1);

    // Verify Company 1 logs are unchanged
    browserApi.set_active_company(1, token);
    const logsCompany1Final = await browserApi.list_plugin_logs("database_bridge", 20, token);
    expect(logsCompany1Final.length).toBe(2);
  });

  it("redacts secrets, tokens, API keys and URLs in audit summaries", async () => {
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    await browserApi.update_plugin("stripe_mcp", true, {}, token, "save", "sk_live_secret12345");

    const logs = await browserApi.list_plugin_logs("stripe_mcp", 20, token);
    for (const log of logs) {
      if (log.summary) {
        expect(log.summary).not.toContain("sk_live_secret12345");
        expect(log.summary).not.toContain("Bearer ");
      }
    }
  });

  it("requires explicit human confirmation for write tools and logs approval blocks", async () => {
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    // Enable write tools for stripe
    await browserApi.update_plugin("stripe_mcp", true, { allow_write_tools: true }, token, "save", "rk_test_123");

    // Call write tool without confirmed flag -> throws approval error
    await expect(
      browserApi.call_plugin_tool("stripe_mcp", "create_payment_link", {}, false, token),
    ).rejects.toThrow(/confirmación explícita/i);

    const logs = await browserApi.list_plugin_logs("stripe_mcp", 20, token);
    const approvalBlock = logs.find((l) => l.action === "tool_blocked_approval");
    expect(approvalBlock).toBeDefined();
    expect(approvalBlock?.result).toBe("blocked");
    expect(approvalBlock?.tool_name).toBe("create_payment_link");
  });

  it("executes authorized read tool in local simulation mode without network fetch calls and records audit log", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    await browserApi.update_plugin("stripe_mcp", true, {}, token, "save", "rk_test_123");

    const res = await browserApi.call_plugin_tool(
      "stripe_mcp",
      "retrieve_balance",
      {},
      false,
      token,
    );

    expect(res.ok).toBe(true);
    expect(res.plugin_key).toBe("stripe_mcp");
    expect(res.tool_name).toBe("retrieve_balance");
    expect((res.result as any).simulation).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const logs = await browserApi.list_plugin_logs("stripe_mcp", 20, token);
    const readLog = logs.find(
      (l) => l.action === "tool_read" && l.tool_name === "retrieve_balance",
    );
    expect(readLog).toBeDefined();
    expect(readLog?.result).toBe("ok");
    expect(readLog?.actor_name).toBe("Administrador");

    fetchSpy.mockRestore();
  });

  it("executes authorized write tool with confirmation in local simulation mode without network fetch calls and records audit log", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adminLogin = await browserApi.login("admin", "1234");
    const token = adminLogin.token;

    await browserApi.update_plugin("stripe_mcp", true, { allow_write_tools: true }, token, "save", "rk_test_123");

    const res = await browserApi.call_plugin_tool(
      "stripe_mcp",
      "create_payment_link",
      { title: "Test Link" },
      true,
      token,
    );

    expect(res.ok).toBe(true);
    expect(res.plugin_key).toBe("stripe_mcp");
    expect(res.tool_name).toBe("create_payment_link");
    expect((res.result as any).simulation).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const logs = await browserApi.list_plugin_logs("stripe_mcp", 20, token);
    const writeLog = logs.find(
      (l) => l.action === "tool_write" && l.tool_name === "create_payment_link",
    );
    expect(writeLog).toBeDefined();
    expect(writeLog?.result).toBe("ok");
    expect(writeLog?.actor_name).toBe("Administrador");

    fetchSpy.mockRestore();
  });
});
