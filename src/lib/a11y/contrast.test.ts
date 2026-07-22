import { describe, expect, it } from "vitest";
import { contrastRatio, DESIGN_TOKENS } from "./contrast";

/**
 * WCAG 2.x AA: normal text ≥ 4.5:1; large/secondary often ≥ 3:1.
 * Muted labels on obsidian should clear at least 4.5 for body-adjacent UI.
 */
describe("design token contrast (open source a11y baseline)", () => {
  it("primary text on obsidian exceeds 7:1", () => {
    const r = contrastRatio(DESIGN_TOKENS.text, DESIGN_TOKENS.bgObsidian);
    expect(r).toBeGreaterThanOrEqual(7);
  });

  it("muted text on obsidian meets AA 4.5:1", () => {
    const r = contrastRatio(DESIGN_TOKENS.muted, DESIGN_TOKENS.bgObsidian);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });

  it("muted-dim on obsidian meets large-text 3:1 (hints)", () => {
    const r = contrastRatio(DESIGN_TOKENS.mutedDim, DESIGN_TOKENS.bgObsidian);
    expect(r).toBeGreaterThanOrEqual(3);
  });

  it("light theme text tokens meet AA on its panel surface", () => {
    expect(contrastRatio(DESIGN_TOKENS.textLight, DESIGN_TOKENS.bgLight)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(DESIGN_TOKENS.mutedLight, DESIGN_TOKENS.bgLight)).toBeGreaterThanOrEqual(4.5);
  });
});
