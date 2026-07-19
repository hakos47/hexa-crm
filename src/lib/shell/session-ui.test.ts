/**
 * Structural: shell exposes Cerrar sesión (#9) and Spanish commerce nav (#12).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = resolve(__dirname, "../../routes/+layout.svelte");
const SIDEBAR = resolve(__dirname, "../components/Sidebar.svelte");
const DASH = resolve(__dirname, "../../routes/+page.svelte");
const INV = resolve(__dirname, "../../routes/inventario/+page.svelte");
const CLI = resolve(__dirname, "../../routes/clientes/+page.svelte");
const CAJA = resolve(__dirname, "../../routes/caja/+page.svelte");
const VEN = resolve(__dirname, "../../routes/ventas/+page.svelte");

describe("session logout UI (#9)", () => {
  const layout = readFileSync(LAYOUT, "utf8");
  const sidebar = readFileSync(SIDEBAR, "utf8");

  it("labels Cerrar sesión and wires logout + clearSession", () => {
    expect(layout).toMatch(/Cerrar sesión/);
    expect(layout).toContain("closeSession");
    expect(layout).toContain("api.logout");
    expect(layout).toContain("clearSession");
    expect(layout).toContain("data-logout");
    expect(layout).not.toMatch(/>\s*Bloquear\s*</);
    expect(sidebar).toMatch(/Cerrar sesión/);
    expect(sidebar).toContain("data-logout");
    expect(sidebar).toContain("onLogout");
  });
});

describe("shell Spanish commerce copy (#12)", () => {
  const sidebar = readFileSync(SIDEBAR, "utf8");
  const dash = readFileSync(DASH, "utf8");

  it("uses Spanish nav labels, not English Navigation/Quick actions", () => {
    expect(sidebar).toContain("Navegación");
    expect(sidebar).toContain("Accesos rápidos");
    expect(sidebar).not.toMatch(/>Navigation</);
    expect(sidebar).not.toMatch(/>Quick actions</);
    expect(dash).toContain("Resumen");
    expect(dash).not.toMatch(/>Overview</);
  });

  it("quick actions deep-link to create flows (?nuevo=1)", () => {
    expect(sidebar).toContain("/inventario?nuevo=1");
    expect(sidebar).toContain("/clientes?nuevo=1");
    expect(sidebar).toContain("/caja?nuevo=1");
    expect(sidebar).toContain("/ventas?nuevo=1");
    expect(dash).toMatch(/inventario\?nuevo=1|caja\?nuevo=1|ventas\?nuevo=1/);
  });
});

describe("create-flow query handlers", () => {
  it("inventario/clientes/caja/ventas open create on ?nuevo=1", () => {
    for (const [name, src] of [
      ["inv", readFileSync(INV, "utf8")],
      ["cli", readFileSync(CLI, "utf8")],
      ["caja", readFileSync(CAJA, "utf8")],
      ["ven", readFileSync(VEN, "utf8")],
    ] as const) {
      expect(src, name).toMatch(/searchParams\.get\(["']nuevo["']\)/);
    }
  });
});
