import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { embedSemanticText, vectorLiteral } from "$lib/ai/ollama-embeddings";
import { canIndexSemanticEntity } from "$lib/ai/semantic-index";
import { semanticMetric } from "$lib/ai/semantic-metrics";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, status: number, requestId: string) => json({ error: "No se pudo indexar el documento", code, request_id: requestId }, { status });

export const POST: RequestHandler = async ({ request, url }) => {
  const startedAt = Date.now();
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
  let input: { entity_type?: string; entity_id?: string; document_version?: string; text?: string; correlation_id?: string };
  try { input = JSON.parse(body); } catch { return fail("invalid_json", 400, requestId); }
  const text = input.text?.replace(/\s+/g, " ").trim() ?? "";
  if (!input.entity_type || !canIndexSemanticEntity(input.entity_type) || !input.entity_id || !input.document_version || !text || text.length > 16_000) return fail("invalid_document", 400, requestId);
  const entityType = input.entity_type;
  const entityId = input.entity_id;
  const documentVersion = input.document_version;
  if (!CENTRAL_MODE) await initDb();
  const tenant = await sql`SELECT id FROM companies WHERE code = ${key.tenantCode} AND active = TRUE`;
  if (!tenant[0]) return fail("unknown_tenant", 403, requestId);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  let embedding: number[] | null = null;
  try { embedding = await embedSemanticText(text); } catch { /* Persist failure below without logging text. */ }
  try {
    const result = await sql.begin(async (tx) => {
      await setTenantRls(tx, tenant[0].id);
      const prior = await tx`SELECT payload_hash, response FROM idempotency_keys WHERE company_id = ${tenant[0].id} AND operation = 'semantic.index' AND key = ${idempotencyKey}`;
      if (prior[0]) { if (prior[0].payload_hash !== payloadHash) throw new Error("idempotency_conflict"); return prior[0].response; }
      const response = { entity_type: entityType, entity_id: entityId, document_version: documentVersion, status: embedding ? "ready" : "failed" };
      if (embedding) {
        await tx`INSERT INTO semantic_documents (id, company_id, entity_type, entity_id, document_version, normalized_text, embedding, embedding_status) VALUES (${crypto.randomUUID()}, ${tenant[0].id}, ${entityType}, ${entityId}, ${documentVersion}, ${text}, ${vectorLiteral(embedding)}::vector, 'ready') ON CONFLICT (company_id, entity_type, entity_id, document_version) DO UPDATE SET normalized_text = EXCLUDED.normalized_text, embedding = EXCLUDED.embedding, embedding_status = 'ready', updated_at = NOW()`;
      } else {
        await tx`INSERT INTO semantic_documents (id, company_id, entity_type, entity_id, document_version, normalized_text, embedding_status) VALUES (${crypto.randomUUID()}, ${tenant[0].id}, ${entityType}, ${entityId}, ${documentVersion}, ${text}, 'failed') ON CONFLICT (company_id, entity_type, entity_id, document_version) DO UPDATE SET normalized_text = EXCLUDED.normalized_text, embedding_status = 'failed', updated_at = NOW()`;
      }
      const metric = semanticMetric({ operation: "index", outcome: embedding ? "ready" : "failed", startedAt });
      await tx`INSERT INTO semantic_metrics (company_id, operation, outcome, latency_ms, queue_depth) VALUES (${tenant[0].id}, ${metric.operation}, ${metric.outcome}, ${metric.latencyMs}, ${metric.queueDepth})`;
      await tx`INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response) VALUES (${tenant[0].id}, 'semantic.index', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(response)}::jsonb)`;
      await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id) VALUES (${tenant[0].id}, ${keyId}, 'semantic.index', ${requestId}, ${input.correlation_id ?? null})`;
      return response;
    });
    if (result.status !== "ready") return fail("embedding_unavailable", 503, requestId);
    return json({ ...result, request_id: requestId }, { status: 201 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "index_failed";
    return fail(code, code === "idempotency_conflict" ? 409 : 500, requestId);
  }
};
