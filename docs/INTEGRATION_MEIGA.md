# Integración Backend-a-Backend (CRM Central ↔ Web Externa / Meiga)

Este documento especifica el contrato de comunicación **estrictamente Backend-a-Backend** entre la web externa (ej. Meiga backend) y el CRM Central (`hexa-crm`).

> [!CAUTION]
> **Prohibición de llamada directa cliente/navegador**: El navegador del usuario o cliente web **NUNCA** debe invocar directamente las API del CRM Central ni poseer claves de API de Stripe o firmas HMAC. Todas las llamadas se realizan exclusivamente desde el backend de la aplicación web externa hacia el CRM.

---

## 1. Autenticación HTTP mediante HMAC por Tenant

Todas las peticiones backend-a-backend enviadas al CRM deben firmarse con HMAC-SHA256 utilizando la clave de servicio (`service key`) asignada a la tienda (`company_id`).

### Cabeceras HTTP Obligatorias

| Cabecera | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `X-Hexa-Key-Id` | Identificador único de la clave de servicio | `meiga-backend-key-1` |
| `X-Hexa-Timestamp` | Fecha y hora de la petición en formato ISO 8601 UTC | `2026-07-23T23:00:00.000Z` |
| `X-Hexa-Signature` | Firma HMAC-SHA256 calculada en hexadecimal | `a1b2c3d4...` |
| `X-Hexa-Idempotency-Key` *(opcional)* | Clave de idempotencia para mutaciones | `idemp_order_12345` |

### Algoritmo de Firma

La firma HMAC se genera concatenando los elementos de la petición con saltos de línea `\n`:

```text
STRING_TO_SIGN = timestamp + "\n" + METHOD_UPPERCASE + "\n" + PATH + "\n" + SHA256_HEX(body)
SIGNATURE = HMAC_SHA256(secret, STRING_TO_SIGN).hex()
```

### Ejemplo de Firma en Pseudocódigo (Node.js)

```javascript
import crypto from "node:crypto";

function buildHmacHeaders({ keyId, secret, method, path, body = "" }) {
  const timestamp = new Date().toISOString();
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const stringToSign = `${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
  const signature = crypto.createHmac("sha256", secret).update(stringToSign).digest("hex");

  return {
    "Content-Type": "application/json",
    "X-Hexa-Key-Id": keyId,
    "X-Hexa-Timestamp": timestamp,
    "X-Hexa-Signature": signature,
  };
}
```

---

## 2. Ejecución de Herramientas de Lectura Stripe MCP (`POST /api/v1/integrations/stripe/execute`)

Permite al backend externo solicitar la ejecución de herramientas de **lectura** del plugin Stripe MCP configuradas en el CRM (ej. `retrieve_balance`).

### Payload de Solicitud (`POST`)

```json
{
  "tool_name": "retrieve_balance",
  "arguments": {},
  "correlation_id": "ext_order_7782"
}
```

### Reglas de Seguridad y Bloqueo de Escrituras (`crm_approval_required`)

1. **Herramientas de Lectura**: Solo las herramientas de consulta/lectura pueden ejecutarse por API externa HMAC.
2. **Prohibición de Escritura por HMAC**: Un flag `confirmed: true` enviado desde el backend externo **NO** constituye aprobación humana. Si el backend externo solicita una herramienta de escritura o modificación (ej. `create_payment_link`, `create_refund`, `create_customer`):
   - El endpoint responde inmediatamente con error `400 Bad Request` y código `crm_approval_required`.
   - Persiste en la tabla outbox `integration_events` un evento seguro con estado `blocked` para trazabilidad.
   - **Exigencia de Aprobación Humana**: Toda operación de escritura DEBE realizarse o aprobarse directamente desde la interfaz del CRM por un operador autenticado con rol `admin`.

### Ejemplo de Respuesta Rechazada por Escritura (`400 Bad Request`)

```json
{
  "error": "Las operaciones de escritura ('create_payment_link') no pueden ser ejecutadas automáticamente por API externa HMAC. Requieren aprobación humana por un administrador en el CRM.",
  "code": "crm_approval_required",
  "request_id": "8f3b2a19-..."
}
```

### Ejemplo de Respuesta Exitosa para Lectura (`200 OK`)

```json
{
  "ok": true,
  "plugin_key": "stripe_mcp",
  "tool_name": "retrieve_balance",
  "correlation_id": "ext_order_7782",
  "request_id": "8f3b2a19-...",
  "result": {
    "available": [{ "amount": 150000, "currency": "eur" }]
  }
}
```

---

## 3. Transmisión de Eventos SSE (`GET /api/v1/integrations/events`)

El backend externo puede conectarse a un canal de eventos en tiempo real mediante **Server-Sent Events (SSE)** autenticado con HMAC.

### Conexión del Backend Servidor

```bash
GET /api/v1/integrations/events?correlation_id=ext_order_7782 HTTP/1.1
Host: crm.tienda.es
X-Hexa-Key-Id: meiga-backend-key-1
X-Hexa-Timestamp: 2026-07-23T23:00:00.000Z
X-Hexa-Signature: e3b0c442...
```

### Formato de Stream y Eventos

1. **Evento de Conexión Lista (`ready`)**:
   ```http
   event: ready
   data: {"status":"ready","tenant":"SHOP","timestamp":"2026-07-23T23:00:00.000Z"}
   ```

2. **Evento de Resultado / Outbox (`integration_event`)**:
   ```http
   event: integration_event
   id: 104
   data: {"type":"stripe_execution","status":"blocked","tool_name":"create_payment_link","correlation_id":"ext_order_7782","request_id":"8f3b2a19-...","created_at":"2026-07-23T23:00:01.000Z"}
   ```

3. **Comentario Keepalive**:
   ```http
   : keepalive
   ```

### Seguridad y Retención del Outbox

- **Persistencia Outbox**: Los eventos se persisten en la tabla PostgreSQL `integration_events` bajo políticas RLS por `company_id`.
- **Retención Acotada de 7 Días**: De forma automática e idempotente al insertar nuevos eventos, se eliminan los registros outbox antiguos con antigüedad superior a 7 días (`created_at < NOW() - INTERVAL '7 days'`).
- **Metadata Segura Únicamente**: Los eventos SSE transmiten **únicamente metadatos de estado** (`type`, `status`, `tool_name`, `correlation_id`, `request_id`, `created_at`). Queda estrictamente prohibido emitir tokens, secretos o payloads sensibles en el stream SSE.
