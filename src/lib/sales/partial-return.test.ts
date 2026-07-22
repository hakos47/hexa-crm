import { describe, expect, it } from "vitest";
import {
  canReturnLines,
  netSaleTotalCents,
  planPartialReturn,
  proportionalCents,
  remainingLineAmounts,
  remainingQty,
} from "./partial-return";

const sale = {
  id: 10,
  number: "T-00010",
  status: "completed",
  total_cents: 3000,
  refunded_cents: 0,
};

const lines = [
  {
    id: 1,
    product_id: 100,
    qty: 2,
    returned_qty: 0,
    line_total_cents: 2000,
    line_base_cents: 1653,
    line_vat_cents: 347,
  },
  {
    id: 2,
    product_id: 200,
    qty: 1,
    returned_qty: 0,
    line_total_cents: 1000,
    line_base_cents: 826,
    line_vat_cents: 174,
  },
];

describe("proportionalCents", () => {
  it("full line sums to total", () => {
    const a = proportionalCents(1000, 3, 0, 1);
    const b = proportionalCents(1000, 3, 1, 1);
    const c = proportionalCents(1000, 3, 2, 1);
    expect(a + b + c).toBe(1000);
  });
});

describe("canReturnLines", () => {
  it("rejects over-qty and cancelled", () => {
    expect(canReturnLines(sale, lines, [{ line_id: 1, qty: 3 }])).toMatch(/quedan/);
    expect(
      canReturnLines({ ...sale, status: "cancelled" }, lines, [{ line_id: 1, qty: 1 }]),
    ).toMatch(/anulada/);
  });
  it("allows partial on completed", () => {
    expect(canReturnLines(sale, lines, [{ line_id: 1, qty: 1 }])).toBeNull();
  });
});

describe("planPartialReturn", () => {
  it("plans stock, cash and partially_returned status", () => {
    const plan = planPartialReturn(sale, lines, [{ line_id: 1, qty: 1 }]);
    expect(plan.new_status).toBe("partially_returned");
    expect(plan.cash_expense_cents).toBe(1000); // half of 2000
    expect(plan.stock_restores).toEqual([{ product_id: 100, qty: 1 }]);
    expect(plan.lines[0].new_returned_qty).toBe(1);
    expect(plan.new_refunded_cents).toBe(1000);
  });

  it("full return of all lines → cancelled and full cash", () => {
    const plan = planPartialReturn(sale, lines, [
      { line_id: 1, qty: 2 },
      { line_id: 2, qty: 1 },
    ]);
    expect(plan.new_status).toBe("cancelled");
    expect(plan.cash_expense_cents).toBe(3000);
    expect(plan.stock_restores.sort((a, b) => a.product_id - b.product_id)).toEqual([
      { product_id: 100, qty: 2 },
      { product_id: 200, qty: 1 },
    ]);
  });

  it("second partial after first uses remaining only", () => {
    const afterFirst = planPartialReturn(sale, lines, [{ line_id: 1, qty: 1 }]);
    const lines2 = lines.map((l) =>
      l.id === 1 ? { ...l, returned_qty: afterFirst.lines[0].new_returned_qty } : l,
    );
    const plan2 = planPartialReturn(
      { ...sale, status: "partially_returned", refunded_cents: afterFirst.new_refunded_cents },
      lines2,
      [{ line_id: 1, qty: 1 }],
    );
    expect(plan2.cash_expense_cents).toBe(1000);
    expect(plan2.lines[0].new_returned_qty).toBe(2);
    // Returning last of line 1 only → still line 2 open → partially_returned
    expect(plan2.new_status).toBe("partially_returned");
  });
});

describe("net + remaining helpers", () => {
  it("netSaleTotalCents subtracts refunds", () => {
    expect(netSaleTotalCents({ total_cents: 3000, refunded_cents: 1000, status: "partially_returned" })).toBe(
      2000,
    );
    expect(netSaleTotalCents({ total_cents: 3000, status: "cancelled" })).toBe(0);
  });

  it("remainingLineAmounts after half return", () => {
    const half = { ...lines[0], returned_qty: 1 };
    expect(remainingQty(half)).toBe(1);
    const rem = remainingLineAmounts(half);
    expect(rem.total_cents).toBe(1000);
    expect(rem.base_cents + rem.vat_cents).toBe(rem.total_cents);
  });
});
