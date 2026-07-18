# Contribuir a Nix-C (hexa-crm)

Gracias por ayudar a un TPV/CRM **local-first** y open source para microcomercios.

## Antes de empezar

1. Lee [README.md](./README.md), [AGENTS.md](./AGENTS.md) y [SECURITY.md](./SECURITY.md).
2. Acepta el [Código de conducta](./CODE_OF_CONDUCT.md).
3. Abre una issue o comenta una existente antes de cambios grandes.

## Requisitos locales

- Node.js 20+
- npm
- Rust + toolchain Tauri (solo si tocas escritorio)
- Ollama opcional (asistente IA)

```bash
git clone git@github.com:HEXA-NIX/hexa-crm.git
cd hexa-crm
npm install
npm run dev      # http://localhost:1420
npm test
npm run check
npm run build
```

Demo: `admin` / `1234`, `cajero` / `0000`.

## Flujo de ramas

```
feat/* | fix/* | docs/* | chore/*
    ↓
  PR → dev   (integración; tests verdes)
    ↓
  PR → main  (solo tras review humana; preferir squash)
```

- **No** commits ni push directos a `main` (hooks + política del repo).
- Emergencia documentada: `ALLOW_MAIN_COMMIT=1` / `ALLOW_MAIN_PUSH=1` (solo mantenedores).

## Qué se espera de un PR

- [ ] Descripción clara del problema y la solución
- [ ] `npm test` y `npm run check` en verde
- [ ] Sin secretos, contraseñas reales ni datos de clientes
- [ ] UI: estados vacío/error/carga cuando toque; español en copy de usuario
- [ ] Dinero e IVA: céntimos enteros; no inventar “homologación” fiscal
- [ ] Enlace a issue si existe

Plantilla: `.github/pull_request_template.md`.

## Áreas sensibles (revisión extra)

| Área | Cuidado |
|------|---------|
| Ventas / caja / IVA | Invariantes de céntimos, stock, anulación |
| Auth / PINs | Nunca loguear credenciales |
| Fiscal / Veri*Factu | Solo docs de diseño; no claims legales |
| IA / Ollama | Contexto acotado; fallos seguros offline |

## Estilo de código

- Svelte 5 (runes), TypeScript estricto, Tailwind 4
- Tests con Vitest para lógica pura (preferido)
- Commits en español o inglés, imperativo: `feat(ventas): …`

## Licencia

Al contribuir, aceptas que tu trabajo se publique bajo la **MIT License** del repositorio ([LICENSE](./LICENSE)).

## Comunidad

- Issues: bugs y propuestas (plantillas en `.github/ISSUE_TEMPLATE/`)
- Seguridad: [SECURITY.md](./SECURITY.md) — no abras PoCs explotables en público
