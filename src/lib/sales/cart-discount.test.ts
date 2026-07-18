import { describe, expect, it } from "vitest";
import { clampCartPercent, planCartDiscounts } from "./cart-discount";
import { saleTotals } from "../vat";

describe("clampCartPercent", () => {
  it("clamps to 0–100", () => {
    expect(clampCartPercent(-5)).toBe(0);
    expect(clampCartPercent(150)).toBe(100);
    expect(clampCartPercent(12.5)).toBe(12.5);
    expect(clampCartPercent(NaN)).toBe(0);
  });
});

describe("planCartDiscounts", () => {
  it("applies 10% cart discount on single line", () => {
    const plan = planCartDiscounts(
      [{ unitPriceCents: 1000, qty: 1, lineDiscountCents: 0 }],
      10,
    );
    expect(plan.cartDiscountTotalCents).toBe(100);
    expect(plan.lines[0].discountCents).toBe(100);
    expect(plan.totalCents).toBe(900);
  });

  it("stacks after line euro discount then cart %", () => {
    // gross 1000, line dto 100 → 900; 10% cart → 90 → total 810
    const plan = planCartDiscounts(
      [{ unitPriceCents: 1000, qty: 1, lineDiscountCents: 100 }],
      10,
    );
    expect(plan.lines[0].afterLineCents).toBe(900);
    expect(plan.cartDiscountTotalCents).toBe(90);
    expect(plan.totalCents).toBe(810);
  });

  it("distributes proportionally across two lines", () => {
    const plan = planCartDiscounts(
      [
        { unitPriceCents: 1000, qty: 1 },
        { unitPriceCents: 3000, qty: 1 },
      ],
      10,
    );
    // sum 4000, cart 400; 1000/4000*400=100, 3000 share 300
    expect(plan.cartDiscountTotalCents).toBe(400);
    expect(plan.lines[0].cartShareCents).toBe(100);
    expect(plan.lines[1].cartShareCents).toBe(300);
    expect(plan.totalCents).toBe(3600);
  });

  it("100% cart zeros ticket", () => {
    const plan = planCartDiscounts(
      [
        { unitPriceCents: 500, qty: 2 },
        { unitPriceCents: 200, qty: 1 },
      ],
      100,
    );
    expect(plan.totalCents).toBe(0);
    expect(plan.cartDiscountTotalCents).toBe(1200);
  });

  it("feeds saleTotals with combined discount_cents", () => {
    const plan = planCartDiscounts(
      [{ unitPriceCents: 1210, qty: 1, lineDiscountCents: 0 }],
      10,
    );
    const totals = saleTotals([
      {
        qty: 1,
        unitPriceCents: 1210,
        vatRate: 21,
        discountCents: plan.lines[0].discountCents,
      },
    ]);
    expect(totals.totalCents).toBe(plan.totalCents);
    expect(totals.subtotalCents + totals.vatCents).toBe(totals.totalCents);
  });
});
