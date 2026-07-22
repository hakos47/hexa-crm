import { json, type RequestHandler } from "@sveltejs/kit";
import { operatorFromAuthorization } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";

export const GET: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized" }, { status: 401 });
  const products = await sql.begin(async (tx) => {
    await setTenantRls(tx, operator.companyId);
    return tx`SELECT id, sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active, publication_status, currency, condition_code, image_url, evidence, updated_at FROM products WHERE company_id = ${operator.companyId} ORDER BY updated_at DESC`;
  });
  return json({ data: products });
};
