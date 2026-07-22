import { describe, expect, it } from "vitest";
import { dashboardHealth } from "./health";

const now = new Date(2026, 6, 22, 12).getTime();

describe("dashboardHealth", () => {
  it("calculates net deltas, average ticket and a seven-day trend", () => {
    const health = dashboardHealth([
      { id: 1, sold_at: "2026-07-22T09:00:00", total_cents: 12_000, refunded_cents: 2_000, status: "completed" },
      { id: 2, sold_at: "2026-07-22T10:00:00", total_cents: 4_000, status: "partially_returned" },
      { id: 3, sold_at: "2026-07-21T10:00:00", total_cents: 7_000, status: "completed" },
      { id: 4, sold_at: "2026-07-22T11:00:00", total_cents: 9_000, status: "cancelled" },
    ] as any, [], false, now);

    expect(health.today_cents).toBe(14_000);
    expect(health.today_count).toBe(2);
    expect(health.yesterday_cents).toBe(7_000);
    expect(health.sales_delta_percent).toBe(100);
    expect(health.average_ticket_cents).toBe(7_000);
    expect(health.trend).toHaveLength(7);
  });

  it("limits actionable alert types to five and links them", () => {
    const health = dashboardHealth([], [{ id: 1 }] as any, true, now);
    expect(health.alerts.map((alert) => alert.id)).toEqual(["stock", "backup", "no-sales"]);
    expect(health.alerts.every((alert) => alert.href.startsWith("/"))).toBe(true);
  });
});
