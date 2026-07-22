import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";
import { isVatRate, lineBreakdown, type VatRate } from "$lib/vat";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudo registrar la venta", code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, params, url }) => {
  const requestId = crypto.randomUUID();
  const orderId = params.id;
  if (!orderId) return fail("invalid_order", 400, requestId);
  const body = await request.text();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const verification = verifyServiceRequest({ keyId, signature: request.headers.get("X-Hexa-Signature") ?? "", timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "POST", path: url.pathname, body }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 200) return fail("idempotency_required", 400, requestId);
  let input: { correlation_id?: string; notes?: string };
  try { input = body ? JSON.parse(body) : {}; } catch { return fail("invalid_json", 400, requestId); }
  if (!CENTRAL_MODE) await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      const prior = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${tenant[0].id} AND operation = 'sale' AND key = ${idempotencyKey}`;
      if (prior[0]) { if (prior[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict"); return prior[0].response; }
      const order = await tx`SELECT id, status, external_customer_id FROM orders WHERE id = ${orderId} AND company_id = ${tenant[0].id} FOR UPDATE`;
      if (!order[0]) throw new Error("order_not_found");
      if (order[0].status === "cancelled") throw new Error("order_cancelled");
      const existingSale = await tx`SELECT id, number, total_cents FROM sales WHERE order_id = ${orderId} AND company_id = ${tenant[0].id}`;
      if (existingSale[0]) return { sale_id: existingSale[0].id, sale_number: existingSale[0].number, total_cents: existingSale[0].total_cents, order_id: orderId };
      const lines = await tx`SELECT l.product_id, l.qty, l.unit_price_cents, l.vat_rate FROM order_lines l WHERE l.order_id = ${orderId}`;
      if (!lines.length) throw new Error("order_without_lines");
      const calculated = lines.map((line) => lineBreakdown({ qty: line.qty, unitPriceCents: line.unit_price_cents, vatRate: isVatRate(line.vat_rate) ? line.vat_rate as VatRate : 21 }));
      const subtotal = calculated.reduce((sum, line) => sum + line.lineBaseCents, 0);
      const vat = calculated.reduce((sum, line) => sum + line.lineVatCents, 0);
      const total = calculated.reduce((sum, line) => sum + line.lineTotalCents, 0);
      const customer = order[0].external_customer_id
        ? await tx`SELECT customer_id FROM external_customer_identities WHERE company_id = ${tenant[0].id} AND source = 'meiga' AND external_user_id = ${order[0].external_customer_id}`
        : [];
      const year = new Date().getUTCFullYear();
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`sale-number-${year}`}))`;
      const count = await tx`SELECT COUNT(*)::int AS count FROM sales WHERE sold_at >= ${new Date(Date.UTC(year, 0, 1))}`;
      const number = `V${year}-${String(count[0].count + 1).padStart(5, "0")}`;
      const sale = await tx`INSERT INTO sales (customer_id, order_id, number, subtotal_cents, vat_cents, total_cents, notes, status, company_id) VALUES (${customer[0]?.customer_id ?? null}, ${orderId}, ${number}, ${subtotal}, ${vat}, ${total}, ${input.notes ?? ""}, 'completed', ${tenant[0].id}) RETURNING id`;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]; const totals = calculated[index];
        await tx`INSERT INTO sale_lines (sale_id, product_id, qty, unit_price_cents, vat_rate, line_base_cents, line_vat_cents, line_total_cents) VALUES (${sale[0].id}, ${line.product_id}, ${line.qty}, ${line.unit_price_cents}, ${totals.vatRate}, ${totals.lineBaseCents}, ${totals.lineVatCents}, ${totals.lineTotalCents})`;
      }
      await tx`INSERT INTO cash_movements (kind, amount_cents, category, description, sale_id, company_id) VALUES ('income', ${total}, 'ventas', ${`Venta ${number}`}, ${sale[0].id}, ${tenant[0].id})`;
      await tx`UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = ${orderId}`;
      const response = { sale_id: sale[0].id, sale_number: number, total_cents: total, order_id: orderId };
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${tenant[0].id}, 'sale', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id) VALUES (${tenant[0].id}, ${keyId}, 'sale.create', ${requestId}, ${input.correlation_id ?? null})`;
      return response;
    });
    return json({ ...result, request_id: requestId }, { status: 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "sale_failed";
    return fail(code, code.startsWith("order_") || code === "idempotency_conflict" ? 409 : 500, requestId);
  }
};
