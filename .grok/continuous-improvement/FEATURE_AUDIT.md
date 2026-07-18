# FEATURE_AUDIT

| Funcionalidad | Última revisión | Estado | Problemas | Pruebas |
|---------------|-----------------|--------|-----------|---------|
| Login/PIN/temp PW | ciclo 0 | ok | — | auth-*.test |
| Inventario categorías | ciclo 0 | ok | — | manual |
| **Import CSV productos** | **ciclo 4** | **gap→fix** | solo export ventas/IVA | product-csv.test |
| Export CSV catálogo | ciclo 4 | ok | — | product-csv round-trip |
| TPV SKU Enter | ciclo 0 | ok | — | quick-add.test |
| TPV descuento línea | ciclo 1+3 | ok | — | sale-discount + plan |
| Anulación ticket | ciclo 2 | ok | parcial pendiente | cancel-sale |
| CSV ventas/IVA | ciclo 0 | ok | — | csv.test |
| Multi-empresa | análisis docs | no impl | Company Tenant | multi-company-analysis.test |
| Ajustes UI design | **ciclo 5** | **ok** | era formulario genérico | ajustes-layout.test |
| Descuento % carrito | **ciclo 6** | **ok** | solo línea antes | cart-discount.test |
