import { json, type RequestHandler } from "@sveltejs/kit";
import { operatorFromAuthorization } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";

export const GET: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized" }, { status: 401 });
  const customers = await sql.begin(async (tx) => { await setTenantRls(tx, operator.companyId); return tx`SELECT id, name, email, phone, nif, notes, created_at FROM customers WHERE company_id = ${operator.companyId} ORDER BY created_at DESC`; });
  return json({ data: customers });
};
