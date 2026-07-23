import { createHash } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { executeStripeIntegrationTool } from "$lib/api/integration-stripe";

const fail = (code: string, message: string, status: number, requestId: string) =>
  json({ error: message, code, request_id: requestId }, { status });

type StripeExecutePayload = {
  tool_name?: string;
  arguments?: Record<string, unknown>;
  correlation_id?: string;
};

/**
 * Backend-to-backend endpoint for external services (e.g. Meiga) to execute authorized
 * READ-ONLY Stripe MCP tools for a tenant.
 * Authentication: HMAC-SHA256 headers (X-Hexa-Key-Id, X-Hexa-Timestamp, X-Hexa-Signature).
 *
 * Security Note: External HMAC requests are strictly forbidden from executing write tools.
 * Any write operation attempt returns crm_approval_required and must be approved/executed inside CRM UI by an admin.
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const body = await request.text();

  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", "Service key no autorizada o no encontrada", 401, requestId);

  const verification = verifyServiceRequest(
    {
      keyId,
      signature: request.headers.get("X-Hexa-Signature") ?? "",
      timestamp: request.headers.get("X-Hexa-Timestamp") ?? "",
      method: "POST",
      path: url.pathname,
      body,
    },
    key.secret,
  );
  if (!verification.ok) {
    return fail(verification.code, `Verificación HMAC fallida: ${verification.code}`, 401, requestId);
  }

  const idempotencyKey =
    request.headers.get("X-Hexa-Idempotency-Key") || request.headers.get("Idempotency-Key") || null;

  let input: StripeExecutePayload;
  try {
    input = JSON.parse(body);
  } catch {
    return fail("invalid_json", "El cuerpo de la petición debe ser un JSON válido", 400, requestId);
  }

  const toolName = input.tool_name?.trim();
  if (!toolName) {
    return fail("tool_name_required", "Se requiere el parámetro 'tool_name'", 400, requestId);
  }

  const toolArgs = input.arguments && typeof input.arguments === "object" ? input.arguments : {};
  const correlationId = input.correlation_id?.trim() || null;

  if (!CENTRAL_MODE) await initDb();

  const tenant = await sql<{ id: number; code: string }[]>`
    SELECT id, code FROM companies WHERE code = ${key.tenantCode} AND active = TRUE
  `;
  if (!tenant[0]) {
    return fail("unknown_tenant", "Tenant no encontrado o inactivo", 403, requestId);
  }
  const tenantId = tenant[0].id;

  const payloadHash = createHash("sha256").update(body).digest("hex");

  // Execute inside transaction so outbox integration_events and audit logs commit cleanly
  const outcome = await sql.begin(async (tx) => {
    return executeStripeIntegrationTool(tx, {
      tenantId,
      keyId,
      requestId,
      toolName,
      toolArgs,
      correlationId,
      idempotencyKey,
      payloadHash,
    });
  });

  if (!outcome.ok) {
    return fail(outcome.code, outcome.message, outcome.httpStatus, requestId);
  }

  return json({ ...outcome.responseData, request_id: requestId }, { status: 200 });
};
