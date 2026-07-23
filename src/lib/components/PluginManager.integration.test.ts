import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../api/client";
import { __resetBrowserStoreForTests } from "../api/browser-store";
import { clearSession, setSession } from "../stores/session";

beforeEach(() => {
  clearSession();
  __resetBrowserStoreForTests();
});

describe("PluginManager client API in local mode", () => {
  it("api.listPlugins() returns 2 items without throwing unsupported command error", async () => {
    const login = await api.login("admin", "1234");
    setSession(login.user, login.token, {
      companies: login.companies,
      activeCompanyId: login.active_company_id,
    });

    const plugins = await api.listPlugins();

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(2);
    expect(plugins.map((p) => p.plugin_key)).toEqual(["database_bridge", "stripe_mcp"]);
  });

  it("api.updatePlugin() and api.testPlugin() work seamlessly via callLocal", async () => {
    const login = await api.login("admin", "1234");
    setSession(login.user, login.token, {
      companies: login.companies,
      activeCompanyId: login.active_company_id,
    });

    const updated = await api.updatePlugin("stripe_mcp", true, {
      environment: "sandbox",
      credential_env: "HEXA_STRIPE_SHOP_TOKEN",
    });

    expect(updated.enabled).toBe(true);

    const testRes = await api.testPlugin("stripe_mcp");
    expect(testRes.ok).toBe(true);
    expect(testRes.message).toContain("Simulación local");
  });

  it("api.listPluginLogs() retrieves audit log history for active tenant", async () => {
    const login = await api.login("admin", "1234");
    setSession(login.user, login.token, {
      companies: login.companies,
      activeCompanyId: login.active_company_id,
    });

    await api.updatePlugin("stripe_mcp", true, {
      environment: "sandbox",
      credential_env: "HEXA_STRIPE_SHOP_TOKEN",
    });

    await api.testPlugin("stripe_mcp");

    const logs = await api.listPluginLogs("stripe_mcp", 20);
    expect(logs.length).toBe(2);
    expect(logs[0].result).toBe("ok");
    expect(logs[0].actor_name).toBe("Administrador");
  });
});
