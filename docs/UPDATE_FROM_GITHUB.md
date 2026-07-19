# Actualizaciones desde GitHub — estado real

**Fecha:** 2026-07-19  
**Commit de referencia:** `e920294` (`feat(ajustes): comprobar y descargar actualizaciones desde GitHub`)  
**Canal:** [HEXA-NIX/hexa-crm Releases](https://github.com/HEXA-NIX/hexa-crm/releases)

## Dónde está en la UI

**Ajustes** (`src/routes/ajustes/+page.svelte`), panel **«Actualizaciones / Desde GitHub»**:

| Acción visible | Función |
|----------------|---------|
| Muestra **versión instalada** | `getAppVersion()` ← `package.json` → hoy `0.1.0` |
| **Buscar actualizaciones** | `checkGitHubUpdate()` → API `.../releases/latest` |
| **Descargar / instalar** (Tauri) o **Abrir descarga en GitHub** (web) | `applyGitHubUpdate()` → abre URL (asset o página de release) |
| **Ver releases** | Abre `https://github.com/HEXA-NIX/hexa-crm/releases` |

No hay actualización silenciosa en segundo plano ni “instalado con éxito” sin que el usuario instale el paquete.

## Pipeline observable

```
package.json version  ──compare──►  GitHub Releases latest (tag_name)
        │                                    │
        └──────── classifyUpdate() ──────────┘
                      │
         up_to_date | update_available | error
```

- **Comparación:** semver-like `major.minor.patch`, acepta prefijo `v`/`V` (`src/lib/update/version.ts`).
- **API:** `https://api.github.com/repos/HEXA-NIX/hexa-crm/releases/latest`
- **Asset preferido al aplicar:** AppImage / deb / rpm / msi / exe / dmg si existen; si no, `html_url` de la release.

## Qué hace el botón «aplicar» (honesto)

1. Solo si el estado es `update_available`.
2. Abre `download_url` o `html_url` (Tauri: plugin opener; web: pestaña nueva).
3. Mensaje: hay que **instalar y reiniciar**; la app **no** se parchea sola.

### Modo web

Aviso en el panel: se puede comprobar y abrir GitHub; **no** se instala un binario en el navegador. La ruta “directa” de empaquetado es **Tauri escritorio**.

### Escritorio (Tauri)

Mismo check; aplicar abre la descarga. **No** está integrado `tauri-plugin-updater` con firmas: no hay install in-app automático.

## Gap vs “actualizar directamente al hacer una release”

| Lo que pediste | Estado actual |
|----------------|---------------|
| Botón en el panel | **Sí** (Ajustes) |
| Ver si hay release nueva | **Sí** (si existe `/releases/latest`) |
| Un clic instala y reinicia sin salir del flujo | **Parcial:** un clic abre la descarga/release; el usuario instala el artefacto y reinicia |
| Funciona en cuanto publicáis una release | **Sí**, cuando exista al menos una **GitHub Release publicada** (no draft) con tag semver y, idealmente, assets |

### Bloqueador típico ahora

Si `GET .../releases/latest` devuelve **404** (aún no hay releases), el botón de buscar muestra **error** claro, no “al día” falso ni “actualizado”.

### Para el flujo ideal al publicar

1. Subir versión en `package.json` / `tauri.conf.json` y tag `vX.Y.Z`.
2. Crear **Release** en GitHub con assets de instalación (AppImage/deb/msi…).
3. En la app: **Buscar actualizaciones** → **Disponible** → **Descargar / instalar** → instalar archivo → reiniciar Nix-C.

### Futuro (fuera de alcance actual)

- `tauri-plugin-updater` + firmas + endpoint de update en la release para install in-app sin abrir el navegador.
- Release automática en CI al merge a `main`.

## Código de referencia

| Archivo | Rol |
|---------|-----|
| `src/lib/update/version.ts` | normalize/compare/classify |
| `src/lib/update/check.ts` | fetch GitHub + apply open URL |
| `src/lib/update/open-url.ts` | opener Tauri / `window.open` |
| `src/routes/ajustes/+page.svelte` | botones y estados |
| `src/lib/update/*.test.ts` | tests del path real |

## Tests

```bash
npm test -- --run src/lib/update/
```
