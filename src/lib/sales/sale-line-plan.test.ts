import { describe, expect, it } from "vitest";
import { lineBreakdown, saleTotals } from "../vat";

/**
 * Characterization of discounted sale math used by TPV → create_sale (browser + Postgres).
 * Regression guard: path must never ignore discount_cents (ciclo 3).
 */
describe("plan sale lines with discount (integrity)", () => {
  it("applies tax-inclusive discount before VAT split", () => {
    // 10.00€ PVP IVA 21%, dto 1.00€ → total 9.00€
    const br = lineBreakdown({
      qty: 1,
      unitPriceCents: 1000,
      vatRate: 21,
      discountCents: 100,
    });
    expect(br.lineTotalCents).toBe(900);
    expect(br.lineBaseCents + br.lineVatCents).toBe(900);
    expect(br.lineVatCents).toBe(br.lineTotalCents - br.lineBaseCents);
  });

  it("caps discount at line total (never negative)", () => {
    const br = lineBreakdown({
      qty: 2,
      unitPriceCents: 500,
      vatRate: 10,
      discountCents: 99999,
    });
    expect(br.lineTotalCents).toBe(0);
    expect(br.lineBaseCents).toBe(0);
    expect(br.lineVatCents).toBe(0);
  });

  it("saleTotals aggregates multi-line discounts", () => {
    const totals = saleTotals([
      { qty: 1, unitPriceCents: 990, vatRate: 10, discountCents: 90 },
      { qty: 1, unitPriceCents: 4990, vatRate: 21, discountCents: 0 },
    ]);
    expect(totals.totalCents).toBe(900 + 4990);
    expect(totals.subtotalCents + totals.vatCents).toBe(totals.totalCents);
  });

  it("zero discount matches gross line", () => {
    const br = lineBreakdown({
      qty: 3,
      unitPriceCents: 333,
      vatRate: 21,
      discountCents: 0,
    });
    expect(br.lineTotalCents).toBe(999);
  });
});
