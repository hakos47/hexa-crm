# Changelog

Todos los cambios relevantes del producto **hexa-crm** se documentan aquí.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

> **Regla de equipo (desde 0.2.0):** ninguna release se publica sin entrada en este archivo.
> Ver proceso en [`docs/RELEASES.md`](./docs/RELEASES.md).

## [Unreleased]

### Added
- Shell: accesos rápidos con deep-link `?nuevo=1` (producto, cliente, caja, TPV) (#12).
- **Onboarding guiado** 1ª sesión: tienda → producto → CTA primera venta; se puede saltar (#11).
- **Cobertura de stock** (~días a ritmo de 14 d) en inventario y alertas del dashboard (#22).
- Tauri/SQLite: `return_sale_lines` con migración de devoluciones parciales, stock y caja netos (#24).
- Documentado el contrato de paridad RPC/Tauri para ventas y devoluciones (#24).
- Carga diferida de `AiDrawer` y `marked`: el shell no descarga IA antes de abrirla (#20).

### Changed
- **Cerrar sesión** explícito en header y sidebar (sustituye «Bloquear»); toast al salir (#9).
- Navegación en **español de comercio** (#12).
- Naming comercial **Hexa** + tagline «Asistente de tienda · IA local opcional» en login/shell (#23). Package npm sigue `hexa-crm`.
- CI queda orientado a `main`; la protección documentada exige squash, revisión y el check `quality` (#1).

### Pendiente / backlog
- Dashboard de mando completo (#13) y copiloto IA con tools (#14)
- CRM valor cliente (#17), TPV favoritos (#15), reposición sugerida (#16)
- Settings por empresa (M1b)
- Design system light (#18); idle timeout (#21)


---

## [0.2.0] — 2026-07-19

Primera release semántica completa del producto bajo el nombre canónico **hexa-crm**
(antes “Nix-C”). Incluye multi-empresa P0, devoluciones parciales, arqueo de caja,
reorganización de Ajustes y actualizaciones vía GitHub Releases.

### Added
- **Multi-empresa (Company Tenant P0):** empresas SHOP/DEV, membresías, switcher de empresa activa, filtrado de ventas/productos y helper de billing por empresa.
- **Devolución parcial de líneas** en historial de ventas (`return_sale_lines`): stock, caja e IVA netos; anular resto unificado.
- **Arqueo de caja:** contado físico vs saldo del sistema, descuadre (sobrante/faltante) y registro de movimiento categoría `arqueo`.
- **Actualizaciones desde GitHub** en Ajustes (buscar / abrir descarga de Releases).
- **Ajustes por categorías** (nav Cuenta → Tienda → Equipo → IA → Actualizaciones → Sistema) con zona de peligro separada.
- Servidor **MCP** `@hexa-nix/hexa-crm-mcp` con env `HEXA_CRM_*` (y legado `NIX_C_*`).
- Catálogo de producto `PRODUCT_NAME` / branding **hexa-crm**.
- Docs: `docs/UPDATE_FROM_GITHUB.md`, análisis multi-empresa, memoria de mejora continua (ciclos 7–9).

### Changed
- Nombre de producto y package npm: **hexa-crm** (UI, Tauri `productName`, MCP, backups `hexa-crm-backup`).
- Cierre de caja del día: incluye `partially_returned`, ventas netas en display y neto de caja sin doble restar reembolsos.
- `cancel_sale` devuelve unidades restantes (compatible con devoluciones parciales previas).
- Storage keys `hexa-crm-*` con lectura de legado `nix-c-*`.

### Fixed
- Integridad de totales/IVA/dashboard tras devoluciones parciales (browser-store y Postgres).
- Carga cognitiva de Ajustes (ya no es un monobloque de todos los paneles).

### Security / ops
- Identifier Tauri se mantiene `com.hexa.nixc` (no romper installs desktop).
- DB Postgres `nix_crm` y contenedor Docker `nix-c-postgres` se mantienen como alias operativos.
- Contenedores Incus `nix-c-web` / `nix-c-srv` (remoto `voura`) actualizados a este build.

### Migration notes
- Claves localStorage antiguas `nix-c-store-*` se migran al vuelo.
- Formato backup `nix-c-backup` sigue siendo restorable.
- Variables MCP: preferir `HEXA_CRM_URL` / `HEXA_CRM_AGENT_TOKEN`.

---

## [0.1.0] — 2026-07-19

Primera release pública (tag `v0.1.0`).

### Added
- CRM/TPV local-first: inventario, ventas, caja, clientes, IVA ES, IA Ollama.
- Auth con sesión/token y contraseñas temporales.
- Artefacto servidor `Nix-C-0.1.0-server.tgz` + `SHA256SUMS.txt` en GitHub Releases.
- Licencia MIT, docs de comunidad y aviso fiscal (no Veri*Factu homologado).

---

[Unreleased]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HEXA-NIX/hexa-crm/releases/tag/v0.1.0
