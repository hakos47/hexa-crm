import { json, type RequestHandler } from "@sveltejs/kit";
import { CENTRAL_MODE, initDb, sql } from "$lib/api/postgres-db";
import { findServiceKey, serviceKeysFromEnv } from "$lib/api/service-config";
import { verifyServiceRequest } from "$lib/api/service-auth";
import { setTenantRls } from "$lib/api/tenant-rls";

const fail = (code: string, message: string, status: number, requestId: string) =>
  json({ error: message, code, request_id: requestId }, { status });

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

/**
 * SSE endpoint for external backend services (e.g. Meiga) to stream outbox integration events.
 * Authentication: HMAC-SHA256 headers (X-Hexa-Key-Id, X-Hexa-Timestamp, X-Hexa-Signature).
 * Not for browser EventSource; intended for server-to-server stream clients.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const requestId = crypto.randomUUID();
  const keyId = request.headers.get("X-Hexa-Key-Id") ?? "";
  const key = findServiceKey(serviceKeysFromEnv(process.env.HEXA_SERVICE_KEYS), keyId);
  if (!key) return fail("unknown_key", "Service key no autorizada o no encontrada", 401, requestId);

  const verification = verifyServiceRequest(
    {
      keyId,
      signature: request.headers.get("X-Hexa-Signature") ?? "",
      timestamp: request.headers.get("X-Hexa-Timestamp") ?? "",
      method: "GET",
      path: url.pathname,
      body: "",
    },
    key.secret,
  );
  if (!verification.ok) {
    return fail(verification.code, `Verificación HMAC fallida: ${verification.code}`, 401, requestId);
  }

  if (!CENTRAL_MODE) await initDb();

  const tenant = await sql<{ id: number; code: string }[]>`
    SELECT id, code FROM companies WHERE code = ${key.tenantCode} AND active = TRUE
  `;
  if (!tenant[0]) {
    return fail("unknown_tenant", "Tenant no encontrado o inactivo", 403, requestId);
  }
  const tenantId = tenant[0].id;

  const correlationFilter = url.searchParams.get("correlation_id")?.trim() || null;
  const rawLastId = request.headers.get("Last-Event-ID") || url.searchParams.get("last_event_id");
  let lastEventId = rawLastId ? parseInt(rawLastId, 10) : 0;
  if (!Number.isFinite(lastEventId) || lastEventId < 0) lastEventId = 0;

  const encoder = new TextEncoder();

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventType: string, id: number | string | null, dataObj: unknown) => {
        if (isClosed) return;
        try {
          const payload = typeof dataObj === "string" ? dataObj : JSON.stringify(dataObj);
          let bodyStr = "";
          if (eventType) bodyStr += `event: ${eventType}\n`;
          if (id != null) bodyStr += `id: ${id}\n`;
          bodyStr += `data: ${payload}\n\n`;
          controller.enqueue(encoder.encode(bodyStr));
        } catch {
          // controller closed
        }
      };

      const sendComment = (comment: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`));
        } catch {
          // controller closed
        }
      };

      // 1. Initial ready event
      sendEvent("ready", null, {
        status: "ready",
        tenant: key.tenantCode,
        timestamp: new Date().toISOString(),
      });

      let keepaliveCounter = 0;

      const pollEvents = async () => {
        if (isClosed || request.signal.aborted) return;
        try {
          const rows = await sql.begin(async (tx) => {
            await setTenantRls(tx, tenantId);
            return tx<{
              id: number;
              correlation_id: string | null;
              request_id: string;
              event_type: string;
              status: string;
              tool_name: string | null;
              created_at: Date;
            }[]>`
              SELECT id, correlation_id, request_id, event_type, status, tool_name, created_at
              FROM integration_events
              WHERE company_id = ${tenantId} AND id > ${lastEventId}
              ${correlationFilter ? tx`AND correlation_id = ${correlationFilter}` : tx``}
              ORDER BY id ASC
              LIMIT 50
            `;
          });

          for (const row of rows) {
            if (row.id > lastEventId) {
              lastEventId = row.id;
            }
            // Metadata segura únicamente (sin argumentos ni resultados raw de Stripe)
            const safeMetadata = {
              type: row.event_type,
              status: row.status,
              tool_name: row.tool_name,
              correlation_id: row.correlation_id,
              request_id: row.request_id,
              created_at: toIso(row.created_at),
            };
            sendEvent("integration_event", row.id, safeMetadata);
          }
        } catch {
          // Ignore DB error transiently during poll
        }

        keepaliveCounter += 1;
        if (keepaliveCounter % 15 === 0) {
          sendComment("keepalive");
        }
      };

      // Run initial poll
      await pollEvents();

      // Poll interval
      intervalId = setInterval(pollEvents, 1000);

      const cleanup = () => {
        isClosed = true;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      isClosed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
