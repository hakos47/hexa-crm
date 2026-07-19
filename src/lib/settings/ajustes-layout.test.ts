/**
 * Structural regression: Ajustes uses category navigation (progressive disclosure),
 * not a single wall of all panels. Business actions remain wired.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AJUSTES_SECTIONS,
  visibleAjustesSections,
} from "./sections";

const PAGE = resolve(__dirname, "../../routes/ajustes/+page.svelte");

describe("ajustes layout — category navigation", () => {
  const src = readFileSync(PAGE, "utf8");

  it("imports and uses the shipped sections catalog", () => {
    expect(src).toMatch(/\$lib\/settings\/sections/);
    expect(src).toContain("visibleAjustesSections");
    expect(src).toContain("resolveActiveSection");
    expect(src).toContain("data-ajustes-nav");
    expect(src).toContain("data-ajustes-panel");
    expect(src).toContain("data-ajustes-shell");
  });

  it("exposes one active panel at a time (not all sections stacked)", () => {
    // Conditional branches per section — not a flat monoblock of every Card at once
    expect(src).toMatch(/activeSection === ["']cuenta["']/);
    expect(src).toMatch(/activeSection === ["']tienda["']/);
    expect(src).toMatch(/activeSection === ["']ia["']/);
    expect(src).toMatch(/activeSection === ["']actualizaciones["']/);
    expect(src).toMatch(/activeSection === ["']sistema["']/);
    expect(src).toMatch(/activeSection === ["']equipo["']/);
    // Must not render every major panel without section gate (legacy monoblock)
    // Count exclusive {:else if activeSection} chain length
    const branches = (src.match(/activeSection === "/g) || []).length;
    expect(branches).toBeGreaterThanOrEqual(5);
  });

  it("nav labels match mental-model catalog (ES)", () => {
    for (const sec of AJUSTES_SECTIONS) {
      expect(src).toContain(`data-ajustes-nav-item={sec.id}`);
    }
    // Labels come from catalog; page iterates navSections
    expect(src).toMatch(/sec\.label/);
    // Catalog itself has Spanish labels
    for (const label of ["Cuenta", "Tienda", "Equipo", "Asistente IA", "Actualizaciones", "Sistema"]) {
      expect(AJUSTES_SECTIONS.some((s) => s.label === label)).toBe(true);
    }
  });

  it("separates danger zone from everyday save", () => {
    expect(src).toContain("data-ajustes-danger-zone");
    expect(src).toMatch(/Zona de peligro/);
    expect(src).toContain("resetDemo");
    // Save lives in tienda/ia context
    expect(src).toMatch(/Guardar ajustes/);
    expect(src).toContain("data-ajustes-save");
  });

  it("keeps section-label design markers in panels", () => {
    expect(src).toMatch(/section-label/);
    expect((src.match(/section-label/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("styles Ollama model chips with selected state", () => {
    expect(src).toMatch(/ollama_model ===/);
    expect(src).toMatch(/rounded-full/);
    expect(src).toMatch(/glow-purple|border-purple/);
  });

  it("preserves core business actions (same API entry points)", () => {
    for (const needle of [
      "changeOwnPin",
      "updateSettings",
      "upsertUser",
      "exportBackup",
      "resetDemo",
      "ollamaHealth",
      "checkGitHubUpdate",
      "applyGitHubUpdate",
    ]) {
      expect(src).toContain(needle);
    }
  });

  it("admin-only equipo matches catalog filter", () => {
    expect(visibleAjustesSections(false).some((s) => s.id === "equipo")).toBe(false);
    expect(visibleAjustesSections(true).some((s) => s.id === "equipo")).toBe(true);
    expect(src).toMatch(/activeSection === ["']equipo["'] && \$isAdmin/);
  });
});
