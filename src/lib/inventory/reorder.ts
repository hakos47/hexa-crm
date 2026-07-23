import type { Product } from "$lib/types";

export type ReorderSuggestion = {
  product_id: number;
  sku: string;
  name: string;
  stock: number;
  min_stock: number;
  avg_daily_sales: number;
  days_of_cover: number | null;
  qty_suggested: number;
  priority: "critical" | "watch";
};

/**
 * Local-only replenishment proposal. It covers `targetDays` at recent velocity,
 * never proposes less than the configured minimum and ignores healthy stock.
 */
export function planReorderSuggestions(
  products: Product[],
  soldInHorizon: Record<number, number>,
  horizonDays = 14,
  targetDays = 21,
): ReorderSuggestion[] {
  const days = Math.max(1, Math.trunc(horizonDays));
  const target = Math.max(1, Math.trunc(targetDays));
  return products
    .filter((p) => p.active)
    .map((product) => {
      const stock = Math.max(0, product.stock);
      const sold = Math.max(0, soldInHorizon[product.id] ?? 0);
      const avg = sold / days;
      const desired = Math.max(product.min_stock, Math.ceil(avg * target));
      const qty = Math.max(0, desired - stock);
      const cover = avg > 0 ? Math.round((stock / avg) * 10) / 10 : null;
      const priority: ReorderSuggestion["priority"] = stock <= product.min_stock || cover === null || cover < 7
        ? "critical"
        : "watch";
      return {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        stock,
        min_stock: product.min_stock,
        avg_daily_sales: Math.round(avg * 100) / 100,
        days_of_cover: cover,
        qty_suggested: qty,
        priority,
      };
    })
    .filter((suggestion) => suggestion.qty_suggested > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "critical" ? -1 : 1;
      return (a.days_of_cover ?? -1) - (b.days_of_cover ?? -1) || b.qty_suggested - a.qty_suggested;
    });
}
