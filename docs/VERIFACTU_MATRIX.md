# Matriz requisito → componente → prueba (VeriFactu plan)

Complemento de [ADR-001](./ADR-001-verifactu-plan.md). **No es certificación AEAT.**

| Req. | Descripción | Componente (futuro) | Prueba |
|------|-------------|---------------------|--------|
| F1 | Emisor/receptor | `fiscal_entities` | fixtures NIF |
| F2 | Numeración | `invoice_series` | secuencia |
| F3 | Hash encadenado | `fiscal_events` | chain break |
| F4 | Conservación | backup + sellado | backup.test |
| F5 | Export oficial | `export_verifactu` | golden |
| F6 | Inmutabilidad | rectificativas | e2e |
| F7 | Auditoría | event log | query |
| F8 | UI honesta | copy disclaimer | review |

**Métrica issue #2:** 100 % de requisitos de la tabla con fila de prueba **identificada** (columnas rellenadas) antes de implementar emisión fiscal.
