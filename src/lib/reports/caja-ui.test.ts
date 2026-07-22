/**
 * Structural: Caja exposes arqueo + daily close wired to shipped planners.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = resolve(__dirname, "../../routes/caja/+page.svelte");

describe("caja UI structure (ciclo 9)", () => {
  const src = readFileSync(PAGE, "utf8");

  it("wires planCashReconcile and buildDailyCloseReport", () => {
    expect(src).toContain("planCashReconcile");
    expect(src).toContain("buildDailyCloseReport");
    expect(src).toContain("data-cash-arqueo");
    expect(src).toContain("data-daily-close");
    expect(src).toMatch(/Contado físico|arqueo/i);
  });

  it("can post suggested arqueo adjustment", () => {
    expect(src).toContain("applyArqueoAdjustment");
    expect(src).toContain("createCashMovement");
    expect(src).toContain("data-arqueo-apply");
    expect(src).toMatch(/Registrar sobrante|Registrar faltante|arqueo/);
  });

  it("passes refunded_cents into daily close", () => {
    expect(src).toMatch(/refunded_cents/);
  });
});
