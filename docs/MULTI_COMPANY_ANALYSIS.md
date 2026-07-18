# Análisis multi-empresa — Nix-C para estudio de desarrollo + tienda de compraventa

**Fecha:** 2026-07-18  
**Tipo:** análisis de producto / arquitectura (sin implementación multi-org en este entregable)  
**Producto base:** Nix-C (hexa-crm) — CRM/TPV local-first, control interno de ventas/caja/IVA  
**Fiscal:** ver [ADR-001 VeriFactu](./ADR-001-verifactu-plan.md) — **no** se reclama facturación electrónica homologada

---

## 1. Dos negocios reales: qué separar y qué puede compartirse

### 1.1 Las dos líneas de actividad

| Código | Negocio | Actividad típica | Canal principal en Nix-C |
|--------|---------|------------------|---------------------------|
| **DEV** | Empresa de **desarrollo de aplicaciones** (estudio/software) | Proyectos, servicios, licencias, mantenimiento, facturas a clientes B2B/B2C de software | Ventas “de servicio” / presupuestos → facturas (futuro), clientes, IVA servicios |
| **SHOP** | **Tienda de compraventa** (segunda mano / retail físico) | TPV, stock de piezas/productos, caja diaria, tickets de mostrador | Inventario, ventas TPV, caja, cierre día, IVA bienes |

Son **dos empresas comerciales** (idealmente **dos NIF / dos personas jurídicas o epígrafes claros**). Aunque el mismo humano sea socio o administrador de ambas, **la facturación y el IVA no deben mezclarse**.

### 1.2 Debe quedar **legal y comercialmente separado** (por empresa)

| Ámbito | Por qué no se mezcla | En producto multi-empresa |
|--------|----------------------|---------------------------|
| **Persona jurídica / NIF emisor** | Cada factura lleva un emisor; mezclar NIF es error fiscal grave | Tabla `companies` con NIF, razón social, dirección |
| **Serie y numeración de facturas/tickets** | Correlatividad por emisor; no “huecos” ni series compartidas | `invoice_series` / series de ticket **por `company_id`** |
| **Libro / resumen de IVA** | Declaraciones y contable por sociedad | `vat_summary`, exports CSV **filtrados por empresa** |
| **Caja y arqueo** | Efectivo de la tienda ≠ cobros del estudio | `cash_movements` + cierre día **por empresa** |
| **Ventas / tickets / facturas** | Imputación de ingreso y base imponible | `sales` (+ futuras `invoices`) con `company_id` NOT NULL |
| **Inventario y stock** (sobre todo SHOP) | Mercancía de la compraventa no es activo del estudio | `products` / stock por empresa (o almacén ligado a empresa) |
| **Clientes “fiscales”** | NIF del cliente en factura del emisor correcto | Clientes pueden ser **compartidos a nivel CRM** o **scoped**; datos en factura = snapshot del emisor |
| **Backup fiscal / auditoría** | Restaurar o exportar una sociedad sin arrastrar la otra | Backup envelope con `company_id` o dumps por tenant |
| **Copy UI fiscal** | No presentar ticket TPV como factura legal de otra sociedad | Disclaimer por empresa; ver ADR-001 capa A vs C |

### 1.3 Puede **compartirse** en un mismo sistema (producto único)

| Ámbito | Cómo | Riesgo a controlar |
|--------|------|--------------------|
| **Shell de producto** | Una app, un login, mismas rutas Svelte | Context de empresa activo siempre visible |
| **Usuarios de acceso** | Tabla global `users`; membresía `company_members` | Sin spill: un cajero de SHOP no ve DEV |
| **UI, temas, componentes** | Código único | Features por tipo de negocio (flag `company.kind`) |
| **Hosting / despliegue / Ollama** | Una instancia Postgres o un Tauri con DB multi-tenant | Aislamiento en filas, no solo en UI |
| **Dueño / holding view** | Rol `owner` o `group_admin` ve consolidado | Consolidado **solo** como informe de gestión, **nunca** como un único libro IVA |
| **Catálogo de plantillas / módulos** | Código compartido (TPV vs “ventas de servicio”) | Módulos opcionales por `company.kind` |
| **IA asistente** | Mismo motor; **contexto = empresa activa** | Prompt y stats solo del tenant actual |

### 1.4 Regla de oro

> **Un sistema, dos (o N) emisores.**  
> “Qué ha facturado cada uno” = informes **por `company_id`**.  
> “Cuánto hemos facturado en total el grupo” = vista consolidada **opcional y etiquetada como no fiscal**.

No se fusionan ambos negocios en un solo NIF ni en una sola serie de facturas.

---

## 2. Modelo de aislamiento: **Company Tenant** (org por empresa)

