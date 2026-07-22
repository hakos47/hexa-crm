import { json, type RequestHandler } from "@sveltejs/kit";
import { operatorFromAuthorization } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";

export const GET: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized" }, { status: 401 });
  const sales = await sql.begin(async (tx) => { await setTenantRls(tx, operator.companyId); return tx`SELECT s.id, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.status, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.company_id = ${operator.companyId} ORDER BY s.sold_at DESC`; });
  return json({ data: sales });
};
