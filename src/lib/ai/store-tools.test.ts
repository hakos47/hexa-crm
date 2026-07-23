import { describe, expect, it } from "vitest";
import { storeTools } from "./store-tools";

describe("storeTools", () => {
  it("returns four deterministic tools from backend-shaped data and excludes cancelled sales", () => {
    const tools = storeTools(
      { sales_today_cents: 1000, sales_today_count: 1, sales_month_cents: 1000, sales_month_count: 1, cash_balance_cents: 500, vat_month_cents: 210, base_month_cents: 790, low_stock: [{ id: 1, name: "Café", stock: 1, min_stock: 3 }] as any },
      [{ id: 1, sku: "CAFE", name: "Café", stock: 1, min_stock: 3, active: true }] as any,
      [{ id: 1, sold_at: "2026-07-22T10:00:00Z", total_cents: 1000, status: "completed", lines: [{ product_id: 1, qty: 2, returned_qty: 1 }] }, { id: 2, sold_at: "2026-07-22T09:00:00Z", total_cents: 9999, status: "cancelled" }] as any,
    );
    expect(tools.map((tool) => tool.name)).toEqual(["get_dashboard_stats", "list_low_stock", "sales_summary", "suggest_reorder"]);
    expect(tools[2].result).toMatchObject({ tickets: 1, net_sales_cents: 1000 });
    expect(tools[3].result).toEqual([{ product_id: 1, name: "Café", qty_suggested: 2, priority: "critical" }]);
  });
});
