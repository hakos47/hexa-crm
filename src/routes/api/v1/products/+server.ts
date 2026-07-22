import { json, type RequestHandler } from "@sveltejs/kit";
import { sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";

function requestId(): string { return crypto.randomUUID(); }
function failure(code: string, status: number, id: string) { return json({ error: "Solicitud de servicio no autorizada", code, request_id: id }, { status }); }

export const GET: RequestHandler = async ({ request, url }) => {
  const id = requestId();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return failure("unknown_key", 401, id);
  const verification = verifyServiceRequest({
    keyId,
    timestamp: request.headers.get("X-Hexa-Timestamp") ?? "",
    signature: request.headers.get("X-Hexa-Signature") ?? "",
    method: "GET", path: url.pathname, body: "",
  }, key.secret);
  if (!verification.ok) return failure(verification.code, 401, id);
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return failure("unknown_tenant", 403, id);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
  const products = await sql`
    SELECT id, sku, name, description, category, stock, min_stock, price_cents, vat_rate, currency,
           condition_code, image_url, evidence, publication_status, updated_at
    FROM products WHERE company_id = ${tenant[0].id} AND active = TRUE AND publication_status = 'published' AND id > ${cursor}
    ORDER BY id ASC LIMIT ${limit + 1}
  `;
  const hasNext = products.length > limit;
  const page = products.slice(0, limit);
  return json({ data: page, next_cursor: hasNext ? String(page.at(-1)?.id) : null, request_id: id });
};
