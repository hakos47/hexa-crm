/**
 * Structural: Ajustes exposes GitHub update controls + honest web fallback.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = resolve(__dirname, "../../routes/ajustes/+page.svelte");
const CHECK = resolve(__dirname, "check.ts");
const VERSION = resolve(__dirname, "version.ts");

describe("update-from-github UI structure", () => {
  const page = readFileSync(PAGE, "utf8");
  const check = readFileSync(CHECK, "utf8");
  const version = readFileSync(VERSION, "utf8");

  it("binds check + apply to shipped helpers", () => {
    expect(page).toContain("checkGitHubUpdate");
    expect(page).toContain("applyGitHubUpdate");
    expect(page).toContain("getAppVersion");
    expect(page).toMatch(/Buscar actualizaciones/);
    expect(page).toMatch(/Descargar|Abrir descarga/);
    expect(page).toContain("data-update-panel");
    expect(page).toContain("data-app-version");
  });

  it("references GitHub releases channel", () => {
    expect(page).toMatch(/HEXA-NIX\/hexa-crm|GitHub/);
    expect(version).toContain("HEXA-NIX/hexa-crm");
    expect(version).toContain("api.github.com/repos");
    expect(check).toContain("DEFAULT_RELEASES_API");
  });

  it("does not claim silent install success", () => {
    expect(check).toMatch(/opened_url/);
    expect(check).not.toMatch(/updated successfully|instalado con éxito/i);
    expect(page).toMatch(/no se actualiza sola|no.*binario en el navegador|escritorio \(Tauri\)|app de\s+escritorio/i);
  });

  it("web fallback copy present when not Tauri", () => {
    expect(page).toContain("data-update-web-fallback");
    expect(page).toMatch(/Modo web/);
  });
});
