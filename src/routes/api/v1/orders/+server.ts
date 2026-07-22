import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudo confirmar el pedido", code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const body = await request.text();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const verification = verifyServiceRequest({ keyId, signature: request.headers.get("X-Hexa-Signature") ?? "", timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "POST", path: url.pathname, body }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) return fail("idempotency_required", 400, requestId);
  let input: { reservation_id?: string; status?: "pending" | "paid"; correlation_id?: string };
  try { input = JSON.parse(body); } catch { return fail("invalid_json", 400, requestId); }
  if (!input.reservation_id) return fail("reservation_required", 400, requestId);
  if (!CENTRAL_MODE) await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      const prior = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${tenant[0].id} AND operation = 'order' AND key = ${idempotencyKey}`;
      if (prior[0]) { if (prior[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict"); return prior[0].response; }
      const reservation = await tx`SELECT id, status, external_customer_id, expires_at FROM reservations WHERE id = ${input.reservation_id} AND company_id = ${tenant[0].id} FOR UPDATE`;
      if (!reservation[0]) throw new Error("reservation_not_found");
      if (reservation[0].status !== "reserved" || new Date(reservation[0].expires_at).getTime() <= Date.now()) throw new Error("reservation_unavailable");
      const lines = await tx`SELECT l.product_id, l.qty, p.price_cents FROM reservation_lines l JOIN products p ON p.id = l.product_id WHERE l.reservation_id = ${input.reservation_id}`;
      const total = lines.reduce((sum, line) => sum + line.qty * line.price_cents, 0);
      const orderId = crypto.randomUUID();
      const status = input.status ?? "pending";
      await tx`INSERT INTO orders (id, company_id, reservation_id, external_customer_id, status, total_cents) VALUES (${orderId}, ${tenant[0].id}, ${input.reservation_id}, ${reservation[0].external_customer_id}, ${status}, ${total})`;
      for (const line of lines) await tx`INSERT INTO order_lines (order_id, product_id, qty, unit_price_cents) VALUES (${orderId}, ${line.product_id}, ${line.qty}, ${line.price_cents})`;
      await tx`UPDATE reservations SET status = 'confirmed' WHERE id = ${input.reservation_id}`;
      const response = { order_id: orderId, reservation_id: input.reservation_id, status, total_cents: total };
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${tenant[0].id}, 'order', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id) VALUES (${tenant[0].id}, ${keyId}, 'order.confirm', ${requestId}, ${input.correlation_id ?? null})`;
      return response;
    });
    return json({ ...result, request_id: requestId }, { status: 201 });
  } catch (cause) { const code = cause instanceof Error ? cause.message : "order_failed"; return fail(code, code.includes("reservation") || code === "idempotency_conflict" ? 409 : 500, requestId); }
};