Nombre del modelo: **Company Tenant Isolation**  
Unidad de aislamiento: **`companies` (empresa / emisor)**  
Contexto de sesión: **`active_company_id`** (obligatorio tras login si el usuario pertenece a más de una)

### 2.1 Esquema conceptual (futuro)

```text
companies
  id, code, legal_name, trade_name, nif, address_json
  kind: 'software_studio' | 'retail_secondhand' | 'generic'
  default_vat, active, created_at

company_members
  company_id, user_id, role: 'admin' | 'cajero' | 'viewer'
  PRIMARY KEY (company_id, user_id)

# Todas las tablas operativas ganan company_id (NOT NULL + índice):
products, stock_movements, customers?, sales, sale_lines,
cash_movements, settings (key scoped por company o JSON por company)

# Futuro fiscal (ADR-001):
invoice_series(company_id, ...), invoices(company_id, ...), fiscal_events(company_id, ...)
```

**Límite de datos (row-level):**

| Dominio | Scope |
|---------|--------|
| Sales / tickets | `company_id` obligatorio; queries siempre filtradas |
| Cash / cierre | `company_id` obligatorio |
| Stock / products | `company_id` obligatorio (SHOP); DEV puede tener catálogo de “servicios” en la misma tabla con `kind=service` |
| Clients | **Opción A (recomendada P0):** scoped por empresa. **Opción B:** global + “visible en empresas” (más complejo) |
| Settings (`shop_name`, Ollama, etc.) | Por empresa (nombre comercial distinto) |
| Users | Global; permisos vía `company_members` |
| Sessions | Token + lista de companies permitidas + `active_company_id` |

### 2.2 Quién puede cambiar de empresa y quién ve qué

| Rol | Switcher de empresa | Ve datos de… | Ve consolidado grupo |
|-----|---------------------|--------------|----------------------|
| **Owner / group admin** (humano que controla ambas) | Sí, todas las empresas del grupo | La activa en detalle; todas en dashboard grupo | Sí (gestión) |
| **Admin de una sola empresa** | No (o solo la suya) | Solo su `company_id` | No |
| **Cajero SHOP** | No | Solo SHOP: TPV, caja, stock | No |
| **Viewer contable** | Select de empresas autorizadas | Solo lectura, por empresa | Opcional, solo si se autoriza |

**UX del switcher:**

- Siempre visible en shell (header): nombre legal + código (`DEV` / `SHOP`).
- Al cambiar: recargar KPIs, ventas, caja, inventario; **no** mezclar carrito TPV entre empresas.
- Login: si una sola empresa → fijar; si varias → elegir o última usada.

### 2.3 Cómo reportar “qué ha facturado cada uno”

| Informe | Filtro | Uso |
|---------|--------|-----|
| **Ventas del periodo (por empresa)** | `company_id` + rango fechas + `status=completed` | “Qué ha facturado / vendido DEV vs SHOP” |
| **IVA interno por empresa** | Igual + desglose tipos 0/4/10/21 | Contable por sociedad |
| **Caja / cierre día por empresa** | `company_id` + día | Arqueo tienda vs cobros estudio |
| **Dashboard consolidado (owner)** | Suma de totales por empresa en columnas o stacked | Visión de grupo; etiqueta: *no es libro IVA único* |
| **Export CSV** | Un archivo por empresa (nombre archivo incluye `company.code`) | Entrega a gestor sin mezclar |

**Métricas mínimas por empresa (periodo):**

- `sales_total_cents`, `sales_count`, `vat_cents`, `base_cents`
- `cash_balance_cents` (si aplica caja física; en DEV puede ser 0 o solo “ingresos registrados”)
- Comparativa lado a lado en vista owner: `DEV | SHOP | Σ grupo (gestión)`

### 2.4 Tipos de empresa y módulos

| `kind` | Módulos prioritarios | Módulos secundarios |
|--------|----------------------|---------------------|
| `retail_secondhand` (SHOP) | TPV, stock, caja, cierre, IVA bienes | Devoluciones, categorías |
| `software_studio` (DEV) | Clientes B2B, “ventas/servicios” (líneas sin stock o stock lógico), IVA servicios, notas de proyecto ligeras | Inventario físico (off), TPV barcode (off) |
| `generic` | Subconjunto común | — |

Feature flags por `company.kind` evitan forzar un TPV de compraventa al estudio de software y viceversa.

---

## 3. Gaps priorizados vs Nix-C **actual**

### 3.1 Realidad del producto hoy (verificación en código)

