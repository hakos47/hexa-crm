# Protección de `main` y CI (issue #1)

## Estado en el repositorio

| Control | Ubicación | Efecto |
|---------|-----------|--------|
| Hook pre-commit | `.githooks/pre-commit` | Bloquea commits locales en `main`/`master` |
| Hook pre-push | `.githooks/pre-push` | Bloquea push local a `main`/`master` |
| Activación hooks | `npm run prepare` / `scripts/install-git-hooks.sh` | `core.hooksPath=.githooks` |
| Workflow CI | `.github/workflows/ci.yml` | Job **`quality`**: `npm ci` → `check` → `test` → `build` |
| Preferencia squash | Settings del repo + este doc | Squash merge recomendado |

Los hooks **no** protegen el remoto. Hace falta un **ruleset** o branch protection en GitHub.

## Ruleset requerido (GitHub — org admin)

Quien tenga permisos **admin** en `HEXA-NIX/hexa-crm` debe configurar:

1. **Settings → Rules → Rulesets → editar `main-gpt`**
2. **Target branches:** rama por defecto (`~DEFAULT_BRANCH`, que resuelve a `main`); nunca un include vacío.
3. **Rules:**
   - Restrict deletions
   - Block force pushes (`non_fast_forward`)
   - Restrict updates (solo vía PR)
   - Require a pull request before merging
     - Required approvals: ≥ 1
     - Allowed merge methods: **squash**
   - Require status checks to pass
     - Required check: **`quality`**
     - Require branches to be up to date before merging: **on**
4. **Enforcement:** Active

### Verificación (criterios de aceptación)

```text
[ ] Push directo a main → rechazado por GitHub
[ ] PR con quality failed → no se puede fusionar
[ ] PR con quality success + aprobación → squash merge OK
[ ] Este documento + ruleset con include ~DEFAULT_BRANCH
```

### Comprobación vía API (admin)

```bash
gh api repos/HEXA-NIX/hexa-crm/rulesets
gh api repos/HEXA-NIX/hexa-crm/branches/main --jq .protected
# Esperado: protected=true y ruleset con include ["~DEFAULT_BRANCH"]
```

El ruleset se gestiona como configuración de repositorio y debe mantenerse activo con el
check exacto `quality` de `.github/workflows/ci.yml`.

## Flujo de entrega

```
feat/*  → PR a main → quality verde + review humana → squash merge
```

Ver también `AGENTS.md`.
