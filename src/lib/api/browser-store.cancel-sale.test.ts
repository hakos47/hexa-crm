import { describe, expect, it, beforeEach } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";

describe("cancel_sale integration", () => {
  beforeEach(() => {
    __resetBrowserStoreForTests();
  });

  it("restores stock, posts cash expense, excludes from dashboard and VAT", async () => {
    const { token } = await browserApi.login("admin", "1234");
    const products = browserApi.list_products(true, token);
    const p = products.find((x) => x.sku === "CAF-001")!;
    const stockBefore = p.stock;

    const sale = browserApi.create_sale(
      [{ product_id: p.id, qty: 2 }],
      null,
      "",
      token
    );
    expect(sale.status).toBe("completed");
    const afterSale = browserApi.list_products(true, token).find((x) => x.id === p.id)!;
    expect(afterSale.stock).toBe(stockBefore - 2);

    const balanceAfterSale = browserApi.get_cash_balance(token);
    expect(balanceAfterSale).toBe(sale.total_cents);

    const cancelled = browserApi.cancel_sale(sale.id, token);
    expect(cancelled.status).toBe("cancelled");

    const afterCancel = browserApi.list_products(true, token).find((x) => x.id === p.id)!;
    expect(afterCancel.stock).toBe(stockBefore);

    // income then expense of same amount → balance 0
    expect(browserApi.get_cash_balance(token)).toBe(0);

    const stats = browserApi.dashboard_stats(token);
    expect(stats.sales_today_cents).toBe(0);

    const today = new Date().toISOString().slice(0, 10);
    const vat = browserApi.vat_summary(today, today, token);
    expect(vat.total_cents).toBe(0);

    expect(() => browserApi.cancel_sale(sale.id, token)).toThrow(/anulada/);
  });
});
