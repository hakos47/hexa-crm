# Inventario y abastecimiento — análisis de mercado y modelo objetivo

**Fecha:** 2026-07-22  
**Producto:** Hexa CRM / Nix-C  
**Ámbito:** tienda física, compraventa y catálogo híbrido (stock propio, proveedor, 3PL y dropshipping).  
**Estado:** propuesta de producto y arquitectura; no implica todavía automatizar compras ni transporte.

## Resumen ejecutivo

El inventario actual resuelve bien el catálogo y el stock agregado: `sku`, categoría, coste, precio, IVA, existencias y mínimo. Sin embargo, no puede responder preguntas operativas elementales:

- ¿a quién se compra un artículo, por qué canal y con qué condiciones?
- ¿qué proveedor es el preferido, qué coste ofrece y cuánto tarda?
- ¿el artículo está en nuestro almacén, en tienda, en tránsito, en un 3PL o lo expedirá el proveedor?
- ¿se puede vender como nuevo, reacondicionado o usado, y cuál es su estado real?
- ¿qué unidades se recibieron, se rechazaron, tienen lote/serie o están en cuarentena?

La conclusión de mercado es que estos datos **no deben vivir como columnas sueltas del producto**. Un producto puede tener varios proveedores, distintos precios y plazos, varias rutas de suministro y existencias en varios lugares. En compraventa, además, la condición y la trazabilidad suelen pertenecer a una **unidad** o a un **lote**, no al catálogo entero.

La entrega recomendada es un núcleo de abastecimiento en dos fases: primero proveedor + relación proveedor-producto + perfil de fulfillment + condición básica; después compras, recepciones y stock por ubicación/unidad. Así se cubre el negocio sin convertir la ficha rápida del TPV en un ERP complejo.

## 1. Evidencia de mercado

