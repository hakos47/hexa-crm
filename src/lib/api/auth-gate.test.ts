import { describe, expect, it, beforeEach } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";
import { assertTokenForCommand } from "./guard";

describe("auth gate", () => {
  beforeEach(() => {
    __resetBrowserStoreForTests();
  });

  it("blocks public commands without forcing token", () => {
    expect(() => assertTokenForCommand("login", null)).not.toThrow();
    expect(() => assertTokenForCommand("public_meta", null)).not.toThrow();
    expect(() => assertTokenForCommand("list_products", null)).toThrow(/Sesión/);
  });

  it("rejects data access without session", async () => {
    expect(() => browserApi.list_products(true, null)).toThrow(/Sesión/);
    expect(() => browserApi.dashboard_stats(null)).toThrow(/Sesión/);
    expect(() => browserApi.get_cash_balance(null)).toThrow(/Sesión/);
  });

  it("allows data after login", async () => {
    const { token } = await browserApi.login("admin", "1234");
    const products = browserApi.list_products(true, token);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    browserApi.logout(token);
    expect(() => browserApi.list_products(true, token)).toThrow(/Sesión/);
  });

  it("rejects wrong pin", async () => {
    await expect(browserApi.login("admin", "9999")).rejects.toThrow(/incorrectos/);
  });
});
