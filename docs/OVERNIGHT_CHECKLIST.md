# Overnight audit checklist — hexa-crm CRM

Pase de orquestación completado (checklist finita + cycle de enhancement).

## Superficies primarias

| # | Superficie | Estado | Nota |
|---|------------|--------|------|
| 1 | Login / public_meta | [x] | Autofocus en usuario; copy sin credenciales demo; `public_meta` solo nombre tienda. |
| 2 | Force password change | [x] | Gate en layout intacto; logo + formulario; validación 8+ chars. Sin cambio de lógica (ya correcto). |
| 3 | Shell layout / nav / mobile | [x] | Drawer móvil, hamburger, logo; AI abre popup. Verificado estructuralmente. |
| 4 | Dashboard | [x] | KPIs OK; stock bajo ahora enlaza a `/inventario` y muestra categoría. |
| 5 | Inventario | [x] | Campo **categoría** + filtro Select; búsqueda por categoría; tabla con columna. |
| 6 | Ventas TPV | [x] | **Enter/SKU** (`resolveQuickAdd`); hint POS; carrito responsive. |
| 7 | Ventas historial | [x] | **Exportar CSV** de ventas; tabla con scroll. |
| 8 | Caja | [x] | **Cierre de caja del día** (informe neto/tickets/gastos); movimientos con scroll. |
| 9 | Clientes | [x] | Búsqueda por nombre/email/tel/NIF; empty state sin resultados. |
| 10 | Impuestos (IVA) | [x] | **Exportar CSV** libro IVA por periodo; botones responsive. |
| 11 | Ajustes | [x] | Select custom rol/IVA; users temp password flow OK; forms stacked. |
| 12 | AI popup | [x] | Compact bottom-right + fullscreen; sin overlay bloqueante en compact. Sin regresión. |
| 13 | Shared (Select, Modal, forms) | [x] | Select estético en uso en todas las superficies; field CSS unificado. |

## Mejoras de mercado (≥3)

| # | Mejora | Estado | Nota |
|---|--------|--------|------|
| M1 | TPV: Enter/SKU rápido | [x] | `src/lib/pos/quick-add.ts` + TPV Enter. Tests unitarios. |
| M2 | Export CSV ventas + libro IVA | [x] | `src/lib/export/csv.ts`; botones en Ventas e Impuestos. |
| M3 | Categorías de producto + filtro | [x] | `Product.category` (web + Tauri migrate); UI inventario. |

## Post-checklist enhancement

| # | Mejora | Estado | Nota |
|---|--------|--------|------|
| E1 | Cierre de caja del día | [x] | `src/lib/reports/daily-close.ts` + panel en Caja. Test unitario. |

## Suite

| Check | Estado | Nota |
|-------|--------|------|
| `npm run test` | [x] | 37 tests OK |
| `npm run build` | [x] | adapter-static OK |
| `cargo check` | [x] | products category OK |

## Market sources (resumen)

Retail POS 2025–26 (Square, Clover, Lightspeed, RetailCloud): stock en tiempo real, alertas mínimo, barcode/SKU checkout, CSV, end-of-day cash, categorías de catálogo.
