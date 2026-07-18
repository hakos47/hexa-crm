# nix-c-mcp — herramientas de agente

Servidor **MCP** del CRM Nix-C. Cada acción vive en **un archivo** bajo `src/actions/` para poder arreglarla sin tocar el resto.

```
tools/mcp/
  src/
    index.ts           # entrada stdio
    config.ts          # NIX_C_URL, token
    rpc-client.ts      # POST /api/rpc
    session.ts         # token tras login_agent
    actions/
      _types.ts
      index.ts         # registro (añade aquí cada acción nueva)
      public-meta.ts
      login-agent.ts
      dashboard-stats.ts
      list-products.ts
      ...
```

## Requisitos

1. Nix-C en marcha (`npm run dev` en la raíz → `:1420` y `/api/rpc`).
2. Node 20+.

## Instalación

```bash
cd tools/mcp
npm install
npm run build
```

## Variables de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `NIX_C_URL` | `http://127.0.0.1:1420` | Base del CRM |
| `NIX_C_RPC_PATH` | `/api/rpc` | Endpoint RPC |
| `NIX_C_AGENT_TOKEN` | — | Bearer de sesión (si no usas `login_agent`) |
| `NIX_C_RPC_TIMEOUT_MS` | `60000` | Timeout |

## Auth del agente

1. **Token en env** (recomendado para automatización):

   ```bash
   export NIX_C_AGENT_TOKEN="<token de sesión del CRM>"
   ```

2. **Tool `login_agent`**: username + password; el token queda en memoria del proceso MCP.

## Acciones (tools)

| Archivo | Tool | Categoría |
|---------|------|-----------|
| `public-meta.ts` | `public_meta` | system |
| `login-agent.ts` | `login_agent` | auth |
| `session-me.ts` | `session_me` | auth |
| `dashboard-stats.ts` | `dashboard_stats` | reports |
| `list-products.ts` | `list_products` | catalog |
| `list-customers.ts` | `list_customers` | catalog |
| `list-sales.ts` | `list_sales` | sales |
| `get-sale.ts` | `get_sale` | sales |
| `create-sale.ts` | `create_sale` | sales |
| `cancel-sale.ts` | `cancel_sale` | sales |
| `list-cash-movements.ts` | `list_cash_movements` | cash |
| `get-cash-balance.ts` | `get_cash_balance` | cash |
| `vat-summary.ts` | `vat_summary` | reports |
| `ollama-health.ts` | `ollama_health` | ai |
| `export-backup.ts` | `export_backup` | system |

Resource: `nix-c://actions` — catálogo JSON de tools.

## Añadir una acción nueva

1. Copia un archivo de `src/actions/` (p.ej. `list-products.ts`).
2. Cambia `meta.name`, descripción, schema zod y el `cmd` de `callRpc`.
3. Importa y añade el módulo en `src/actions/index.ts`.
4. `npm run build` y reinicia el MCP.

## Grok Build (`~/.grok/config.toml`)

```toml
[mcp_servers.nix-c]
command = "npx"
args = ["tsx", "/workspace/hexa/nix-c/tools/mcp/src/index.ts"]
env = { NIX_C_URL = "http://127.0.0.1:1420" }
# o tras build:
# command = "node"
# args = ["/workspace/hexa/nix-c/tools/mcp/dist/index.js"]
```

Con token:

```toml
env = { NIX_C_URL = "http://127.0.0.1:1420", NIX_C_AGENT_TOKEN = "..." }
```

## Probar a mano

```bash
# terminal 1
cd /workspace/hexa/nix-c && npm run dev

# terminal 2
cd tools/mcp && npm run dev
# el proceso espera stdio MCP; no escribe JSON en la terminal interactiva
```

Smoke del RPC sin MCP:

```bash
curl -s -X POST http://127.0.0.1:1420/api/rpc \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"public_meta","args":{}}'
```

## Notas

- No inventa lógica de negocio: reenvía a `/api/rpc`.
- Arreglos de una tool = un solo archivo en `actions/`.
- HTTP/URL remoto (Cloudflare `McpAgent`) puede envolver este mismo registro de actions más adelante.
