# Proceso de releases — hexa-crm

A partir de **0.2.0**, **todo cambio que vaya a producción debe quedar documentado**
en el changelog y, al publicar, en las notas de la GitHub Release.

## Fuentes de verdad

| Artefacto | Rol |
|-----------|-----|
| `CHANGELOG.md` | Historial humano de cambios (Keep a Changelog) |
| `package.json` → `version` | Versión de app (también Tauri / update check) |
| `src-tauri/tauri.conf.json` → `version` | Debe coincidir con package.json |
| `src-tauri/Cargo.toml` → `version` | Debe coincidir |
| Tag git `vMAJOR.MINOR.PATCH` | Inmutable; fuente del canal **stable** |
| GitHub Release | Distribución + notas + assets |

## Versionado

SemVer:

- **MAJOR** — roturas de API/datos incompatibles o rebranding mayor.
- **MINOR** — features compatibles (p. ej. 0.1 → 0.2 con multi-empresa, arqueo…).
- **PATCH** — fixes y docs sin feature nueva.

Prefijos de pre-release: `v0.2.0-beta.1`, `v0.2.0-rc.1`.

## Checklist obligatorio antes de publicar

1. **CHANGELOG**
   - Mover lo de `[Unreleased]` a una sección `## [X.Y.Z] — YYYY-MM-DD`.
   - Categorías: `Added` / `Changed` / `Fixed` / `Deprecated` / `Removed` / `Security`.
   - Mencionar migraciones (DB, localStorage, env vars).
2. **Versión alineada** en `package.json`, lockfile raíz, `tauri.conf.json`, `Cargo.toml` (y MCP si aplica).
3. **Tests verdes:** `npm test` (y `npm run check` si se tocó UI/types).
4. **Build:** `npm run build` (adapter-node → `build/`).
5. **Git**
   - Commits en `feat/*` o directamente integrados en `dev` según flujo del equipo.
   - Tag anotado: `git tag -a vX.Y.Z -m "hexa-crm X.Y.Z"`.
   - Push de rama + tag (`git push origin dev --tags` o tag suelto).
6. **GitHub Release**
   - Crear release desde el tag (no draft si el checker de updates debe verla).
   - Pegar el cuerpo desde CHANGELOG (sección de esa versión).
   - Adjuntar assets (tarball servidor y/o instaladores) + checksums si hay binarios.
7. **Despliegue Incus** (si aplica entorno `voura`)
   - Ver sección siguiente; anotar host/commit en las notas internas del ciclo o en el cuerpo de la release.

## Qué documentar (y qué no)

**Sí documentar**

- Features visibles (UI, API RPC nuevas, MCP tools).
- Cambios de comportamiento de negocio (IVA, stock, caja, auth).
- Migraciones de schema / storage / env.
- Breaking changes y pasos de upgrade.
- Fixes de seguridad o de integridad de datos.

**No hace falta en CHANGELOG**

- Refactors internos sin cambio de comportamiento.
- Ruido de formato/deps menores (salvo CVEs).
- Experimentos solo en `.grok/continuous-improvement/` sin llegar a código de producto.

Cada **ciclo de mejora continua** que entre en `dev` debe dejar al menos una línea en `[Unreleased]` el mismo día.

## Despliegue Incus (hexa-crm)

Remoto habitual: **`voura`** (túnel SSH → `127.0.0.1:8443`).

| Contenedor | Rol |
|------------|-----|
| `nix-c-web` | App Node (SvelteKit adapter-node) en `/root/nix-c`, OpenRC `nix-c`, puerto 3000 + cloudflared |
| `nix-c-srv` | PostgreSQL (`nix_crm`) |

Script de ayuda (desde la raíz del repo, con túnel activo):

```bash
# 1) build local
npm ci && npm test && npm run build

# 2) empaquetar artefacto de deploy
tar -czf /tmp/hexa-crm-server.tgz \
  --exclude=node_modules --exclude=.git \
  -C . build package.json package-lock.json

# 3) copiar y reiniciar servicio en el contenedor web
incus file push /tmp/hexa-crm-server.tgz voura:nix-c-web/tmp/hexa-crm-server.tgz
incus exec voura:nix-c-web -- sh -lc '
  set -e
  cd /root/nix-c
  tar -xzf /tmp/hexa-crm-server.tgz
  npm ci --omit=dev
  rc-service nix-c restart
  rc-service nix-c status
'
```

Variables de producción en el OpenRC del contenedor (`/etc/init.d/nix-c`):

- `PORT=3000`, `HOST=0.0.0.0`
- `DATABASE_URL=postgresql://…@nix-c-srv:5432/nix_crm`

Tras desplegar, verificar:

- `incus exec voura:nix-c-web -- wget -qO- http://127.0.0.1:3000/ | head`
- En la app: Ajustes → Actualizaciones → versión **X.Y.Z**

## Canales

| Canal | Cómo |
|-------|------|
| **stable** | Tag `vX.Y.Z` + Release no-prerelease |
| **beta / rc** | Tag con sufijo + Release prerelease |
| **nightly** | CI sobre `main` (cuando exista workflow); no sustituye CHANGELOG de features |

## Responsabilidades

- **Director de dev:** puede integrar en `dev`, documentar Unreleased y proponer release.
- **Humano / release owner:** decide merge `dev` → `main`, publica tag/Release y autoriza despliegue prod.

No force-push a `main`. No release sin CHANGELOG.
