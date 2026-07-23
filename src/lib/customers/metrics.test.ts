import { describe, expect, it } from "vitest";
import { customerMetrics } from "./metrics";

const customer = { id: 1, name: "Ana" } as any;

describe("customerMetrics", () => {
  it("excludes cancelled tickets and uses net totals after returns", () => {
    const metrics = customerMetrics([customer], [
      { customer_id: 1, status: "completed", total_cents: 10_000, refunded_cents: 0, sold_at: "2026-07-20T10:00:00Z" },
      { customer_id: 1, status: "partially_returned", total_cents: 20_000, refunded_cents: 5_000, sold_at: "2026-07-21T10:00:00Z" },
      { customer_id: 1, status: "cancelled", total_cents: 99_999, sold_at: "2026-07-22T10:00:00Z" },
    ] as any, Date.parse("2026-07-22T12:00:00Z"));
    expect(metrics[1]).toMatchObject({ purchase_count: 2, lifetime_cents: 25_000, last_purchase_at: "2026-07-21T10:00:00Z" });
  });
});
