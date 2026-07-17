import { describe, expect, it } from "vitest";
import { buildDailyCloseReport } from "./daily-close";

describe("buildDailyCloseReport", () => {
  const day = "2026-07-18";

  it("aggregates sales and cash for the day only", () => {
    const report = buildDailyCloseReport(
      day,
      [
        {
          sold_at: "2026-07-18T09:00:00.000Z",
          total_cents: 12100,
          subtotal_cents: 10000,
          vat_cents: 2100,
        },
        {
          sold_at: "2026-07-17T09:00:00.000Z",
          total_cents: 5000,
          subtotal_cents: 4132,
          vat_cents: 868,
        },
      ],
      [
        {
          kind: "income",
          amount_cents: 12100,
          occurred_at: "2026-07-18T09:00:00.000Z",
          sale_id: 1,
        },
        {
          kind: "income",
          amount_cents: 2000,
          occurred_at: "2026-07-18T12:00:00.000Z",
          sale_id: null,
        },
        {
          kind: "expense",
          amount_cents: 1500,
          occurred_at: "2026-07-18T14:00:00.000Z",
        },
      ],
      50000
    );

    expect(report.sales_count).toBe(1);
    expect(report.sales_total_cents).toBe(12100);
    expect(report.other_income_cents).toBe(2000);
    expect(report.expense_cents).toBe(1500);
    expect(report.net_cash_cents).toBe(12100 + 2000 - 1500);
    expect(report.cash_balance_cents).toBe(50000);
  });
});
