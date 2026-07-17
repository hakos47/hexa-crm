# CYCLE_LOG

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
