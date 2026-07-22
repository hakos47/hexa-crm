import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const error = (message: string, code: string, status: number, requestId: string) => json({ error: message, code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const body = await request.text();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return error("Clave de servicio desconocida", "unknown_key", 401, requestId);
  const signature = request.headers.get("X-Hexa-Signature") ?? "";
  const verification = verifyServiceRequest({ keyId, signature, timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "POST", path: url.pathname, body }, key.secret);
  if (!verification.ok) return error("Firma de servicio inválida", verification.code, 401, requestId);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 200) return error("Falta Idempotency-Key", "idempotency_required", 400, requestId);
  let input: { lines?: { product_id: number; qty: number }[]; expires_at?: string; external_customer_id?: string; correlation_id?: string };
  try { input = JSON.parse(body); } catch { return error("JSON inválido", "invalid_json", 400, requestId); }
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.some((line) => !Number.isInteger(line.product_id) || !Number.isInteger(line.qty) || line.qty <= 0)) return error("Líneas de reserva inválidas", "invalid_lines", 400, requestId);
  if (!CENTRAL_MODE) await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return error("Tenant no disponible", "unknown_tenant", 403, requestId);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      await tx`DELETE FROM service_request_replays WHERE expires_at < NOW()`;
      const replay = await tx`INSERT INTO service_request_replays (key_id, signature, expires_at) VALUES (${keyId}, ${signature}, NOW() + INTERVAL '5 minutes') ON CONFLICT DO NOTHING RETURNING signature`;
      if (!replay.length) throw new Error("replay");
      const previous = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${tenant[0].id} AND operation = 'reservation' AND key = ${idempotencyKey}`;
      if (previous[0]) {
        if (previous[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict");
        return previous[0].response;
      }
      const productIds = input.lines!.map((line) => line.product_id);
      const products = await tx`SELECT id, stock FROM products WHERE company_id = ${tenant[0].id} AND id IN ${tx(productIds)} FOR UPDATE`;
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const line of input.lines!) {
        const product = byId.get(line.product_id);
        if (!product || product.stock < line.qty) throw new Error("insufficient_stock");
      }
      for (const line of input.lines!) await tx`UPDATE products SET stock = stock - ${line.qty}, updated_at = NOW() WHERE id = ${line.product_id} AND company_id = ${tenant[0].id}`;
      const reservationId = crypto.randomUUID();
      const expiresAt = input.expires_at ?? new Date(Date.now() + 15 * 60_000).toISOString();
      if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error("invalid_expiry");
      await tx`INSERT INTO reservations (id, company_id, status, expires_at, external_customer_id) VALUES (${reservationId}, ${tenant[0].id}, 'reserved', ${expiresAt}, ${input.external_customer_id ?? null})`;
      for (const line of input.lines!) await tx`INSERT INTO reservation_lines (reservation_id, product_id, qty) VALUES (${reservationId}, ${line.product_id}, ${line.qty})`;
      const response = { reservation_id: reservationId, status: "reserved", expires_at: expiresAt, lines: input.lines };
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${tenant[0].id}, 'reservation', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id) VALUES (${tenant[0].id}, ${keyId}, 'reservation.create', ${requestId}, ${input.correlation_id ?? null})`;
      return response;
    });
    return json({ ...result, request_id: requestId }, { status: 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "reservation_failed";
    const status = code === "replay" ? 409 : code === "insufficient_stock" || code === "idempotency_conflict" ? 409 : 500;
    return error("No se pudo crear la reserva", code, status, requestId);
  }
};
