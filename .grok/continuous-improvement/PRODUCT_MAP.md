# PRODUCT_MAP — Nix-C

## Usuarios
- Dueño/admin de tienda física (ES): inventario, IVA, caja, usuarios
- Cajero: TPV, clientes, stock básico

## Jobs-to-be-done
1. Cobrar rápido con stock correcto e IVA (incl. descuentos)
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
| Ventas | /ventas | TPV + dto. línea + historial + void + CSV |
| Caja | /caja | movimientos + cierre día |
| Clientes | /clientes | CRM ligero |
| Impuestos | /impuestos | libro IVA + CSV |
| Ajustes | /ajustes | tienda, Ollama, users |
| IA | popup | Ollama local (`think:false`) |

## Stack (fuente de verdad en repo)
- UI: Svelte 5 + SvelteKit + Tailwind 4
- Desktop: Tauri 2 + SQLite (commands Rust)
- Web dev: `/api/rpc` → PostgreSQL (`postgres` package) + Ollama
- No migrar a Cloudflare sin autorización

## Métricas candidatas
- Total ticket = Σ (PVP×qty − dto) con IVA coherente
- Caja income = total neto de venta
- Cobertura tests pure logic (VAT, cancel, discount)

## Multi-empresa (análisis, no implementado)
Hoy: **single-shop** (`shop_name`, un pipeline ventas/caja/IVA).  
Objetivo grupo: estudio de software (**DEV**) + compraventa (**SHOP**) con facturación separada en un solo sistema.  
Ver: `docs/MULTI_COMPANY_ANALYSIS.md` (Company Tenant) + `docs/ADR-001-verifactu-plan.md`.
