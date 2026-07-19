import { describe, expect, it } from "vitest";
import {
  canCancelSale,
  countsInBusinessTotals,
  planCancelSale,
} from "./cancel-sale";

describe("canCancelSale", () => {
  it("allows completed", () => {
    expect(
      canCancelSale({ id: 1, number: "T-1", status: "completed", total_cents: 100 })
    ).toBeNull();
  });
  it("rejects cancelled", () => {
    expect(
      canCancelSale({ id: 1, number: "T-1", status: "cancelled", total_cents: 100 })
    ).toMatch(/anulada/);
  });
});

describe("planCancelSale", () => {
  it("plans stock restore and cash expense", () => {
    const plan = planCancelSale(
      { id: 7, number: "T-00007", status: "completed", total_cents: 4990 },
      [
        { product_id: 3, qty: 1 },
        { product_id: 1, qty: 2 },
      ]
    );
    expect(plan.new_status).toBe("cancelled");
    expect(plan.cash_expense_cents).toBe(4990);
    expect(plan.cash_category).toBe("anulaciones");
    expect(plan.stock_restores).toEqual([
      { product_id: 3, qty: 1 },
      { product_id: 1, qty: 2 },
    ]);
  });

  it("throws if already cancelled", () => {
    expect(() =>
      planCancelSale(
        { id: 1, number: "T-1", status: "cancelled", total_cents: 100 },
        [{ product_id: 1, qty: 1 }]
      )
    ).toThrow(/anulada/);
  });
});

describe("countsInBusinessTotals", () => {
  it("completed and partially_returned count; cancelled does not", () => {
    expect(countsInBusinessTotals("completed")).toBe(true);
    expect(countsInBusinessTotals("partially_returned")).toBe(true);
    expect(countsInBusinessTotals("cancelled")).toBe(false);
  });
});
