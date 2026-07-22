import { describe, expect, it, beforeEach } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";

describe("create_sale with line discount", () => {
  beforeEach(() => {
    __resetBrowserStoreForTests();
  });

  it("persists discounted total and lower cash income", async () => {
    const { token } = await browserApi.login("admin", "1234");
    const products = browserApi.list_products(true, token);
    const p = products.find((x) => x.sku === "TEC-110");
    expect(p).toBeTruthy();
    // PVP 49.90 €; discount 9.90 € → line total 40.00 €
    const sale = browserApi.create_sale(
      [{ product_id: p!.id, qty: 1, discount_cents: 990 }],
      null,
      "dto test",
      token
    );
    expect(sale.total_cents).toBe(4000);
    expect(sale.total_cents).toBeLessThan(p!.price_cents);
    const balance = browserApi.get_cash_balance(token);
    expect(balance).toBe(4000);
    const detail = browserApi.get_sale(sale.id, token);
    expect(detail.lines?.[0]?.line_total_cents).toBe(4000);
  });
});
