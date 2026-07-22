/**
 * Critical commerce flow (issue #5) — deterministic seed via browser-store.
 * Runs in CI via `npm test`.
 */
import { describe, expect, it } from "vitest";
import { browserApi } from "../api/browser-store";
import { lineBreakdown } from "../vat";
import { buildDailyCloseReport } from "../reports/daily-close";
import { salesToCsv } from "../export/csv";
import { canCancelSale, planCancelSale } from "../sales/cancel-sale";

describe("E2E critical flow (browser-store)", () => {
  it("rejects operations without session", () => {
    expect(() => browserApi.list_products(true, null)).toThrow(/Sesión|sesión/i);
    expect(() => browserApi.dashboard_stats(null)).toThrow(/Sesión|sesión/i);
  });

  it("public_meta does not require session", () => {
    const meta = browserApi.public_meta();
    expect(meta.shop_name).toBeTruthy();
  });

  it("login → product → sale (VAT+discount) → stock → cash → close/CSV → cancel", async () => {
    const login = await browserApi.login("admin", "1234");
    expect(login.token).toBeTruthy();
    expect(login.user.role).toBe("admin");
    const token = login.token;

    const me = await browserApi.session_me(token);
    expect(me?.username).toBe("admin");

    const products = browserApi.list_products(false, token);
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];
    const stockBefore = product.stock;

    const discount = Math.min(100, product.price_cents);
    const expected = lineBreakdown({
      qty: 1,
      unitPriceCents: product.price_cents,
      vatRate: product.vat_rate,
      discountCents: discount,
    });

    const cashBefore = browserApi.get_cash_balance(token);
    const sale = browserApi.create_sale(
      [{ product_id: product.id, qty: 1, discount_cents: discount }],
      null,
      "e2e-critical",
      token,
    );

    expect(sale.status).toBe("completed");
    expect(sale.total_cents).toBe(expected.lineTotalCents);
    expect(sale.subtotal_cents + sale.vat_cents).toBe(sale.total_cents);

    const cashAfter = browserApi.get_cash_balance(token);
    expect(cashAfter - cashBefore).toBe(sale.total_cents);

    const p2 = browserApi.list_products(false, token).find((p) => p.id === product.id)!;
    expect(p2.stock).toBe(stockBefore - 1);

    const sales = browserApi.list_sales(token);
    const movements = browserApi.list_cash_movements(token);
    const day = sale.sold_at.slice(0, 10);
    const close = buildDailyCloseReport(
      day,
      sales.map((s) => ({
        sold_at: s.sold_at,
        total_cents: s.total_cents,
        subtotal_cents: s.subtotal_cents,
        vat_cents: s.vat_cents,
        status: s.status,
      })),
      movements.map((m) => ({
        kind: m.kind,
        amount_cents: m.amount_cents,
        occurred_at: m.occurred_at,
        sale_id: m.sale_id,
      })),
      cashAfter,
    );
    expect(close.sales_count).toBeGreaterThanOrEqual(1);
    expect(salesToCsv(sales)).toContain(sale.number);

    expect(canCancelSale({ id: sale.id, number: sale.number, status: sale.status, total_cents: sale.total_cents })).toBeNull();
    const plan = planCancelSale(
      { id: sale.id, number: sale.number, status: sale.status, total_cents: sale.total_cents },
      (sale.lines ?? []).map((l) => ({ product_id: l.product_id, qty: l.qty })),
    );
    expect(plan.new_status).toBe("cancelled");

    const cancelled = browserApi.cancel_sale(sale.id, token);
    expect(cancelled.status).toBe("cancelled");
    expect(browserApi.get_cash_balance(token)).toBe(cashBefore);
    const p3 = browserApi.list_products(false, token).find((p) => p.id === product.id)!;
    expect(p3.stock).toBe(stockBefore);
  });
});
