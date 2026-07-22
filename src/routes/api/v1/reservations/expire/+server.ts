import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudieron expirar las reservas", code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const body = await request.text();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const signature = request.headers.get("X-Hexa-Signature") ?? "";
  const verification = verifyServiceRequest({ keyId, signature, timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "POST", path: url.pathname, body }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 200) return fail("idempotency_required", 400, requestId);
  if (!CENTRAL_MODE) await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      await tx`DELETE FROM service_request_replays WHERE expires_at < NOW()`;
      const replay = await tx`INSERT INTO service_request_replays (key_id, signature, expires_at) VALUES (${keyId}, ${signature}, NOW() + INTERVAL '5 minutes') ON CONFLICT DO NOTHING RETURNING signature`;
      if (!replay.length) throw new Error("replay");
      const prior = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${tenant[0].id} AND operation = 'reservation.expire' AND key = ${idempotencyKey}`;
      if (prior[0]) { if (prior[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict"); return prior[0].response; }
      const reservations = await tx`SELECT id FROM reservations WHERE company_id = ${tenant[0].id} AND status = 'reserved' AND expires_at <= NOW() FOR UPDATE`;
      for (const reservation of reservations) {
        const lines = await tx`SELECT product_id, qty FROM reservation_lines WHERE reservation_id = ${reservation.id}`;
        for (const line of lines) {
          await tx`UPDATE products SET stock = stock + ${line.qty}, updated_at = NOW() WHERE id = ${line.product_id} AND company_id = ${tenant[0].id}`;
          await tx`INSERT INTO stock_movements (product_id, company_id, delta, reason, ref_type, ref_key) VALUES (${line.product_id}, ${tenant[0].id}, ${line.qty}, 'Expiración de reserva', 'reservation', ${reservation.id})`;
        }
        await tx`UPDATE reservations SET status = 'expired', cancelled_at = NOW() WHERE id = ${reservation.id}`;
      }
      const response = { expired_reservation_ids: reservations.map((reservation) => reservation.id), count: reservations.length };
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${tenant[0].id}, 'reservation.expire', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id) VALUES (${tenant[0].id}, ${keyId}, 'reservation.expire', ${requestId})`;
      return response;
    });
    return json({ ...result, request_id: requestId });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "expiration_failed";
    return fail(code, code === "replay" || code === "idempotency_conflict" ? 409 : 500, requestId);
  }
};
