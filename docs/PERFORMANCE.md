# Rendimiento local-first

## Línea base #20 — 2026-07-22

Build de producción con Vite 6, sin abrir el asistente IA:

| Artefacto | Antes | Después | Resultado |
|---|---:|---:|---|
| Entrada de layout (`nodes/0`) | 89,43 kB / 29,14 kB gzip | 24,73 kB / 9,02 kB gzip | -64,70 kB / -20,12 kB gzip |
| Asistente + `marked` | incluido en entrada | chunk diferido 65,44 kB / 20,88 kB gzip | se descarga al abrir IA |

`src/routes/+layout.svelte` usa `import()` al pulsar el botón Asistente IA. Por
ello login, dashboard y TPV no cargan `AiDrawer` ni el renderizador Markdown
hasta que el usuario lo solicita.

No se han añadido dependencias de gráficos: dashboard e inventario siguen con
HTML/CSS/SVG ligero.
