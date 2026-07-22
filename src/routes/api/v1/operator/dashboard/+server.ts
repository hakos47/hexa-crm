import { json, type RequestHandler } from "@sveltejs/kit";
import { operatorFromAuthorization } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";

/** Read-only operational summary for the authenticated tenant. */
export const GET: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized" }, { status: 401 });

  const dashboard = await sql.begin(async (tx) => {
    await setTenantRls(tx, operator.companyId);
    const [totals] = await tx`
      SELECT
        COALESCE(SUM(total_cents) FILTER (WHERE sold_at::date = CURRENT_DATE AND status = 'completed'), 0)::int AS sales_today_cents,
        COUNT(*) FILTER (WHERE sold_at::date = CURRENT_DATE AND status = 'completed')::int AS sales_today_count,
        COALESCE(SUM(total_cents) FILTER (WHERE date_trunc('month', sold_at) = date_trunc('month', CURRENT_DATE) AND status = 'completed'), 0)::int AS sales_month_cents,
        COUNT(*) FILTER (WHERE date_trunc('month', sold_at) = date_trunc('month', CURRENT_DATE) AND status = 'completed')::int AS sales_month_count,
        COALESCE(SUM(vat_cents) FILTER (WHERE date_trunc('month', sold_at) = date_trunc('month', CURRENT_DATE) AND status = 'completed'), 0)::int AS vat_month_cents,
        COALESCE(SUM(subtotal_cents) FILTER (WHERE date_trunc('month', sold_at) = date_trunc('month', CURRENT_DATE) AND status = 'completed'), 0)::int AS base_month_cents
      FROM sales WHERE company_id = ${operator.companyId}`;
    const [cash] = await tx`SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN -ABS(amount_cents) ELSE ABS(amount_cents) END), 0)::int AS cash_balance_cents FROM cash_movements WHERE company_id = ${operator.companyId}`;
    const lowStock = await tx`SELECT id, sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active, created_at, updated_at FROM products WHERE company_id = ${operator.companyId} AND active = TRUE AND stock <= min_stock ORDER BY stock ASC, updated_at DESC`;
    return { ...totals, cash_balance_cents: cash.cash_balance_cents, low_stock: lowStock };
  });

  return json({ ...dashboard, synchronized_at: new Date().toISOString() });
};
