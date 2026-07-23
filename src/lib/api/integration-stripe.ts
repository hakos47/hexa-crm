import type postgres from "postgres";
import { setTenantRls } from "./tenant-rls";
import { redactSensitive, sanitizePluginConfig, stripeToolAccess } from "../plugins/catalog";
import { decryptSecret } from "../plugins/secret-vault";
import { callStripeTool } from "../plugins/runtime.server";

export type ExecutionOutcome =
  | {
      ok: true;
      responseData: {
        ok: true;
        plugin_key: "stripe_mcp";
        tool_name: string;
        correlation_id: string | null;
        result: unknown;
      };
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
    };

export type StripeExecutionParams = {
  tenantId: number;
  keyId: string;
  requestId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  correlationId: string | null;
  idempotencyKey: string | null;
  payloadHash: string;
};

/**
 * Handles Stripe integration execution inside a PostgreSQL transaction.
 * Ensures all outcomes (ok, blocked, error) commit outbox integration_events and audit logs
 * before returning outcome status to caller.
 */
export async function executeStripeIntegrationTool(
  tx: postgres.TransactionSql,
  params: StripeExecutionParams,
): Promise<ExecutionOutcome> {
  const { tenantId, keyId, requestId, toolName, toolArgs, correlationId, idempotencyKey, payloadHash } = params;

  await setTenantRls(tx, tenantId);

  // 1. Limpieza de retención acotada (elimina eventos outbox mayores a 7 días)
  await tx`
    DELETE FROM integration_events
    WHERE company_id = ${tenantId} AND created_at < NOW() - INTERVAL '7 days'
  `;

  // 2. Verificación de Idempotencia
  if (idempotencyKey) {
    const prior = await tx`
      SELECT payload_hash, response FROM idempotency_keys
      WHERE company_id = ${tenantId} AND operation = 'stripe_execute' AND key = ${idempotencyKey}
    `;
    if (prior[0]) {
      if (prior[0].payload_hash !== payloadHash) {
        return {
          ok: false,
          code: "idempotency_conflict",
          message: "Un payload diferente ya utilizó la misma Idempotency-Key",
          httpStatus: 409,
        };
      }
      return {
        ok: true,
        responseData: prior[0].response,
      };
    }
  }

  // 3. Obtener estado del plugin Stripe MCP
  const pluginRows = await tx`
    SELECT enabled, config, encrypted_secret, last_error
    FROM tenant_plugins
    WHERE company_id = ${tenantId} AND plugin_key = 'stripe_mcp'
  `;
  const pluginRow = pluginRows[0];

  if (!pluginRow || !pluginRow.enabled) {
    const msg = "El plugin Stripe MCP no está activo para esta tienda";
    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'blocked', ${toolName}, ${msg})
    `;
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_blocked_permission', ${toolName}, 'blocked', ${msg})
    `;
    return { ok: false, code: "plugin_disabled", message: msg, httpStatus: 400 };
  }

  if (!pluginRow.encrypted_secret) {
    const msg = "La credencial de Stripe no ha sido ingresada en el CRM";
    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'blocked', ${toolName}, ${msg})
    `;
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_blocked_permission', ${toolName}, 'blocked', ${msg})
    `;
    return { ok: false, code: "plugin_needs_secret", message: msg, httpStatus: 400 };
  }

  const config = sanitizePluginConfig("stripe_mcp", pluginRow.config);
  const access = stripeToolAccess(toolName, config);

  if (!access.allowed) {
    const msg = `La herramienta '${toolName}' no está autorizada para esta tienda`;
    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'blocked', ${toolName}, ${msg})
    `;
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_blocked_permission', ${toolName}, 'blocked', ${msg})
    `;
    return { ok: false, code: "tool_forbidden", message: msg, httpStatus: 403 };
  }

  // 4. Bloqueo estricto de herramientas de escritura por HMAC
  if (access.write || access.approval) {
    const msg = `Las operaciones de escritura ('${toolName}') no pueden ser ejecutadas automáticamente por API externa HMAC. Requieren aprobación humana por un administrador en el CRM.`;
    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'blocked', ${toolName}, ${`Operación de escritura '${toolName}' requiere aprobación humana en el CRM`})
    `;
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_blocked_approval', ${toolName}, 'blocked', ${`Bloqueada escritura externa ${toolName}`})
    `;
    return { ok: false, code: "crm_approval_required", message: msg, httpStatus: 400 };
  }

  // 5. Invocación de la herramienta de lectura
  try {
    const secretToken = decryptSecret(pluginRow.encrypted_secret);
    const executionResult = await callStripeTool(config, toolName, toolArgs, secretToken);

    const responseObj = {
      ok: true as const,
      plugin_key: "stripe_mcp" as const,
      tool_name: toolName,
      correlation_id: correlationId,
      result: executionResult.result,
    };

    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'ok', ${toolName}, ${`Herramienta '${toolName}' ejecutada con éxito`})
    `;

    const cleanSummary = redactSensitive(`Ejecución externa de lectura ${toolName}`).slice(0, 255);
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_read', ${toolName}, 'ok', ${cleanSummary})
    `;

    if (idempotencyKey) {
      await tx`
        INSERT INTO idempotency_keys (company_id, operation, key, payload_hash, response)
        VALUES (${tenantId}, 'stripe_execute', ${idempotencyKey}, ${payloadHash}, ${JSON.stringify(responseObj)}::jsonb)
      `;
    }

    return { ok: true, responseData: responseObj };
  } catch (err) {
    const cleanErr = redactSensitive(err instanceof Error ? err.message : String(err));
    await tx`
      INSERT INTO integration_events (company_id, correlation_id, request_id, event_type, status, tool_name, summary)
      VALUES (${tenantId}, ${correlationId}, ${requestId}, 'stripe_execution', 'error', ${toolName}, ${cleanErr.slice(0, 255)})
    `;
    await tx`
      INSERT INTO service_audit_log (company_id, key_id, action, request_id, correlation_id)
      VALUES (${tenantId}, ${keyId}, ${`stripe.${toolName}`}, ${requestId}, ${correlationId})
    `;
    await tx`
      INSERT INTO plugin_audit_log (company_id, user_id, plugin_key, action, tool_name, result, summary)
      VALUES (${tenantId}, NULL, 'stripe_mcp', 'tool_error', ${toolName}, 'error', ${cleanErr.slice(0, 255)})
    `;
    return { ok: false, code: "stripe_execution_error", message: cleanErr, httpStatus: 500 };
  }
}
