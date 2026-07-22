import { beforeEach, describe, expect, it } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";

beforeEach(() => {
  __resetBrowserStoreForTests();
});

describe("company isolation (browser-store)", () => {
  it("admin can switch company; products/sales do not leak across companies", async () => {
    const login = await browserApi.login("admin", "1234");
    const token = login.token;
    expect(login.companies?.length).toBe(2);
    expect(login.active_company_id).toBe(1);

    const shopProducts = browserApi.list_products(true, token);
    expect(shopProducts.length).toBeGreaterThan(0);

    // Create sale in SHOP
    const sale = browserApi.create_sale(
      [{ product_id: shopProducts[0].id, qty: 1 }],
      null,
      "shop-sale",
      token,
    );
    expect(sale.company_id).toBe(1);

    // Switch to DEV
    const dev = browserApi.set_active_company(2, token);
    expect(dev.code).toBe("DEV");
    expect(browserApi.list_products(true, token)).toEqual([]);
    expect(browserApi.list_sales(token)).toEqual([]);

    // SHOP sale not visible under DEV
    expect(() => browserApi.get_sale(sale.id, token)).toThrow(/no encontrada/i);

    // Back to SHOP — sale visible
    browserApi.set_active_company(1, token);
    expect(browserApi.list_sales(token).some((s) => s.id === sale.id)).toBe(true);

    const report = browserApi.billing_by_company(token);
    const shop = report.find((r) => r.code === "SHOP")!;
    const d = report.find((r) => r.code === "DEV")!;
    expect(shop.total_cents).toBeGreaterThan(0);
    expect(d.total_cents).toBe(0);
  });

  it("cajero cannot access DEV company", async () => {
    const login = await browserApi.login("cajero", "0000");
    expect(login.companies?.map((c) => c.code)).toEqual(["SHOP"]);
    expect(() => browserApi.set_active_company(2, login.token)).toThrow(/acceso/i);
  });
});
