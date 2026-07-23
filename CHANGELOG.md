# Changelog

Todos los cambios relevantes del producto **hexa-crm** se documentan aquí.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

> **Regla de equipo (desde 0.2.0):** ninguna release se publica sin entrada en este archivo.
> Ver proceso en [`docs/RELEASES.md`](./docs/RELEASES.md).

## [Unreleased]

### Added

- Módulo multiempresa Trabajo (fase 1): bandeja persistente y categorizada (`/trabajo`), migración browser store v6, esquema e índices PostgreSQL con RLS por tenant, captura de avisos desde el Dashboard y flag centralizado `supportsWorkManagement()`.

- Gestión de plugins por tenant en Ajustes, con activación y configuración independientes por empresa.
- Plugin de conexión PostgreSQL externa mediante referencias seguras a variables de entorno.
- Plugin Stripe MCP para el asistente, con lista cerrada de herramientas, auditoría y confirmación humana obligatoria para escrituras.
- Perfil Maestro con vista normal de empresas asignadas y despliegue explícito y autorizado de todos los tenants.
- Selector de proveedores guardados al crear o editar artículos, con alta rápida sin perder el formulario y conservación de proveedores históricos.
- Landing pública editorial y hero original para presentar el CRM antes del acceso.
- Shell: accesos rápidos con deep-link `?nuevo=1` (producto, cliente, caja, TPV) (#12).
- **Onboarding guiado** 1ª sesión: tienda → producto → CTA primera venta; se puede saltar (#11).
- **Cobertura de stock** (~días a ritmo de 14 d) en inventario y alertas del dashboard (#22).
- Tauri/SQLite: `return_sale_lines` con migración de devoluciones parciales, stock y caja netos (#24).
- Documentado el contrato de paridad RPC/Tauri para ventas y devoluciones (#24).
- Carga diferida de `AiDrawer` y `marked`: el shell no descarga IA antes de abrirla (#20).
- Bloqueo de sesión por inactividad configurable (15 min por defecto; 0 lo desactiva) y ajustes restringidos por rol (#21).
- Recordatorio de copia en dashboard, fecha persistente y validación de checksum antes de restaurar en modo local (#19).
- Modo claro persistente, tokens de contraste, movimiento reducido y guía del design system (#18).
- Vista local de reposición con cálculo por ventas, cantidades editables y CSV para proveedor (#16).
- TPV express con hasta ocho favoritos persistentes, chips táctiles y atajos F2/Esc (#15).
- Ficha de cliente con valor neto, frecuencia, última compra, segmento e inicio de venta preseleccionado (#17).
- Dashboard con deltas diarios, tendencia de siete días y alertas enlazadas (#13).
- Copiloto local con herramientas de ventas, stock y reposición basadas en datos reales (#14).
- Base de API central v1 con OpenAPI, health/readiness y receta PostgreSQL 18 + pgvector (#26).
- Índice semántico privado por tenant, sin clientes ni ventas, preparado para embeddings locales (#32).
- Catálogo central con estado de publicación y metadatos de producto para el tenant Meiga (#28).
- El despliegue central ya no inserta datos demo al migrar (#26).

### Changed
- Extraído e integrado el plugin `stripe_mcp` desde `vendor/hexa-crm-plugins` -> `plugins/stripe`, ambos pinneados por SHA de commit inmutable; `database_bridge` permanece in-tree (`src/lib/plugins/`). Se requiere `git submodule update --init --recursive` al sincronizar.
- Documentada la arquitectura de separación Host-plugins y la especificación del agregador `hexa-crm-plugins` compuesto por submódulos de Git pinneados a versiones estables.
- Cabecera autenticada adaptada al lenguaje editorial de la landing: contexto de área, selector de empresa custom, identidad de sesión y acciones responsive.
- Rediseño editorial completo del área autenticada: Pulso, Inventario, TPV e historial, Caja, Clientes, Impuestos y Ajustes comparten la jerarquía y estética de la landing.
- Onboarding, cambio forzado de contraseña, modales, estados vacíos, toasts y asistente IA se alinean con el mismo sistema visual y responsive.
- Rediseño integral del shell, navegación, login, tarjetas y sistema visual inspirado en una experiencia retail editorial.
- **Cerrar sesión** explícito en header y sidebar (sustituye «Bloquear»); toast al salir (#9).
- Navegación en **español de comercio** (#12).
- Naming comercial **Hexa** + tagline «Asistente de tienda · IA local opcional» en login/shell (#23). Package npm sigue `hexa-crm`.
- CI queda orientado a `main`; la protección documentada exige squash, revisión y el check `quality` (#1).

### Fixed
- El selector de empresa de la cabecera permanece por encima del contenido y permite pulsar todas las opciones del desplegable.

### Pendiente / backlog
- Dashboard de mando completo (#13) y copiloto IA con tools (#14)
- CRM valor cliente (#17), TPV favoritos (#15), reposición sugerida (#16)
- Settings por empresa (M1b)
- Design system light (#18); idle timeout (#21)


---

## [0.2.1-rc.2] — 2026-07-24

### Fixed
- **Aislamiento multiempresa crítico de productos en PostgreSQL/RPC:** Se corrigió un fallo por el cual `upsert_product()` no resolvía la empresa activa (`active_company_id`) de la sesión. Los `INSERT` no incluían `company_id` cayendo en el valor por defecto `1`, y los `UPDATE` filtraban exclusivamente por `id`. Con este fix, la creación, edición y ajuste de stock de productos operan siempre sobre el tenant activo de la sesión del usuario, rechazando modificaciones sobre productos de otros tenants e ignorando cualquier `company_id` recibido en el payload.


---

## [0.2.1-rc.1] - 2026-07-23

### Added
- Integración del agregador Stripe.

### Fixed
- Arreglo de Plugins en modo local.


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

[Unreleased]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.2.1-rc.2...HEAD
[0.2.1-rc.2]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.2.1-rc.1...v0.2.1-rc.2
[0.2.1-rc.1]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.2.0...v0.2.1-rc.1
[0.2.0]: https://github.com/HEXA-NIX/hexa-crm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HEXA-NIX/hexa-crm/releases/tag/v0.1.0
