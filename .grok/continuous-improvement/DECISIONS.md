# DECISIONS

| Fecha | Decisión | Alternativas | Motivo |
|-------|----------|--------------|--------|
| 2026-07-18 | Stack Tauri+Svelte es fuente de verdad; no migrar a Cloudflare en este ciclo | Workers/D1 | Sin autorización; AGENTS.md local-first |
| 2026-07-18 C1 | Descuento manual en **euros por línea** (no % carrito) | Solo % global | Backend ya tiene discount_cents por línea; mínimo viable |
| 2026-07-18 | No push a main en ciclo CI; rama `feat/ci-cycle-1` | Merge automático | Prompt prohíbe push sin autorización explícita |
