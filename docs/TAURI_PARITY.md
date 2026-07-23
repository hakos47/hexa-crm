# Paridad de comandos Tauri y RPC

La aplicación web llama a `/api/rpc`; la aplicación desktop usa `invoke`. Ambos
backends deben conservar las mismas reglas de negocio, importes en céntimos y
mensajes de error en español.

| Operación | Web/RPC | Tauri/SQLite | Regla comprobada |
|---|---|---|---|
| Crear venta | `create_sale` | `create_sale` | stock, IVA y caja |
| Anular venta | `cancel_sale` | `cancel_sale` | solo unidades pendientes tras una devolución |
| Devolver líneas | `return_sale_lines` | `return_sale_lines` | stock, caja, `returned_qty`, `refunded_cents` |
| Historial | `list_sales` / `get_sale` | `list_sales` / `get_sale` | estado y importes devueltos visibles |

## Devoluciones parciales

SQLite migra automáticamente `sales.refunded_cents` y
`sale_lines.returned_qty`. El comando rechaza líneas ajenas, cantidades no
positivas, duplicadas y superiores a las unidades pendientes. Cada devolución
crea el movimiento de stock y el gasto de caja dentro de la misma transacción.

La asignación de céntimos mantiene el redondeo: el último artículo devuelto de
una línea recibe el resto, de modo que la devolución completa coincide siempre
con el total original de la línea.
