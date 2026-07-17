# PRODUCT_MAP — Nix-C

## Usuarios
- Dueño/admin de tienda física (ES): inventario, IVA, caja, usuarios
- Cajero: TPV, clientes, stock básico

## Jobs-to-be-done
1. Cobrar rápido con stock correcto e IVA
2. Controlar caja del día
3. Exportar datos para contable
4. Reponer stock bajo mínimo
5. Gestionar acceso con credenciales temporales

## Módulos
| Módulo | Ruta | Estado |
|--------|------|--------|
| Auth | login / force PW | estable |
| Dashboard | / | KPIs + stock bajo |
| Inventario | /inventario | categorías + stock |
| Ventas | /ventas | TPV + historial + CSV |
| Caja | /caja | movimientos + cierre día |
| Clientes | /clientes | CRM ligero |
| Impuestos | /impuestos | libro IVA + CSV |
| Ajustes | /ajustes | tienda, Ollama, users |
| IA | popup | Ollama local |

## Stack (fuente de verdad)
Svelte 5 + SvelteKit static + Tailwind 4 + Tauri 2 + SQLite + Ollama (no Cloudflare).

## Métricas candidatas
- Pasos para aplicar descuento en venta
- Tiempo hasta ticket con SKU Enter
- Cobertura tests pure logic
