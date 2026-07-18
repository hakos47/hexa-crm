# BACKLOG (priorizado)

Fórmula: prioridad = (impacto × alcance × confianza) / (esfuerzo × riesgo)  // escala 1-5

| ID | Oportunidad | I | A | C | E | R | Prio | Estado |
|----|-------------|---|---|---|---|---|------|--------|
| C1 | Descuento por línea en TPV | 4 | 4 | 5 | 2 | 2 | **20** | **SELECTED ciclo 1** |
| B2 | Devolución/anulación ticket | 5 | 3 | 4 | 4 | 3 | 5.0 | **DONE ciclo 2** (void completo; parcial pendiente) |
| B3 | Descuento % carrito global | 3 | 3 | 4 | 2 | 2 | 9.0 | pendiente |
| B4 | Import CSV productos | 3 | 3 | 4 | 3 | 2 | 6.0 | pendiente |
| B5 | Contraste a11y textos muted | 2 | 4 | 3 | 2 | 1 | 12.0 | pendiente |

**Por qué C1 gana:** backend y VAT ya soportan `discount_cents`; gap solo UI; impacto transaccional real; esfuerzo bajo; alinea con POS de mercado.
