import type { Customer, Sale } from "$lib/types";
import { countsInBusinessTotals } from "$lib/sales/cancel-sale";

export type CustomerMetrics = {
  customer_id: number;
  purchase_count: number;
  lifetime_cents: number;
  last_purchase_at: string | null;
  segment: "nuevo" | "vip" | "en_riesgo" | "habitual";
};

export function customerMetrics(
  customers: Customer[],
  sales: Sale[],
  now = Date.now(),
): Record<number, CustomerMetrics> {
  const result = Object.fromEntries(
    customers.map((customer) => [
      customer.id,
      { customer_id: customer.id, purchase_count: 0, lifetime_cents: 0, last_purchase_at: null, segment: "nuevo" as const },
    ]),
  ) as Record<number, CustomerMetrics>;

  for (const sale of sales) {
    if (!sale.customer_id || !countsInBusinessTotals(sale.status) || !result[sale.customer_id]) continue;
    const metric = result[sale.customer_id];
    metric.purchase_count += 1;
    metric.lifetime_cents += Math.max(0, sale.total_cents - (sale.refunded_cents ?? 0));
    if (!metric.last_purchase_at || sale.sold_at > metric.last_purchase_at) metric.last_purchase_at = sale.sold_at;
  }

  for (const metric of Object.values(result)) {
    const daysSince = metric.last_purchase_at ? (now - Date.parse(metric.last_purchase_at)) / 86_400_000 : Infinity;
    metric.segment = metric.purchase_count <= 1 ? "nuevo" : metric.lifetime_cents >= 50_000 || metric.purchase_count >= 8 ? "vip" : daysSince > 90 ? "en_riesgo" : "habitual";
  }
  return result;
}
