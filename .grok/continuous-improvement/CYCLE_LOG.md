# CYCLE_LOG

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
