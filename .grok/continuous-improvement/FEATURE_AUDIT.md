# FEATURE_AUDIT

| Funcionalidad | Última revisión | Estado | Problemas | Pruebas |
|---------------|-----------------|--------|-----------|---------|
| Login/PIN/temp PW | ciclo 0 | ok | — | auth-*.test |
| Inventario categorías | ciclo 0 | ok | — | manual |
| Import CSV productos | ciclo 4 | ok | — | product-csv.test |
| TPV SKU Enter | ciclo 0 | ok | — | quick-add.test |
| TPV descuento línea/% carrito | ciclo 1–6 | ok | — | sale-discount + cart-discount |
| Anulación + devolución parcial | ciclo 8 | ok | Tauri return pendiente | partial-return* |
| **Caja cierre + arqueo** | **ciclo 9** | **ok** | — | daily-close + cash-reconcile + caja-ui |
| CSV ventas/IVA | ciclo 0 | ok | — | csv.test |
| Multi-empresa | ciclo 7 | ok slice | settings mono | company-isolation |
| Ajustes UI | ciclo 5 + reorg | ok | — | ajustes-layout |
| Clientes | ciclo 0 | basico | sin historial compras | — |
| **Shell sesión / nav ES** | **ciclo 10** | **ok** | onboarding aún no | session-ui.test |
