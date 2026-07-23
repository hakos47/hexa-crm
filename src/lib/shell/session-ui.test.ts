/**
 * Structural: shell exposes Cerrar sesión (#9) and Spanish commerce nav (#12).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = resolve(__dirname, "../../routes/+layout.svelte");
const APP_CSS = resolve(__dirname, "../../app.css");
const SIDEBAR = resolve(__dirname, "../components/Sidebar.svelte");
const DASH = resolve(__dirname, "../../routes/+page.svelte");
const INV = resolve(__dirname, "../../routes/inventario/+page.svelte");
const CLI = resolve(__dirname, "../../routes/clientes/+page.svelte");
const CAJA = resolve(__dirname, "../../routes/caja/+page.svelte");
const VEN = resolve(__dirname, "../../routes/ventas/+page.svelte");
const ROADMAP = resolve(__dirname, "../../routes/roadmap/+page.svelte");

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

  it("resets and enforces the configured inactivity lock", () => {
    expect(layout).toContain("idleTimeoutMinutes");
    expect(layout).toContain("lockAfterIdle");
    expect(layout).toMatch(/pointerdown.*keydown.*touchstart.*scroll/s);
  });

  it("gives master profiles an explicit assigned/all-companies toggle", () => {
    expect(layout).toContain("data-master-companies-toggle");
    expect(layout).toContain("data-master-company-menu");
    expect(layout).toContain("api.listCompanies(true)");
    expect(layout).toMatch(/Todas ↓/);
    expect(layout).toContain("data-master-own-companies");
  });

  it("keeps company menus above the scrollable workspace", () => {
    const css = readFileSync(APP_CSS, "utf8");
    expect(css).toMatch(/\.app-header\s*\{[^}]*z-index:\s*100[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\.app-main\s*\{[^}]*position:\s*relative[^}]*z-index:\s*0/s);
    expect(css).toMatch(/\.app-header-master-menu\s*\{[^}]*z-index:\s*120/s);
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

  it("groups the sidebar by domain and exposes a working roadmap", () => {
    const roadmap = readFileSync(ROADMAP, "utf8");
    expect(sidebar).toContain('label: "OPERACIÓN"');
    expect(sidebar).toContain('label: "FINANZAS"');
    expect(sidebar).toContain('label: "PROYECTOS"');
    expect(sidebar).toContain('href: "/roadmap"');
    expect(roadmap).toContain("Roadmap de trabajo");
    expect(roadmap).toContain("api.listWorkItems");
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
