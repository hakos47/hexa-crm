import type { DashboardStats, Product, Sale } from "$lib/types";
import { countsInBusinessTotals } from "$lib/sales/cancel-sale";
import { planReorderSuggestions } from "$lib/inventory/reorder";

export type StoreToolResult = {
  name: "get_dashboard_stats" | "list_low_stock" | "sales_summary" | "suggest_reorder";
  result: unknown;
};

/** Deterministic tool results. The caller supplies data already scoped by the authenticated API. */
export function storeTools(stats: DashboardStats, products: Product[], sales: Sale[]): StoreToolResult[] {
  const eligible = sales.filter((sale) => countsInBusinessTotals(sale.status));
  const netSales = eligible.reduce((total, sale) => total + Math.max(0, sale.total_cents - (sale.refunded_cents ?? 0)), 0);
  const soldByProduct: Record<number, number> = {};
  for (const sale of eligible) {
    for (const line of sale.lines ?? []) {
      soldByProduct[line.product_id] = (soldByProduct[line.product_id] ?? 0) + Math.max(0, line.qty - (line.returned_qty ?? 0));
    }
  }
  return [
    { name: "get_dashboard_stats", result: { sales_today_cents: stats.sales_today_cents, sales_today_count: stats.sales_today_count, sales_month_cents: stats.sales_month_cents, cash_balance_cents: stats.cash_balance_cents } },
    { name: "list_low_stock", result: stats.low_stock.map((product) => ({ id: product.id, name: product.name, stock: product.stock, min_stock: product.min_stock })) },
    { name: "sales_summary", result: { tickets: eligible.length, net_sales_cents: netSales, latest_sale_at: eligible[0]?.sold_at ?? null } },
    { name: "suggest_reorder", result: planReorderSuggestions(products, soldByProduct).slice(0, 8).map((item) => ({ product_id: item.product_id, name: item.name, qty_suggested: item.qty_suggested, priority: item.priority })) },
  ];
}
