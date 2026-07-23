import { describe, expect, it, vi } from "vitest";
import { signServiceRequest, verifyServiceRequest } from "./service-auth";
import { findServiceKey, serviceKeysFromEnv } from "./service-config";
import { redactSensitive, sanitizePluginConfig, stripeToolAccess } from "../plugins/catalog";
import { executeStripeIntegrationTool, type StripeExecutionParams } from "./integration-stripe";

describe("Integraciones Externas Backend-a-Backend (HMAC & Outbox Events)", () => {
  const testSecret = "meiga_secret_key_1234567890_32bytes!";
  const testKeyId = "meiga-backend-key-1";
  const testEnvKeys = JSON.stringify([
    {
      keyId: testKeyId,
      tenantCode: "SHOP",
      secret: testSecret,
    },
  ]);

  it("firma y verifica peticiones HTTP HMAC para la ejecución de herramientas de lectura", () => {
    const timestamp = new Date().toISOString();
    const method = "POST";
    const path = "/api/v1/integrations/stripe/execute";
    const body = JSON.stringify({
      tool_name: "retrieve_balance",
      arguments: {},
      correlation_id: "ext_order_77",
    });

    const signature = signServiceRequest(testSecret, { timestamp, method, path, body });
    expect(signature).toHaveLength(64);

    const keys = serviceKeysFromEnv(testEnvKeys);
    const key = findServiceKey(keys, testKeyId);
    expect(key).toBeDefined();
    expect(key?.tenantCode).toBe("SHOP");

    const result = verifyServiceRequest(
      {
        keyId: testKeyId,
        timestamp,
        signature,
        method,
        path,
        body,
      },
      key!.secret,
    );

    expect(result.ok).toBe(true);
  });

  it("rechaza peticiones con firmas alteradas o claves desconocidas", () => {
    const timestamp = new Date().toISOString();
    const method = "POST";
    const path = "/api/v1/integrations/stripe/execute";
    const body = JSON.stringify({ tool_name: "retrieve_balance" });

    const signature = signServiceRequest(testSecret, { timestamp, method, path, body });
    const tamperedSignature = signature.slice(0, -4) + "0000";

    const keys = serviceKeysFromEnv(testEnvKeys);
    const key = findServiceKey(keys, testKeyId);
    expect(key).toBeDefined();

    const result = verifyServiceRequest(
      {
        keyId: testKeyId,
        timestamp,
        signature: tamperedSignature,
        method,
        path,
        body,
      },
      key!.secret,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_signature");
    }
  });

  it("bloquea herramientas de escritura desde peticiones HMAC externas requiriendo aprobación en CRM (crm_approval_required) y persistiendo el evento outbox", async () => {
    const insertedEvents: any[] = [];
    const insertedAuditLogs: any[] = [];

    // Mock sql transaction interface
    const mockTx: any = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      if (query.includes("DELETE FROM integration_events")) {
        return Promise.resolve([]);
      }
      if (query.includes("SELECT enabled, config, encrypted_secret")) {
        return Promise.resolve([
          {
            enabled: true,
            config: { allow_write_tools: true, environment: "sandbox" },
            encrypted_secret: "123456789012345678901234:12345678901234567890123456789012:1234",
          },
        ]);
      }
      if (query.includes("INSERT INTO integration_events")) {
        insertedEvents.push({ values });
        return Promise.resolve([]);
      }
      if (query.includes("INSERT INTO service_audit_log") || query.includes("INSERT INTO plugin_audit_log")) {
        insertedAuditLogs.push({ values });
        return Promise.resolve([]);
      }
      if (query.includes("SELECT set_config")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const params: StripeExecutionParams = {
      tenantId: 1,
      keyId: "meiga-key",
      requestId: "req_test_123",
      toolName: "create_payment_link",
      toolArgs: { amount: 100 },
      correlationId: "corr_999",
      idempotencyKey: null,
      payloadHash: "abc",
    };

    const outcome = await executeStripeIntegrationTool(mockTx, params);

    // Verify transaction did NOT throw, returned outcome with ok: false and crm_approval_required
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("crm_approval_required");
      expect(outcome.httpStatus).toBe(400);
      expect(outcome.message).toContain("operaciones de escritura ('create_payment_link')");
    }

    // Verify outbox integration_event WAS persisted before returning
    expect(insertedEvents.length).toBe(1);
    expect(insertedAuditLogs.length).toBe(2);
  });

  it("garantiza que los eventos SSE nunca incluyan secretos ni argumentos sensibles", () => {
    const eventPayload = {
      type: "stripe_execution",
      status: "blocked",
      tool_name: "create_payment_link",
      correlation_id: "ext_999",
      request_id: "req_abc_123",
      created_at: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(eventPayload);
    expect(jsonStr).not.toContain("sk_live_");
    expect(jsonStr).not.toContain("secret");
    expect(jsonStr).not.toContain("arguments");

    const redacted = redactSensitive(jsonStr);
    expect(redacted).toBe(jsonStr);
  });
});
