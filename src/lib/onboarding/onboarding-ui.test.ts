import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = resolve(__dirname, "../../routes/+layout.svelte");
const WIZARD = resolve(__dirname, "../components/OnboardingWizard.svelte");
const LOGIN = resolve(__dirname, "../components/LoginScreen.svelte");
const PRODUCT = resolve(__dirname, "../product.ts");

describe("onboarding wizard (#11)", () => {
  it("is hosted from layout and marks done via state helper", () => {
    const layout = readFileSync(LAYOUT, "utf8");
    const wiz = readFileSync(WIZARD, "utf8");
    expect(layout).toContain("OnboardingWizard");
    expect(layout).toContain("isOnboardingDone");
    expect(wiz).toContain("data-onboarding-wizard");
    expect(wiz).toContain("markOnboardingDone");
    expect(wiz).toMatch(/Saltar y usar demo/);
    expect(wiz).toMatch(/Cobrar primera venta/);
    expect(wiz).toContain("updateSettings");
    expect(wiz).toContain("upsertProduct");
  });
});

describe("Retail OS naming (#23)", () => {
  it("login and product constants use commercial display", () => {
    const login = readFileSync(LOGIN, "utf8");
    const product = readFileSync(PRODUCT, "utf8");
    expect(product).toContain("PRODUCT_DISPLAY_NAME");
    expect(product).toContain("Hexa");
    expect(product).toMatch(/IA local|Asistente de tienda/);
    expect(login).toContain("PRODUCT_TAGLINE");
    expect(login).toContain("PRODUCT_DISPLAY_NAME");
  });
});
