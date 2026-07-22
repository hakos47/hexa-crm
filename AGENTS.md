# AGENTS.md — hexa-crm

Instrucciones **persistentes** para cualquier agente o desarrollador en este repo.  
Remoto: `git@github.com:HEXA-NIX/hexa-crm.git` · Producto: **hexa-crm** (CRM de tienda local).

---

## Estructura de ramas (obligatoria)

Modelo: **trunk-based + canales por tags/CI** (no ramas eternas tipo nightly/prod).

### Larga vida

| Rama | Rol |
|------|-----|
| **`main`** | Producción / release. Solo avanza cuando el **humano** decide mergear desde `dev` (o un release). Protegida: no commits/push directos. |
| **`dev`** | Integración del equipo de desarrollo (director de dev). Aquí aterrizan los `feat/*` ya testeados. Listo para review humana → `main`. |

**No crear** por defecto: `nightly`, `staging`, `prod` como ramas eternas adicionales.

### Flujo de entrega (director de dev → humano)

```
feat/*  →  PR/merge a dev  →  tests+build verdes  →  [humano] decide merge dev → main
```

El director de dev puede mergear a **`dev`** y pushear `origin/dev`.  
**No** mergear a `main` sin autorización explícita del responsable del producto.

### Corta vida (siempre desde `main`)

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| `feat/` | Features | `feat/ai-popup` |
| `fix/` | Bugs | `fix/vat-rounding` |
| `chore/` | Tooling, CI, deps | `chore/nightly-workflow` |
| `docs/` | Documentación | `docs/agents-branching` |
| `release/x.y` | Solo al congelar una versión | `release/0.2` (corta vida) |
| `hotfix/x.y.z` | Parche urgente sobre release | `hotfix/0.2.1` |

### Flujo

1. `git checkout main && git pull`
2. `git checkout -b feat/mi-cambio`
3. PR → `main` (preferir **squash merge**)
4. CI debe pasar (test + build) antes de merge
5. **No force-push** a `main`

### Releases y documentación de cambios (obligatorio)

Desde **0.2.0**, **todo cambio que vaya a una release debe documentarse**:

| Artefacto | Uso |
|-----------|-----|
| [`CHANGELOG.md`](./CHANGELOG.md) | Historial Keep a Changelog; sección `[Unreleased]` al cerrar cada feature |
| [`docs/RELEASES.md`](./docs/RELEASES.md) | Checklist de versión, tag, GitHub Release y deploy Incus |
| `package.json` / Tauri / Cargo `version` | Siempre alineados entre sí |

No publicar tag/Release sin entrada de CHANGELOG para esa versión.  
Despliegue Incus (`voura:nix-c-web` / `nix-c-srv`): ver `docs/RELEASES.md`.

### Canales de entrega (≠ ramas eternas)

| Canal | Origen | Cómo |
|-------|--------|------|
| **nightly** | Último `main` verde | CI cron; Release GitHub `prerelease` o artefacto “nightly” (evitar miles de tags) |
| **beta / rc** | Tag pre-release | `v0.2.0-beta.1`, `v0.2.0-rc.1` |
| **stable** | Tag semver | `v0.2.0` |

Tags:

```
vMAJOR.MINOR.PATCH
vMAJOR.MINOR.PATCH-beta.N
vMAJOR.MINOR.PATCH-rc.N
```

Al estabilizar sin parar `main`:

```
main → branch release/X.Y → solo fixes → tag vX.Y.Z → merge back a main
```

### Protección de `main` (local + GitHub)

**Hooks versionados** (en el repo):

| Hook | Efecto |
|------|--------|
| `.githooks/pre-commit` | Bloquea **commits** si la rama actual es `main`/`master` |
| `.githooks/pre-push` | Bloquea **push** a `refs/heads/main` o `master` |

Activación (automática con `npm install` vía `prepare`, o manual):

```bash
npm run hooks:install
# o: bash scripts/install-git-hooks.sh
```

Ejecuta `git config core.hooksPath .githooks`.

Excepciones de emergencia:

