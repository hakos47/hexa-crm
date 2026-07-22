import { json, type RequestHandler } from "@sveltejs/kit";
import { embedSemanticText, vectorLiteral } from "$lib/ai/ollama-embeddings";
import { sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, status: number, requestId: string) => json({ error: "Búsqueda semántica no disponible", code, request_id: requestId }, { status });

export const GET: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", 401, requestId);
  const verification = verifyServiceRequest({ keyId, signature: request.headers.get("X-Hexa-Signature") ?? "", timestamp: request.headers.get("X-Hexa-Timestamp") ?? "", method: "GET", path: url.pathname, body: "" }, key.secret);
  if (!verification.ok) return fail(verification.code, 401, requestId);
  const query = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (!query || query.length > 1_000) return fail("invalid_query", 400, requestId);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10) || 10));
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  let embedding: number[];
  try { embedding = await embedSemanticText(query); } catch { return fail("embedding_unavailable", 503, requestId); }
  const vector = vectorLiteral(embedding);
  const documents = await sql.begin(async (tx) => {
    await setTenantRls(tx, tenant[0].id);
    return tx`SELECT entity_type, entity_id, document_version, normalized_text, (1 - (embedding <=> ${vector}::vector)) AS semantic_score, CASE WHEN normalized_text ILIKE ${`%${query}%`} THEN 0.15 ELSE 0 END AS lexical_boost FROM semantic_documents WHERE company_id = ${tenant[0].id} AND embedding_status = 'ready' ORDER BY ((1 - (embedding <=> ${vector}::vector)) + CASE WHEN normalized_text ILIKE ${`%${query}%`} THEN 0.15 ELSE 0 END) DESC, updated_at DESC LIMIT ${limit}`;
  });
  return json({ data: documents, request_id: requestId });
};
