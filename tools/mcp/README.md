# hexa-crm-mcp — herramientas de agente

Servidor **MCP** del CRM **hexa-crm**. Cada acción vive en **un archivo** bajo `src/actions/` para poder arreglarla sin tocar el resto.

```
tools/mcp/
  src/
    index.ts           # servidor stdio
    config.ts          # HEXA_CRM_URL, token (+ legado NIX_C_*)
    rpc-client.ts
    session.ts
    actions/           # un archivo = una tool
  package.json
```

## Requisitos

1. hexa-crm en marcha (`npm run dev` en la raíz → `:1420` y `/api/rpc`).
2. Node ≥ 20.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `HEXA_CRM_URL` | `http://127.0.0.1:1420` | Base del CRM |
| `HEXA_CRM_RPC_PATH` | `/api/rpc` | Endpoint RPC |
| `HEXA_CRM_AGENT_TOKEN` | — | Bearer de sesión (si no usas `login_agent`) |
| `HEXA_CRM_RPC_TIMEOUT_MS` | `60000` | Timeout |

Alias legados (siguen funcionando): `NIX_C_URL`, `NIX_C_RPC_PATH`, `NIX_C_AGENT_TOKEN`, `NIX_C_RPC_TIMEOUT_MS`.

## Uso rápido

```bash
cd tools/mcp && npm install && npm run dev
# o con token pre-cargado:
export HEXA_CRM_AGENT_TOKEN="<token de sesión del CRM>"
npm run dev
```

Resource: `hexa-crm://actions` — catálogo JSON de tools.

## Config en cliente MCP

```toml
[mcp_servers.hexa-crm]
command = "npx"
args = ["tsx", "/workspace/hexa/nix-c/tools/mcp/src/index.ts"]
env = { HEXA_CRM_URL = "http://127.0.0.1:1420" }

# build:
# args = ["/workspace/hexa/nix-c/tools/mcp/dist/index.js"]
# env = { HEXA_CRM_URL = "http://127.0.0.1:1420", HEXA_CRM_AGENT_TOKEN = "..." }
```

## Dev de la app + MCP

```bash
cd /workspace/hexa/nix-c && npm run dev
# otra terminal:
HEXA_CRM_URL=http://127.0.0.1:1420 npm run mcp:dev
```
