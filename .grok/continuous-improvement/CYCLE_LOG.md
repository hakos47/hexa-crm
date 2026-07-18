# CYCLE_LOG

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
