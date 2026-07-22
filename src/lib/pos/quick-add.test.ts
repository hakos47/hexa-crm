import { describe, expect, it } from "vitest";
import { resolveQuickAdd } from "./quick-add";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const catalog = [
  { id: 1, sku: "CAF-001", name: "Café", stock: 10, active: true },
  { id: 2, sku: "TEC-110", name: "Auriculares", stock: 5, active: true },
  { id: 3, sku: "OUT", name: "Agotado", stock: 0, active: true },
  { id: 4, sku: "OLD", name: "Inactivo", stock: 9, active: false },
];

describe("resolveQuickAdd", () => {
  it("matches exact SKU case-insensitively", () => {
    const r = resolveQuickAdd("caf-001", catalog);
    expect(r.kind).toBe("exact_sku");
    if (r.kind === "exact_sku") expect(r.product.id).toBe(1);
  });

  it("returns sole name match", () => {
    const r = resolveQuickAdd("Auri", catalog);
    expect(r.kind).toBe("sole_match");
    if (r.kind === "sole_match") expect(r.product.sku).toBe("TEC-110");
  });

  it("returns none for empty or no match", () => {
    expect(resolveQuickAdd("", catalog).kind).toBe("none");
    expect(resolveQuickAdd("xyz", catalog).kind).toBe("none");
  });

  it("skips zero stock and inactive", () => {
    expect(resolveQuickAdd("OUT", catalog).kind).toBe("none");
    expect(resolveQuickAdd("OLD", catalog).kind).toBe("none");
  });
});

describe("TPV express UI (#15)", () => {
  const source = readFileSync(resolve(__dirname, "../../routes/ventas/+page.svelte"), "utf8");

  it("ships persisted favorites and F2/Escape shortcuts", () => {
    expect(source).toContain("hexa-crm-pos-favorites-v1");
    expect(source).toContain("data-pos-favorites");
    expect(source).toMatch(/event\.key === "F2"/);
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toContain("min-h-11");
  });
});
