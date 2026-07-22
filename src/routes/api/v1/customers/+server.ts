import { json, type RequestHandler } from "@sveltejs/kit";
import { initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudo enlazar el cliente", code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const body = await request.text();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const verification = verifyServiceRequest({ keyId, signature: request.headers.get("X-Hexa-Signature") ?? "", timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "POST", path: url.pathname, body }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  let input: { source?: string; external_user_id?: string; name?: string; email?: string; phone?: string; correlation_id?: string };
  try { input = JSON.parse(body); } catch { return fail("invalid_json", 400, requestId); }
  if (input.source !== "meiga" || !input.external_user_id || !input.name || input.name.length > 200) return fail("invalid_external_identity", 400, requestId);
  const externalUserId = input.external_user_id;
  const name = input.name;
  await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`meiga:${tenant[0].id}:${externalUserId}`}))`;
      const known = await tx`SELECT customer_id FROM external_customer_identities WHERE company_id = ${tenant[0].id} AND source = 'meiga' AND external_user_id = ${externalUserId} FOR UPDATE`;
      let customerId = known[0]?.customer_id as number | undefined;
      if (customerId) {
        await tx`UPDATE customers SET name = ${name}, email = ${input.email ?? ""}, phone = ${input.phone ?? ""} WHERE id = ${customerId} AND company_id = ${tenant[0].id}`;
      } else {
        const created = await tx`INSERT INTO customers (company_id, name, email, phone, nif, notes) VALUES (${tenant[0].id}, ${name}, ${input.email ?? ""}, ${input.phone ?? ""}, '', '') RETURNING id`;
        const createdId = Number(created[0].id);
        customerId = createdId;
        await tx`INSERT INTO external_customer_identities (company_id, source, external_user_id, customer_id) VALUES (${tenant[0].id}, 'meiga', ${externalUserId}, ${createdId})`;
      }
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id) VALUES (${tenant[0].id}, ${keyId}, 'customer.meiga_upsert', ${requestId}, ${input.correlation_id ?? null})`;
      return { customer_id: customerId, source: "meiga", external_user_id: externalUserId };
    });
    return json({ ...result, request_id: requestId }, { status: 200 });
  } catch (cause) { return fail(cause instanceof Error ? cause.message : "customer_upsert_failed", 500, requestId); }
};
