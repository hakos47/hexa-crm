import type { Product, Sale } from "$lib/types";
import { countsInBusinessTotals } from "$lib/sales/cancel-sale";

export type DashboardAlert = {
  id: "stock" | "backup" | "no-sales" | "sales-down";
  tone: "warn" | "err" | "info";
  title: string;
  detail: string;
  href: string;
};

export type DayMetric = { date: string; cents: number; count: number };

export type DashboardHealth = {
  today_cents: number;
  today_count: number;
  yesterday_cents: number;
  yesterday_count: number;
  sales_delta_percent: number | null;
  tickets_delta_percent: number | null;
  average_ticket_cents: number;
  trend: DayMetric[];
  alerts: DashboardAlert[];
};

const DAY_MS = 86_400_000;

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Pure dashboard summary. Inputs have already been scoped to the active company by the API. */
export function dashboardHealth(
  sales: Sale[],
  lowStock: Product[],
  backupNeedsAttention: boolean,
  now = Date.now(),
): DashboardHealth {
  const startToday = localDayStart(now);
  const startYesterday = startToday - DAY_MS;
  const trend = Array.from({ length: 7 }, (_, index) => {
    const start = startToday - (6 - index) * DAY_MS;
    return { date: new Date(start).toISOString().slice(0, 10), cents: 0, count: 0, start };
  });

  let todayCents = 0;
  let todayCount = 0;
  let yesterdayCents = 0;
  let yesterdayCount = 0;
  for (const sale of sales) {
    if (!countsInBusinessTotals(sale.status)) continue;
    const soldAt = Date.parse(sale.sold_at);
    if (!Number.isFinite(soldAt)) continue;
    const netCents = Math.max(0, sale.total_cents - (sale.refunded_cents ?? 0));
    if (soldAt >= startToday && soldAt <= now) {
      todayCents += netCents;
      todayCount += 1;
    } else if (soldAt >= startYesterday && soldAt < startToday) {
      yesterdayCents += netCents;
      yesterdayCount += 1;
    }
    const bucket = trend.find((day) => soldAt >= day.start && soldAt < day.start + DAY_MS);
    if (bucket) {
      bucket.cents += netCents;
      bucket.count += 1;
    }
  }

  const alerts: DashboardAlert[] = [];
  if (lowStock.length) {
    alerts.push({ id: "stock", tone: "warn", title: "Stock para reponer", detail: `${lowStock.length} producto(s) bajo el mínimo`, href: "/inventario?reponer=1" });
  }
  if (backupNeedsAttention) {
    alerts.push({ id: "backup", tone: "warn", title: "Copia de seguridad pendiente", detail: "Guarda un JSON local para proteger los datos", href: "/ajustes" });
  }
  if (todayCount === 0) {
    alerts.push({ id: "no-sales", tone: "info", title: "Aún no hay ventas hoy", detail: "Abre el TPV para registrar el primer ticket", href: "/ventas?nuevo=1" });
  } else if (yesterdayCents > 0 && todayCents < yesterdayCents) {
    alerts.push({ id: "sales-down", tone: "info", title: "Ventas por debajo de ayer", detail: "Revisa los tickets y prepara una acción comercial", href: "/ventas" });
  }

  return {
    today_cents: todayCents,
    today_count: todayCount,
    yesterday_cents: yesterdayCents,
    yesterday_count: yesterdayCount,
    sales_delta_percent: percentDelta(todayCents, yesterdayCents),
    tickets_delta_percent: percentDelta(todayCount, yesterdayCount),
    average_ticket_cents: todayCount ? Math.round(todayCents / todayCount) : 0,
    trend: trend.map(({ start: _start, ...day }) => day),
    alerts: alerts.slice(0, 5),
  };
}
