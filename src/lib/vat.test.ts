import { describe, expect, it } from "vitest";
import { lineBreakdown, saleTotals, splitInclusive } from "./vat";

describe("splitInclusive", () => {
  it("splits 21% IVA correctly", () => {
    // 121.00 € with 21% → base 100.00, vat 21.00
    expect(splitInclusive(12100, 21)).toEqual({
      baseCents: 10000,
      vatCents: 2100,
      totalCents: 12100,
    });
  });

  it("handles 10% and 4%", () => {
    expect(splitInclusive(1100, 10)).toEqual({
      baseCents: 1000,
      vatCents: 100,
      totalCents: 1100,
    });
    expect(splitInclusive(10400, 4)).toEqual({
      baseCents: 10000,
      vatCents: 400,
      totalCents: 10400,
    });
  });

  it("handles 0%", () => {
    expect(splitInclusive(5000, 0)).toEqual({
      baseCents: 5000,
      vatCents: 0,
      totalCents: 5000,
    });
  });
});

describe("saleTotals", () => {
  it("aggregates multi-rate sale", () => {
    const t = saleTotals([
      { qty: 1, unitPriceCents: 12100, vatRate: 21 },
      { qty: 2, unitPriceCents: 1100, vatRate: 10 },
    ]);
    expect(t.totalCents).toBe(12100 + 2200);
    expect(t.byRate[21].baseCents).toBe(10000);
    expect(t.byRate[10].baseCents).toBe(2000);
  });

  it("applies line discount", () => {
    const line = lineBreakdown({
      qty: 2,
      unitPriceCents: 1000,
      vatRate: 21,
      discountCents: 200,
    });
    expect(line.lineTotalCents).toBe(1800);
  });
});