| Hecho en repo | Evidencia |
|---------------|-----------|
| Una sola tienda lógica | `Settings.shop_name`; `settings` key-value global; seed `"Mi Tienda"` |
| Un pipeline de ventas/caja/IVA | Rutas `/ventas`, `/caja`, `/impuestos`; `create_sale` / `dashboard_stats` sin `company_id` |
| Sin multi-org en tipos/API | `src/lib/types.ts` — no existe `Company` / `org_id` / `company_id` |
| Usuarios globales a la instancia | `users` + roles `admin` \| `cajero` sin membresía por empresa |
| Control interno, no Veri*Factu | [ADR-001](./ADR-001-verifactu-plan.md), disclaimer en `/impuestos` |
| PRODUCT_MAP asume un comercio | Un dashboard, un inventario, un TPV |

### 3.2 Lista de gaps (prioridad)

Fórmula orientativa: impacto negocio × urgencia legal/comercial / esfuerzo.

| ID | Gap | Prioridad | Qué hace falta |
|----|-----|-----------|----------------|
| **G1** | No existe entidad **Company / tenant** | **P0** | Tabla `companies`, seed DEV+SHOP, NIF y `kind` |
| **G2** | Ninguna tabla operativa lleva **`company_id`** | **P0** | Migración: añadir `company_id` a sales, cash, products, settings…; backfill a empresa default |
| **G3** | Sesión sin **empresa activa** | **P0** | `active_company_id` en sesión; filtro en todo RPC/Tauri command |
| **G4** | Sin **company_members** / permisos por empresa | **P0** | Membresía + enforce en `requireSession` |
| **G5** | Settings mono-tienda (`shop_name` global) | **P0** | Settings por empresa o prefijo `company:{id}:shop_name` |
| **G6** | Informes y dashboard **sin desglose multi-empresa** | **P0** | API `billing_by_company(from,to)` + UI owner |
| **G7** | Switcher UI y copy “empresa activa” | **P0** | Header switcher; vaciar carrito al cambiar |
| **G8** | Export CSV / backup **sin partición por empresa** | **P1** | Filename + filtro; backup envelope con lista de companies |
| **G9** | Módulos no discriminan **studio vs retail** | **P1** | `company.kind` → nav condicional (ocultar stock en DEV o simplificar) |
| **G10** | Series fiscales / facturas legales por emisor | **P2** (post ADR capa C) | `invoice_series` por company — **no** mezclar con tickets TPV |
| **G11** | Clientes y “proyectos” del estudio | **P1–P2** | Clientes scoped; opcional `projects` ligero solo DEV |
| **G12** | Caja física irrelevante o distinta en DEV | **P1** | Política: DEV sin caja o caja “bancaria” etiquetada |
| **G13** | IA con contexto de una sola `tienda` | **P1** | Contexto = empresa activa + totales de esa empresa |
| **G14** | Tests E2E asumen un solo tenant | **P0** | Ampliar critical-flow con 2 companies y no-leak |

### 3.3 Conceptos / módulos de producto necesarios (resumen)

1. **Companies & membership** — núcleo de aislamiento  
2. **Tenant-scoped operations** — sales, cash, stock, VAT, settings  
3. **Company switcher + owner consolidated report** — “qué facturó cada uno”  
4. **Kind-specific UX** — retail TPV vs studio services  
5. **Fiscal layer (futuro)** — series por NIF; seguir ADR-001; sin claim Veri*Factu hasta capa C  

### 3.4 Caveats fiscales (obligatorio en roadmap)

- Control actual = **gestión interna** (tickets, IVA de control). No es libro oficial ni Veri*Factu ([ADR-001](./ADR-001-verifactu-plan.md)).
- **Cada empresa legal** necesita su propia serie y su propio NIF emisor cuando se implemente facturación.
- El consolidado del grupo es **informe de gestión**, no base de autoliquidación conjunta salvo que un asesor diga lo contrario (no es el caso por defecto).
- Compraventa de segunda mano puede tener reglas de IVA especiales (REBU, etc.): **fuera de alcance de implementación aquí**; documentar como riesgo de dominio SHOP para el asesor.
- Servicios de software: IVA y facturación B2B distintos del ticket de mostrador — no reutilizar ciegamente el mismo “ticket TPV” como factura de honorarios.

---

## 4. Roadmap por fases (ejecutable por un implementer)

### Fase P0 — Aislamiento + “qué facturó cada uno” (MVP multi-empresa)

**Objetivo:** Dos empresas (DEV + SHOP) en la misma instancia; datos no se mezclan; el owner ve totales por empresa.

