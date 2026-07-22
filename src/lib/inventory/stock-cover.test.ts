import { describe, expect, it } from "vitest";
import { estimateDaysOfCover, qtySoldForProduct } from "./stock-cover";

describe("estimateDaysOfCover", () => {
  it("returns critical 0 when stock is 0", () => {
    const r = estimateDaysOfCover({ stock: 0, qtySoldInHorizon: 10, horizonDays: 14 });
    expect(r.days_of_cover).toBe(0);
    expect(r.label).toBe("critical");
    expect(r.display).toMatch(/Sin stock/i);
  });

  it("returns unknown when no sales", () => {
    const r = estimateDaysOfCover({ stock: 50, qtySoldInHorizon: 0, horizonDays: 14 });
    expect(r.days_of_cover).toBeNull();
    expect(r.label).toBe("unknown");
    expect(r.display).not.toMatch(/NaN/);
  });

  it("estimates cover from average daily sales", () => {
    // 14 units in 14 days = 1/day; stock 10 → 10 days → watch
    const r = estimateDaysOfCover({ stock: 10, qtySoldInHorizon: 14, horizonDays: 14 });
    expect(r.days_of_cover).toBe(10);
    expect(r.label).toBe("watch");
    expect(r.avg_daily_sales).toBe(1);
  });

  it("marks critical under 7 days", () => {
    const r = estimateDaysOfCover({ stock: 5, qtySoldInHorizon: 14, horizonDays: 14 });
    expect(r.days_of_cover).toBe(5);
    expect(r.label).toBe("critical");
  });

  it("marks ok at 14+ days", () => {
    const r = estimateDaysOfCover({ stock: 30, qtySoldInHorizon: 14, horizonDays: 14 });
    expect(r.days_of_cover).toBe(30);
    expect(r.label).toBe("ok");
  });
});

describe("qtySoldForProduct", () => {
  it("nets returned qty", () => {
    expect(
      qtySoldForProduct(
        [
          { product_id: 1, qty: 5, returned_qty: 2 },
          { product_id: 2, qty: 3 },
        ],
        1,
      ),
    ).toBe(3);
  });
});
