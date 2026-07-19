# CYCLE_LOG

## CICLO 7 — 2026-07-19

```
CICLO 7 — 2026-07-19
Área auditada: multi-empresa (Company Tenant P0 slice)
Cambio de mercado / evidencia:
  - docs/MULTI_COMPANY_ANALYSIS.md: DEV + SHOP facturación separada
  - BACKLOG M1
Problema: una sola tienda; ventas/stock no se aíslan por NIF/emisor
Hipótesis: companies + members + active_company_id + filter list/create
Cambios:
  - types Company; company/context.ts + tests
  - browser-store v5 isolation + company-isolation.test
  - postgres companies schema + list/set_active + filter products/sales
  - RPC + client + session store + header switcher
Pruebas: 107/107; check 0
Antes → después: single-shop → SHOP/DEV con no-leak de ventas/productos
Riesgos: settings globales aún mono; customers/cash filter incompleto en PG dashboard; SKU unique global en PG
Siguiente: settings por empresa o devolución parcial
Estado: CYCLE_COMPLETE
```

## CICLO 6 — 2026-07-18

```
CICLO 6 — 2026-07-18
Área auditada: 5 — Ventas/TPV (descuento % carrito)
Cambio de mercado relevante y fuentes:
  - POS retail: descuento % sobre ticket es feature core (tras dto. línea)
  - BACKLOG B3 pendiente desde ciclo 1
Problema seleccionado y evidencia:
  Solo dto. € por línea; cajero no puede aplicar % global al carrito
Hipótesis y métrica:
  planCartDiscounts(lines, %) → discount_cents por línea; total e IVA correctos
Cambios realizados:
  - src/lib/sales/cart-discount.ts (+ tests 6)
  - TPV: input "Descuento carrito %"; totales con desglose; checkout usa plan
Pruebas: npm test + check
Antes → después: sin % carrito → 0–100% tras dto. línea, stack con create_sale
Riesgos: redondeo céntimos en reparto multi-línea (remainder en última línea)
Elementos aparcados: multi-empresa P0; devolución parcial
Siguiente área candidata: multi-empresa Company Tenant P0 o devolución parcial
Estado: CYCLE_COMPLETE
```

## CICLO 5 — 2026-07-18

```
CICLO 5 — 2026-07-18
Área auditada: 11 — Ajustes / administración
Cambio de mercado relevante y fuentes:
  - Evidencia de producto: captura + feedback usuario “ajustes no sigue el diseño”
  - Design system existente (dashboard, login glass-strong, section-label)
Problema seleccionado y evidencia:
  Stack de cards planas max-w-3xl; sin jerarquía, chips Ollama grises, Guardar al final
Hipótesis y métrica:
  Header + status strip + grid 2 col + Ollama glow + users rows → mismo lenguaje visual
Cambios realizados:
  - Redesign completo src/routes/ajustes/+page.svelte (misma lógica API)
  - Tests estructurales ajustes-layout.test.ts (4)
Pruebas: npm test; npm run check 0 errors
Antes → después: formulario genérico → shell Nix-C (section-label, pills, danger zone)
Riesgos: solo visual; sin E2E browser screenshot en CI
Elementos aparcados: B3 % carrito; multi-empresa P0
Siguiente área candidata: B3 descuento % carrito global
Estado: CYCLE_COMPLETE
```

## CICLO 4 — 2026-07-18

```
CICLO 4 — 2026-07-18
Área auditada: 4+9 — Inventario / importación CSV de productos
Cambio de mercado relevante y fuentes:
  - Retail POS: bulk catalog CSV import es onboarding estándar (Square/Lightspeed-like)
  - Evidencia producto: FEATURE_AUDIT import ausente; solo export ventas/IVA
Problema seleccionado y evidencia:
  Alta de catálogo solo manual (modal); sin importación masiva por SKU
Hipótesis y métrica:
  CSV con sku,name,price_eur,… → parseProductCsv → upsert por SKU;
  plantilla + export catálogo round-trip
Cambios realizados:
  - src/lib/import/product-csv.ts (parse, aliases ES, template, productsToCsv)
  - Tests product-csv.test.ts (7)
  - UI Inventario: Plantilla / Exportar / Importar CSV
Pruebas: npm test + product-csv; check sin errores de import
Antes → después: sin import → import/upsert con validación IVA/precio/SKU
Riesgos: import fila a fila (no transacción batch); errores de fila bloquean todo el archivo
Elementos aparcados: B5 a11y; B3 % carrito; multi-empresa P0
Siguiente área candidata: a11y contraste (B5)
Estado: CYCLE_COMPLETE
```

