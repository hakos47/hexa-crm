# FEATURE_AUDIT

| Funcionalidad | Última revisión | Estado | Problemas | Pruebas |
|---------------|-----------------|--------|-----------|---------|
| Login/PIN/temp PW | ciclo 0 overnight | ok | — | auth-*.test |
| Inventario categorías | ciclo 0 | ok | — | manual |
| TPV SKU Enter | ciclo 0 | ok | — | quick-add.test |
| TPV descuento línea | **ciclo 1** | **gap→fix** | UI no enviaba discount_cents | vat + create_sale test |
| CSV ventas/IVA | ciclo 0 | ok | — | csv.test |
| Cierre caja día | ciclo 0 | ok | — | daily-close.test |
| AI popup | ciclo 0 | ok | — | popup-state.test |
| Anulación ticket | **ciclo 2** | ok | void completo; sin devolución parcial | cancel-sale.test + integration |
| Devolución parcial | nunca | ausente | no implementado | — |
