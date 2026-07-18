/**
 * Structural check: multi-company analysis deliverable is present and complete.
 * Ensures the analysis goal artifacts stay in-repo (not a re-implementation of product logic).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const ANALYSIS = resolve(ROOT, "docs/MULTI_COMPANY_ANALYSIS.md");
const ADR = resolve(ROOT, "docs/ADR-001-verifactu-plan.md");

describe("MULTI_COMPANY_ANALYSIS deliverable", () => {
  it("exists next to fiscal ADR", () => {
    expect(existsSync(ANALYSIS)).toBe(true);
    expect(existsSync(ADR)).toBe(true);
  });

  it("covers acceptance criteria sections with concrete product terms", () => {
    const text = readFileSync(ANALYSIS, "utf8");

    // Criterion 1 — two businesses + separate vs shared
    expect(text).toMatch(/software_studio|desarrollo de aplicaciones/i);
    expect(text).toMatch(/retail_secondhand|compraventa/i);
    expect(text).toMatch(/NIF/i);
    expect(text).toMatch(/legal y comercialmente separado|Debe quedar/i);
    expect(text).toMatch(/compartirse|Shell de producto/i);

    // Criterion 2 — isolation model + reports
    expect(text).toMatch(/Company Tenant/i);
    expect(text).toMatch(/company_id/);
    expect(text).toMatch(/active_company_id/);
    expect(text).toMatch(/company_members/);
    expect(text).toMatch(/billing_by_company|qué ha facturado cada uno|Billing by company/i);
    expect(text).toMatch(/consolidado/i);

    // Criterion 3 — gaps vs current Nix-C
    expect(text).toMatch(/shop_name/);
    expect(text).toMatch(/sin multi-org|Sin multi-org|no existe.*Company/i);
    expect(text).toMatch(/ADR-001|VeriFactu|Veri\*Factu/i);
    expect(text).toMatch(/serie/i);

    // Criterion 4 — phased roadmap
    expect(text).toMatch(/Fase P0|P0 —/i);
    expect(text).toMatch(/P0\.1|companies/);
    expect(text).toMatch(/Fase P1|Fase P2/);
  });

  it("does not claim certified e-invoicing for multi-company ops", () => {
    const text = readFileSync(ANALYSIS, "utf8");
    expect(text).toMatch(/no.*Veri\*Factu|no se reclama|No es libro oficial|no certificad/i);
  });
});
