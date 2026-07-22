import { json, type RequestHandler } from "@sveltejs/kit";
import { initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudo cancelar la reserva", code, request_id: requestId }, { status });

export const DELETE: RequestHandler = async ({ request, params, url }) => {
  const requestId = crypto.randomUUID();
  const reservationId = params.id;
  if (!reservationId) return fail("invalid_reservation", 400, requestId);
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const signature = request.headers.get("X-Hexa-Signature") ?? "";
  const verification = verifyServiceRequest({ keyId, signature, timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "DELETE", path: url.pathname, body: "" }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  try {
    const response = await sql.begin(async (tx) => {
      await tx`DELETE FROM service_request_replays WHERE expires_at < NOW()`;
      const replay = await tx`INSERT INTO service_request_replays (key_id, signature, expires_at) VALUES (${keyId}, ${signature}, NOW() + INTERVAL '5 minutes') ON CONFLICT DO NOTHING RETURNING signature`;
      if (!replay.length) throw new Error("replay");
      const rows = await tx`SELECT id, status FROM reservations WHERE id = ${reservationId} AND company_id = ${tenant[0].id} FOR UPDATE`;
      if (!rows[0]) throw new Error("not_found");
      if (rows[0].status !== "reserved") return { reservation_id: reservationId, status: rows[0].status, restored: false };
      const lines = await tx`SELECT product_id, qty FROM reservation_lines WHERE reservation_id = ${reservationId}`;
      for (const line of lines) {
        await tx`UPDATE products SET stock = stock + ${line.qty}, updated_at = NOW() WHERE id = ${line.product_id} AND company_id = ${tenant[0].id}`;
        await tx`INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id) VALUES (${line.product_id}, ${line.qty}, 'Cancelación de reserva', 'reservation', NULL)`;
      }
      await tx`UPDATE reservations SET status = 'cancelled', cancelled_at = NOW() WHERE id = ${reservationId}`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id) VALUES (${tenant[0].id}, ${keyId}, 'reservation.cancel', ${requestId})`;
      return { reservation_id: reservationId, status: "cancelled", restored: true };
    });
    return json({ ...response, request_id: requestId });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "cancel_failed";
    return fail(code, code === "not_found" ? 404 : code === "replay" ? 409 : 500, requestId);
  }
};
