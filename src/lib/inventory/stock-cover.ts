/**
 * Simple days-of-cover estimate from recent sales (issue #22).
 * Pure — no I/O. horizonDays = window used for average daily sales.
 */

export type CoverInput = {
  stock: number;
  /** Units sold in the last `horizonDays` (completed / remaining sales). */
  qtySoldInHorizon: number;
  horizonDays: number;
};

export type CoverResult = {
  /** null = insufficient data (no sales in window). */
  days_of_cover: number | null;
  avg_daily_sales: number;
  label: "ok" | "watch" | "critical" | "unknown";
  /** Human ES short label */
  display: string;
};

/**
 * Days until stock hits 0 at recent average velocity.
 * - stock 0 → 0 days, critical
 * - no sales → unknown (null)
 */
export function estimateDaysOfCover(input: CoverInput): CoverResult {
  const stock = Math.max(0, Math.trunc(input.stock));
  const sold = Math.max(0, input.qtySoldInHorizon);
  const days = Math.max(1, Math.trunc(input.horizonDays));

  if (stock <= 0) {
    return {
      days_of_cover: 0,
      avg_daily_sales: sold / days,
      label: "critical",
      display: "Sin stock",
    };
  }

  if (sold <= 0) {
    return {
      days_of_cover: null,
      avg_daily_sales: 0,
      label: "unknown",
      display: "Sin datos de venta",
    };
  }

  const avg = sold / days;
  const cover = stock / avg;
  // Round to 1 decimal for display logic; keep number finite
  const rounded = Math.round(cover * 10) / 10;

  let label: CoverResult["label"] = "ok";
  if (rounded < 7) label = "critical";
  else if (rounded < 14) label = "watch";

  return {
    days_of_cover: rounded,
    avg_daily_sales: Math.round(avg * 100) / 100,
    label,
    display:
      label === "critical"
        ? `~${rounded} d (crítico)`
        : label === "watch"
          ? `~${rounded} d`
          : `~${rounded} d`,
  };
}

/** Sum sold qty for product_id from sale lines in date range (caller filters status). */
export function qtySoldForProduct(
  lines: { product_id: number; qty: number; returned_qty?: number }[],
  productId: number,
): number {
  let n = 0;
  for (const l of lines) {
    if (l.product_id !== productId) continue;
    n += Math.max(0, l.qty - (l.returned_qty ?? 0));
  }
  return n;
}
