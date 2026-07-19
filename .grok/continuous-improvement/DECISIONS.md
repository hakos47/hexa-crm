# DECISIONS

| Fecha | Decisión | Alternativas | Motivo |
|-------|----------|--------------|--------|
| 2026-07-18 | Stack Tauri+Svelte es fuente de verdad; no migrar a Cloudflare en este ciclo | Workers/D1 | Sin autorización; AGENTS.md local-first |
| 2026-07-18 C1 | Descuento manual en **euros por línea** (no % carrito) | Solo % global | Backend ya tiene discount_cents por línea; mínimo viable |
| 2026-07-18 | No push a main en ciclo CI; rama `feat/ci-cycle-1` | Merge automático | Prompt prohíbe push sin autorización explícita |
| 2026-07-18 C3 | Reusar `lineBreakdown` de `vat.ts` en Postgres `create_sale` | Recalcular VAT a mano en SQL | Una sola fuente de verdad; evita desvío browser vs web |
| 2026-07-18 C3 | Priorizar fix integridad dto. sobre a11y/import CSV | B5 (prio 12), B4 | Filtro: integridad transaccional > UX/onboarding |
| 2026-07-18 C4 | Import CSV con cabeceras canónicas + aliases ES | Solo EN headers | Onboarding tienda ES; round-trip con export |
| 2026-07-18 C4 | Upsert por SKU (id si existe) | Solo create | Evita duplicados al reimportar catálogo |
| 2026-07-18 C6 | % carrito sobre neto tras dto. línea; reparto a discount_cents | % solo sobre bruto global en un campo sale | Reusa create_sale/VAT line-based sin migrar schema |
| 2026-07-19 C8 | Partial return mutates returned_qty + refunded_cents; full cancel = return remaining | Documento de abono separado / ticket negativo | Menos schema; misma caja/stock; auditoría en líneas |
| 2026-07-19 C8 | IVA dashboard netea por remainingLineAmounts | Dejar IVA bruto del ticket | Evita sobre-declarar base/IVA tras devoluciones |
| 2026-07-19 C9 | Arqueo: sobrante→adjustment, faltante→expense categoría arqueo | Solo nota sin movimiento | Alinea saldo sistema con contado físico |
| 2026-07-19 C9 | Cierre día: ventas display netas; net_cash usa bruto − gastos (incl. devoluciones) | Netear ventas y restar gastos de nuevo | Evita doble resta de reembolsos |
