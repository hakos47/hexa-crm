import { json, type RequestHandler } from "@sveltejs/kit";
import { operatorFromAuthorization } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";
import { createHash } from "node:crypto";
import { isVatRate, lineBreakdown, type VatRate } from "$lib/vat";

export const GET: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized" }, { status: 401 });
  const sales = await sql.begin(async (tx) => { await setTenantRls(tx, operator.companyId); return tx`SELECT s.id, s.number, s.sold_at, s.subtotal_cents, s.vat_cents, s.total_cents, s.status, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.company_id = ${operator.companyId} ORDER BY s.sold_at DESC`; });
  return json({ data: sales });
};

export const POST: RequestHandler = async ({ request }) => {
  const operator = await operatorFromAuthorization(request.headers.get("authorization"));
  const requestId = crypto.randomUUID();
  if (!operator) return json({ error: "Sesión de operador no válida", code: "operator_unauthorized", request_id: requestId }, { status: 401 });
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 200) return json({ error: "Falta Idempotency-Key", code: "idempotency_required", request_id: requestId }, { status: 400 });
  const body = await request.text();
  let input: { lines?: { product_id: number; qty: number; unit_price_cents?: number; discount_cents?: number }[]; customer_id?: number | null; notes?: string };
  try { input = JSON.parse(body); } catch { return json({ error: "Solicitud inválida", code: "invalid_json", request_id: requestId }, { status: 400 }); }
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.some((line) => !Number.isInteger(line.product_id) || !Number.isInteger(line.qty) || line.qty <= 0)) return json({ error: "Líneas de venta inválidas", code: "invalid_lines", request_id: requestId }, { status: 400 });
  const payloadHash = createHash("sha256").update(body).digest("hex");
  try {
    const sale = await sql.begin(async (tx) => {
      await setTenantRls(tx, operator.companyId);
      const prior = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${operator.companyId} AND operation = 'operator.sale' AND key = ${idempotencyKey}`;
      if (prior[0]) { if (prior[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict"); return prior[0].response; }
      if (input.customer_id) {
        const customer = await tx`SELECT id FROM customers WHERE id = ${input.customer_id} AND company_id = ${operator.companyId}`;
        if (!customer[0]) throw new Error("customer_not_found");
      }
      const productIds = input.lines!.map((line) => line.product_id);
      const products = await tx`SELECT id, name, stock, price_cents, vat_rate FROM products WHERE company_id = ${operator.companyId} AND id IN ${tx(productIds)} FOR UPDATE`;
      const byId = new Map(products.map((product) => [product.id, product]));
      const calculated = input.lines!.map((line) => {
        const product = byId.get(line.product_id);
        if (!product || product.stock < line.qty) throw new Error("insufficient_stock");
        const unit = line.unit_price_cents ?? product.price_cents;
        const discount = Math.min(Math.max(0, line.discount_cents ?? 0), unit * line.qty);
        const vatRate = isVatRate(product.vat_rate) ? product.vat_rate as VatRate : 21;
        return { product, line, breakdown: lineBreakdown({ qty: line.qty, unitPriceCents: unit, vatRate, discountCents: discount }) };
      });
      const subtotal = calculated.reduce((sum, item) => sum + item.breakdown.lineBaseCents, 0);
      const vat = calculated.reduce((sum, item) => sum + item.breakdown.lineVatCents, 0);
      const total = calculated.reduce((sum, item) => sum + item.breakdown.lineTotalCents, 0);
      const year = new Date().getUTCFullYear();
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`sale-number-${year}`}))`;
      const count = await tx`SELECT COUNT(*)::int AS count FROM sales WHERE sold_at >= ${new Date(Date.UTC(year, 0, 1))}`;
      const number = `V${year}-${String(count[0].count + 1).padStart(5, "0")}`;
      const created = await tx`INSERT INTO sales (customer_id, number, subtotal_cents, vat_cents, total_cents, notes, status, company_id) VALUES (${input.customer_id ?? null}, ${number}, ${subtotal}, ${vat}, ${total}, ${input.notes ?? ""}, 'completed', ${operator.companyId}) RETURNING *`;
      for (const item of calculated) {
        await tx`INSERT INTO sale_lines (sale_id, product_id, qty, unit_price_cents, vat_rate, line_base_cents, line_vat_cents, line_total_cents) VALUES (${created[0].id}, ${item.line.product_id}, ${item.line.qty}, ${item.breakdown.unitPriceCents}, ${item.breakdown.vatRate}, ${item.breakdown.lineBaseCents}, ${item.breakdown.lineVatCents}, ${item.breakdown.lineTotalCents})`;
        await tx`UPDATE products SET stock = stock - ${item.line.qty}, updated_at = NOW() WHERE id = ${item.line.product_id} AND company_id = ${operator.companyId}`;
        await tx`INSERT INTO stock_movements (product_id, company_id, delta, reason, ref_type, ref_id, ref_key) VALUES (${item.line.product_id}, ${operator.companyId}, ${-item.line.qty}, 'Venta de operador', 'sale', ${created[0].id}, ${operator.accountId})`;
      }
      await tx`INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, company_id) VALUES ('income', ${total}, 'ventas', ${`Venta ${number}`}, ${created[0].id}, ${operator.companyId})`;
      const response = { id: created[0].id, number, total_cents: total, status: 'completed' };
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${operator.companyId}, 'operator.sale', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      return response;
    });
    return json(sale, { status: 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "sale_failed";
    return json({ error: "No se pudo registrar la venta", code, request_id: requestId }, { status: code === "insufficient_stock" || code === "idempotency_conflict" ? 409 : 500 });
  }
};