## CICLO 3 — 2026-07-18

```
CICLO 3 — 2026-07-18
Área auditada: 5 — Ventas/TPV (path PostgreSQL /api/rpc)
Cambio de mercado relevante y fuentes:
  - Descuentos por línea = core POS (evidencia ciclo 1)
  - Integridad de caja/IVA con descuento = requisito operativo (auditoría local)
Problema seleccionado y evidencia:
  postgresApi.create_sale ignoraba line.discount_cents; UI TPV sí enviaba dto.
  Antes live: total = PVP bruto; caja inflada; IVA sobre bruto.
Hipótesis y métrica:
  Usar lineBreakdown(vat.ts) + cap dto → total_cents y cash income = neto
Cambios realizados:
  - create_sale aplica discount_cents (cap 0..PVP×qty) y isVatRate
  - Tests sale-line-plan.test.ts (4)
  - Memoria CI actualizada
Pruebas: npm test 53/53 OK; build OK
  Live RPC: café 9,90 − 0,90 dto → total 900 cts; cash += 900
  Adyacente: venta con dto 1700 + cancel → cash restaura
Antes → después: dto ignorado → dto aplicado con IVA y caja correctos
Riesgos: sale_lines sin columna discount_cents (solo neto en totales); Tauri SQLite path ya OK
Elementos aparcados: B5 a11y; B4 import CSV; B3 % carrito; devolución parcial
Siguiente área candidata: a11y contraste (B5) o import CSV (B4)
Estado: CYCLE_COMPLETE
```

## CICLO 2 — 2026-07-18

```
CICLO 2 — 2026-07-18
Área auditada: Ventas + Caja (anulación de ticket completo)
Cambio de mercado relevante y fuentes:
  - POS retail: void/cancel sale es feature core (restaurar stock y caja)
Problema seleccionado y evidencia:
  FEATURE_AUDIT: devoluciones ausentes; sin forma de deshacer ticket erróneo
Hipótesis y métrica:
  cancel_sale(completed) → stock restaurado, gasto caja = total, IVA/dashboard sin contar
Cambios realizados:
  - planCancelSale / canCancelSale pure helpers
  - browserApi.cancel_sale + Tauri cancel_sale
  - UI historial: badge anulada + botón Anular ticket
  - VAT, dashboard, daily-close excluyen status!=completed
Pruebas: npm test 44/44 OK; build OK; cargo check OK
Antes → después: sin anulación → anulación completa con integridad stock/caja/IVA
Siguiente área: a11y contraste o import CSV
Estado: CYCLE_COMPLETE
```

## CICLO 1 — 2026-07-18

```
CICLO 1 — 2026-07-18
Área auditada: Ventas/TPV (descuentos por línea)
Cambio de mercado relevante y fuentes:
  - National Funding POS: descuentos como feature core (2026-07-18)
  - NaviPartner: descuento manual por línea en POS
  - Evidencia de producto: discount_cents en API sin UI
Problema seleccionado y evidencia:
  Cajero no puede registrar descuentos reales; backend ya soportaba discount_cents
Hipótesis y métrica:
  UI de dto. € por línea → total e IVA correctos; venta y caja persisten neto
Cambios realizados:
  - CartLine.discount_cents en TPV; input "Dto. €"; totales con descuento
  - create_sale envía discount_cents
  - Test browser-store.sale-discount.test.ts
  - Memoria .grok/continuous-improvement/*
Pruebas ejecutadas y resultados:
  npm run test → 38/38 OK
  npm run build → OK
Antes → después:
  Antes: descuento imposible desde UI (siempre 0)
  Después: descuento acotado a total de línea, IVA recalculado, cash = neto
Riesgos o límites restantes:
  Sin descuento % carrito global; sin trazabilidad de motivo de descuento
Elementos aparcados y motivo:
  Devoluciones (mayor esfuerzo/riesgo); descuento % global (priorizado tras línea)
Siguiente área candidata: Devoluciones o a11y contraste
Estado: CYCLE_COMPLETE
```
