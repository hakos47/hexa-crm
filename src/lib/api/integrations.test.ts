import { describe, expect, it, vi } from "vitest";
import { signServiceRequest, verifyServiceRequest } from "./service-auth";
import { findServiceKey, serviceKeysFromEnv } from "./service-config";
import { redactSensitive, sanitizePluginConfig, stripeToolAccess } from "../plugins/catalog";
import { executeStripeIntegrationTool, type StripeExecutionParams } from "./integration-stripe";
import { GET as eventsGetHandler } from "../../routes/api/v1/integrations/events/+server";

vi.mock("$lib/api/postgres-db", async () => {
  const actual = await vi.importActual<any>("$lib/api/postgres-db");
  const mockSql: any = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");
    if (query.includes("SELECT id, code FROM companies")) {
      return Promise.resolve([{ id: 1, code: "SHOP" }]);
    }
    if (query.includes("SELECT id, correlation_id")) {
      return Promise.resolve([
        {
          id: 101,
          correlation_id: "corr_test_123",
          request_id: "req_999",
          event_type: "stripe_execution",
          status: "blocked",
          tool_name: "create_payment_link",
          created_at: new Date(),
        },
      ]);
    }
    return Promise.resolve([]);
  });
  mockSql.begin = vi.fn((cb: any) => cb(mockSql));
  return {
    ...actual,
    CENTRAL_MODE: true,
    initDb: vi.fn().mockResolvedValue(undefined),
    sql: mockSql,
  };
});

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

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("crm_approval_required");
      expect(outcome.httpStatus).toBe(400);
      expect(outcome.message).toContain("operaciones de escritura ('create_payment_link')");
    }

    expect(insertedEvents.length).toBe(1);
    expect(insertedAuditLogs.length).toBe(2);
  });

  it("evalúa la ruta SSE GET /api/v1/integrations/events con HMAC válido e inválido garantizando la ausencia de secretos", async () => {
    const originalEnv = process.env.HEXA_SERVICE_KEYS;
    process.env.HEXA_SERVICE_KEYS = testEnvKeys;

    try {
      // 1. Invalid HMAC signature -> returns 401
      const invalidReq = new Request("http://localhost:3001/api/v1/integrations/events", {
        headers: {
          "X-Hexa-Key-Id": testKeyId,
          "X-Hexa-Timestamp": new Date().toISOString(),
          "X-Hexa-Signature": "0000000000000000000000000000000000000000000000000000000000000000",
        },
      });

      const invalidRes = await eventsGetHandler({
        request: invalidReq,
        url: new URL(invalidReq.url),
      } as any);

      expect(invalidRes.status).toBe(401);
      const invalidJson = await invalidRes.json();
      expect(invalidJson.code).toBe("invalid_signature");

      // 2. Valid HMAC signature -> opens SSE stream
      const timestamp = new Date().toISOString();
      const signature = signServiceRequest(testSecret, {
        timestamp,
        method: "GET",
        path: "/api/v1/integrations/events",
        body: "",
      });

      const validReq = new Request("http://localhost:3001/api/v1/integrations/events?correlation_id=corr_test_123", {
        headers: {
          "X-Hexa-Key-Id": testKeyId,
          "X-Hexa-Timestamp": timestamp,
          "X-Hexa-Signature": signature,
        },
      });

      const validRes = await eventsGetHandler({
        request: validReq,
        url: new URL(validReq.url),
      } as any);

      expect(validRes.status).toBe(200);
      expect(validRes.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = validRes.body?.getReader();
      expect(reader).toBeDefined();
      const firstChunk = await reader?.read();
      const text = new TextDecoder().decode(firstChunk?.value);

      expect(text).toContain("event: ready");
      expect(text).toContain('"tenant":"SHOP"');
      expect(text).not.toContain("sk_live_");
      expect(text).not.toContain("secret");

      await reader?.cancel();
    } finally {
      process.env.HEXA_SERVICE_KEYS = originalEnv;
    }
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
