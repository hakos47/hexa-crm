# EXPERIMENTS

## EXP-001 — Descuento por línea en TPV (ciclo 1)

- **Hipótesis:** Si el cajero puede introducir un descuento en € por línea, el total cobrado y el IVA reflejan el importe real sin trucar precios de catálogo.
- **Línea base:** `discount_cents` nunca se envía desde UI; solo qty × PVP.
- **Métrica:** venta con descuento produce `total_cents` = sum(max(0, unit×qty−discount)); desglose IVA sobre total con descuento (PVP con IVA incl.).
- **Criterio aceptación:**
  1. UI permite descuento € ≥ 0 por línea y no supera el subtotal de línea.
  2. Totales del carrito incluyen descuento.
  3. `create_sale` persiste totales descontados (browser store).
  4. Tests unitarios del flujo pure + create_sale con descuento en verde.
- **Resultado:** ACEPTADO — test create_sale con dto 9,90 € sobre TEC-110 (49,90) → total 40,00 € y caja 40,00 €. Suite 38 tests + build OK.
- **Decisión:** Ship en `feat/ci-cycle-1`. Iterar % carrito en ciclo posterior si se prioriza.
