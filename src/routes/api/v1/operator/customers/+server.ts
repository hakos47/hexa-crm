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

export const POST: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  const requestId = crypto.randomUUID();
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized", request_id: requestId }, { status: 401 });
  let input: { id?: number; name?: string; email?: string; phone?: string; nif?: string; notes?: string };
  try { input = await request.json(); } catch { return json({ error: "Solicitud inválida", code: "invalid_json", request_id: requestId }, { status: 400 }); }
  if (!input.name?.trim() || input.name.length > 200) return json({ error: "Cliente inválido", code: "invalid_customer", request_id: requestId }, { status: 400 });
  const name = input.name.trim();
  try {
    const customer = await sql.begin(async (tx) => {
      await setTenantRls(tx, operator.companyId);
      if (input.id) {
        const rows = await tx`UPDATE customers SET name = ${name}, email = ${input.email ?? ""}, phone = ${input.phone ?? ""}, nif = ${input.nif ?? ""}, notes = ${input.notes ?? ""} WHERE id = ${input.id} AND company_id = ${operator.companyId} RETURNING *`;
        if (!rows[0]) throw new Error("customer_not_found");
        return rows[0];
      }
      const rows = await tx`INSERT INTO customers (company_id, name, email, phone, nif, notes) VALUES (${operator.companyId}, ${name}, ${input.email ?? ""}, ${input.phone ?? ""}, ${input.nif ?? ""}, ${input.notes ?? ""}) RETURNING *`;
      return rows[0];
    });
    return json(customer, { status: input.id ? 200 : 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "customer_save_failed";
    return json({ error: "No se pudo guardar el cliente", code, request_id: requestId }, { status: code === "customer_not_found" ? 404 : 500 });
  }
};