```bash
ALLOW_MAIN_COMMIT=1 git commit ...
ALLOW_MAIN_PUSH=1 git push origin main
```

**GitHub Branch protection** (Settings → Branches → regla para `main`) — el hook local no basta en el servidor:

- Require a pull request before merging
- Require status checks: `test`, `build` (cuando existan workflows)
- Do not allow force pushes / deletions
- Prefer squash merge / linear history

---


## Estructura de carpetas del proyecto

```
hexa-crm/
├── AGENTS.md                 # Este archivo (convenciones para agentes)
├── README.md                 # Documentación de usuario/dev
├── package.json              # Scripts: dev, build, test, tauri
├── vite.config.js
├── svelte.config.js
├── tsconfig.json
├── .gitignore
│
├── src/                      # Frontend SvelteKit (SPA static)
│   ├── app.css               # Design system (obsidian + morado radiante)
│   ├── app.html
│   ├── app.d.ts
│   ├── lib/
│   │   ├── ai/               # Estado popup IA (compact/fullscreen)
│   │   ├── api/              # client.ts, browser-store, guards, auth tests
│   │   ├── auth/             # PIN/password policy + hash
│   │   ├── components/       # UI: Logo, Select, AiDrawer, Login, etc.
│   │   ├── stores/           # session, ui
│   │   ├── money.ts
│   │   ├── vat.ts
│   │   └── types.ts
│   └── routes/               # Páginas (App Router SvelteKit)
│       ├── +layout.svelte    # Shell + auth gate + AI popup host
│       ├── +page.svelte      # Dashboard
│       ├── inventario/
│       ├── ventas/
│       ├── caja/
│       ├── clientes/
│       ├── impuestos/
│       └── ajustes/
│
├── static/                   # Assets estáticos (logo, favicon)
│   ├── favicon.svg
│   ├── logo.svg
│   ├── logo-mark.svg
│   └── logo-mark.png
│
├── src-tauri/                # Backend desktop Tauri 2 + SQLite
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── db.rs
│       ├── models.rs
│       └── commands/         # auth, products, sales, cash, ai, …
│
├── build/                    # Output SvelteKit (gitignored)
├── node_modules/             # gitignored
└── src-tauri/target/         # gitignored
```

### Dónde va cada tipo de cambio

| Cambio | Ubicación |
|--------|-----------|
| UI / rutas / componentes | `src/routes/`, `src/lib/components/` |
| Lógica de negocio TS (IVA, auth policy, money) | `src/lib/` (+ tests `*.test.ts`) |
| Persistencia browser / API dual | `src/lib/api/` |
| Comandos nativos SQLite / Ollama | `src-tauri/src/commands/` |
| Schema SQLite / migraciones | `src-tauri/src/db.rs` |
| Tema visual / tokens | `src/app.css` |
| Branding | `static/` |
| CI nightlies / releases | `.github/workflows/` (cuando exista) |

### Convenciones de código del producto

- **Idioma UI:** español (ES)
- **Auth:** sesión con token; usuarios nuevos → password temporal 14 chars, cambio forzado &lt; 24 h
- **IA:** popup inferior derecha (`AiDrawer` + `src/lib/ai/popup-state.ts`), no drawer a pantalla completa por defecto
- **Selects:** componente custom `Select.svelte` (no nativos del SO)
- **Importes:** céntimos enteros; IVA ES 0/4/10/21; PVP con IVA incluido
- **Tests:** Vitest en `src/**/*.test.ts`; no mockear la unidad bajo test
- **Commits:** mensajes en oraciones completas; PRs a `main`

### Qué no versionar

Ver `.gitignore`: `node_modules/`, `build/`, `.svelte-kit/`, `src-tauri/target/`, `.env*`, `*.db`

---

## Comandos habituales

```bash
npm install
npm run dev          # http://localhost:1420
npm run test
npm run build
npm run tauri:dev    # app nativa
```

Demo seed (browser/Tauri): `admin` / `1234` · `cajero` / `0000`

---

*Última actualización de convenciones de ramas/carpetas: 2026-07-18. Mantener este archivo al cambiar la topología del repo.*