| # | Entrega | Criterio de aceptación |
|---|---------|------------------------|
| P0.1 | Modelo `companies` + seed `DEV` (software_studio) y `SHOP` (retail_secondhand) | Existen 2 filas con NIF placeholder y `kind` |
| P0.2 | `company_id` en sales, cash_movements, products, settings (o settings scoped) | Migración + backfill a SHOP o empresa default |
| P0.3 | `company_members` + sesión con `active_company_id` | Usuario sin membresía no lee datos; queries filtran siempre |
| P0.4 | Todos los commands RPC/Tauri/`browserApi` reciben y aplican company | Test: venta en SHOP no aparece en list_sales de DEV |
| P0.5 | Switcher UI + bloqueo de carrito al cambiar | Imposible cobrar un carrito de una empresa en otra |
| P0.6 | Informe **Billing by company** (periodo) + dashboard owner | Tabla/API: por cada company → total_cents, count, vat; opcional Σ |
| P0.7 | Tests: no-leak + E2E crítico por tenant | Vitest: create_sale company A invisible en B |
| P0.8 | Docs: actualizar PRODUCT_MAP + disclaimer fiscal multi-emisor | Referencia a este doc + ADR-001 |

**Fuera de P0:** Veri*Factu, series legales, REBU, proyectos de software completos, multi-almacén.

### Fase P1 — Producto por tipo de negocio + exports

| # | Entrega |
|---|---------|
| P1.1 | Nav por `kind`: SHOP = TPV+stock+caja; DEV = clientes+ventas servicio (stock opcional off) |
| P1.2 | Export CSV / IVA / backup **por empresa** (y opción “todas” solo owner, archivos separados) |
| P1.3 | Clientes scoped; import/export clientes por empresa |
| P1.4 | Política de caja en DEV (desactivar o “cobros registrados”) |
| P1.5 | IA: contexto y stats solo de `active_company_id` |

### Fase P2 — Fiscal por emisor (diseño → implementación condicionada)

| # | Entrega |
|---|---------|
| P2.1 | `invoice_series` por `company_id` (ADR-001 F2) |
| P2.2 | Facturas borrador **etiquetadas no certificadas** hasta capa C |
| P2.3 | Matriz requisito→prueba por empresa emisor |
| P2.4 | Asesoría externa antes de cualquier claim AEAT / Veri*Factu |

### Fase P3 — Escala del grupo (opcional)

- Más de 2 empresas, marcas blancas internas  
- Roles viewer contable multi-empresa  
- Consolidado multi-moneda (no aplicable ES hoy)  
- Proyectos/hitos solo DEV  

### Orden de implementación sugerido (checklist P0)

```text
1. Schema companies + members + company_id columns
2. Session active_company_id + server-side filters
3. Seed DEV + SHOP + memberships owner
4. Fix all list/create APIs
5. UI switcher + reports billing_by_company
6. Tests anti-fuga + update docs
```

---

## 5. Decisiones de producto recomendadas (para no reabrir debate)

| Decisión | Elección | Motivo |
|----------|----------|--------|
| Modelo | **Company Tenant** (no “una DB por empresa” en P0) | Un sistema, un deploy, menos ops |
| Clientes P0 | Scoped por empresa | Menos fugas; CRM cruzado es P2 |
| Consolidado | Solo owner; etiqueta no fiscal | Evita error de autoliquidación |
| Default al migrar datos actuales | Asignar todo a **SHOP** (TPV actual es retail) | Encaja con PRODUCT_MAP actual |
| Segunda empresa DEV | Seed vacía o con 1 servicio demo | Lista para facturar servicios sin stock |
| Facturación legal | Fuera de P0; ADR-001 | No bloquear aislamiento operativo |

---

## 6. Referencias en repo

| Documento | Uso |
|-----------|-----|
| [ADR-001 VeriFactu](./ADR-001-verifactu-plan.md) | Capas A/B/C; no claim legal |
| [VERIFACTU_MATRIX](./VERIFACTU_MATRIX.md) | Requisitos F1–F8 |
| [BACKUP](./BACKUP.md) | Copias; futuro por tenant |
| [PRODUCT_MAP](../.grok/continuous-improvement/PRODUCT_MAP.md) | Mapa actual single-shop |
| `src/lib/types.ts` → `Settings.shop_name` | Evidencia mono-tienda |

---

## 7. Resumen ejecutivo (una página)

Tenéis **dos negocios** (estudio de apps + compraventa) que deben **facturar e informar IVA por separado**, pero podéis operar en **un solo Nix-C** con aislamiento **Company Tenant**: cada venta, caja, stock y setting lleva `company_id`; los usuarios se asignan por membresía; el dueño cambia de empresa y ve **totales por empresa** (y un consolidado de gestión).  

Hoy Nix-C es **single-shop** (`shop_name`, un pipeline de ventas/caja/IVA, sin `org_id`). El trabajo prioritario es **P0: schema + sesión + filtros + informe “billing by company” + tests anti-fuga**. La facturación electrónica / Veri*Factu es **posterior** y **por NIF emisor**, nunca mezclando series de DEV y SHOP.
