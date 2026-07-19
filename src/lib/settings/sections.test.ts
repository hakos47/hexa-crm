/**
 * Unit tests for the shipped Ajustes IA catalog (mental-model categories).
 */
import { describe, expect, it } from "vitest";
import {
  AJUSTES_SECTIONS,
  DEFAULT_AJUSTES_SECTION,
  resolveActiveSection,
  sectionById,
  visibleAjustesSections,
  type AjustesSectionId,
} from "./sections";

describe("AJUSTES_SECTIONS catalog", () => {
  it("covers required mental-model categories in Spanish", () => {
    const ids = AJUSTES_SECTIONS.map((s) => s.id);
    for (const need of [
      "cuenta",
      "tienda",
      "equipo",
      "ia",
      "actualizaciones",
      "sistema",
    ] as AjustesSectionId[]) {
      expect(ids).toContain(need);
    }
    // Labels readable for humans (not stack jargon)
    expect(AJUSTES_SECTIONS.find((s) => s.id === "cuenta")?.label).toMatch(/Cuenta/i);
    expect(AJUSTES_SECTIONS.find((s) => s.id === "tienda")?.label).toMatch(/Tienda/i);
    expect(AJUSTES_SECTIONS.find((s) => s.id === "equipo")?.label).toMatch(/Equipo/i);
    expect(AJUSTES_SECTIONS.find((s) => s.id === "ia")?.label).toMatch(/IA|Asistente/i);
    expect(AJUSTES_SECTIONS.find((s) => s.id === "actualizaciones")?.label).toMatch(
      /Actualizaciones/i,
    );
    expect(AJUSTES_SECTIONS.find((s) => s.id === "sistema")?.label).toMatch(/Sistema/i);
  });

  it("orders everyday → technical → destructive (sistema last, danger marked)", () => {
    const ids = AJUSTES_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("cuenta")).toBeLessThan(ids.indexOf("tienda"));
    expect(ids.indexOf("tienda")).toBeLessThan(ids.indexOf("equipo"));
    expect(ids.indexOf("equipo")).toBeLessThan(ids.indexOf("ia"));
    expect(ids.indexOf("ia")).toBeLessThan(ids.indexOf("actualizaciones"));
    expect(ids.indexOf("actualizaciones")).toBeLessThan(ids.indexOf("sistema"));
    expect(sectionById("sistema").danger).toBe(true);
    expect(sectionById("tienda").hasSave).toBe(true);
  });

  it("hides equipo for non-admin and keeps it for admin", () => {
    const cajero = visibleAjustesSections(false).map((s) => s.id);
    const admin = visibleAjustesSections(true).map((s) => s.id);
    expect(cajero).not.toContain("equipo");
    expect(admin).toContain("equipo");
    expect(cajero).toContain("cuenta");
    expect(cajero).toContain("tienda");
  });

  it("resolveActiveSection falls back when requested is hidden or invalid", () => {
    expect(resolveActiveSection("equipo", false)).toBe(DEFAULT_AJUSTES_SECTION);
    expect(resolveActiveSection("nope", true)).toBe(DEFAULT_AJUSTES_SECTION);
    expect(resolveActiveSection("ia", true)).toBe("ia");
    expect(resolveActiveSection("equipo", true)).toBe("equipo");
  });
});
