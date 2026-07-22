/**
 * Structural: historial exposes partial return controls wired to API.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = resolve(__dirname, "../../routes/ventas/+page.svelte");

describe("partial return UI structure", () => {
  const src = readFileSync(PAGE, "utf8");

  it("wires returnSaleLines and return qty controls", () => {
    expect(src).toContain("returnSaleLines");
    expect(src).toContain("returnSelectedLines");
    expect(src).toContain("data-sale-return-panel");
    expect(src).toMatch(/Devolver líneas/);
    expect(src).toMatch(/partially_returned|parcial/);
  });

  it("keeps full void entry point", () => {
    expect(src).toContain("cancelSale");
    expect(src).toMatch(/Anular resto|Anular ticket/);
  });
});
