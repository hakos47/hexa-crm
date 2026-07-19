import { beforeEach, describe, expect, it } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";

describe("return_sale_lines integration", () => {
  beforeEach(() => {
    __resetBrowserStoreForTests();
  });

  it("partial return restores stock, cash expense, nets IVA and allows second return", async () => {
    const { token } = await browserApi.login("admin", "1234");
    const products = browserApi.list_products(true, token);
    // Pick two products with stock
    const p1 = products[0];
    const p2 = products[1] ?? products[0];
    expect(p1).toBeTruthy();

    const sale = browserApi.create_sale(
      [
        { product_id: p1.id, qty: 2 },
        ...(p2.id !== p1.id ? [{ product_id: p2.id, qty: 1 }] : []),
      ],
      null,
      "",
      token,
    );
    expect(sale.status).toBe("completed");
    const detail = browserApi.get_sale(sale.id, token);
    const line0 = detail.lines![0];
    const stockAfterSale = browserApi.list_products(true, token).find((x) => x.id === p1.id)!
      .stock;
    const balAfterSale = browserApi.get_cash_balance(token);

    // Return 1 unit of first line
    const partial = browserApi.return_sale_lines(
      sale.id,
      [{ line_id: line0.id, qty: 1 }],
      token,
    );
    expect(partial.status).toBe(
      detail.lines!.length === 1 && line0.qty === 1 ? "cancelled" : "partially_returned",
    );
    // For qty 2 line, half refund ≈ proportional
    expect(partial.refunded_cents).toBeGreaterThan(0);
    expect(partial.lines!.find((l) => l.id === line0.id)!.returned_qty).toBe(1);

    const stockAfter = browserApi.list_products(true, token).find((x) => x.id === p1.id)!
      .stock;
    expect(stockAfter).toBe(stockAfterSale + 1);

    const balAfter = browserApi.get_cash_balance(token);
    expect(balAfter).toBe(balAfterSale - (partial.refunded_cents ?? 0));

    const today = new Date().toISOString().slice(0, 10);
    const vat = browserApi.vat_summary(today, today, token);
    // Net IVA should be less than full ticket if partially returned
    if (partial.status === "partially_returned") {
      expect(vat.total_cents).toBeLessThan(sale.total_cents);
      expect(vat.total_cents).toBeGreaterThan(0);
    }

    // Cancel remaining = full void path
    const done = browserApi.cancel_sale(sale.id, token);
    expect(done.status).toBe("cancelled");
    expect(() => browserApi.cancel_sale(sale.id, token)).toThrow(/anulada/);
  });
});
