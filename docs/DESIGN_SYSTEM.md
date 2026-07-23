# Design system de Hexa

Hexa usa tokens de `src/app.css`, no colores de framework como fuente de verdad.

## Tema

- **Oscuro** es el valor por defecto; **claro** se activa desde Cuenta o la cabecera.
- La preferencia se guarda por dispositivo en `hexa-crm-theme-v1` y se aplica antes de hidratar para evitar parpadeo.
- Usa `var(--color-text)`, `var(--color-muted)`, `var(--color-border)` y las superficies `glass`/`panel` en componentes nuevos. Evita `slate-*` para texto o bordes funcionales.

## Movimiento y accesibilidad

- Toda transición debe ser decorativa; la operación nunca depende de ella.
- `prefers-reduced-motion: reduce` minimiza animaciones y transiciones.
- Mantén foco visible y contraste AA para texto normal: `--color-text` y `--color-muted` sobre cada superficie.

## Revisión manual

Comprueba ambos temas en Login, Dashboard, TPV e Inventario: texto principal, campos,
tablas, estados de alerta, modal y foco de teclado.
