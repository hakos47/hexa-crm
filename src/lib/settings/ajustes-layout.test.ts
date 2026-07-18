/**
 * Structural regression: Ajustes page must use design-system markers
 * (section-label, status strip, sticky-style header actions) — ciclo 5.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = resolve(__dirname, "../../routes/ajustes/+page.svelte");

describe("ajustes layout design system", () => {
  const src = readFileSync(PAGE, "utf8");

  it("uses section-label headers (not bare form stack only)", () => {
    expect(src).toMatch(/section-label/);
    expect((src.match(/section-label/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps primary save action near page header", () => {
    expect(src).toMatch(/Guardar ajustes/);
    const headerIdx = src.indexOf("Configuración");
    const saveIdx = src.indexOf("Guardar ajustes");
    expect(headerIdx).toBeGreaterThan(0);
    expect(saveIdx).toBeGreaterThan(headerIdx);
    // save should appear early (header), not only at bottom
    expect(saveIdx - headerIdx).toBeLessThan(800);
  });

  it("styles Ollama model chips with selected state", () => {
    expect(src).toMatch(/ollama_model ===/);
    expect(src).toMatch(/rounded-full/);
    expect(src).toMatch(/glow-purple|border-purple/);
  });

  it("preserves core business actions", () => {
    for (const needle of [
      "changeOwnPin",
      "updateSettings",
      "upsertUser",
      "exportBackup",
      "resetDemo",
      "ollamaHealth",
    ]) {
      expect(src).toContain(needle);
    }
  });
});
