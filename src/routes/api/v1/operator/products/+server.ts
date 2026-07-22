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

export const POST: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  const requestId = crypto.randomUUID();
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized", request_id: requestId }, { status: 401 });
  if (operator.role !== "admin") return json({ error: "Se requieren permisos de administrador", code: "operator_forbidden", request_id: requestId }, { status: 403 });
  let input: { id?: number; sku?: string; name?: string; description?: string; category?: string; stock?: number; min_stock?: number; cost_cents?: number; price_cents?: number; vat_rate?: number; active?: boolean };
  try { input = await request.json(); } catch { return json({ error: "Solicitud inválida", code: "invalid_json", request_id: requestId }, { status: 400 }); }
  const rawStock = input.stock;
  const rawPriceCents = input.price_cents;
  if (!input.sku?.trim() || !input.name?.trim() || typeof rawStock !== "number" || !Number.isInteger(rawStock) || rawStock < 0 || typeof rawPriceCents !== "number" || !Number.isInteger(rawPriceCents) || rawPriceCents < 0 || ![0, 4, 10, 21].includes(input.vat_rate ?? 21)) return json({ error: "Producto inválido", code: "invalid_product", request_id: requestId }, { status: 400 });
  const sku = input.sku.trim();
  const name = input.name.trim();
  const stock = rawStock;
  const priceCents = rawPriceCents;
  const minStock = input.min_stock ?? 0;
  const costCents = input.cost_cents ?? 0;
  const vatRate = input.vat_rate ?? 21;
  const active = input.active ?? true;
  try {
    const product = await sql.begin(async (tx) => {
      await setTenantRls(tx, operator.companyId);
      if (input.id) {
        const existing = await tx`SELECT id, stock FROM products WHERE id = ${input.id} AND company_id = ${operator.companyId} FOR UPDATE`;
        if (!existing[0]) throw new Error("product_not_found");
        const rows = await tx`UPDATE products SET sku = ${sku}, name = ${name}, description = ${input.description ?? ""}, category = ${input.category ?? ""}, stock = ${stock}, min_stock = ${minStock}, cost_cents = ${costCents}, price_cents = ${priceCents}, vat_rate = ${vatRate}, active = ${active}, updated_at = NOW() WHERE id = ${input.id} AND company_id = ${operator.companyId} RETURNING *`;
        const delta = stock - existing[0].stock;
        if (delta) await tx`INSERT INTO stock_movements (product_id, company_id, delta, reason, ref_type, ref_key) VALUES (${input.id}, ${operator.companyId}, ${delta}, 'Ajuste de operador', 'operator', ${operator.accountId})`;
        return rows[0];
      }
      const rows = await tx`INSERT INTO products (company_id, sku, name, description, category, stock, min_stock, cost_cents, price_cents, vat_rate, active) VALUES (${operator.companyId}, ${sku}, ${name}, ${input.description ?? ""}, ${input.category ?? ""}, ${stock}, ${minStock}, ${costCents}, ${priceCents}, ${vatRate}, ${active}) RETURNING *`;
      if (stock) await tx`INSERT INTO stock_movements (product_id, company_id, delta, reason, ref_type, ref_key) VALUES (${rows[0].id}, ${operator.companyId}, ${stock}, 'Alta de operador', 'operator', ${operator.accountId})`;
      return rows[0];
    });
    return json(product, { status: input.id ? 200 : 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "product_save_failed";
    return json({ error: "No se pudo guardar el producto", code, request_id: requestId }, { status: code === "product_not_found" ? 404 : 409 });
  }
};
