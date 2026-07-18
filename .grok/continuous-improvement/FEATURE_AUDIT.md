# FEATURE_AUDIT

| Funcionalidad | Última revisión | Estado | Problemas | Pruebas |
|---------------|-----------------|--------|-----------|---------|
| Login/PIN/temp PW | ciclo 0 overnight | ok | — | auth-*.test |
| Inventario categorías | ciclo 0 | ok | — | manual |
| TPV SKU Enter | ciclo 0 | ok | — | quick-add.test |
| TPV descuento línea (UI) | **ciclo 1** | ok | — | browser-store.sale-discount |
| TPV descuento (Postgres RPC) | **ciclo 3** | **gap→fix** | `create_sale` ignoraba discount_cents | sale-line-plan + live RPC |
| CSV ventas/IVA | ciclo 0 | ok | — | csv.test |
| Cierre caja día | ciclo 0 | ok | — | daily-close.test |
| AI popup + think:false | post-ciclo2 hotfix | ok | qwen thinking vaciaba content | ollama-reply.test |
| Anulación ticket | **ciclo 2** | ok | void completo; sin devolución parcial | cancel-sale.test |
| Devolución parcial | nunca | ausente | no implementado | — |
| Import CSV productos | nunca | ausente | solo export | — |
