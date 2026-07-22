# Estrategia de producto — HEXA Retail OS

Fecha: 2026-07-19 · Repo: `HEXA-NIX/hexa-crm` · Versión base: **0.2.0**

## Visión

De **CRM/TPV técnico** a:

> **HEXA Retail OS** — el asistente inteligente de tienda con **IA privada** (local-first).

No competimos en amplitud con Odoo/Holded. Competimos en:

| Diferenciador | Implicación de producto |
|---------------|-------------------------|
| Local-first | Venta sin internet; datos en el comercio |
| Privacidad | IA vía Ollama local; sin telemetría obligatoria |
| Simplicidad extrema | <15 min a primera venta; UI para cajero/dueño, no para consultor ERP |
| Experiencia agradable | Dark glass premium; menos paneles técnicos |
| Valor diario | Dashboard de mando + copiloto, no “otro listado” |

## Auditoría (síntesis del repo actual)

### Arquitectura
- **Frontend:** Svelte 5 + SvelteKit + Tailwind 4 (SPA).
- **Dual backend:** Tauri 2 + SQLite · Web `/api/rpc` + PostgreSQL · fallback `browser-store`.
- **IA:** popup `AiDrawer` + Ollama; prompt “Lucía”; aún **chat genérico**, no tools de negocio.
- **Multi-empresa:** P0 slice (SHOP/DEV); settings aún globales.
- **Fortalezas:** dinero en céntimos, IVA ES, tests de integridad (venta/cancel/dto/devolución/arqueo).
- **Deuda:** paridad Tauri incompleta en features nuevas; rutas-página monoliticas (ventas/ajustes grandes); nav con labels en inglés (“Navigation”).

### UX / UI actual
| Módulo | Estado | Gap principal |
|--------|--------|---------------|
| Dashboard | KPIs + stock bajo + últimas ventas | No es centro de mando; sin tendencias ni IA |
| TPV | Funcional (SKU, dto, % carrito, void, parcial) | Densidad alta; poca “venta express” |
| Inventario | CRUD + CSV + categorías | Sin rotación, predicción ni historia visual |
| Clientes | Ficha plana (nombre/contacto) | Sin RFM, valor, última compra |
| Caja | Movimientos + cierre + **arqueo 0.2** | OK operativo; falta ritual de turno |
| Impuestos | Libro IVA + CSV | Técnico; poco “gestor-friendly” |
| Ajustes | Nav por categorías (0.2) | Bien reorganizado; aún muchos conceptos para dueño |
| IA | Chat + TTS + fullscreen con datos | No ejecuta acciones; no briefing proactivo |
| Sesión | “Bloquear” hace logout | **Issue #9** — falta “Cerrar sesión” claro |

### Competidores (huecos explotables)

| Rival | Bien | Problema del usuario | Oportunidad HEXA |
|-------|------|----------------------|------------------|
| **Odoo** | Todo-en-uno | Curva y coste de implantación | Vertical microcomercio, 15 min |
| **Holded** | Cloud ES, facturación | Dependencia cloud y complejidad | Offline + IA local |
| **Square / Shopify POS** | TPV fluido, onboarding | Vendor lock-in, fees, datos fuera | Soberanía de datos, sin comisión venta |
| **TPV tradicionales** | Familiar en mostrador | Hardware cerrado, sin inventario real | Soft + inventario + caja + IA |

## Principios de diseño del backlog

1. **Impacto en mostrador > features de demos.**
2. **Una issue = un resultado observable** asignable a un agente.
3. **IA con tools de dominio**, no solo LLM charlatán.
4. **Carga cognitiva:** menos campos, más defaults, copy en español de tienda.
5. **No afirmar Veri\*Factu** sin arquitectura + revisión (ADR-001).

## Roadmap de épicas (orden de entrega sugerido)

```
P0  Sesión clara + Onboarding 2 min
P1  Dashboard mando · Copiloto IA · TPV express · Stock crítico
P1  CRM ficha valor · Backup recovery UX
P2  Design system light/motion · Inventario predictivo · Perf
P2  Seguridad idle/audit · Settings por empresa
P3  Polish premium · Segmentos marketing
```

Las issues de GitHub de esta oleada implementan estas épicas. Actualizar este doc al cerrar cada release.