| Práctica observada | Qué demuestra | Decisión para Hexa |
|---|---|---|
| Shopify distingue el stock físico por ubicación y aconseja no gestionar como propio el stock de dropshipping salvo sincronización del proveedor. [Shopify: configuración de inventario](https://help.shopify.com/en/manual/products/inventory/setup/initial-inventory-setup) | «En almacén» y «lo sirve un proveedor» son estados operativos distintos. | Separar `fulfillment_mode`, `stock_ownership` y ubicación; no descontar el stock local para dropshipping. |
| Shopify modela proveedores como entidad de pedidos, con datos de contacto, divisa y condiciones de pago. [Shopify: proveedores de compra](https://help.shopify.com/en/manual/products/inventory/purchase-orders/managing-suppliers) | El proveedor se reutiliza entre artículos y pedidos; no es texto libre en cada SKU. | Tabla `suppliers` y contactos, vinculada N:M con productos. |
| Odoo permite varios proveedores por producto, cada uno con precio, cantidad mínima y plazo de entrega; usa esos datos al reponer. [Odoo: lead times](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/lead_times.html) | El coste y plazo son propios de la pareja proveedor-producto, no universales. | `supplier_products` con SKU del proveedor, coste, moneda, MOQ, múltiplo y plazo. |
| Las reglas de reposición de Odoo usan ubicación, mínimo, máximo, múltiplos y unidad de medida. [Odoo: reordering rules](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/products/reordering.html) | El mínimo actual no basta para emitir una compra acertada. | Evolucionar `min_stock` a reglas por producto-ubicación con `max_stock` y múltiplo. |
| Shopify separa origen, destino, recepción, rechazo, tránsito, transportista y ETA en transferencias. [Shopify: transferencias y recepciones](https://help.shopify.com/en/manual/products/inventory/inventory-transfers/creating-and-managing-transfers) | Una entrada debe ser un documento auditable, no un ajuste de stock con texto. | Órdenes de compra y recepciones con cantidades pedidas/aceptadas/rechazadas y coste aterrizado. |
| En dropshipping el proveedor prepara y envía al cliente, pero el comerciante mantiene la atención al cliente y seguimiento. [Shopify: dropshipping](https://help.shopify.com/en/manual/products/dropshipping) | Dropshipping es una ruta de fulfillment, no simplemente un proveedor sin stock. | Guardar canal de envío, SLA, política de devoluciones y capacidad de sincronización; crear el pedido al proveedor desde la venta en una fase posterior. |
| GS1 distingue trazabilidad por lote y por instancia/serie. [GS1 Global Traceability Standard](https://www.gs1.org/sites/default/files/docs/traceability/GS1_Global_Traceability_Standard_i2.pdf) | La condición/serie no debe colapsarse en una sola columna de catálogo si hay unidades distintas. | Añadir lotes y, para segunda mano o artículos serializados, `inventory_items` individuales. |

## 2. Realidad de Hexa CRM hoy

| Área | Estado actual | Limitación para la operación propuesta |
|---|---|---|
| Producto | `Product` contiene SKU, descripción, categoría, stock agregado, mínimo, coste y precio. | No hay proveedor, ruta de suministro, ubicación, condición ni trazabilidad. |
| Inventario UI | CRUD, CSV y sugerencia de reposición basada en stock mínimo y ventas recientes. | El CSV de “pedido proveedor” no sabe a cuál proveedor dirigirlo ni respeta MOQ/plazo. |
| Movimientos | `stock_movements` conserva delta y motivo. | No identifica origen/destino, recepción, lote, unidad ni documento de compra. |
| Backends | Tauri/SQLite y web/PostgreSQL deben mantenerse en paridad. | Todo modelo nuevo requiere migración, comandos y tests en ambos caminos. |
| Negocio | `SHOP` ya está modelado como `retail_secondhand`. | La segunda mano exige condición por unidad y adquisición trazable, no solo stock fungible. |

Evidencia en el repositorio: `src/lib/types.ts`, `src/routes/inventario/+page.svelte`, `src/lib/import/product-csv.ts`, `src-tauri/src/db.rs`, `src-tauri/src/commands/products.rs` y `src/lib/api/postgres-db.ts`.

## 3. Modelo de dominio propuesto

### 3.1 Entidades

```text
suppliers ──< supplier_contacts
     │
     └──< supplier_products >── products
                                  │
                                  ├──< replenishment_rules >── locations
                                  ├──< purchase_order_lines >── purchase_orders ── suppliers
                                  ├──< inventory_lots
                                  └──< inventory_items       (solo serie/segunda mano)

stock_movements: origen/destino, motivo y referencia al documento/lote/unidad
```

#### A. `suppliers` — la empresa proveedora

Campos obligatorios de la primera entrega:

| Grupo | Campos |
|---|---|
| Identidad | `id`, `company_id`, `name`, `legal_name`, `tax_id`, `active`, `tags` |
| Operación | `supplier_type` (`manufacturer`, `distributor`, `wholesaler`, `consignor`, `dropshipper`, `3pl`, `other`), `default_currency`, `payment_terms`, `incoterm` opcional, `notes` |
| Canal | `ordering_method` (`portal`, `email`, `phone`, `edi`, `api`, `manual`), `order_email`, `portal_url`, `account_reference` |
| Riesgo / servicio | `default_lead_time_days`, `reliability_rating` interno opcional, `return_policy_summary` |

`tax_id` y los datos comerciales son opcionales para un proveedor informal de segunda mano; no bloquear una compra legítima por no conocerlos todavía.

#### B. `supplier_contacts` — personas y vías de contacto

Un proveedor puede tener contacto comercial, pedidos, soporte, devoluciones y facturación. Debe haber varios contactos, no un único teléfono en el producto.

Campos: `supplier_id`, `name`, `role`, `email`, `phone`, `preferred_channel`, `is_primary`, `notes`.

Los contactos son datos personales cuando identifican a una persona. Se limitarán a los necesarios, con roles de acceso y sin exponerlos en la pantalla de venta. Es coherente con el principio de minimización y de protección por defecto de la [AEPD](https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/medidas-de-cumplimiento/proteccion-de-datos-por-defecto).

#### C. `supplier_products` — la relación N:M que falta

Ésta es la pieza central. Un mismo SKU de Hexa puede comprarse a más de un proveedor y cada proveedor puede ofrecer muchos productos.

| Campo | Por qué |
|---|---|
| `supplier_id`, `product_id`, `is_preferred`, `priority` | Elegir fuente principal y alternativas sin duplicar el catálogo. |
| `supplier_sku`, `supplier_product_name`, `supplier_url` | Pedir o sincronizar el artículo correcto. |
| `unit_cost_cents`, `currency`, `price_valid_from/to` | Historial y comparación comercial. |
| `min_order_qty`, `order_multiple`, `unit_of_measure` | Emitir pedidos que el proveedor acepta. |
| `lead_time_days`, `availability_mode` (`manual`, `synced`, `on_request`) | Calcular fecha y nivel de confianza. |
| `fulfillment_supported` | Indicar `own_stock`, `dropship`, `3pl`, `make_to_order`. |
| `last_verified_at`, `active` | No recomendar una tarifa o enlace obsoleto. |

El coste estándar de `products.cost_cents` puede mantenerse para margen rápido, pero debe derivar o actualizarse explícitamente desde la fuente preferida; nunca sobrescribir silenciosamente el coste histórico de una recepción.

#### D. `product_supply_profile` — de dónde se sirve una venta

No usar un booleano `is_dropshipping`. La selección debe expresar operación y propiedad:

| Campo | Valores iniciales | Efecto |
|---|---|---|
| `fulfillment_mode` | `own_stock`, `supplier_dropship`, `third_party_fulfillment`, `make_to_order`, `digital_or_service` | Determina si se reserva/descarga stock propio y quién expide. |
| `stock_ownership` | `owned`, `consignment`, `supplier_owned`, `not_applicable` | Separa disponibilidad de valoración/propiedad. |
| `inventory_tracking` | `none`, `aggregate`, `lot`, `serial` | Activa la granularidad mínima necesaria. |
| `default_location_id` | ubicación interna o 3PL | Explica dónde está lo que sí poseemos. |

Un producto puede tener una ruta preferida y alternativas, pero **cada línea de venta debe congelar la ruta seleccionada**. De otro modo una posterior edición del producto reescribiría la historia de qué proveedor entregó al cliente.

#### E. `locations` y stock por ubicación

La primera taxonomía debe ser simple: `store`, `warehouse`, `in_transit`, `quality_hold`, `returns`, `third_party`, `supplier_virtual`, `virtual`. La ubicación de proveedor sólo informa disponibilidad externa; no suma a “stock propio disponible”.

Modelo posterior: `inventory_balances(product_id, location_id, on_hand, reserved, incoming, available)` con movimientos de doble entrada origen→destino. La vista inicial puede seguir mostrando un total de “disponible propio”, pero debe poder desglosarse.

#### F. Condición, lote y unidad

| Nivel | Úsalo para | Campos mínimos |
|---|---|---|
| Producto | Política por defecto de catálogo. | `condition_scheme`, por ejemplo `new_only` o `graded_used`. |
| Lote | Muchas unidades equivalentes recibidas juntas. | `lot_code`, proveedor, fecha de recepción/caducidad opcional, condición, coste. |
| Unidad (`inventory_items`) | Segunda mano, serializados, móvil/electrónica, piezas únicas. | `id`, `product_id`, `serial_number`, `condition`, `condition_grade`, `status`, ubicación, coste de adquisición, lote/proveedor, notas y fotos futuras. |

Valores controlados iniciales: `new`, `open_box`, `refurbished_a`, `refurbished_b`, `used_a`, `used_b`, `used_c`, `for_parts`, `damaged`. `condition_notes` queda libre para defectos concretos, nunca como sustituto del valor controlado.

Para la compraventa, una unidad debe poder pasar por `received → quality_hold → available → reserved → sold → returned/quarantine`. La recepción no la pone a la venta hasta ser aceptada; esta separación evita vender una devolución o artículo pendiente de revisión.

## 4. Flujos que el modelo debe cubrir

### Reposición de almacén propio

1. La regla por producto-ubicación detecta que `available + incoming` cae bajo el mínimo.
2. Propone proveedor preferido, alternativa, MOQ/múltiplo, coste y fecha estimada.
3. El usuario crea una orden de compra en borrador; la confirma por el canal del proveedor.
4. Al recibir, registra pedido, recibido, rechazado, transporte/aduana si procede y lote/unidades.
5. Sólo las unidades aceptadas entran en `available`; el coste aterrizado queda auditable.

### Dropshipping

1. El producto se marca `supplier_dropship` y se liga a una fuente que soporta esa ruta.
2. La venta no disminuye stock propio. Crea una solicitud al proveedor, manual o integrada en una fase posterior.
3. Se guarda proveedor, referencia externa, coste comprometido, estado y tracking por línea de venta.
4. La atención al cliente y la devolución siguen en Hexa aunque expida el proveedor.

### Compraventa / segunda mano

1. Registrar la adquisición con fuente (`supplier` o proveedor particular/consignador), coste y prueba/documento asociado cuando proceda.
2. Crear unidad individual o lote; dejarla en `quality_hold`.
3. Inspeccionar condición, serie/IMEI si aplica, accesorios y garantía; publicar sólo si queda `available`.
4. Vender, devolver o poner en cuarentena conservando el historial exacto de la unidad.

## 5. Prioridad de implementación

### P0 — útil para comprar y saber qué se vende

- `suppliers`, contactos y CRUD de proveedor en Inventario.
- `supplier_products` con proveedor preferido, SKU proveedor, coste, MOQ, múltiplo, plazo y enlace/canal.
- `fulfillment_mode` y `stock_ownership` por producto: propio, dropship, 3PL, bajo pedido, servicio/digital.
- Condición de catálogo (`new`, usado/reacondicionado) y texto de estado comercial visible.
- Filtros y columnas: proveedor preferido, abastecimiento, condición y estado de stock.
- CSV de catálogo con esos campos; export de reposición agrupado por proveedor, mostrando mínimo, múltiplo y datos de contacto.
- Migraciones y API equivalentes para browser-store, PostgreSQL y Tauri/SQLite.

**No entra en P0:** restar stock de proveedor, automatizar envío de órdenes, guardar credenciales de portales, ni afirmar disponibilidad sincronizada sin integración real.

### P1 — compra y recepción fiables

- Ubicaciones propias y stock por ubicación.
- Órdenes de compra y recepción parcial/aceptada/rechazada.
- Reglas mínimo–máximo por ubicación, stock entrante, coste aterrizado y alertas de pedido tardío.
- Historial de precios, plazos y rendimiento del proveedor.
- Reserva de stock y fulfillment seleccionado por línea de venta.

### P2 — operaciones avanzadas

- Lotes, seriales e inventario por unidad para segunda mano; cuarentena, pruebas y fotos.
- Consignación y liquidaciones al consignador.
- Integración de disponibilidad/tracking de dropship o 3PL, con marca de “última sincronización”.
- Reglas automáticas de compra sólo con confirmación humana y límites configurables.

## 6. UX: completa sin saturar el TPV

La ficha de producto se divide en pestañas, con el formulario rápido conservando sólo lo necesario para venta:

| Pestaña | Contenido |
|---|---|
| General | SKU, nombre, categoría, precio, IVA, activo. |
| Stock | Seguimiento, mínimo/máximo, ubicación, disponible/reservado/entrante. |
| Abastecimiento | Proveedor preferido, alternativos, coste, MOQ, múltiplo, plazo, botón “crear pedido”. |
| Cumplimiento | Propio, dropship, 3PL, bajo pedido; propiedad del stock. |
| Estado | Nuevo/usado/reacondicionado y política de inspección. |
| Historial | Movimientos, recepciones, compras, cambios de coste y —si aplica— unidades/lotes. |

El cajero ve disponibilidad, condición y ubicación de recogida; los contactos y costes sólo los ven perfiles de compra/admin. La pantalla de venta nunca debe mostrar datos de contacto de proveedores.

## 7. Criterios de aceptación para el primer incremento

1. Un proveedor tiene varios contactos y se puede marcar el canal de pedido preferido.
2. Un producto puede tener dos proveedores con SKU, coste, plazo y MOQ diferentes; uno es preferido.
3. La sugerencia de reposición se agrupa por proveedor y redondea a MOQ/múltiplo sin mezclar empresas.
4. Un producto `supplier_dropship` no se vende como stock de almacén propio ni rebaja ese stock.
5. La ficha permite filtrar nuevo/usado/reacondicionado y mostrar la condición de forma inequívoca.
6. El CSV importa/exporta los datos P0 sin perderlos; errores señalan fila y columna.
7. Las mismas operaciones pasan por Tauri/SQLite, web/PostgreSQL y browser-store, con tests de no fuga por `company_id`.
8. Los contactos quedan restringidos a compra/admin y las notas no se indexan ni envían a IA por defecto.

## 8. Decisiones para no cometer errores de diseño

- **No guardar `supplier_name` directamente en `products`.** Rompe multi-proveedor, tarifas y trazabilidad.
- **No llamar “stock” a la disponibilidad del dropshipper.** Es una promesa externa con fecha de verificación, no inventario propio.
- **No usar `used: boolean`.** No distingue abierto, reacondicionado, grados de desgaste, defectuoso o para piezas.
- **No usar condición sólo a nivel de producto en compraventa.** Dos unidades del mismo modelo pueden tener distinto estado y coste.
- **No descontar una recepción con un ajuste genérico.** Debe quedar ligada a proveedor, pedido, aceptación/rechazo y ubicación.
- **No exponer datos de contacto o precios de proveedor al cajero ni a la IA por defecto.** Son datos operativos sensibles y, si identifican personas, datos personales.

## 9. Próximo incremento recomendado

Implementar P0 como una épica “Abastecimiento y condición de inventario”, en esta secuencia:

```text
1. Tipos y migraciones: suppliers, contacts, supplier_products, supply profile.
2. API dual + browser-store, con aislamiento por company_id.
3. Formulario de proveedores y pestaña Abastecimiento/Estado de producto.
4. CSV de producto y reposición agrupada por proveedor/MOQ.
5. Tests unitarios, API y flujo UI; build de Svelte + pruebas Rust/Tauri.
```

La separación de ubicaciones, compras y unidades individuales queda diseñada desde ahora para que P0 no cree una deuda de modelo, pero se entrega en P1/P2 para mantener la primera experiencia rápida de tienda.
