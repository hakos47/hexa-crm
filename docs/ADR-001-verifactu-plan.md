# ADR-001 — Arquitectura fiscal y plan VeriFactu

**Estado:** Propuesto (diseño) — **no** implementado como emisión legal  
**Fecha:** 2026-07-18  
**Issue:** [#2](https://github.com/HEXA-NIX/hexa-crm/issues/2)

## Contexto

Nix-C es un CRM/TPV **local-first** para microcomercio en España. Hoy registra:

- tickets de venta (totales base/IVA/total en céntimos),
- movimientos de caja,
- export CSV de ventas y resumen IVA.

Eso **no** es facturación electrónica ni sistema Veri*Factu / SIF homologado.  
La UI y la documentación **no** deben presentarlo como tal.

## Decisión

Separar en capas:

| Capa | Rol | Estado actual |
|------|-----|---------------|
| **A. Operativa** | TPV, stock, caja, IVA interno de gestión | Implementada |
| **B. Fiscal documentada** | Diseño, requisitos, matriz prueba | Este ADR |
| **C. Emisión legal** | Facturas, hash encadenado, firma, envío AEAT/Veri*Factu | **Fuera de alcance** hasta validación jurídica / proveedor |

**No** se implementa emisión fiscal en este ciclo. Cualquier pantalla de “facturas” futura debe etiquetarse como *borrador interno* o *no certificado* hasta completar C.

## Requisitos funcionales (identificados — no certificados)

Fuente de descubrimiento: BOE / AEAT (consulta de requisitos de sistemas de facturación y Veri*Factu).  
**No constituye dictamen legal.** Validación jurídica externa obligatoria antes de C.

| ID | Requisito (resumen) | Componente futuro | Prueba futura |
|----|---------------------|-------------------|---------------|
| F1 | Identificación emisor/receptor | `fiscal_entities` | Unit + fixture NIF |
| F2 | Numeración correlativa inviolable | `invoice_series` | Secuencia + huecos prohibidos |
| F3 | Registro inmutable / encadenado (hash) | `fiscal_events` | Cadena rota → detect |
| F4 | Conservación e integridad | backup + sellado | backup.test + audit |
| F5 | Exportación AEAT / Veri*Factu | `export_verifactu` | Golden files oficiales |
| F6 | No alteración post-emisión | soft-delete + rectificativas | E2E cancel ≠ borrar factura |
| F7 | Trazabilidad de eventos | append-only log | Query auditoría |
| F8 | UI no engañosa | copy/disclaimer | Snapshot a11y copy |

## Modelo de datos versionado (propuesta v0)

```text
fiscal_entities(id, nif, name, address_json, ...)
invoice_series(id, code, next_number, year)
invoices(id, series_id, number, status, issued_at,
         customer_snapshot_json, totals_cents, hash, prev_hash, ...)
invoice_lines(...)
fiscal_events(id, kind, entity_ref, payload_json, hash, prev_hash, at)
```

Migraciones: **nunca** reescribir ventas históricas `sales`; las facturas legales son tablas nuevas enlazadas opcionalmente a `sale_id`.

## Amenazas y controles

| Amenaza | Control |
|---------|---------|
| Presentar ticket TPV como factura legal | Disclaimer UI; copy “gestión interna” |
| Alteración de importes post-emisión | Append-only + hash chain |
| Pérdida de datos | Backup versionado (issue #4) |
| Implementación prematura “casi legal” | Gate: ADR + revisión jurídica antes de código C |
| Dependencia de proveedor no auditado | Lista de proveedores; no hardcode secretos |

## Estrategia de firma / QR / exportación

- **Fase diseño:** definir campos mínimos y formato de exportación según documentación AEAT vigente en el momento de implementación.
- **Fase implementación (futura):** valorar software homologado o API de tercero; Nix-C como cliente, no como “homologación casera”.
- **QR / huella:** solo cuando el formato oficial esté implementado y revisado.

## Qué queda en la UI actual

- Export CSV de ventas e IVA = **herramienta de gestión / contable**, no libro oficial certificado.
- Tickets = justificante operativo interno.

## Consecuencias

- Producto puede seguir vendiendo y cerrando caja sin bloquearse.
- Roadmap fiscal es **documentación + gates**, no feature flag engañosa.
- Issue #2 se cierra en alcance **diseño**; la implementación C es issue futura.

## Aprobación

- [ ] Revisión producto (humano)
- [ ] Revisión técnica (este PR)
- [ ] Revisión jurídica externa (bloqueante para capa C)
