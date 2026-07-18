# Nix-C (hexa-crm)

[![CI](https://github.com/HEXA-NIX/hexa-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/HEXA-NIX/hexa-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**CRM / TPV local-first open source** para microcomercios: inventario, ventas, caja, clientes, control de IVA (España) e asistente IA opcional con [Ollama](https://ollama.com).

Diseñado para **bajo consumo** (SQLite / Postgres local, modelos Ollama pequeños) y UI dark glass (Svelte 5).

| | |
|--|--|
| **Repo** | [github.com/HEXA-NIX/hexa-crm](https://github.com/HEXA-NIX/hexa-crm) |
| **Licencia** | [MIT](./LICENSE) |
| **Contribuir** | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| **Seguridad** | [SECURITY.md](./SECURITY.md) |
| **Conducta** | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |
| **Agentes / ramas** | [AGENTS.md](./AGENTS.md) |

## Por qué existe

Posicionamiento de mercado (`docs/MARKET.md`): TPV **offline-first** y predecible frente a ERP cloud pesados y TPV SaaS con dependencia de red. Enfocado en tiendas pequeñas (1–10 personas), no en hostelería compleja ni ecommerce multicanal.

## Aviso fiscal (importante)

El control de IVA y los tickets son **herramientas de gestión interna**.  
**No** es software de facturación homologado AEAT / Veri*Factu / SIF.  
Ver [NOTICE](./NOTICE) y [docs/ADR-001-verifactu-plan.md](./docs/ADR-001-verifactu-plan.md).

## Stack

| Capa | Tech |
|------|------|
| UI | Svelte 5 + SvelteKit + Tailwind CSS 4 |
| Desktop | Tauri 2 + SQLite (`rusqlite`) |
| Web / API | SvelteKit + PostgreSQL opcional (`/api/rpc`) |
| IA | Ollama local (p. ej. `qwen3.5:4b`) |

## Arranque rápido (contribuidores y curiosos)

```bash
git clone https://github.com/HEXA-NIX/hexa-crm.git
cd hexa-crm
npm install

# Navegador (demo en localStorage o Postgres si DATABASE_URL)
npm run dev
# → http://localhost:1420

# Escritorio nativo
npm run tauri:dev
```

**Requisitos:** Node.js 20+, Rust (solo Tauri), Ollama opcional.

```bash
ollama pull qwen3.5:4b   # opcional
```

### Demo

| Usuario | PIN | Rol |
|---------|-----|-----|
| `admin` | `1234` | Administrador |
| `cajero` | `0000` | Cajero |

Los usuarios nuevos reciben contraseña temporal (14 caracteres, 24 h) y deben cambiarla al entrar.

### Postgres (web API)

```bash
# Ejemplo: contenedor local con pgvector
export DATABASE_URL=postgresql://hakos:nix_password@127.0.0.1:5432/nix_crm
cp .env.example .env   # si aplica
npm run dev
```

Ver `.env.example` y `docs/BACKUP.md`.

## Módulos

- **Dashboard** — ventas, caja, IVA, stock bajo  
- **Inventario** — productos, categorías, **import/export CSV**, stock  
- **Ventas (TPV)** — carrito, descuentos por línea, anulación de ticket, CSV  
- **Caja** — movimientos y cierre de día  
- **Clientes** — CRM ligero  
- **Impuestos** — resumen IVA por periodo + CSV (control interno)  
- **Ajustes** — tienda, Ollama, usuarios, **export copia de seguridad**  
- **Asistente IA** — contexto local vía Ollama (`think:false` en modelos reasoning)

## Scripts

```bash
npm run dev          # desarrollo
npm run build        # build producción
npm run test         # Vitest
npm run check        # svelte-check / TS
npm run tauri:dev    # app nativa
npm run tauri:build  # empaquetado
```

## Documentación

| Doc | Contenido |
|-----|-----------|
| [docs/MARKET.md](./docs/MARKET.md) | Posicionamiento y mercado |
| [docs/MULTI_COMPANY_ANALYSIS.md](./docs/MULTI_COMPANY_ANALYSIS.md) | Multi-empresa (análisis; no implementado) |
| [docs/BACKUP.md](./docs/BACKUP.md) | Copias y restauración |
| [docs/BRANCH_PROTECTION.md](./docs/BRANCH_PROTECTION.md) | CI y protección de `main` |
| [ROADMAP.md](./ROADMAP.md) | Fases de producto |

## Principios

1. Local-first (sin cloud obligatorio)  
2. Dinero e IVA en **céntimos enteros**  
3. IA solo bajo demanda, contexto acotado  
4. Sin pretensiones fiscales no demostradas  
5. Contribuciones bajo MIT  

## MCP (agentes)

Servidor de herramientas para Grok/Cursor: cada acción en un archivo.

```bash
npm run mcp:install && npm run mcp:build
# CRM en :1420, luego:
NIX_C_URL=http://127.0.0.1:1420 npm run mcp:dev
```

Ver [tools/mcp/README.md](./tools/mcp/README.md).

## Comunidad

- Issues y PRs en GitHub  
- Preferir PRs hacia **`dev`**; `main` es release/humano  
- Reportes de seguridad: ver [SECURITY.md](./SECURITY.md)

## Licencia

[MIT](./LICENSE) © 2026 HEXA-NIX contributors.  
Aviso de terceros y disclaimer fiscal: [NOTICE](./NOTICE).
