# BACKLOG (priorizado)

Fórmula: prioridad = (impacto × alcance × confianza) / (esfuerzo × riesgo)  // escala 1-5

| ID | Oportunidad | I | A | C | E | R | Prio | Estado |
|----|-------------|---|---|---|---|---|------|--------|
| C1 | Descuento por línea en TPV | 4 | 4 | 5 | 2 | 2 | **20** | **DONE ciclo 1** (UI) |
| C3 | Integridad dto. en path Postgres | 5 | 4 | 5 | 2 | 2 | **25** | **DONE ciclo 3** |
| B2 | Devolución/anulación ticket | 5 | 3 | 4 | 4 | 3 | 5.0 | **DONE ciclo 2** (void completo; parcial pendiente) |
| B3 | Descuento % carrito global | 3 | 3 | 4 | 2 | 2 | 9.0 | pendiente |
| B4 | Import CSV productos | 3 | 3 | 4 | 3 | 2 | 6.0 | pendiente |
| B5 | Contraste a11y textos muted | 2 | 4 | 3 | 2 | 1 | 12.0 | pendiente |

**Ciclo 3 ganó por filtro de integridad:** path web `/api/rpc` + Postgres ignoraba `discount_cents` → caja/IVA/total incorrectos pese a UI correcta.
